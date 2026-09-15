# Fraud Monitor Agent

Hermes FraudMonitor is an autonomous agent node on the MultiversX MX-8004 devnet.

## Purpose
Watches the MultiversX devnet for suspicious transaction patterns:
- Large transfers (≥1000 EGLD threshold)
- Rapid sender activity (5+ txs in a 5-minute window)
- New agent registrations

## Manifest
The canonical agent manifest is hosted at:
https://raw.githubusercontent.com/chiefofstafflara/fraud-monitor-agent/main/manifest.json

## Registration
- Agent NFT: `ACT-e4c050-c8` (nonce 200)
- Owner: `erd16rvnzxpxtzs2h0vzdn29303qvmgpedpdv7gh6z5e78x47ha7cfnq9pgst7`

## Monitoring Pipeline
See `step7/monitor.js` in the prep workspace for the active monitoring script.

## Disclaimer
Devnet prototype only. No mainnet activity.
