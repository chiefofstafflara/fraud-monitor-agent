#!/usr/bin/env node
/**
 * Update the MX-8004 agent manifest URI on MultiversX (Identity Registry).
 *
 * SAFE BY DEFAULT: with no flags this performs a cost estimate and a simulation
 * only. Nothing is signed-and-sent until you pass --broadcast.
 *
 * Usage:
 *   node scripts/update_manifest.js                    # dry run: cost + simulate
 *   node scripts/update_manifest.js --broadcast        # send, then verify on-chain
 *   node scripts/update_manifest.js --uri <url>        # override the URI to register
 *   node scripts/update_manifest.js --broadcast --yes  # skip the confirmation prompt
 *
 * Env overrides:
 *   PEM_PATH   (default /home/ubuntu/mvx-prep/step2/wallet.pem)
 *   CHAIN_ID   (default D = devnet)
 *   API_BASE   (default https://devnet-api.multiversx.com)
 *   GAS_LIMIT  (default 10000000)     GAS_PRICE (default 1000000000 wei)
 *   COLLECTION (only if NFT auto-discovery needs a hint)
 *
 * Requires: @multiversx/sdk-core @multiversx/sdk-wallet
 *
 * WHY THIS SHAPE — do not "simplify" it:
 *   update_agent is PAYABLE and requires the agent NFT as payment. Therefore
 *     - receiver must be the SIGNER'S OWN address (not the registry)
 *     - value is 0; the registry address is carried INSIDE the data field
 *     - data must start with ESDTNFTTransfer@<collection>@<nonce>@01@<registryHex>
 *     - argument order is (new_name, new_uri, new_public_key); name comes FIRST
 *     - metadata and services Optionals are OMITTED so existing metadata is
 *       left untouched (the contract gates on is_some(); a present-but-empty
 *       list also works but passing NOTHING is the clearest signal)
 *   A plain call to the registry fails. The previous version of this file did
 *   exactly that, on wrong field types, and broadcast with no simulation.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

let sdkCore, sdkWallet;
try {
  sdkCore = require('@multiversx/sdk-core');
  sdkWallet = require('@multiversx/sdk-wallet');
} catch (e) {
  console.error('Missing dependencies. Run: npm install @multiversx/sdk-core @multiversx/sdk-wallet');
  process.exit(1);
}
const { Address, Transaction, TransactionComputer } = sdkCore;
const { UserSecretKey, UserSigner } = sdkWallet;

// ------------------------------------------------------------------ config
const IDENTITY_REGISTRY = 'erd1qqqqqqqqqqqqqpgqxyum8w6cn6xkz9q5rsy4mfcsw3njpd6cd8ssr4quyy';
const CHAIN_ID = process.env.CHAIN_ID || 'D';
const API_BASE = process.env.API_BASE || 'https://devnet-api.multiversx.com';
const EXPLORER = process.env.EXPLORER || 'https://devnet-explorer.multiversx.com';
const PEM_PATH = process.env.PEM_PATH || '/home/ubuntu/mvx-prep/step2/wallet.pem';
const GAS_LIMIT = BigInt(process.env.GAS_LIMIT || 10_000_000);
const GAS_PRICE = BigInt(process.env.GAS_PRICE || 1_000_000_000);

const REPO_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_DIR, 'manifest.json');

// ------------------------------------------------------------------ helpers
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const BROADCAST = flag('--broadcast');
const ASSUME_YES = flag('--yes');

const req = (url, body, method = body ? 'POST' : 'GET') => new Promise((resolve, reject) => {
  const u = new URL(url);
  const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method,
    headers: { 'Content-Type': 'application/json' } },
    x => { let b = ''; x.on('data', d => b += d); x.on('end', () => resolve({ code: x.statusCode, body: b })); });
  r.on('error', reject);
  if (body) r.write(JSON.stringify(body));
  r.end();
});
const getJson = async url => {
  const r = await req(url, null, 'GET');
  try { return JSON.parse(r.body); } catch { throw new Error(`non-JSON from ${url}: ${r.body.slice(0, 200)}`); }
};
const hx = s => Buffer.from(s, 'utf8').toString('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtXegld = wei => (Number(BigInt(wei)) / 1e18).toFixed(6);
const listOf = v => (Array.isArray(v) ? v : (v && v.data) || []);

function die(msg) { console.error(`\n❌ ${msg}\n`); process.exit(1); }

async function confirm(question) {
  if (ASSUME_YES) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(res => rl.question(question, res));
  rl.close();
  return answer.trim().toUpperCase() === 'BROADCAST';
}

// ------------------------------------------------------------------ main
(async () => {
  if (!fs.existsSync(PEM_PATH)) die(`PEM not found at ${PEM_PATH} (set PEM_PATH)`);

  // key material stays in-process and is never logged
  const pem = fs.readFileSync(PEM_PATH, 'utf-8');
  const hexKey = Buffer.from(
    pem.split('\n').filter(l => l && !l.startsWith('-----')).join(''), 'base64'
  ).toString('ascii');
  const signer = new UserSigner(UserSecretKey.fromString(hexKey.slice(0, 64)));
  const sender = signer.getAddress().bech32();

  if (!fs.existsSync(MANIFEST_PATH)) die(`manifest.json not found at ${MANIFEST_PATH}`);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const NAME = manifest.name;
  const AGENT_NONCE = Number(manifest.agentId);
  const PUBKEY = manifest.publicKey;
  if (!NAME || !AGENT_NONCE || !PUBKEY) die('manifest.json must define name, agentId and publicKey');

  const URI = opt('--uri')
    || 'https://cdn.jsdelivr.net/gh/chiefofstafflara/fraud-monitor-agent@main/manifest.json';

  // ---- discover the agent NFT from the wallet itself (no hardcoded collection) ----
  const walletNfts = listOf(await getJson(`${API_BASE}/accounts/${sender}/nfts?size=100`));
  const agentNft = walletNfts.find(n => Number(n.nonce) === AGENT_NONCE)
    || (process.env.COLLECTION
        ? walletNfts.find(n => n.collection === process.env.COLLECTION)
        : null);
  if (!agentNft) {
    die(`wallet ${sender} does not hold agent NFT nonce ${AGENT_NONCE} — cannot self-transfer it`);
  }
  const COLLECTION = agentNft.collection;

  const acct = await getJson(`${API_BASE}/accounts/${sender}`);
  const nonce = acct.nonce;
  const balance = acct.balance;

  const destHex = Buffer.from(new Address(IDENTITY_REGISTRY).getPublicKey()).toString('hex');
  const dataStr = [
    'ESDTNFTTransfer', hx(COLLECTION), AGENT_NONCE.toString(16), '01', destHex,
    hx('update_agent'), hx(NAME), hx(URI), PUBKEY,
  ].join('@');

  const tx = new Transaction({
    sender: new Address(sender),
    receiver: new Address(sender),   // SELF — the NFT rides along; registry is inside `data`
    value: '0',
    gasLimit: GAS_LIMIT,
    chainID: CHAIN_ID,
    nonce,
    version: 1,
    data: Buffer.from(dataStr, 'utf8'),
  });
  const tc = new TransactionComputer();
  tx.signature = await signer.sign(tc.computeBytesForSigning(tx));
  const sendable = tx.toSendable();

  console.log('\n  ── MX-8004 manifest URI update ─────────────────────────────');
  console.log(`   mode        : ${BROADCAST ? '🔴 BROADCAST' : '🟢 DRY RUN (cost + simulate only)'}`);
  console.log(`   signer      : ${sender}`);
  console.log(`   agent       : #${AGENT_NONCE}  ${JSON.stringify(NAME)}  (${COLLECTION}-${AGENT_NONCE})`);
  console.log(`   new uri     : ${URI}`);
  console.log(`   receiver    : self (ESDTNFTTransfer carries the NFT)`);
  console.log(`   gasLimit    : ${GAS_LIMIT}   nonce: ${nonce}   chainID: ${CHAIN_ID}`);
  console.log(`   balance     : ${fmtXegld(balance)} xEGLD`);
  console.log(`   data fields : ${dataStr.split('@').length} (metadata + services absent)`);

  // ---- 1. cost estimate ----
  console.log('\n  [1/3] cost estimate …');
  const costRaw = await req(`${API_BASE}/transaction/cost`, sendable);
  let cost = null;
  try { cost = JSON.parse(costRaw.body).data; } catch {}
  if (!cost || !cost.txGasUnits) {
    const hint = /insufficient gas limit/i.test(costRaw.body)
      ? ` — GAS_LIMIT ${GAS_LIMIT} is too low for this call (a metadata-free update needs ~5.85M)`
      : '';
    die(`cost estimate failed${hint}: ${costRaw.body.slice(0, 300)}`);
  }
  const fee = BigInt(cost.txGasUnits) * GAS_PRICE;
  console.log(`        txGasUnits ${cost.txGasUnits}  ≈ ${fmtXegld(fee)} xEGLD`);
  if (BigInt(cost.txGasUnits) > GAS_LIMIT) {
    die(`estimated gas ${cost.txGasUnits} exceeds GAS_LIMIT ${GAS_LIMIT} — raise GAS_LIMIT`);
  }
  if (BigInt(balance) < fee) die(`balance cannot cover the fee (${fee} wei)`);

  // ---- 2. simulate against live state ----
  console.log('  [2/3] simulating against live chain state …');
  const simRaw = await req(`${API_BASE}/transaction/simulate`, sendable);
  let sim = null;
  try { sim = JSON.parse(simRaw.body).data; } catch {}
  const status = sim && sim.result && sim.result.status;
  if (status !== 'success') {
    die(`simulation did NOT succeed (status=${JSON.stringify(status)}): ${simRaw.body.slice(0, 400)}`);
  }
  console.log(`        status ${status} ✅`);

  // ---- 3. broadcast, opt-in only ----
  if (!BROADCAST) {
    console.log(`\n  [3/3] DRY RUN — nothing sent. on-chain nonce still ${nonce}.`);
    console.log('        re-run with --broadcast to send.\n');
    return;
  }

  console.log('\n  [3/3] about to BROADCAST for real.');
  if (!await confirm('        Type BROADCAST to confirm: ')) {
    console.log('        aborted — nothing sent.\n');
    return;
  }

  const sendRaw = await req(`${API_BASE}/transaction/send`, sendable);
  let txHash = null;
  try { txHash = JSON.parse(sendRaw.body).data.txHash; } catch {}
  if (!txHash) die(`send failed: ${sendRaw.body.slice(0, 400)}`);
  console.log(`\n   txHash  : ${txHash}`);
  console.log(`   explorer: ${EXPLORER}/transactions/${txHash}`);

  process.stdout.write('   awaiting finality ');
  let final = null;
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    process.stdout.write('.');
    const r = await getJson(`${API_BASE}/transactions/${txHash}`);
    if (r.status === 'success' || r.status === 'fail' || r.status === 'invalid') { final = r; break; }
  }
  console.log();
  if (!final) die(`tx ${txHash} did not reach finality in 120s — see ${EXPLORER}/transactions/${txHash}`);
  console.log(`   status  : ${final.status}   gasUsed: ${final.gasUsed}`);
  if (final.status !== 'success') die(`tx ${txHash} finished as ${final.status}`);
  if (final.returnMessage) console.log(`   returnMessage: ${final.returnMessage}`);

  // ---- read back: a success status alone does not prove the effect ----
  console.log('\n   verifying by read-back (success status alone proves nothing) …');
  await sleep(3000);
  const after = listOf(await getJson(`${API_BASE}/accounts/${sender}/nfts?size=100`));
  const nft = after.find(n => Number(n.nonce) === AGENT_NONCE);
  const onchain = nft && nft.uris && nft.uris.length
    ? Buffer.from(nft.uris[0], 'base64').toString('utf-8') : null;
  console.log(`   on-chain uri: ${onchain}`);
  if (onchain !== URI) die(`read-back MISMATCH — expected ${URI}, chain says ${onchain}`);
  console.log('\n✅ done — on-chain uri matches the requested value.\n');
})().catch(e => { console.error('\n❌', e.message, '\n'); process.exit(1); });
