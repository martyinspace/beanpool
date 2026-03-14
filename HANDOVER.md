# BeanPool Agent Handover

> Context document for new agents working on the BeanPool project.

---

## Current State (2026-03-17)

**BeanPool is a fully functional PWA** with invite-only membership, marketplace, E2E messaging, mutual credit ledger, member profiles, and lazy state sync — deployed on 2 sovereign nodes.

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
- ✅ **Docker Deployment** — Let's Encrypt auto-TLS, Cloudflare DNS auto-registration
- ✅ **2 Live Nodes** — [sydney.beanpool.org](https://sydney.beanpool.org) + [korea.beanpool.org](https://korea.beanpool.org)

### Key Source Files
| File | Purpose |
|------|---------|
| `apps/server/src/state-engine.ts` | In-memory state: members, posts, profiles, conversations, messages, invites, ledger, sync |
| `apps/server/src/connector-manager.ts` | Sovereign connectors with 3 trust levels |
| `apps/server/src/handshake.ts` | Mutual trust verification + latency via yamux streams |
| `apps/server/src/sync-protocol.ts` | Lazy state sync — Merkle hash + delta exchange |
| `apps/server/src/local-config.ts` | Admin auth (scrypt hashing) + node config |
| `apps/pwa/src/lib/api.ts` | Typed API client for all 18 REST endpoints |
| `apps/pwa/src/lib/e2e-crypto.ts` | Plaintext v1 encoding (E2E-ready for X25519/AES-256-GCM) |
| `apps/pwa/src/pages/MapPage.tsx` | Leaflet/OSM map with pins, popups, "View in Market" navigation |
| `apps/pwa/src/pages/MarketplacePage.tsx` | Marketplace list + post detail view (author profile, messaging) |
| `apps/pwa/src/pages/MessagesPage.tsx` | Conversations list + chat view (DMs + groups) |

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
# Package, upload, rebuild Docker on both nodes:
tar -czf /tmp/beanpool-deploy.tar.gz --exclude=... -C . .
scp ... azureuser@<IP>:/tmp/
ssh ... "cd BeanPool && tar xzf ... && sudo -E docker compose -p beanpool up -d --build"
```

### Live Nodes
| Node | IP | DNS |
|------|----|-----|
| Sydney | 20.211.27.68 | sydney.beanpool.org |
| Korea | 20.194.24.118 | korea.beanpool.org |

SSH: `ssh -i ~/.ssh/id_azure_lattice azureuser@<IP>`

---

## Reading Order for New Agents

1. `README.md` — Project overview, features, API table, status
2. `HANDOVER.md` — This file (current state + architecture)
3. `NETWORK.md` — Network topology, trust levels, connectors
4. `SUMMARY.md` — Protocol concepts: mutual credit, identity, governance

---

## Coming Next

- [ ] Community health dashboard (invite tree visualisation, flagged patterns)
- [ ] Offline PWA caching via Service Worker
- [ ] Federated credit verification (`/beanpool/verify/1.0.0`)
- [ ] Governance module integration (quadratic voting)

---

_Last updated: 2026-03-17 14:00 AEDT_
