# BeanPool Agent Handover

> Context document for new agents working on the BeanPool project.
> **Read this first** — then see `index.md` for a full documentation map.

---
## Current State (2026-04-01)

**BeanPool is a fully functional PWA + Native App** with invite-only membership, 12-word seed phrase recovery, marketplace (with photos and category filters), E2E messaging, mutual credit ledger, member profiles (editable callsign), friends & guardians, 🫘 bean reputation system, abuse reporting, community health dashboard, and federation protocol — deployed on **3 sovereign nodes** with Let's Encrypt TLS. A **React Native / Expo companion app** (`apps/native/`) is in active development with near-complete PWA parity.

### What's Working
- ✅ **Dynamic Map Root** — Leaflet map defaults coordinate center to the node's `serviceRadius` config (e.g. Mullumbimby) instead of hardcoding, and handles location cleanly without async ghost-pin drops.
- ✅ **Invite-only membership** — single-use invite codes, hierarchical invite tree (node → seed codes → admin → organic invites)
- ✅ **12-word seed phrase** — BIP-39 mnemonic, deterministic Ed25519 key derivation, recovery flow in PWA
- ✅ **People tab** — Friends, Community browser, Invites (moved), Guardians (select up to 5)
- ✅ **Landing page welcome hub** — 3 paths (join, transfer, recover), admin contact info, FAQ
- ✅ **Admin community config** — name, email, phone in Settings → Community tab
- ✅ **Member profiles** — avatar (camera + gallery), editable callsign, bio, contact details with 3-tier visibility
- ✅ **Editable callsign** — change callsign in Profile, syncs to IndexedDB + server
- ✅ **Public Transparency** — The global Invite Tree is now viewable from genesis down by all members, and both PWA/Native clients support full Node Ledger Audit (Balances + full Txn History) CSV downloads via local/remote execution.
- ✅ **🫘 Bean reputation** — 5-bean rating with comments, displayed on post tiles and detail view
- ✅ **Abuse reporting** — reason dropdown (spam, offensive, misleading, harassment, other), admin panel in Settings
- ✅ **Marketplace** — 14-category Deals Hub with "My Market" segment controls and unread inbound request counters. The Global Discovery feed permanently hides personal listings to isolate discovery from personal administration.
- ✅ **Smart CRM Inbox** — The messaging tab acts as a Transactional CRM. Threads automatically surface their parent Marketplace Post Title and contextual Status (Active/In Escrow/Completed), with quick-filters for All, Transactions, and Direct messages natively and in PWA.
- ✅ **Automated Deals Routing** — Both Native and PWA instantly route users into their "My Market" active deals dashboard immediately upon creating a new post.
- ✅ **Escrow Handshake & Soft-Delets** — Branching 3-step (Needs) vs 1-step (Offers) request flow with smart-contract style `escrow_{id}` wallets securely handling auto-refunds even on post soft-deletion.
- ✅ **Post photos** — up to 3 photos per post, auto-resized to 400px JPEG, primary photo on tiles, gallery in detail
- ✅ **Post validation** — all fields required, red glow on empty fields, location required
- ✅ **E2E messaging** — DMs and group chats (plaintext v1, E2E-ready data model)
- ✅ **PWA** — community map (Leaflet/OSM), marketplace, messaging, people, ledger
- ✅ **Map popups → Market** — "View in Market →" button on map pins navigates to post detail
- ✅ **Post detail → Message** — "💬 Message" creates DM and auto-opens chat
- ✅ **Community health dashboard** — admin settings panel with member stats, tree depth, activity, flags
- ✅ **REST APIs** — 30+ endpoints for community, invites, profiles, ledger, marketplace, messaging, ratings, reports, friends
- ✅ **WebSocket `/ws`** — real-time state feed
- ✅ **Federation Protocol** — peer/mirror/blocked trust levels, dynamic CORS, `/api/node/info`, verify-member
- ✅ **Cross-Community Marketplace** — Connected Communities UI, remote post browsing, `🌐` node badges
- ✅ **Secure Libp2p Federation Routing** — Cross-node messaging and ledger trade validation now strictly operate over authenticated PeerID Noise streams to cryptographically prevent spoofing.
- ✅ **Mirror State Sync** — Merkle hash comparison + delta exchange, 15-min intervals (for mirror-trusted nodes)
- ✅ **Handshake Protocol** — mutual trust + latency over yamux streams
- ✅ **Let's Encrypt Auto-TLS** — DNS-01 challenge via Cloudflare API (acme-client v5)
- ✅ **4 Live Nodes** — Mullum 2 (Azure AU), Brisbane (Azure AU), Mullum 1 (bare metal LAN), Review (Azure US)
- ✅ **Node Admin Setup Guide** — comprehensive docs for new node operators
- ✅ **Database Migration (SQLite)** — replaced JSON engine with `better-sqlite3` for robust relational validation and paging limits
- ✅ **Cryptographically signed APIs** — Ed25519 client-side signatures on all POST requests preventing spoofing
- ✅ **Native App (Expo)** — 7-tab React Native companion app with PWA parity: Map, Projects, Market (14 categories), Chat, People, Ledger, Settings
- ✅ **Native SQLite Persistence** — `expo-sqlite` for local data storage (posts, projects, messages, ledger)
- ✅ **Native Background Sync** — SQLite `dbSyncLock` Mutex Queue safely handling parallel `applyDelta` and foreground Map/Inbox requests without `database is locked` panics.
- ✅ **Live Inbox Parity** — Base64 E2E plaintext message decryption, real-time polling, and global unread notification tab badges.
- ✅ **Native Identity Flow** — sovereign identity creation and 12-word recovery via Expo SecureStore
- ✅ **Community Projects Tab** — native-only crowdfunding feature with progress bars and proposal creation
- ✅ **Neon-Vine Tab Bar** — branded tab navigation with artwork background and dark overlay

---

## ⚠️ Critical: Let's Encrypt Rate Limits

> [!CAUTION]
> **Every deploy to a live node can trigger a new Let's Encrypt cert request.** If the cert fails or the node restarts too many times, you WILL hit the LE rate limit (HTTP 429) and the node will appear to hang for 60-90 minutes on "Step 2: Creating order..." before falling back to self-signed. **This has happened multiple times. Read this entire section.**

### The Golden Rule

> **Do NOT deploy to a live node unless absolutely necessary.** Each deploy wipes the Docker container and triggers a fresh LE cert request. If you're only fixing frontend code, batch your changes and deploy ONCE.

### Why Deploys Are Dangerous

1. `deploy.sh` stops the container, re-extracts code, pulls a new image, and starts a fresh container
2. The fresh container has no cached LE cert, so it calls `requestLetsEncryptCert()` on boot
3. If a previous deploy already obtained a cert AND then failed (or you deploy again quickly), the ACME account is different and LE rate-limits the domain
4. The `acme-client` library **silently waits** for the `retry-after` header (60-90 min) before the 5-minute timeout catches it
5. During this 5 minutes, the HTTPS server doesn't start — the node appears offline

### Safe Deploy Checklist

```
BEFORE DEPLOYING:
  ✅ Are you deploying for a good reason? (not just "let me try again")
  ✅ Have you batched ALL your changes into ONE commit?
  ✅ Has the GH Actions build succeeded? (check: gh run list --limit 1)
  ✅ Is the node currently online with a valid LE cert?
     → If YES: the deploy will wipe it and request a new one
     → Ask yourself: is the change worth the risk of a 5-min outage?

AFTER DEPLOYING:
  ✅ Wait 2 minutes, then check logs: ssh ... "docker logs ... | tail -20"
  ✅ Look for "✅ Let's Encrypt cert obtained" or "⚠️ Let's Encrypt failed"
  ✅ If stuck at "Step 2: Creating order..." — it's rate-limited, just wait
     → The 5-min timeout will fire and fall back to self-signed
     → The 24h renewal scheduler will get the real cert later
  ✅ Do NOT restart or redeploy — that makes it worse
```

### Rate Limits to Know

| Limit | Value | Window |
|-------|-------|--------|
| Failed Validations | 5 per domain | 1 hour |
| Duplicate Certificates | 5 per domain | 7 days |
| New Orders | 300 per account | 3 hours |

### Key File

`apps/server/src/tls.ts` — handles all TLS certificate management:
- Let's Encrypt via `acme-client` with DNS-01 challenge (Cloudflare API)
- 5-minute ACME timeout with self-signed fallback
- Self-signed CA fallback if LE fails
- 24-hour renewal scheduler
- Certificate expiry checking (30-day threshold)

---

## Architecture

| App | Dir | Purpose |
|-----|-----|---------|
| BeanPool Node | `apps/server` | Gateway — genesis, admin, REST APIs (Ed25519-secured), WebSocket, connectors, handshake, sync, libp2p |
| PWA | `apps/pwa` | UI — map, marketplace (13 categories), messaging, ledger, profiles, identity, privacy, install prompt |
| Native App | `apps/native` | Expo + React Native — 7-tab mobile client (Map, Projects, Market, Chat, People, Ledger, Settings), SQLite persistence, background Merkle sync |
| Core Protocol | `packages/beanpool-core` | Shared logic — Ledger, Merkle, Passport, Governance, Trade, Router |

### Escrow & Settlement Architecture
To prevent double-spend vulnerabilities and guarantee atomic refunds, BeanPool uses synthetic escrow wallets for all pending commitments (both Marketplace Offers/Needs and Crowdfund Projects).
* When a Deal is accepted or a project is backed, funds are instantly transferred from the backer's normal Ledger into a synthetic wallet named `escrow_{post_id}`.
* **Role-Based Release:** Only the Payer (Buyer) is authorized to release funds from escrow via `completePostTransaction()`.
* **Destructive Rollback:** If a post is deleted or reversed, all un-swept funds inside `escrow_{post_id}` are natively auto-refunded to their original backers via `recalculateEscrowRefunds()` in SQLite.
* **DO NOT** attempt to deduct directly from base Ledgers during final settlement; you must sweep the `escrow_{post_id}` wallet.

### Key Design Constraints
- **Ed25519 keypairs** for all identity (community, node, user)
- **4-port layout:** 4001 (TCP), 4002 (WS), 8080 (HTTP trust), 8443 (HTTPS PWA + API)
- **Invite-only membership** — single-use codes, hierarchical accountability tree
- **Node.js 22 required** — libp2p dependencies use `Promise.withResolvers()` (Node 22+ only)
- **Docker image:** `ghcr.io/martyinspace/beanpool-node:latest`
- **Public repo:** `github.com/martyinspace/beanpool`

---

## Development

```bash
cd /Users/marty/projects/beanpool
pnpm install
pnpm build   # Builds all packages via Turborepo
```

### Deploy

```bash
bash deploy.sh           # Deploy to all live nodes
bash deploy.sh 1         # Mullum 2 only
bash deploy.sh 2         # Brisbane only
bash deploy.sh 3         # Mullum 1 only
bash deploy.sh 4         # Review (US) only
```

### Live Nodes

| # | Node | IP | DNS | SSH User | SSH Key | Notes |
|---|------|----|-----|----------|---------|-------|
| 1 | Mullum 2 | `20.211.27.68` | `mullum2.beanpool.org` | `azureuser` | `~/.ssh/id_azure_lattice` | Azure VM (AU) |
| 2 | Brisbane | `20.5.121.158` | `brisbane.beanpool.org` | `azureuser` | `~/.ssh/id_azure_lattice` | Azure VM (AU) |
| 3 | Mullum 1 | `192.168.1.219` | `mullum1.beanpool.org` | `marty` | default key | Bare metal (LAN), behind CF `mullum.beanpool.org` LB |
| 4 | Review | `20.96.126.56` | `review.beanpool.org` | `azureuser` | `~/.ssh/id_azure_lattice` | Azure VM (US) — staging/review server |

```bash
ssh -i ~/.ssh/id_azure_lattice azureuser@20.211.27.68   # Mullum 2
ssh -i ~/.ssh/id_azure_lattice azureuser@20.5.121.158   # Brisbane
ssh marty@192.168.1.219                                  # Mullum 1 (LAN)
ssh -i ~/.ssh/id_azure_lattice azureuser@20.96.126.56   # Review (US)
```

### Useful Debug Commands

```bash
# Check node logs
ssh ... "docker logs beanpool-beanpool-node-1 2>&1"

# Check GH Actions build status
gh run list --limit 3
```

---

## Reading Order for New Agents

1. **`HANDOVER.md`** — This file (current state, gotchas, architecture)
2. **`index.md`** — Full documentation map with all source files
3. **`NETWORK.md`** — Network topology, trust levels, connectors, LE info
4. **`README.md`** — Project overview, features, API table
5. **`SUMMARY.md`** — Protocol concepts: mutual credit, identity, governance
6. **`docs/NODE_ADMIN_SETUP.md`** — Step-by-step guide for new node operators
7. **`docs/MIRRORING_AND_FAILOVER.md`** — High availability guide (CRDT mirrors, Cloudflare failover)

---

## Coming Next

- [ ] **Native App Polish & App Store Submission** — Remaining parity items: bean ratings, abuse reporting, federation (remote markets). Then submit to iOS App Store and Google Play Store.
- [ ] **Offline PWA caching** via Service Worker
- [ ] **Federated credit verification** (`/beanpool/verify/1.0.0`)
- [ ] **Social Recovery** (Guardian Protocol implementation)

---

_Last updated: 2026-04-01 00:45 AEDT_
