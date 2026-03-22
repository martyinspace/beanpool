# 📚 BeanPool Documentation Index

> **Start here.** This is the master guide to all documentation in the BeanPool project.
> Updated: 2026-03-19

---

## 🚀 Quick Start — For New Agents

| # | Document | What You'll Learn |
|---|----------|-------------------|
| 1 | [HANDOVER.md](HANDOVER.md) | **Start here.** Current state, gotchas (LE rate limits!), architecture, deploy commands |
| 2 | [NETWORK.md](NETWORK.md) | Live nodes, ports, DNS, TLS, connectors, sync |
| 3 | [README.md](README.md) | Project overview, features, API reference |
| 4 | [SUMMARY.md](SUMMARY.md) | Protocol concepts: mutual credit, identity, governance |
| 5 | [docs/NODE_ADMIN_SETUP.md](docs/NODE_ADMIN_SETUP.md) | Step-by-step guide for new node operators |
| 6 | [docs/MIRRORING_AND_FAILOVER.md](docs/MIRRORING_AND_FAILOVER.md) | High availability guide for CRDT mirrors and Cloudflare load balancing |
| 7 | [ROADMAP.md](ROADMAP.md) | Planned features and future work |

> [!IMPORTANT]
> **Read `HANDOVER.md` before making any changes.** It contains critical information about Let's Encrypt rate limits that can break deployments if ignored.

---

## Project Overview

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Project overview, features, quick start, API reference, status |
| [SUMMARY.md](SUMMARY.md) | Protocol concepts: mutual credit, identity, reputation, governance, mesh design |
| [SCALING.md](SCALING.md) | Scaling design: sharding, CRDTs, DHT, edge computing |
| [NETWORK.md](NETWORK.md) | Live network reference — nodes, IPs, DNS, ports, TLS, trust levels, sync |
| [ROADMAP.md](ROADMAP.md) | Planned features — identity, marketplace, governance, native app |

## Operations & Deployment

| Document | Description |
|----------|-------------|
| [HANDOVER.md](HANDOVER.md) | Agent handover: current state, LE rate limits, architecture, how to deploy |
| [docs/NODE_ADMIN_SETUP.md](docs/NODE_ADMIN_SETUP.md) | Admin setup guide — Docker, Let's Encrypt, no-domain, maintenance |
| [docs/MIRRORING_AND_FAILOVER.md](docs/MIRRORING_AND_FAILOVER.md) | High availability guide — CRDT mirrors, DNS failover, and community merging |
| [deploy.sh](deploy.sh) | Deploy script — `bash deploy.sh 1 2 3` for node-specific deploys |

## Contributing

| Document | Description |
|----------|-------------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines, code of conduct, governance, licensing |

---

## App Documentation

| App | Dir | What It Does |
|-----|-----|-------------|
| **BeanPool Node** | `apps/server/` | Gateway — genesis, admin, REST APIs, WebSocket, connectors, handshake, lazy sync, libp2p |
| **PWA** | `apps/pwa/` | UI — map, marketplace, messaging, people/friends, ledger, profiles, seed phrase recovery, reputation, privacy |
| **Pillar Toggle** | `apps/native/` | Background mesh state mirror (Expo + React Native) — see [apps/native/README.md](apps/native/README.md) |

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
| `apps/server/src/tls.ts` | **TLS certificate management** — LE via acme-client + self-signed fallback |
| `apps/server/src/state-engine.ts` | In-memory state: members, posts, profiles, conversations, messages, invites, ledger, ratings, reports |
| `apps/server/src/https-server.ts` | 30+ REST API endpoints: community, marketplace, friends, ratings, reports, admin |
| `apps/server/src/connector-manager.ts` | Sovereign connectors with federation trust levels (peer/mirror/blocked) |
| `apps/server/src/federation-api.ts` | Federation CORS middleware + `/api/node/info` |
| `apps/server/src/federation-protocol.ts` | Secure Libp2p authenticated Noise streams for cross-node mesh routing |
| `apps/server/src/handshake.ts` | Mutual trust verification + latency via yamux streams |
| `apps/server/src/sync-protocol.ts` | Lazy state sync — Merkle hash + delta exchange |
| `apps/server/src/local-config.ts` | Admin auth (scrypt) + node config |
| `apps/server/static/settings.html` | Admin settings page — 4-tab layout (Identity, Network, Community, System), health dashboard, abuse reports, connectors |

## PWA Source (Key Files)

| File | Purpose |
|------|---------|
| `apps/pwa/src/App.tsx` | Shell — identity gate, 5-tab bottom nav (Map, Market, Chat, People, Ledger), header |
| `apps/pwa/src/pages/MapPage.tsx` | Leaflet/OSM map with marketplace pins, post form with photo upload |
| `apps/pwa/src/pages/MarketplacePage.tsx` | Marketplace list + search + radius filter + post detail + edit own posts + bean ratings + abuse reporting |
| `apps/pwa/src/pages/MessagesPage.tsx` | Conversations list + chat view (DMs + groups) |
| `apps/pwa/src/pages/PeoplePage.tsx` | People tab — Friends, Community browser, Invites, Guardians sub-views |
| `apps/pwa/src/pages/LedgerPage.tsx` | Balance, transactions, send credits |
| `apps/pwa/src/pages/ProfilePage.tsx` | Editable profile — avatar (camera/gallery), callsign, bio, contact |
| `apps/pwa/src/components/MarketplaceCard.tsx` | Post tile with primary photo + bean rating |
| `apps/pwa/src/lib/api.ts` | Typed client for all 30+ REST endpoints (incl. friends, guardians, members) |
| `apps/pwa/src/lib/identity.ts` | Ed25519 identity — mnemonic-derived keys, IndexedDB persistence |
| `apps/pwa/src/lib/mnemonic.ts` | BIP-39 mnemonic generation + WebCrypto PKCS8 key derivation |
| `apps/pwa/src/lib/e2e-crypto.ts` | Plaintext v1 encoding (E2E-ready data model) |
| `apps/pwa/src/lib/marketplace.ts` | 13-category config, MarketplacePost type |
| `apps/pwa/src/lib/geo.ts` | Haversine distance, radius settings persistence |
| `apps/pwa/src/components/RadiusPickerPage.tsx` | Facebook-style map radius picker (Leaflet circle + slider) |

---

## Config Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Port mappings, env vars, volume mounts |
| `.env` | Cloudflare + admin secrets (**gitignored**) |
| `Dockerfile` | Multi-stage build: core → PWA → BeanPool Node |
| `deploy.sh` | Deploy script — Azure + Debian nodes, per-node SSH user |
| `turbo.json` | Turborepo build pipeline |
| `pnpm-workspace.yaml` | Monorepo workspace config |

---

_Last updated: 2026-03-19 12:35 AEDT_
