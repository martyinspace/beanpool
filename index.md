# 📚 BeanPool Documentation Index

> **Start here.** This is the master guide to all documentation in the BeanPool project.
> Updated: 2026-03-16

---

## Project Overview

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Project overview, monorepo structure, quick start, downloads |
| [SUMMARY.md](SUMMARY.md) | Protocol vision: mutual credit, passports, governance, mesh design |
| [SCALING.md](SCALING.md) | **Scaling vision**: how the mesh handles 1 million concurrent users |
| [NETWORK.md](NETWORK.md) | **Live network reference** — nodes, IPs, DNS, ports, trust levels, connectors |

## Operations & Deployment

| Document | Description |
|----------|-------------|
| [HANDOVER.md](HANDOVER.md) | Agent handover: current state, architecture, how to continue development |
| [deploy.sh](deploy.sh) | Deploy script for Azure VMs. Nodes can also `git pull` this public repo directly. |

## Contributing

| Document | Description |
|----------|-------------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines, code of conduct, governance, licensing |

---

## App Documentation

| App | README | What It Does |
|-----|--------|-------------|
| **BeanPool Node** | [apps/server/README.md](apps/server/README.md) | Local gateway — genesis logic, trust bootstrap, DNS shim, PWA host, libp2p mesh |
| **PWA** | [apps/pwa/README.md](apps/pwa/README.md) | Sovereign community interface — identity, 4-tier privacy, marketplace, offline mode |
| **Pillar Toggle** | [apps/native/README.md](apps/native/README.md) | Background mesh mirror — delta-only sync, 20s fail-fast, 1,000-tx pruning |

## Core Protocol

| Module | Path | What It Handles |
|--------|------|----------------|
| **Ledger** | `packages/beanpool-core/src/ledger.ts` | Mutual credit accounts, demurrage decay, transfers, Commons Fund |
| **Passport** | `packages/beanpool-core/src/passport.ts` | Identity, standing score, badges, contribution history |
| **Router** | `packages/beanpool-core/src/router.ts` | Geo-pinned marketplace (Needs, Offers, Commons), proximity search |
| **Governance** | `packages/beanpool-core/src/governance.ts` | Proposals, quadratic voting, Commons escrow |
| **Merkle** | `packages/beanpool-core/src/merkle.ts` | SHA-256 state hashing (`crypto-js`), delta sync |
| **Trade** | `packages/beanpool-core/src/trade.ts` | Trade execution — validates badges, transfers credits, logs contributions |
| **Crypto** | `packages/beanpool-core/src/crypto.ts` | Ed25519 keypair generation, signing, verification |
| **Gossip** | `packages/beanpool-core/src/gossip.ts` | GossipSub topic definitions and message handling |

> **⚠️ Cross-Platform Hashing:** All Merkle and state hashing uses `crypto-js/sha256` — NOT `node:crypto` or `webcrypto`. This ensures deterministic hashes across browser, Node.js, and React Native.

---

## Key Config Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Port mappings, env vars, volume mounts |
| `.env` | Cloudflare API secrets — `CF_API_TOKEN`, `CF_ZONE_ID` (gitignored) |
| `Dockerfile` | Multi-stage build: core → PWA → BeanPool Node |
