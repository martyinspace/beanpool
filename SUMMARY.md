# BeanPool Protocol Summary

BeanPool is a decentralized mutual credit protocol designed for sovereign communities. The current implementation operates as a **local-first mesh** where a BeanPool Node serves as a community gateway, hosting a PWA for members and connecting to other nodes via libp2p.

## Core Concepts

### 1. Identity (Sovereign Passports)
Each participant generates an **Ed25519 keypair** locally on their device. There are no central accounts or passwords.
*   **Standing Score**: A reputation metric earned by contributing to the community (completing trades, claiming bounties). Standing governs privileges like creating Governance proposals.
*   **Callsign**: A human-readable name chosen at first boot (e.g. "Farm-Jenny") that maps to the cryptographic public key.
*   **Genesis Badge**: New participants start with a Standing of 10 to enable immediate participation.

### 2. Economics (Mutual Credit + Demurrage)
A peer-to-peer economic layer designed to encourage circulation rather than accumulation.
*   **Mutual Credit**: Participants begin with 0.00 credits and a guaranteed credit floor of `−100Ʀ`. This enables immediate participation — you can contribute value before receiving it.
*   **Demurrage (Decay)**: Positive balances decay at 0.5% per month. The decayed value is swept into a shared `COMMONS_BALANCE`, funding community projects via governance proposals.
*   **Merkle Sync**: All account state is hashed into a deterministic Merkle tree using `crypto-js/sha256`. Nodes reconcile state via delta sync.

### 3. Mesh Network (libp2p)
The current implementation uses a **libp2p gossip mesh** over TCP and WebSocket transports:
*   **GossipSub** for state propagation (Merkle roots, mesh state)
*   **Layered Bootstrap Discovery**: DNS (Cloudflare) → Hardcoded IPs → PeerStore cache
*   **Cloudflare DNS Auto-Registration**: Each node self-registers its DNS record on startup
*   **Future**: BLE mesh for local-first communication without internet dependency

### 4. Marketplace (Geo-Located Needs & Offers)
A hyper-local resource coordination system with 13 categories:
*   **Blue** (#3b82f6) = Offers — what community members can provide
*   **Orange** (#f97316) = Needs — what community members are looking for
*   Posts can be geo-tagged and sync across the mesh via libp2p gossip

### 5. Governance (Quadratic Voting)
Community proposals are voted on using quadratic voting to prevent plutocratic capture.
*   **Grand Bounties**: Community-level goals (e.g. "Install Solar Arrays") funded from the Commons Fund
*   **Commons Escrow**: When proposals reach their vote threshold, credits are drawn from the accumulated `COMMONS_BALANCE`

### 6. Privacy (4-Tier Location Model)
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
| BeanPool Node | `apps/server` | Local gateway — genesis, trust bootstrap, DNS shim, PWA host, libp2p mesh |
| PWA | `apps/pwa` | Primary user interface — identity, marketplace, ledger, offline mode |
| Pillar Toggle | `apps/native` | Background sync engine — delta-only Merkle comparison, 20s timeout, pruning |
| Core Protocol | `packages/beanpool-core` | Shared library — Ledger, Merkle, Passport, Governance, Trade, Router, Crypto |

---
_Building sovereign infrastructure for communities. Moving from extraction to contribution._
