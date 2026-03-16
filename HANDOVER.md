# BeanPool Agent Handover

> Context document for new agents working on the BeanPool project.

---

## Current State (2026-03-16)

**BeanPool is a functional PWA** with live server APIs, deployed on 2 sovereign nodes.

### What's Working
- ✅ **PWA** — community map (Leaflet/OSM), marketplace, ledger, identity, install banner
- ✅ **REST APIs** — `/api/community/*`, `/api/ledger/*`, `/api/marketplace/*`
- ✅ **WebSocket `/ws`** — real-time state feed
- ✅ **Sovereign Connectors** — node-to-node trust with 3 levels (`read_only`, `credit_verification`, `full_sync`)
- ✅ **Handshake Protocol** — mutual trust + latency over yamux streams (~570ms Sydney↔Korea)
- ✅ **State Engine** — `@beanpool/core` LedgerManager with JSON persistence
- ✅ **Docker Deployment** — Let's Encrypt auto-TLS, Cloudflare DNS auto-registration
- ✅ **2 Live Nodes** — [sydney.beanpool.org](https://sydney.beanpool.org) + [korea.beanpool.org](https://korea.beanpool.org)

### Key Files Added Since Scaffold
| File | Purpose |
|------|---------|
| `apps/server/src/state-engine.ts` | In-memory ledger + member registry + marketplace + persistence |
| `apps/server/src/connector-manager.ts` | Sovereign connectors with 3 trust levels |
| `apps/server/src/handshake.ts` | Mutual trust verification + latency via yamux streams |
| `apps/server/src/local-config.ts` | Admin auth (scrypt hashing) + node config |
| `apps/pwa/src/lib/api.ts` | Typed API client for all REST endpoints |
| `apps/pwa/src/pages/MapPage.tsx` | Leaflet/OSM map with dark/light, GPS, marketplace pins |
| `apps/pwa/src/components/InstallPrompt.tsx` | PWA install banner with iOS/Android detection |

---

## Architecture

| App | Dir | Purpose |
|-----|-----|---------|
| BeanPool Node | `apps/server` | Gateway — genesis, admin, REST APIs, WebSocket, connectors, handshake, libp2p |
| PWA | `apps/pwa` | UI — map, marketplace, ledger, identity, privacy, install prompt |
| Pillar Toggle | `apps/native` | Background mesh sync (Expo — not yet functional) |
| Core Protocol | `packages/beanpool-core` | Shared logic — Ledger, Merkle, Passport, Governance, Trade, Router |

### Key Design Constraints
- **Ed25519 keypairs** for all identity (community, node, user)
- **4-port layout:** 4001 (TCP), 4002 (WS), 8080 (HTTP trust), 8443 (HTTPS PWA + API)
- **Docker image:** `ghcr.io/martyinspace/beanpool-node:latest`
- **Public repo:** `github.com/martyinspace/beanpool`

---

## Development

```bash
cd /Users/marty/projects/beanpool
pnpm install
pnpm --filter @beanpool/core build     # Core first
pnpm --filter @beanpool/pwa build      # PWA → apps/server/public/
pnpm --filter @beanpool/server build   # Server TypeScript → dist/
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
3. `NETWORK.md` — Network topology, trust levels, bootstrap layers
4. `SUMMARY.md` — Protocol concepts: mutual credit, identity, governance

---

## Coming Next

- [ ] Play Store / App Store submission via `apps/native` (Expo)
- [ ] Federated credit verification (`/beanpool/verify/1.0.0`)
- [ ] Full sync data replication for backup nodes
- [ ] Governance module integration (quadratic voting)
- [ ] Geo-tagged marketplace posts (real coordinates, not random)

---

_Last updated: 2026-03-16 12:30 AEDT_
