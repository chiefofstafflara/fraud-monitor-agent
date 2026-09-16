# Hermes FraudMonitor

> Autonomous AI agent for real-time on-chain fraud detection on MultiversX.

[![Build Grant Tier](https://img.shields.io/badge/Grant-Build_Tier-blue?style=for-the-badge)](https://multiversx.com/growthgames/build)
[![AI Agent Category](https://img.shields.io/badge/Category-AI_Agent-green?style=for-the-badge)](https://multiversx.com/growthgames)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

---

## 📊 Status

| Component | Status | Link |
|-----------|--------|------|
| **Agent NFT** | ✅ Registered | `ACT-e4c050-c8` (MX-8004) |
| **Devnet Scan** | ✅ Live | Scans every 6 seconds |
| **Dashboard** | ✅ Public | [fraudalysis.com/results](https://fraudalysis.com/results) |
| **API** | ✅ Public | [fraudalysis.com/results/data.json](https://fraudalysis.com/results/data.json) |

---

## 🚀 Quick Start

### Prerequisites
- Node.js v22+
- npm or pnpm

### Installation
```bash
# Clone repo
git clone https://github.com/chiefofstafflara/fraud-monitor-agent.git
cd fraud-monitor-agent

# Install dependencies (if building mx-agent-kit)
pnpm install

# Run monitor
node step7/monitor.js --once
```

### Environment Setup
```bash
export TELEGRAM_BOT_TOKEN="your_bot_token"
export TELEGRAM_CHAT_ID="381440594"
```

---

## 📑 Grant Documentation

This project is applying for the **MultiversX Growth Games Build Grant Tier** (AI Agent category).

| Document | Link |
|----------|------|
| Grant Proposal | [MVX-Grant-Proposal-DRAFT.md](MVX-Grant-Proposal-DRAFT.md) |
| Technical Whitepaper | [docs/WHITEPAPER.md](docs/WHITEPAPER.md) |
| Demo Video Script | [assets/VIDEO_SCRIPT.md](assets/VIDEO_SCRIPT.md) |

### Application Requirements Checklist
- ✅ Open-source repository (MIT license)
- ✅ Devnet prototype live
- ✅ Documentation complete
- ✅ Team bio & GitHub links
- ✅ Integration plan (xPortal, OpenDAO, MVX Explorer)

---

## 🛠️ Technical Stack

- **Framework:** `mx-agent-kit` (eliza framework)
- **Agent Identity:** MX-8004 NFT (`ACT-e4c050-c8`)
- **Language:** Node.js / JavaScript
- **API:** Devnet/Mainnet MultiversX API
- **Storage:** GitHub, Obsidian Vault, Static Site

---

## 🤝 Integration

We expose public endpoints for dApp integration:

```json
// GET /results/data.json
{
  "timestamp": "2026-09-16T23:22:00Z",
  "findings": [
    {
      "rule": "rapid_sender",
      "address": "erd16vdpyafz0gceq2x5...",
      "tx_count": 37,
      "severity": "medium"
    }
  ]
}
```

---

## 📞 Contact

**Lead Architect:** Armand  
**Email:** chiefofstafflara@gmail.com  
**GitHub:** [@chiefofstafflara](https://github.com/chiefofstafflara)

---

## ⚖️ License

MIT License — See [LICENSE](LICENSE) file.
