# BeanPool

> A decentralized mutual credit protocol for sovereign communities.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Beta](https://img.shields.io/badge/Status-Beta-emerald.svg)]()

---

## What is BeanPool?

BeanPool is an open protocol for building a **post-extraction economy**. It connects communities through a decentralized mutual credit system where value is created through cooperation, not extraction. Nodes gossip transactions over a libp2p mesh, automatically applying demurrage (value decay) to prevent hoarding and fund a community Commons pool.

**Live network:** 2 sovereign nodes — [sydney.beanpool.org](https://sydney.beanpool.org) and [korea.beanpool.org](https://korea.beanpool.org), connected via libp2p with ~570ms handshake latency.

---

## Monorepo Structure

```
beanpool/
├── apps/
│   ├── server/        # BeanPool Node — gateway, PWA host, REST API, libp2p mesh
│   ├── pwa/           # PWA — map, marketplace, ledger (Vite + React + Leaflet)
│   └── native/        # Pillar Toggle — background mesh sync (Expo)
├── packages/
│   └── beanpool-core/ # Shared protocol: Ledger, Merkle, Passport, Governance
├── branding/          # Bean icon assets (16x16 → 512x512)
├── docs/architecture/ # Architecture diagrams
├── Dockerfile         # Multi-stage build for BeanPool Node container
├── docker-compose.yml # Docker orchestration
└── deploy.sh          # Deploy to Azure VMs via SSH
```

### Per-App Documentation

| App | README | Description |
|-----|--------|-------------|
| **BeanPool Node** | [apps/server/README.md](apps/server/README.md) | Gateway — genesis, admin auth, REST APIs, WebSocket, connectors, handshake, libp2p |
| **PWA** | [apps/pwa/README.md](apps/pwa/README.md) | Map, marketplace, ledger, identity, 4-tier privacy, install banner |
| **Pillar Toggle** | [apps/native/README.md](apps/native/README.md) | Background mesh mirror — delta-only sync, pruning |
| **Core** | [packages/beanpool-core/](packages/beanpool-core/) | Shared protocol — Ledger, Merkle, Passport, Governance, Trade, Router |

### Project Documentation

| Document | Description |
|----------|-------------|
| [**index.md**](index.md) | Master documentation index for all `.md` files and protocol modules |
| [NETWORK.md](NETWORK.md) | Live network reference — nodes, IPs, DNS, ports, trust levels, connectors |
| [HANDOVER.md](HANDOVER.md) | Agent handover: current state, architecture, how to continue development |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines, code of conduct, governance model |
| [SUMMARY.md](SUMMARY.md) | Protocol concepts: mutual credit, identity, governance, mesh design |

---

## Quick Start

### Run a BeanPool Node (Docker)

```bash
git clone https://github.com/martyinspace/beanpool.git
cd beanpool
docker compose -p beanpool up -d --build
```

- **PWA:** `https://localhost:8443/` — community map, marketplace, ledger
- **Settings:** `https://localhost:8443/settings` — admin dashboard, connectors
- **Trust Bootstrap:** `http://localhost:8080/` — QR codes + CA cert download
- **P2P Mesh:** TCP `:4001` / WS `:4002`

### Development

```bash
pnpm install
cd packages/beanpool-core && pnpm build   # Build shared core first
cd apps/pwa && pnpm build                 # Build PWA → apps/server/public/
cd apps/server && pnpm dev                # Start BeanPool Node with hot reload
```

---

## Port Architecture

| Port | Protocol | Purpose |
|------|----------|---------|
| **4001** | TCP | libp2p P2P mesh |
| **4002** | WS | libp2p WebSocket transport |
| **8080** | HTTP | Trust Bootstrap (`/trust` + QR onboarding) |
| **8443** | HTTPS | PWA + REST API + WebSocket + Settings |

---

## Features

### 🗺️ Community Map (`apps/pwa`)
Full-screen Leaflet/OSM map as the landing page:
- **Dark mode** (default) via CSS invert — toggle ☀️/🌙
- **GPS crosshair** — pulse-animated purple user marker
- **Marketplace pins** — category emoji icons with offer/need color coding
- **Zoom controls** (+/−) bottom-left

### 🤝 Marketplace
13-category peer-to-peer bazaar with blue Offers / orange Needs:
- Create posts (offer/need, category, title, description, Ʀ pricing)
- Filter by type and category
- Real-time updates via WebSocket

### 📊 Ledger
Mutual credit balance, transactions, and community economy:
- **Send credits** to other members with member picker
- **Balance gauge** with −100Ʀ floor
- **Commons Pool** display (funds from demurrage decay)
- **Transaction history** with sent/received indicators

### 🔗 Sovereign Connectors
Node-to-node trust relationships with 3 levels:
- **`read_only`** — observe public activity
- **`credit_verification`** — cross-community credit verification (default)
- **`full_sync`** — complete data replication (backup nodes)
- Mutual handshake protocol: trust verification + latency measurement

### 📲 PWA Install
Install banner with device-specific instructions:
- **Android Chrome** → native `beforeinstallprompt` one-tap install
- **iPhone Safari** → Share → Add to Home Screen steps
- Bean icon on home screen, full-screen standalone mode

### 🔒 Privacy (4-Tier Location Model)
| Tier | Emoji | GPS Usage | What's Shared |
|------|-------|-----------|---------------|
| Ghost *(default)* | 👻 | None | Nothing — manual pin drop |
| Post-Only | 📍 | Once per post | Location at posting time |
| Zone | 🔵 | On app open | Fuzzed ±2km, session-stable |
| Live | 🔴 | Real-time | Exact, foreground only |

---

## REST API

All endpoints are served on port 8443 (HTTPS):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/community/info` | GET | Community stats (members, posts, transactions) |
| `/api/community/register` | POST | Register new member (publicKey + callsign) |
| `/api/community/members` | GET | List all members |
| `/api/ledger/balance/:publicKey` | GET | Get balance, floor, commons |
| `/api/ledger/transfer` | POST | Send credits (from, to, amount, memo) |
| `/api/ledger/transactions` | GET | Transaction history |
| `/api/marketplace/posts` | GET | List marketplace posts |
| `/api/marketplace/posts` | POST | Create a new post |
| `/ws` | WebSocket | Real-time state feed |

---

## The Protocol

- **Mutual Credit** — participants can go negative (up to −100Ʀ) backed by community trust
- **Demurrage (Decay)** — positive balances decay at 0.5% per month, returning to the Commons Fund
- **Gossip Mesh** — nodes sync state via libp2p over TCP/WebSockets
- **Sovereign Identity** — Ed25519 keypairs generated locally (WebCrypto + IndexedDB)
- **Handshake Protocol** — mutual trust verification + latency measurement via yamux streams

---

## Status

BeanPool is in active development. The PWA is **functional** with a community map, marketplace, ledger, and identity system — all connected to live server APIs. Two nodes (Sydney and Korea) are deployed and connected via libp2p with sovereign connectors and a working handshake protocol.

**What's working:**
- ✅ PWA with map, marketplace, ledger, identity, install banner
- ✅ REST APIs for community, ledger, and marketplace
- ✅ WebSocket real-time state feed
- ✅ Sovereign connectors with 3 trust levels
- ✅ Handshake protocol (~570ms latency between continents)
- ✅ Let's Encrypt auto-TLS
- ✅ Cloudflare DNS auto-registration

**Coming next:**
- Store submissions (Play Store + App Store via apps/native)
- Federated credit verification (`/beanpool/verify/1.0.0`)
- Full sync data replication for backup nodes
- Governance module integration (quadratic voting)

---

## License

[MIT](LICENSE)
