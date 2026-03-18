# BeanPool Agent Handover

> Context document for new agents working on the BeanPool project.
> **Read this first** — then see `index.md` for a full documentation map.

---

## Current State (2026-03-18)

**BeanPool is a fully functional PWA** with invite-only membership, marketplace, E2E messaging, mutual credit ledger, member profiles, and lazy state sync — deployed on **3 sovereign nodes** with Let's Encrypt TLS.

### What's Working
- ✅ **Invite-only membership** — single-use invite codes, invite tree hierarchy, QR sharing
- ✅ **Member profiles** — avatar, bio, contact details with 3-tier visibility
- ✅ **E2E messaging** — DMs and group chats (plaintext v1, E2E-ready data model)
- ✅ **PWA** — community map (Leaflet/OSM), marketplace with post detail view, messaging, ledger, identity
- ✅ **Map popups → Market** — "View in Market →" button on map pins navigates to post detail
- ✅ **Post detail → Message** — "💬 Message" creates DM and auto-opens chat
- ✅ **REST APIs** — 18 endpoints for community, invites, profiles, ledger, marketplace, messaging
- ✅ **WebSocket `/ws`** — real-time state feed
- ✅ **Sovereign Connectors** — node-to-node trust with 3 levels
- ✅ **Lazy State Sync** — Merkle hash comparison + delta exchange, 15-min intervals
- ✅ **Handshake Protocol** — mutual trust + latency over yamux streams (~570ms Sydney↔Korea)
- ✅ **Let's Encrypt Auto-TLS** — DNS-01 challenge via Cloudflare API (acme-client v5)
- ✅ **3 Live Nodes** — Sydney, Korea, Debian (local dev server)

---

## ⚠️ Critical: Let's Encrypt Rate Limits

> [!CAUTION]
> **Do NOT rapid-fire deploy during cert debugging.** Each failed ACME request counts against the LE rate limit. After 5 failures in 1 hour, LE returns HTTP 429 with a `retry-after` of 60-90 minutes. The `acme-client` library **silently waits** for this period, making it look like a hang.

### Rate Limits to Know

| Limit | Value | Window |
|-------|-------|--------|
| Failed Validations | 5 per domain | 1 hour |
| Duplicate Certificates | 5 per domain | 7 days |
| New Orders | 300 per account | 3 hours |
| Certificates per Domain | 50 per domain | 7 days |

### How to Avoid Problems

1. **Never wipe `data/tls/` between deploys** — `deploy.sh` preserves the `data/` directory. If a valid cert exists, the node reuses it (no LE request needed)
2. **Use `DEBUG=acme-client` to diagnose** — add this env var to see all HTTP requests, responses, and retry-after headers
3. **The `createOrder` hang is always a 429** — if Step 2 appears stuck, it's rate-limited, not a code bug
4. **The 24-hour renewal scheduler** will automatically retry — no manual intervention needed after a rate limit

### Key File

`apps/server/src/tls.ts` — handles all TLS certificate management:
- Let's Encrypt via `acme-client` with DNS-01 challenge (Cloudflare API)
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
bash deploy.sh 2         # Korea only
bash deploy.sh 3         # Debian (local dev) only
bash deploy.sh 1 2       # Sydney + Korea
```

### Live Nodes

| # | Node | IP | DNS | SSH User | SSH Key |
|---|------|----|-----|----------|---------|
| 1 | Sydney | `20.211.27.68` | `sydney.beanpool.org` | `azureuser` | `~/.ssh/id_azure_lattice` |
| 2 | Korea | `20.194.24.118` | `korea.beanpool.org` | `azureuser` | `~/.ssh/id_azure_lattice` |
| 3 | Debian | `192.168.1.219` | `debian.beanpool.org` | `marty` | default key |

```bash
ssh -i ~/.ssh/id_azure_lattice azureuser@20.211.27.68   # Sydney
ssh -i ~/.ssh/id_azure_lattice azureuser@20.194.24.118  # Korea
ssh marty@192.168.1.219                                  # Debian (LAN)
```

### Useful Debug Commands

```bash
# Check node logs
ssh ... "docker logs beanpool-beanpool-node-1 2>&1"

# Check LE cert status with debug tracing
ssh ... "docker exec beanpool-beanpool-node-1 node -e \"
  process.env.DEBUG='acme-client*';
  // ... run acme flow
\""

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

---

## Coming Next

- [ ] Community health dashboard (invite tree visualisation, flagged patterns)
- [ ] Offline PWA caching via Service Worker
- [ ] Federated credit verification (`/beanpool/verify/1.0.0`)
- [ ] Governance module integration (quadratic voting)

---

_Last updated: 2026-03-18 11:00 AEDT_
