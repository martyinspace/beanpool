# BeanPool Protocol Summary

BeanPool is a decentralized mutual credit protocol designed for sovereign communities. A BeanPool Node serves as a community gateway, hosting a PWA for members and connecting to other nodes via libp2p for lazy state synchronisation.

## Core Concepts

### 1. Identity (Sovereign Passports)
Each participant generates an **Ed25519 keypair** locally on their device. There are no central accounts or passwords.
* **Callsign**: A human-readable name chosen at first boot (e.g. "Farm-Jenny") that maps to the cryptographic public key. Callsigns are editable and sync across IndexedDB and the server.
* **Invite Tree**: New members join by redeeming single-use invite codes, building a hierarchical accountability tree.
* **Profiles**: Avatar (camera + gallery upload), editable callsign, bio, and contact details with 3-tier visibility (hidden / trade partners / community).

### 2. Economics (Mutual Credit + Demurrage)
A peer-to-peer economic layer designed to encourage circulation rather than accumulation.
* **Mutual Credit**: Participants begin with 0.00 credits and a guaranteed credit floor of `−100Ʀ`. This enables immediate participation — you can contribute value before receiving it.
* **Demurrage (Decay)**: Positive balances decay at 0.5% per month. The decayed value is swept into a shared `COMMONS_BALANCE`, funding community projects via governance proposals.
* **Merkle Sync**: All account state is hashed into a deterministic Merkle tree. Nodes reconcile state via lazy delta sync.

### 3. Mesh Network (libp2p)
The current implementation uses a **libp2p mesh** over TCP and WebSocket transports:
* **Sovereign Connectors**: Manual trust relationships between nodes (peer / mirror / blocked) with a federation protocol for cross-community trading and cross-node messaging over cryptographically authenticated Noise streams.
* **Lazy State Sync**: Merkle hash comparison + delta exchange every 15 minutes
* **Handshake Protocol**: Mutual trust verification + latency measurement via yamux streams
* **Cloudflare DNS Auto-Registration**: Each node self-registers its DNS record on startup

### 4. Marketplace (Geo-Located Needs & Offers)
A hyper-local resource coordination system with 13 categories (PWA) / 14 categories (Native, adds Care ❤️):
* **Blue** (#3b82f6) = Offers — what community members can provide
* **Orange** (#f97316) = Needs — what community members are looking for
* Posts appear as pins on the community map and sync across trusted nodes
* **Post photos** — up to 3 photos per post, auto-resized to 400px JPEG
* **Post detail view** with author profile, photo gallery, credits, and action buttons
* **Post validation** — all fields required with visual red glow on empty fields
* **"My Posts"** toggle to view own listings
* **Category dropdown** for filtering

### 5. Messaging (E2E-Ready)
DMs and group chats between community members:
* **Direct messages** — from marketplace posts or the member list
* **Group chats** — named groups with multiple members
* **Plaintext v1** encoding — data model ready for X25519/AES-256-GCM upgrade
* Messages stored as opaque ciphertext on the server

### 6. Reputation & Trust
Community-driven accountability mechanisms:
* **🫘 Bean Ratings** — 5-tier reputation score with optional comments (one per rater-per-target, updatable)
* **Bean display** — `🫘🫘🫘○○` shown on marketplace tiles and post detail view
* **Abuse Reporting** — flag bad actors with reason dropdown (spam, offensive, misleading, harassment, other)
* **Admin Panel** — abuse reports viewable in Settings with reporter, target, reason, and date

### 7. Governance (Quadratic Voting)
Community proposals are voted on using quadratic voting to prevent plutocratic capture.
* **Grand Bounties**: Community-level goals funded from the Commons Fund
* **Commons Escrow**: When proposals reach their vote threshold, credits are drawn from `COMMONS_BALANCE`

### 8. Privacy (4-Tier Location Model)
Location privacy is user-controlled with four tiers:

| Tier | GPS Usage | What's Shared |
|------|-----------|---------------|
| 👻 Ghost *(default)* | None | Nothing — manual pin drop for posts |
| 📍 Post-Only | Once per post | Location attached to that post only |
| 🔵 Zone (~2km) | On app open | Fuzzed location, session-stable |
| 🔴 Live | Real-time | Exact position, foreground only |

## Current Architecture

| Component | Directory | Role |
|-----------|-----------|------|
| BeanPool Node | `apps/server` | Gateway — genesis, admin, REST APIs, WebSocket, connectors, handshake, sync, libp2p |
| PWA | `apps/pwa` | UI — map, marketplace (13 categories), messaging, ledger, profiles, identity, privacy |
| Core Protocol | `packages/beanpool-core` | Shared library — Ledger, Merkle, Passport, Governance, Trade, Router, Crypto |
| Native App | `apps/native` | Expo + React Native — 7-tab mobile client (Map, Projects, Market, Chat, People, Ledger, Settings), SQLite + SecureStore |

---
_Building sovereign infrastructure for communities. Moving from extraction to contribution._
