# BeanPool Protocol Summary

BeanPool is a decentralized mutual credit protocol designed for sovereign communities. A BeanPool Node serves as a community gateway, hosting a PWA for members and connecting to other nodes via libp2p for lazy state synchronisation.

## Core Concepts

### 1. Identity (Sovereign Passports)
Each participant generates an **Ed25519 keypair** locally on their device. There are no central accounts or passwords.
* **Callsign**: A human-readable name chosen at first boot (e.g. "Farm-Jenny") that maps to the cryptographic public key.
* **Invite Tree**: New members join by redeeming single-use invite codes, building a hierarchical accountability tree.
* **Profiles**: Avatar, bio, and contact details with 3-tier visibility (hidden / trade partners / community).

### 2. Economics (Mutual Credit + Demurrage)
A peer-to-peer economic layer designed to encourage circulation rather than accumulation.
* **Mutual Credit**: Participants begin with 0.00 credits and a guaranteed credit floor of `−100Ʀ`. This enables immediate participation — you can contribute value before receiving it.
* **Demurrage (Decay)**: Positive balances decay at 0.5% per month. The decayed value is swept into a shared `COMMONS_BALANCE`, funding community projects via governance proposals.
* **Merkle Sync**: All account state is hashed into a deterministic Merkle tree. Nodes reconcile state via lazy delta sync.

### 3. Mesh Network (libp2p)
The current implementation uses a **libp2p mesh** over TCP and WebSocket transports:
* **Sovereign Connectors**: Manual trust relationships between nodes (read_only / credit_verification / full_sync)
* **Lazy State Sync**: Merkle hash comparison + delta exchange every 15 minutes
* **Handshake Protocol**: Mutual trust verification + latency measurement via yamux streams
* **Cloudflare DNS Auto-Registration**: Each node self-registers its DNS record on startup

### 4. Marketplace (Geo-Located Needs & Offers)
A hyper-local resource coordination system with 13 categories:
* **Blue** (#3b82f6) = Offers — what community members can provide
* **Orange** (#f97316) = Needs — what community members are looking for
* Posts appear as pins on the community map and sync across trusted nodes
* **Post detail view** with author profile, credits, and action buttons

### 5. Messaging (E2E-Ready)
DMs and group chats between community members:
* **Direct messages** — from marketplace posts or the member list
* **Group chats** — named groups with multiple members
* **Plaintext v1** encoding — data model ready for X25519/AES-256-GCM upgrade
* Messages stored as opaque ciphertext on the server

### 6. Governance (Quadratic Voting)
Community proposals are voted on using quadratic voting to prevent plutocratic capture.
* **Grand Bounties**: Community-level goals funded from the Commons Fund
* **Commons Escrow**: When proposals reach their vote threshold, credits are drawn from `COMMONS_BALANCE`

### 7. Privacy (4-Tier Location Model)
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
| PWA | `apps/pwa` | UI — map, marketplace, messaging, ledger, profiles, identity, privacy |
| Core Protocol | `packages/beanpool-core` | Shared library — Ledger, Merkle, Passport, Governance, Trade, Router, Crypto |

---
_Building sovereign infrastructure for communities. Moving from extraction to contribution._
