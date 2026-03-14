# 📚 BeanPool Documentation Index

> **Start here.** This is the master guide to all documentation in the BeanPool project.
> Updated: 2026-03-17

---

## Project Overview

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Project overview, features, quick start, API reference, status |
| [SUMMARY.md](SUMMARY.md) | Protocol concepts: mutual credit, identity, governance, mesh design |
| [SCALING.md](SCALING.md) | Scaling design: sharding, CRDTs, DHT, edge computing |
| [NETWORK.md](NETWORK.md) | Live network reference — nodes, IPs, DNS, ports, trust levels, sync |

## Operations & Deployment

| Document | Description |
|----------|-------------|
| [HANDOVER.md](HANDOVER.md) | Agent handover: current state, architecture, how to continue |
| [deploy.sh](deploy.sh) | Deploy script for Azure VMs via SSH |

## Contributing

| Document | Description |
|----------|-------------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines, code of conduct, governance, licensing |

---

## App Documentation

| App | README | What It Does |
|-----|--------|-------------|
| **BeanPool Node** | `apps/server/` | Gateway — genesis, admin, REST APIs, WebSocket, connectors, handshake, lazy sync, libp2p |
| **PWA** | `apps/pwa/` | UI — map, marketplace, messaging, ledger, profiles, identity, privacy, install prompt |

## Core Protocol

| Module | Path | What It Handles |
|--------|------|----------------|
| **Ledger** | `packages/beanpool-core/src/ledger.ts` | Mutual credit accounts, demurrage decay, transfers, Commons Fund |
| **Passport** | `packages/beanpool-core/src/passport.ts` | Identity, standing score, badges, contribution history |
| **Router** | `packages/beanpool-core/src/router.ts` | Geo-pinned marketplace (Needs, Offers, Commons), proximity search |
| **Governance** | `packages/beanpool-core/src/governance.ts` | Proposals, quadratic voting, Commons escrow |
| **Merkle** | `packages/beanpool-core/src/merkle.ts` | SHA-256 state hashing, delta sync |
| **Trade** | `packages/beanpool-core/src/trade.ts` | Trade execution — validates badges, transfers credits |
| **Crypto** | `packages/beanpool-core/src/crypto.ts` | Ed25519 keypair generation, signing, verification |
| **Gossip** | `packages/beanpool-core/src/gossip.ts` | GossipSub topic definitions and message handling |

---

## Server Source (Key Files)

| File | Purpose |
|------|---------|
| `apps/server/src/index.ts` | Main boot orchestrator — 5-stage startup |
| `apps/server/src/state-engine.ts` | In-memory state: members, posts, profiles, conversations, messages, invites, ledger |
| `apps/server/src/connector-manager.ts` | Sovereign connectors with 3 trust levels |
| `apps/server/src/handshake.ts` | Mutual trust verification + latency via yamux streams |
| `apps/server/src/sync-protocol.ts` | Lazy state sync — Merkle hash + delta exchange |
| `apps/server/src/local-config.ts` | Admin auth (scrypt) + node config |

## PWA Source (Key Files)

| File | Purpose |
|------|---------|
| `apps/pwa/src/App.tsx` | Shell — identity gate, 5-tab bottom nav, header, tab routing |
| `apps/pwa/src/pages/MapPage.tsx` | Leaflet/OSM map with marketplace pins + "View in Market" popups |
| `apps/pwa/src/pages/MarketplacePage.tsx` | Marketplace list + post detail view with author profile |
| `apps/pwa/src/pages/MessagesPage.tsx` | Conversations list + chat view (DMs + groups) |
| `apps/pwa/src/pages/InvitePage.tsx` | Generate + share invite codes (QR, clipboard) |
| `apps/pwa/src/pages/LedgerPage.tsx` | Balance, transactions, send credits |
| `apps/pwa/src/lib/api.ts` | Typed client for all 18 REST endpoints |
| `apps/pwa/src/lib/e2e-crypto.ts` | Plaintext v1 encoding (E2E-ready data model) |

---

## Config Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Port mappings, env vars, volume mounts |
| `.env` | Cloudflare + admin secrets (gitignored) |
| `Dockerfile` | Multi-stage build: core → PWA → BeanPool Node |
| `turbo.json` | Turborepo build pipeline |
| `pnpm-workspace.yaml` | Monorepo workspace config |
