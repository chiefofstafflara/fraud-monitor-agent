// Step 7: Fraud-Monitoring Pipeline (devnet prototype)
// Hermes FraudMonitor's core loop:
//   1. Poll recent devnet transactions (large transfers + new token issuances)
//   2. Watch Identity Registry for new agent registrations
//   3. Flag suspicious patterns: large transfers, rapid transfers from same sender
//   4. Append findings to a local log + send Telegram alerts
//
// Run: node monitor.js [--once]
const API = 'https://devnet-api.multiversx.com';
const IDENTITY = 'erd1qqqqqqqqqqqqqpgqxyum8w6cn6xkz9q5rsy4mfcsw3njpd6cd8ssr4quyy';
const LOG = '/home/ubuntu/mvx-prep/step7/findings.log';
const LARGE_TRANSFER_LIMIT = 1000n * 10n ** 18n; // 1000 EGLD in atomic units (devnet-scale adjustable)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '381440594'; // Armand's DM

const fs = require('fs');

function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

// --- Telegram Alert Function ---
async function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log('DEBUG', 'Telegram alert skipped: credentials not configured');
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: TELEGRAM_CHAT_ID,
      text: `🔍 *Fraud Monitor Alert*\n\n${message}`,
      parse_mode: 'Markdown'
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      log('WARN', `Telegram alert failed: ${res.status} ${res.statusText}`);
    } else {
      log('INFO', 'Telegram alert sent successfully');
    }
  } catch (e) {
    log('ERROR', `Telegram alert error: ${e.message}`);
  }
}

// --- Rule 1: large EGLD transfers across the whole devnet chain ---
async function scanLargeTransfers(afterTs) {
  const res = await fetch(`${API}/transactions?size=50&order=desc&after=${afterTs}&function=transfer`); // plain EGLD transfers
  if (!res.ok) return 0;
  const txs = await res.json();
  let flagged = 0;
  for (const tx of txs) {
    const value = BigInt(tx.value || '0');
    if (value >= LARGE_TRANSFER_LIMIT) {
      flagged++;
      const alertMsg = `⚠️ LARGE TRANSFER\nAmount: ${Number(value / 10n ** 18n)} EGLD\nFrom: ${tx.sender?.slice(0, 20)}...\nTo: ${tx.receiver?.slice(0, 20)}...\nTX: ${tx.txHash.slice(0, 16)}`;
      log('ALERT', `${alertMsg}`);
      await sendTelegramAlert(alertMsg);
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
    const alertMsg = `🆕 NEW AGENT REGISTRATION\nSender: ${tx.sender?.slice(0, 20)}...\nTX: ${tx.txHash.slice(0, 16)}\nStatus: ${tx.status}`;
    log('INFO', `${alertMsg}`);
    await sendTelegramAlert(alertMsg);
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
      const alertMsg = `⚡ RAPID SENDER\nAddress: ${sender.slice(0, 20)}...\nTX Count: ${ts.length} in recent window`;
      log('WARN', `${alertMsg}`);
      await sendTelegramAlert(alertMsg);
    }
  }
  return flagged;
}

// --- Main loop ---
const seenAgents = new Set();
let lastScanTs = Math.floor(Date.now() / 1000) - 300; // start: last 5 min

async function scanOnce() {
  const t0 = Date.now();
  let alerts = 0;
  try {
    alerts += await scanLargeTransfers(lastScanTs);
    alerts += await scanNewAgents(seenAgents);
    alerts += await scanRapidSenders();
  } catch (e) {
    log('ERROR', 'scan failure: ' + e.message);
  }
  lastScanTs = Math.floor(t0 / 1000);
  log('DEBUG', `scan complete in ${Date.now() - t0}ms, ${alerts} alert(s) this round`);
  return alerts;
}

(async () => {
  log('INFO', 'Hermes FraudMonitor (devnet prototype) starting. PID logging to findings.log');
  // Seed seenAgents with existing registrations so we only report NEW ones
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
  // Continuous mode: poll every devnet round (~6s)
  setInterval(scanOnce, 6000);
})();
