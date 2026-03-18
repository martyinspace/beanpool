# BeanPool

> A decentralized mutual credit protocol for sovereign communities.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Beta](https://img.shields.io/badge/Status-Beta-emerald.svg)]()

---

## What is BeanPool?

BeanPool is an open protocol for building a **post-extraction economy**. It connects communities through a decentralized mutual credit system where value is created through cooperation, not extraction. Nodes gossip state over a libp2p mesh, automatically applying demurrage (value decay) to prevent hoarding and fund a community Commons pool.

**Live network:** [sydney.beanpool.org](https://sydney.beanpool.org) · [korea.beanpool.org](https://korea.beanpool.org) · [debian.beanpool.org](https://debian.beanpool.org:8443) — connected via libp2p with ~570ms handshake latency and 15-minute lazy state sync.

---

## Features

### 🗺️ Community Map
Full-screen Leaflet/OSM map as the landing page:
- **Light mode** (default) with dark mode toggle 🌙
- **GPS crosshair** with pulse-animated purple user marker
- **Marketplace pins** — category emoji icons, colour-coded offers (blue) / needs (orange)
- **Tap pin → popup → "View in Market →"** navigates directly to the post detail view

### 🤝 Marketplace
13-category peer-to-peer bazaar:
- Create posts (offer/need, category, title, description, Ʀ pricing)
- Filter by type and category
- **Post detail view** — full description, credits, author profile (avatar, bio, contact), action buttons
- **💬 Message** — opens a DM with the author directly from the post
- **🤝 Accept / Fulfill** — trade proposal (placeholder)

### 💬 E2E Messaging
DMs and group chats with E2E-ready data model:
- **Direct messages** — tap any member or use "Message" from a post detail
- **Group chats** — create named groups with multiple members
- **Plaintext v1** encoding (base64) — data model ready for X25519/AES-256-GCM upgrade

### 🎟️ Invite Tree
Invite-only membership with hierarchical accountability:
- **Single-use invite codes** — each code works once, then a new one is generated
- **QR + share** — copy invite code or share via QR
- **Invite tree** — full hierarchy of who invited whom, useful for community health

### 👤 Member Profiles
- **Avatar, bio, and contact details** with 3-tier visibility (hidden / trade partners / community)
- Profile shown in post detail views and messaging

### 📊 Ledger
Mutual credit balance and transaction history:
- **Send credits** to other members with member picker
- **Balance gauge** with −100Ʀ floor
- **Commons Pool** display (funds from demurrage decay)
- **Transaction history** with sent/received indicators

### 🔗 Sovereign Connectors
Node-to-node trust relationships with 3 levels:
- **`read_only`** — observe public activity
- **`credit_verification`** — cross-community credit verification
- **`full_sync`** — complete data replication + lazy state sync

### 🔄 Lazy State Sync
Automatic state synchronisation between trusted nodes:
- **Merkle hash comparison** — only syncs when state differs
- **Delta exchange** — new members and posts only
- **15-minute intervals** with initial sync 30s after boot
- **Origin tracking** — posts carry their source node ID

### 🔒 Privacy (4-Tier Location Model)
| Tier | Emoji | GPS Usage | What's Shared |
|------|-------|-----------|---------------|
| Ghost *(default)* | 👻 | None | Nothing — manual pin drop |
| Post-Only | 📍 | Once per post | Location at posting time |
| Zone | 🔵 | On app open | Fuzzed ±2km, session-stable |
| Live | 🔴 | Real-time | Exact, foreground only |

### 📲 PWA Install
Install banner with device-specific instructions:
- **Android Chrome** → native `beforeinstallprompt` one-tap install
- **iPhone Safari** → Share → Add to Home Screen steps
- Bean icon on home screen, full-screen standalone mode

---

## Monorepo Structure

```
beanpool/
├── apps/
│   ├── server/        # BeanPool Node — gateway, PWA host, REST API, libp2p mesh
│   └── pwa/           # PWA — map, marketplace, messaging, ledger (Vite + React + Leaflet)
├── packages/
│   └── beanpool-core/ # Shared protocol: Ledger, Merkle, Passport, Governance
├── branding/          # Bean icon assets (16x16 → 512x512)
├── Dockerfile         # Multi-stage build for BeanPool Node container
├── docker-compose.yml # Docker orchestration
└── deploy.sh          # Deploy to all nodes via SSH (Azure + Debian)
```

---

## Quick Start

### Run a BeanPool Node (Docker)

```bash
git clone https://github.com/martyinspace/beanpool.git
cd beanpool
docker compose -p beanpool up -d --build
```

- **PWA:** `https://localhost:8443/` — community map, marketplace, messaging, ledger
- **Trust Bootstrap:** `http://localhost:8080/` — QR codes + CA cert download
- **P2P Mesh:** TCP `:4001` / WS `:4002`

### Development

```bash
pnpm install
cd packages/beanpool-core && pnpm build   # Build shared core first
cd apps/pwa && pnpm build                 # Build PWA → apps/server/public/
cd apps/server && pnpm dev                # Start BeanPool Node with hot reload
```

Or build everything at once:

```bash
pnpm build   # Builds all packages via Turborepo
```

---

## REST API

All endpoints are served on port 8443 (HTTPS):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/community/info` | GET | Community stats (members, posts, transactions) |
| `/api/community/register` | POST | Register new member (publicKey + callsign) |
| `/api/community/members` | GET | List all members |
| `/api/invite/generate` | POST | Generate a single-use invite code |
| `/api/invite/redeem` | POST | Redeem an invite code to join |
| `/api/invite/tree` | GET | Full invite hierarchy |
| `/api/profile/update` | POST | Update member profile (avatar, bio, contact) |
| `/api/profile/:publicKey` | GET | Get a member's profile |
| `/api/ledger/balance/:publicKey` | GET | Get balance, floor, commons |
| `/api/ledger/transfer` | POST | Send credits (from, to, amount, memo) |
| `/api/ledger/transactions` | GET | Transaction history |
| `/api/marketplace/posts` | GET | List marketplace posts (filterable) |
| `/api/marketplace/posts` | POST | Create a new post |
| `/api/messages/conversation` | POST | Create a DM or group conversation |
| `/api/messages/send` | POST | Send a message |
| `/api/messages/conversations/:pubkey` | GET | List conversations for a member |
| `/api/messages/messages/:conversationId` | GET | Get messages in a conversation |
| `/ws` | WebSocket | Real-time state feed |

---

## Port Architecture

| Port | Protocol | Purpose |
|------|----------|---------|
| **4001** | TCP | libp2p P2P mesh |
| **4002** | WS | libp2p WebSocket transport |
| **8080** | HTTP | Trust Bootstrap (QR onboarding) |
| **8443** | HTTPS | PWA + REST API + WebSocket |

---

## The Protocol

- **Mutual Credit** — participants can go negative (up to −100Ʀ) backed by community trust
- **Demurrage (Decay)** — positive balances decay at 0.5% per month, returning to the Commons Fund
- **Gossip Mesh** — nodes sync state via libp2p over TCP/WebSockets
- **Lazy State Sync** — Merkle hash comparison + delta exchange every 15 minutes
- **Sovereign Identity** — Ed25519 keypairs generated locally (WebCrypto + IndexedDB)
- **Invite Tree** — hierarchical membership with single-use invite codes
- **Handshake Protocol** — mutual trust verification + latency measurement via yamux streams

---

## Project Documentation

| Document | Description |
|----------|-------------|
| [index.md](index.md) | Master documentation index — **start here** |
| [HANDOVER.md](HANDOVER.md) | Agent handover: current state, LE rate limits, architecture |
| [NETWORK.md](NETWORK.md) | Live network reference — nodes, IPs, DNS, ports, TLS, trust levels |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines, code of conduct, governance model |
| [SUMMARY.md](SUMMARY.md) | Protocol concepts: mutual credit, identity, governance, mesh design |
| [SCALING.md](SCALING.md) | Scaling design: sharding, CRDTs, DHT, edge computing |

---

## Status

BeanPool is in active development (v0.2.10). The PWA is **fully functional** with invite-only membership, community map, marketplace with post detail views, E2E messaging (DMs + groups), mutual credit ledger, and member profiles — all connected to live server APIs. Three nodes (Sydney, Korea, Debian) are deployed with lazy state sync over libp2p.

**What's working:**
- ✅ Invite-only membership with single-use codes + invite tree
- ✅ Member profiles (avatar, bio, contact visibility)
- ✅ E2E messaging — DMs and group chats
- ✅ PWA with map, marketplace, messaging, ledger, identity
- ✅ Post detail view with author profile + Message/Trade actions
- ✅ REST APIs for all features
- ✅ WebSocket real-time state feed
- ✅ Sovereign connectors with 3 trust levels
- ✅ Lazy state sync (Merkle hash + delta exchange, 15-min intervals)
- ✅ Handshake protocol (~570ms latency between continents)
- ✅ Let's Encrypt auto-TLS via DNS-01 challenge (Cloudflare API)
- ✅ 3 live nodes — Sydney (Azure), Korea (Azure), Debian (bare metal)

**Coming next:**
- Community health dashboard (invite tree visualisation, flagged patterns)
- Offline PWA caching via Service Worker
- Federated credit verification (`/beanpool/verify/1.0.0`)
- Governance module integration (quadratic voting)

---

## License

[MIT](LICENSE)
