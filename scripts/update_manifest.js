#!/usr/bin/env node
/**
 * Update MX-8004 agent manifest URI on devnet.
 * Usage: node update_manifest.js
 * 
 * Requires: npm install @multiversx/sdk-core @multiversx/sdk-wallet axios
 * Saved at: /home/ubuntu/mvx-manifest-update/update_manifest.js
 * 
 * Also committed to: github.com/chiefofstafflara/fraud-monitor-agent
 */

const { UserSecretKey, UserSigner } = require('@multiversx/sdk-wallet');
const { Transaction, TransactionComputer, Address } = require('@multiversx/sdk-core');
const axios = require('axios');

const IDENTITY_REGISTRY = 'erd1qqqqqqqqqqqqqpgqxyum8w6cn6xkz9q5rsy4mfcsw3njpd6cd8ssr4quyy';
const CHAIN_ID = 'D';
const GAS_LIMIT = 60000000n;
const PEM_PATH = process.env.PEM_PATH || '/home/ubuntu/mvx-prep/step2/wallet.pem';
const AGENT_NONCE = 200;
const NEW_URI = 'https://raw.githubusercontent.com/chiefofstafflara/fraud-monitor-agent/main/manifest.json';

async function main() {
  const pemContent = require('fs').readFileSync(PEM_PATH, 'utf-8');
  const hexKey = Buffer.from(
    pemContent.split('\n').filter(l => l && !l.startsWith('-----')).join(''), 
    'base64'
  ).toString('ascii');
  
  const secretKey = UserSecretKey.fromString(hexKey.slice(0, 64));
  const signer = new UserSigner(secretKey);
  const walletBech32 = signer.getAddress().bech32();
  
  const resp = await axios.get(`https://devnet-api.multiversx.com/address/${walletBech32}`);
  const nonce = resp.data.data.account.nonce;
  
  const tx = new Transaction({
    sender: new Address(walletBech32),
    receiver: new Address(IDENTITY_REGISTRY),
    value: '0',
    gasLimit: GAS_LIMIT,
    chainID: CHAIN_ID,
    nonce: nonce,
    data: Buffer.from(
      `update_agent@${AGENT_NONCE.toString(16).padStart(16, '0')}@${Buffer.from(NEW_URI).toString('hex')}`,
      'ascii'
    ),
    version: 1,
  });
  
  const txComputer = new TransactionComputer();
  tx.signature = await signer.sign(txComputer.computeBytesForSigning(tx));
  
  const sendResp = await axios.post('https://devnet-gateway.multiversx.com/transaction/send', tx.toSendable());
  console.log('✅ TX:', sendResp.data.data.txHash);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });