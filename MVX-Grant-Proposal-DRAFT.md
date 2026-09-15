# MVX Ecosystem Growth Fund Grant Proposal — Hermes FraudMonitor

**Date:** 2026-09-16  
**Applicant:** Hermes Agent (chafofstafflara@gmail.com)  
**Project Name:** Hermes FraudMonitor  
**Target:** MultiversX Ecosystem Growth Fund (formerly Growth Games)  
**Current Status:** ✅ Devnet Alpha Complete (NFT Registered, Monitoring Live)

---

## 1. Executive Summary

**Hermes FraudMonitor** is an autonomous AI agent deployed on the MultiversX blockchain designed to provide **real-time on-chain fraud detection**.

We build the surveillance layer for the on-chain economy. By continuously scanning transactions, token issuances, and agent registrations, we flag suspicious patterns *before* capital is lost.

This grant funds the **production-ready Mainnet launch** of the FraudMonitor agent, API integration for dApps, and public transparency dashboards.

---

## 2. Problem Statement

The MultiversX ecosystem is rapidly growing, but security infrastructure is lagging:
- **Reactive Forensics:** Tools like scammers and tracing happen *after* a rug pull or exploit.
- **Lack of Real-Time Alerts:** Users and protocols transact without warning signals.
- **Manual Monitoring:** Auditors spend hours manually tracking whale wallets and new contract deployments.

**Impact:** Users lose trust and capital. Protocols face reputational damage from being targeted or exploited.

---

## 3. Proposed Solution

A decentralized, autonomous monitoring node (Hermes FraudMonitor) that:
1.  **Watches Devnet/Mainnet:** Scans transactions every block.
2.  **Detects Patterns:** Flags large transfers, rapid senders, and suspicious agent registrations.
3.  **Alerts Publicly:** Publishes findings via a public dashboard and JSON API.
4.  **Integrates:** Allows dApps to query "risk scores" via API before finalizing transactions.

**Current Prototype Status (Devnet):**
- ✅ Agent NFT Registered: `ACT-e4c050-c8`
- ✅ Monitoring Pipeline Active (scans every 6s)
- ✅ Public Dashboard: `https://fraudalysis.com/results`
- ✅ Raw Data API: `https://fraudalysis.com/results/data.json`

---

## 4. Technical Architecture

### Core Components
1.  **Agent Core (MX-8004):**
    - Built using `mx-agent-kit` (eliza framework).
    - Manages the `register_agent` and `set_metadata` lifecycle.
2.  **Detection Engine:**
    - Rules-based logic: Large transfers (≥1000 EGLD), Rapid senders (5+ txs/window), New agents.
    - Event decoding: Parses `agentRegistered`, `ESDTNFTCreate`, `transfer` events.
3.  **Data Pipeline:**
    - Reads from MultiversX Devnet/Mainnet API.
    - Publishes to Obsidian Vault, GitHub, and public static site.

### Deployment
- **Network:** MultiversX Mainnet (Phase 2)
- **Identity:** NFT-based registration (MX-8004)
- **Transparency:** All findings logged publicly in JSON.

---

## 5. Milestones & Deliverables

| ID | Phase | Deliverable | Timeline |
|----|-------|-------------|----------|
| **M1** | **Mainnet Launch** | Deploy FraudMonitor to MX-8004 Mainnet; Mint NFT. | Month 1 |
| **M2** | **API v1** | Public endpoint: `/api/risk/{address}` and `/api/scan`. | Month 2 |
| **M3** | **Dashboard Enhancement** | Add historical charts, risk scoring, and CSV export. | Month 2 |
| **M4** | **Integration SDK** | npm/JS SDK for dApps to call the monitor directly. | Month 3 |
| **M5** | **Audit & Documentation** | Publish whitepaper and invite independent code review. | Month 3 |

---

## 6. Budget Request

**Total Requested:** ~5,000 EGLD (or USD equivalent)

| Category | Cost | Details |
|----------|------|---------|
| **Devnet Gas Fees** | 5 EGLD | Testing transactions, metadata updates. |
| **Mainnet Gas Fees** | 10 EGLD | Initial registration, deployment. |
| **Development Time** | 4,500 EGLD | 3 months (Core dev + API + Docs). |
| **Server/Hosting** | 485 EGLD | 12 months VPS for API & dashboard (AWS/DigitalOcean). |
| **Total** | **5,000 EGLD** | |

*Note: We are already covering initial devnet costs out of pocket. Grant funds will be directed primarily to Mainnet deployment and long-term sustainability.*

---

## 7. Team

**Lead Architect:** Armand (Hermes Agent)
- **Experience:** Autonomous agent architecture, blockchain development, security tooling.
- **Track Record:** Deployed 9+ AI agents on local cloud infra; built fraud analytics pipeline on MVX devnet.
- **Contact:** chiefofstafflara@gmail.com

---

## 8. Ecosystem Impact

**Value for MultiversX:**
- **Trust:** Provides infrastructure for safer transactions.
- **Transparency:** Public monitoring increases ecosystem visibility.
- **Developer Enablement:** API allows other projects to build security checks into their UX.

**Long-term Vision:**
A fully decentralized, community-run network of fraud-monitoring nodes competing to provide the most accurate, fastest alerts.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| False Positives | Start with high thresholds (1000+ EGLD), refine over time with community feedback. |
| API Downtime | Host API on multiple providers; open-source the code for community redundancy. |
| Regulatory | Focus purely on public blockchain analysis; no user data collection. |

---

## 10. Conclusion

We have built the **proof of concept** on Devnet. With grant funding, we will launch a production-ready security layer for MultiversX that benefits every user, protocol, and developer on the chain.

---

*Draft prepared on 2026-09-16. Ready for review and iteration.*
