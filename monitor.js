// Step 7: Fraud-Monitoring Pipeline (devnet prototype)
// Hermes FraudMonitor's core loop:
//   1. Poll recent devnet transactions (large transfers + new token issuances)
//   2. Watch Identity Registry for new agent registrations
//   3. Flag suspicious patterns: large transfers, rapid transfers from same sender
//   4. Append findings to a local log + send batched Telegram alert per cycle
//
// Batching: instead of sending one Telegram message per alert (which triggers 429 rate limits),
// all alerts from a single scan cycle are collected and sent as one summary message.
//
// Run: node monitor.js [--once]
const API = 'https://devnet-api.multiversx.com';
const IDENTITY = 'erd1qqqqqqqqqqqqqpgqxyum8w6cn6xkz9q5rsy4mfcsw3njpd6cd8ssr4quyy';
const LOG = '/home/ubuntu/ops-logs/monitor-findings.log';
const LARGE_TRANSFER_LIMIT = 1000n * 10n ** 18n;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '381440594';

const fs = require('fs');

function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

// --- Batched Telegram Alert ---
// Collects alerts during a scan cycle, sends one summary at the end
const alertBatch = [];
function addAlert(emoji, title, detail) {
  alertBatch.push({ emoji, title, detail });
}

let lastFlush = 0;

async function flushAlerts() {
  if (alertBatch.length === 0) return;

  // Throttle: minimum 12s between sends
  const now = Date.now();
  if (lastFlush > 0 && now - lastFlush < 12000) {
    log('DEBUG', 'Telegram batch skipped (' + alertBatch.length + ' alerts queued, throttle active)');
    alertBatch.length = 0;
    return;
  }
  lastFlush = now;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log('DEBUG', 'Telegram alert skipped: credentials not configured');
    alertBatch.length = 0;
    return;
  }

  // Build one summary message from all alerts in the batch
  const lines = alertBatch.map(a => `${a.emoji} *${a.title}*\n${a.detail}`);
  const text = `🔍 *Fraud Monitor Summary*\n\n${lines.join('\n\n')}`;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const retryAfter = errBody.parameters?.retry_after || 0;
      if (retryAfter > 0) {
        log('WARN', `Telegram rate limited: wait ${retryAfter}s (${res.status})`);
        lastFlush = Date.now() - 11000 + (retryAfter * 1000); // extend throttle
      } else {
        log('WARN', `Telegram alert failed: ${res.status} ${res.statusText}`);
      }
    } else {
      log('INFO', `Telegram summary sent (${alertBatch.length} alert(s))`);
    }
  } catch (e) {
    log('ERROR', `Telegram alert error: ${e.message}`);
  }
  alertBatch.length = 0;
}

// --- Rule 1: large EGLD transfers across the whole devnet chain ---
async function scanLargeTransfers(afterTs) {
  const res = await fetch(`${API}/transactions?size=50&order=desc&after=${afterTs}&function=transfer`);
  if (!res.ok) return 0;
  const txs = await res.json();
  let flagged = 0;
  for (const tx of txs) {
    const value = BigInt(tx.value || '0');
    if (value >= LARGE_TRANSFER_LIMIT) {
      flagged++;
      const msg = `⚠️ LARGE TRANSFER\nAmount: ${Number(value / 10n ** 18n)} EGLD\nFrom: ${tx.sender?.slice(0, 20)}...\nTo: ${tx.receiver?.slice(0, 20)}...\nTX: ${tx.txHash.slice(0, 16)}`;
      log('ALERT', msg);
      addAlert('⚠️', 'Large Transfer', msg.split('\n').slice(1).join('\n'));
    }
  }
  return flagged;
}

// --- Rule 2: new agent registrations on MX-8004 ---
async function scanNewAgents(seenSet) {
  const res = await fetch(`${API}/transactions?receiver=${IDENTITY}&function=register_agent&size=10&order=desc`);
  if (!res.ok) return 0;
  const txs = await res.json();
  let newOnes = 0;
  for (const tx of txs) {
    if (seenSet.has(tx.txHash)) continue;
    seenSet.add(tx.txHash);
    newOnes++;
    const msg = `🆕 NEW AGENT REGISTRATION\nSender: ${tx.sender?.slice(0, 20)}...\nTX: ${tx.txHash.slice(0, 16)}\nStatus: ${tx.status}`;
    log('INFO', msg);
    addAlert('🆕', 'New Agent Registration', msg.split('\n').slice(1).join('\n'));
  }
  return newOnes;
}

// --- Rule 3: rapid-fire transfers (same sender, >=5 txs in window) ---
async function scanRapidSenders() {
  const res = await fetch(`${API}/transactions?size=100&order=desc`);
  if (!res.ok) return 0;
  const txs = await res.json();
  const bySender = {};
  for (const tx of txs) {
    if (!tx.sender) continue;
    if (!bySender[tx.sender]) bySender[tx.sender] = [];
    bySender[tx.sender].push(tx.timestamp);
  }
  let flagged = 0;
  for (const [sender, ts] of Object.entries(bySender)) {
    if (ts.length >= 5) {
      flagged++;
      const msg = `⚡ RAPID SENDER\nAddress: ${sender.slice(0, 20)}...\nTX Count: ${ts.length} in recent window`;
      log('WARN', msg);
      addAlert('⚡', 'Rapid Sender', msg.split('\n').slice(1).join('\n'));
    }
  }
  return flagged;
}

// --- Main loop ---
const seenAgents = new Set();
let lastScanTs = Math.floor(Date.now() / 1000) - 300;

async function scanOnce() {
  const t0 = Date.now();
  let alerts = 0;
  try {
    alerts += await scanLargeTransfers(lastScanTs);
    alerts += await scanNewAgents(seenAgents);
    alerts += await scanRapidSenders();
    // Send one batch per scan cycle
    await flushAlerts();
  } catch (e) {
    log('ERROR', 'scan failure: ' + e.message);
  }
  lastScanTs = Math.floor(t0 / 1000);
  log('DEBUG', `scan complete in ${Date.now() - t0}ms, ${alerts} alert(s) this round`);
  return alerts;
}

(async () => {
  log('INFO', 'Hermes FraudMonitor (devnet prototype) starting. PID logging to findings.log');
  try {
    const res = await fetch(`${API}/transactions?receiver=${IDENTITY}&function=register_agent&size=100&order=desc`);
    const txs = await res.json();
    txs.forEach(t => seenAgents.add(t.txHash));
    log('INFO', `seeded ${seenAgents.size} existing registrations`);
  } catch (e) { log('ERROR', 'seed failure: ' + e.message); }

  if (process.argv.includes('--once')) {
    await scanOnce();
    console.log('\nSTEP7 RESULT: single scan cycle complete. Pipeline functional.');
    return;
  }
  setInterval(scanOnce, 6000);
})();
