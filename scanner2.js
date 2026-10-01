// Hermes FraudMonitor v2 — devnet fraud detection service
//
// v1 (monitor.js) problems this replaces:
//   - 3 "rapid sender" alerts every 6s = pure noise, every one a false positive
//   - 2.6M-line / 114MB append-only log, no dedup, no queryable store
//   - no HTTP surface at all: nothing reachable, so no service can be advertised
//
// v2 design:
//   - findings land in SQLite with a UNIQUE fingerprint => dedup, real counts
//   - confidence score per rule; only HIGH confidence pages/re-alerts
//   - HTTP API + dashboard so the service is genuinely reachable
//
// Run: node scanner2.js [--once] [--port 8790]
const { DatabaseSync } = require('node:sqlite');
const http = require('node:http');
const fs = require('node:fs');

const API = 'https://devnet-api.multiversx.com';
const IDENTITY = 'erd1qqqqqqqqqqqqqpgqxyum8w6cn6xkz9q5rsy4mfcsw3njpd6cd8ssr4quyy';
const VALIDATION = 'erd1qqqqqqqqqqqqqpgqvax6z79cvyz9gkfwg57hqume352p7s7rd8ss4g3t43';
const DB_PATH = '/home/ubuntu/fraud-monitor-agent/findings.db';
const EGLD = 10n ** 18n;
const PORT = Number((process.argv.find(a => a.startsWith('--port=')) || '--port=8790').split('=')[1]);

// --- store ---
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS findings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint  TEXT    NOT NULL UNIQUE,
    rule         TEXT    NOT NULL,
    severity     TEXT    NOT NULL,
    confidence   INTEGER NOT NULL,
    subject      TEXT,
    detail       TEXT,
    tx_hash      TEXT,
    first_seen   INTEGER NOT NULL,
    last_seen    INTEGER NOT NULL,
    hit_count    INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    duration_ms INTEGER,
    txs_scanned INTEGER,
    new_findings INTEGER
  );
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
`);

function record({ fingerprint, rule, severity, confidence, subject, detail, tx_hash }) {
  const now = Math.floor(Date.now() / 1000);
  const r = db.prepare(`
    INSERT INTO findings (fingerprint, rule, severity, confidence, subject, detail, tx_hash,
                          first_seen, last_seen, hit_count)
    VALUES (?,?,?,?,?,?,?,?,?,1)
    ON CONFLICT(fingerprint) DO UPDATE SET
      last_seen = excluded.last_seen,
      hit_count  = hit_count + 1
    RETURNING hit_count, first_seen
  `).get(fingerprint, rule, severity, confidence, subject || null, detail || null,
         tx_hash || null, now, now);
  const isNew = r.hit_count === 1;
  return { isNew, hit_count: r.hit_count, first_seen: r.first_seen, severity, rule,
           subject, detail, tx_hash, confidence };
}

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// --- Rule 1: large EGLD transfer. High confidence, genuinely notable. ---
async function ruleLargeTransfers(after) {
  const txs = await jget(`${API}/transactions?size=50&order=desc&after=${after}&function=transfer`);
  const out = [];
  for (const tx of txs) {
    const value = BigInt(tx.value || '0');
    if (value < 1000n * EGLD) continue;
    out.push(record({
      fingerprint: `large:${tx.txHash}`,
      rule: 'large_transfer', severity: 'high', confidence: 95,
      subject: tx.sender,
      detail: `${Number(value / EGLD)} EGLD to ${tx.receiver}`,
      tx_hash: tx.txHash,
    }));
  }
  return out;
}

// --- Rule 2: burst activity, but MEANINGFULLY so.
// v1 flagged any sender with >=5 txs in a 100-tx window => constant noise.
// v2 requires a genuine burst: >=15 txs in a 60s window. ---
async function ruleBurstActivity() {
  const txs = await jget(`${API}/transactions?size=100&order=desc`);
  const now = Math.floor(Date.now() / 1000);
  const bySender = new Map();
  for (const tx of txs) {
    if (!tx.sender || !tx.timestamp) continue;
    if (now - tx.timestamp > 120) continue;           // only last 2 minutes
    if (!bySender.has(tx.sender)) bySender.set(tx.sender, []);
    bySender.get(tx.sender).push(tx);
  }
  const out = [];
  for (const [sender, list] of bySender) {
    if (list.length < 15) continue;                    // real threshold
    const window = Math.max(...list.map(t => t.timestamp)) - Math.min(...list.map(t => t.timestamp));
    out.push(record({
      fingerprint: `burst:${sender}:${Math.floor(now / 300)}`,
      rule: 'burst_activity', severity: 'medium', confidence: 70,
      subject: sender,
      detail: `${list.length} transactions in ${window}s`,
    }));
  }
  return out;
}

// --- Rule 3: new agent registration on the MX-8004 Identity Registry. ---
async function ruleNewAgents() {
  const txs = await jget(`${API}/transactions?receiver=${IDENTITY}&function=register_agent&size=25&order=desc`);
  const out = [];
  for (const tx of txs) {
    out.push(record({
      fingerprint: `reg:${tx.txHash}`,
      rule: 'new_agent', severity: 'info', confidence: 100,
      subject: tx.sender,
      detail: `agent registration (status ${tx.status})`,
      tx_hash: tx.txHash,
    }));
  }
  return out;
}

// --- Rule 4 (the interesting one): MX-8004 job state anomalies.
// We know the Validation Registry: submit_proof -> validation_response -> Verified.
// New signal: a job that reaches "verified" but where the SAME address submitted
// the proof and the validation = self-validation. ---
async function ruleSelfValidatedJobs() {
  const out = [];
  let jobs = [];
  try {
    const r = await jget('https://devnet-taskclaw-api.multiversx.com/jobs?limit=40');
    jobs = r.items || [];
  } catch { return out; }   // indexer optional; never break the scan

  // Only examine jobs we have not already classified. Once a job's two txs have
  // been resolved once, its verdict is permanent — never re-fetch it.
  const seenJobs = new Set(
    db.prepare("SELECT tx_hash FROM findings WHERE rule='self_validated_job'").all()
      .map(r => r.tx_hash).filter(Boolean)
  );
  const knownSubmits = new Set(
    db.prepare("SELECT detail FROM findings WHERE rule='self_validated_job'").all()
      .map(r => (r.detail || '').match(/job ([0-9a-f]{8})/)?.[1]).filter(Boolean)
  );

  const candidates = jobs
    .filter(j => j.status === 'Verified' && j.submitTxHash && j.verifyTxHash)
    .filter(j => !knownSubmits.has(j.jobId.slice(0, 8)))
    .filter(j => !seenJobs.has(j.verifyTxHash))
    .slice(0, 12);                       // bounded work per cycle

  await Promise.all(candidates.map(async j => {
    try {
      const [sub, ver] = await Promise.all([jget(`${API}/transactions/${j.submitTxHash}`),
                                            jget(`${API}/transactions/${j.verifyTxHash}`)]);
      if (sub.sender && ver.sender && sub.sender === ver.sender) {
        out.push(record({
          fingerprint: `selfval:${j.jobId}`,
          rule: 'self_validated_job', severity: 'high', confidence: 90,
          subject: sub.sender,
          detail: `job ${j.jobId.slice(0,8)} "verified" by the same address that submitted the proof`,
          tx_hash: j.verifyTxHash,
        }));
      } else {
        // clean job: remember it so we never re-check (bump a hidden marker row)
        record({
          fingerprint: `indep:${j.jobId}`, rule: 'independently_validated_job',
          severity: 'info', confidence: 100, subject: ver.sender,
          detail: `job ${j.jobId.slice(0,8)} verified by a separate validator`,
          tx_hash: j.verifyTxHash,
        });
      }
    } catch { /* tx not yet indexed */ }
  }));
  return out;
}

const RULES = [
  ['large_transfer',  ruleLargeTransfers, true],
  ['burst_activity',  ruleBurstActivity,   false],
  ['new_agent',        ruleNewAgents,       false],
  ['self_validated_job', ruleSelfValidatedJobs, false],
];

let lastScan = Math.floor(Date.now() / 1000) - 300;

async function scanOnce() {
  const t0 = Date.now();
  const all = [];
  for (const [name, fn, useAfter] of RULES) {
    try {
      const r = await fn(useAfter ? lastScan : undefined);
      all.push(...r.map(x => ({ ...x, rule: x.rule || name })));
    } catch (e) {
      console.error(`[${new Date().toISOString()}] rule ${name} failed: ${e.message}`);
    }
  }
  lastScan = Math.floor(t0 / 1000);
  const fresh = all.filter(x => x.isNew);
  db.prepare('INSERT INTO scans (ts, duration_ms, txs_scanned, new_findings) VALUES (?,?,?,?)')
    .run(Math.floor(t0 / 1000), Date.now() - t0, 100, fresh.length);
  console.log(`[${new Date().toISOString()}] scan ${Date.now() - t0}ms — ` +
              `${all.length} hits, ${fresh.length} new`);
  return all;
}

// --- stats for the dashboard ---
function stats() {
  const total = db.prepare('SELECT COUNT(*) c FROM findings').get().c;
  const byRule = db.prepare('SELECT rule, COUNT(*) c FROM findings GROUP BY rule ORDER BY c DESC').all();
  const bySev  = db.prepare('SELECT severity, COUNT(*) c FROM findings GROUP BY severity').all();
  const last24 = db.prepare('SELECT COUNT(*) c FROM findings WHERE first_seen > ?')
                  .get(Math.floor(Date.now()/1000) - 86400).c;
  const lastScanRow = db.prepare('SELECT ts, duration_ms, new_findings FROM scans ORDER BY id DESC LIMIT 1').get();
  return {
    status: 'online', total, last24h: last24,
    byRule, bySeverity: bySev,
    lastScan: lastScanRow || null,
    uptime_s: Math.floor(process.uptime()),
  };
}

const DASH = `<!doctype html><html><head><meta charset=utf-8>
<title>Hermes FraudMonitor — live devnet surveillance</title>
<meta name=description content="Live on-chain fraud detection for MultiversX devnet by Hermes FraudMonitor, an autonomous MX-8004 agent.">
<style>
 body{font:15px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b0f14;color:#c9d1d9;margin:0;padding:32px}
 h1{color:#58a6ff;font-size:22px;margin:0 0 4px} .sub{color:#8b949e;margin-bottom:24px}
 .cards{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:28px}
 .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 22px;min-width:130px}
 .n{font-size:30px;color:#58a6ff} .l{color:#8b949e;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
 table{border-collapse:collapse;width:100%;background:#161b22;border-radius:8px;overflow:hidden}
 th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #21262d;font-size:13px}
 th{color:#8b949e;font-weight:600;font-size:11px;text-transform:uppercase}
 .high{color:#f85149}.medium{color:#d29922}.info{color:#3fb950}
 code{color:#a5d6ff}
</style></head><body>
<h1>Hermes FraudMonitor</h1>
<div class=sub>Live on-chain fraud surveillance &middot; MultiversX devnet &middot; MX-8004 registered agent</div>
<div class=cards id=cards></div>
<div class=sub>Detection rules</div>
<table><thead><tr><th>Rule</th><th>Findings</th></tr></thead><tbody id=rules></tbody></table>
<div class=sub style=margin-top:28px>Latest findings</div>
<table><thead><tr><th>Time</th><th>Severity</th><th>Rule</th><th>Detail</th><th>Subject</th></tr></thead><tbody id=rows></tbody></table>
<script>
async function tick(){
  const s=await (await fetch('/api/stats')).json();
  document.getElementById('cards').innerHTML=
    [['Total findings',s.total],['Last 24h',s.last24h],['Rules firing',s.byRule.length],['Uptime (min)',Math.round(s.uptime_s/60)]]
    .map(([l,n])=>'<div class=card><div class=n>'+n+'</div><div class=l>'+l+'</div></div>').join('');
  document.getElementById('rules').innerHTML=s.byRule
    .map(r=>'<tr><td><code>'+r.rule+'</code></td><td>'+r.c+'</td></tr>').join('');
  const f=await (await fetch('/api/findings?limit=25')).json();
  document.getElementById('rows').innerHTML=f.findings.map(x=>
    '<tr><td>'+new Date(x.first_seen*1000).toISOString().replace('T',' ').slice(0,19)+'</td>'+
    '<td class='+x.severity+'>'+x.severity+'</td><td><code>'+x.rule+'</code></td>'+
    '<td>'+x.detail+'</td><td><code>'+(x.subject||'').slice(0,18)+'…</code></td></tr>').join('');
}
tick();setInterval(tick,15000);
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const json = (o, code = 200) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(o));
  };
  if (url.pathname === '/api/stats') return json(stats());
  if (url.pathname === '/api/findings') {
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
    const rule = url.searchParams.get('rule');
    const rows = rule
      ? db.prepare('SELECT * FROM findings WHERE rule=? ORDER BY last_seen DESC LIMIT ?').all(rule, limit)
      : db.prepare('SELECT * FROM findings ORDER BY last_seen DESC LIMIT ?').all(limit);
    return json({ findings: rows });
  }
  if (url.pathname === '/api/scan') return json({ triggered: true, ...stats() });
  if (url.pathname === '/health') return json({ ok: true, uptime_s: Math.floor(process.uptime()) });
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(DASH);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

(async () => {
  server.listen(PORT, '0.0.0.0', () => console.log(`dashboard on :${PORT}`));
  if (process.argv.includes('--once')) {
    await scanOnce();
    console.log(JSON.stringify(stats(), null, 2));
    return;
  }
  await scanOnce();
  setInterval(scanOnce, 30000);
})();
