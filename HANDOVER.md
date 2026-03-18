# BeanPool Agent Handover

> Context document for new agents working on the BeanPool project.
> **Read this first** — then see `index.md` for a full documentation map.

---

## Current State (2026-03-19)

**BeanPool is a fully functional PWA** with invite-only membership, 12-word seed phrase recovery, marketplace (with photos and category filters), E2E messaging, mutual credit ledger, member profiles (editable callsign), friends & guardians, 🫘 bean reputation system, abuse reporting, community health dashboard, and lazy state sync — deployed on **3 sovereign nodes** with Let's Encrypt TLS.

### What's Working
- ✅ **Invite-only membership** — single-use invite codes, hierarchical invite tree (node → seed codes → admin → organic invites)
- ✅ **12-word seed phrase** — BIP-39 mnemonic, deterministic Ed25519 key derivation, recovery flow in PWA
- ✅ **People tab** — Friends, Community browser, Invites (moved), Guardians (select up to 5)
- ✅ **Landing page welcome hub** — 3 paths (join, transfer, recover), admin contact info, FAQ
- ✅ **Admin community config** — name, email, phone in Settings → Community tab
- ✅ **Member profiles** — avatar (camera + gallery), editable callsign, bio, contact details with 3-tier visibility
- ✅ **Editable callsign** — change callsign in Profile, syncs to IndexedDB + server
- ✅ **🫘 Bean reputation** — 5-bean rating with comments, displayed on post tiles and detail view
- ✅ **Abuse reporting** — reason dropdown (spam, offensive, misleading, harassment, other), admin panel in Settings
- ✅ **Marketplace** — 13-category bazaar with type/category filters, "My Posts" view, photo attachments (up to 3)
- ✅ **Post photos** — up to 3 photos per post, auto-resized to 400px JPEG, primary photo on tiles, gallery in detail
- ✅ **Post validation** — all fields required, red glow on empty fields, location required
- ✅ **E2E messaging** — DMs and group chats (plaintext v1, E2E-ready data model)
- ✅ **PWA** — community map (Leaflet/OSM), marketplace, messaging, people, ledger
- ✅ **Map popups → Market** — "View in Market →" button on map pins navigates to post detail
- ✅ **Post detail → Message** — "💬 Message" creates DM and auto-opens chat
- ✅ **Community health dashboard** — admin settings panel with member stats, tree depth, activity, flags
- ✅ **REST APIs** — 30+ endpoints for community, invites, profiles, ledger, marketplace, messaging, ratings, reports, friends
- ✅ **WebSocket `/ws`** — real-time state feed
- ✅ **Sovereign Connectors** — node-to-node trust with 3 levels
- ✅ **Lazy State Sync** — Merkle hash comparison + delta exchange, 15-min intervals
- ✅ **Handshake Protocol** — mutual trust + latency over yamux streams
- ✅ **Let's Encrypt Auto-TLS** — DNS-01 challenge via Cloudflare API (acme-client v5)
- ✅ **3 Live Nodes** — Sydney, Brisbane, Debian (local dev server)
- ✅ **Node Admin Setup Guide** — comprehensive docs for new node operators

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
| BeanPool Node | `apps/server` | Gateway — genesis, admin, REST APIs, WebSocket, connectors, handshake, sync, libp2p |
| PWA | `apps/pwa` | UI — map, marketplace, messaging, ledger, profiles, identity, privacy, install prompt |
| Core Protocol | `packages/beanpool-core` | Shared logic — Ledger, Merkle, Passport, Governance, Trade, Router |

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
bash deploy.sh           # Deploy to all 3 nodes
bash deploy.sh 1         # Sydney only
bash deploy.sh 2         # Brisbane only
bash deploy.sh 3         # Debian (local dev) only
bash deploy.sh 1 2       # Sydney + Brisbane
```

### Live Nodes

| # | Node | IP | DNS | SSH User | SSH Key |
|---|------|----|-----|----------|---------|
| 1 | Sydney | `20.211.27.68` | `sydney.beanpool.org` | `azureuser` | `~/.ssh/id_azure_lattice` |
| 2 | Brisbane | `20.5.121.158` | `brisbane.beanpool.org` | `azureuser` | `~/.ssh/id_azure_lattice` |
| 3 | Debian | `192.168.1.219` | `debian.beanpool.org` | `marty` | default key |

```bash
ssh -i ~/.ssh/id_azure_lattice azureuser@20.211.27.68   # Sydney
ssh -i ~/.ssh/id_azure_lattice azureuser@20.5.121.158   # Brisbane
ssh marty@192.168.1.219                                  # Debian (LAN)
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

---

## Coming Next

- [ ] Offline PWA caching via Service Worker
- [ ] Federated credit verification (`/beanpool/verify/1.0.0`)
- [ ] Governance module integration (quadratic voting)
- [ ] Social Recovery (Guardian Protocol)

---

_Last updated: 2026-03-18 20:00 AEDT_
