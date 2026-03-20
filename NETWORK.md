# 🌐 BeanPool Network

> A guide to the BeanPool live network — nodes, ports, DNS, connectors, and TLS.

---

## 🍌 The Banana-Simple Version

BeanPool is a **federation of sovereign nodes** — each node is independently operated and controlled by its host admin. There is no central server and no automatic mesh. Each node decides which other nodes to trust and connect to. Nodes connect via **peer** (cross-community trading) or **mirror** (backup replication) trust levels.

> 📖 For step-by-step setup instructions, see [docs/NODE_ADMIN_SETUP.md](docs/NODE_ADMIN_SETUP.md).

---

## 🗺️ The Nodes

Every node runs the same software in a Docker container. Each one has:
- A **public IP** — the raw network address
- A **DNS name** — a human-friendly alias (like `sydney.beanpool.org`)
- A **callsign** — the name shown on the dashboard

| # | Flag | Callsign | IP Address | DNS Name | Type | PWA |
|---|------|----------|-----------|----------|------|-----|
| 1 | 🇦🇺 | Sydney | `20.211.27.68` | `sydney.beanpool.org` | Azure VM | [Open](https://sydney.beanpool.org) |
| 2 | 🇦🇺 | Brisbane | `20.5.121.158` | `brisbane.beanpool.org` | Azure VM | [Open](https://brisbane.beanpool.org) |
| 3 | 🏠 | Mullum | `192.168.1.219` | `mullum.beanpool.org` | Bare Metal (LAN) | [Open](https://mullum.beanpool.org:8443) |

All nodes run Docker containers. Public nodes use Let's Encrypt TLS (auto-provisioned via DNS-01 challenge). LAN nodes fall back to self-signed certificates.

---

## 🔌 The Ports

Every BeanPool node listens on **4 ports**:

| Port | Protocol | What It Does | Who Uses It |
|------|----------|-------------|-------------|
| **4001** | TCP | **P2P Communication** — nodes sync state and verify trust via libp2p | Other nodes |
| **4002** | TCP | **WebSocket P2P** — same as 4001 but via WebSocket for browsers | Browsers, mobile |
| **8080** | HTTP | **HTTP → HTTPS Redirect** — 301 redirect to HTTPS root (LAN nodes: QR trust bootstrap) | Everyone |
| **8443** | HTTPS | **Landing page** (`/`), **PWA** (`/app`), **Settings** (`/settings`), **REST APIs** (`/api/*`) | Everyone |

### Can I change them?

Yes! Every port is configurable via environment variables:

| Env Var | Default | Controls |
|---------|---------|----------|
| `PORT_P2P` | `4001` | P2P TCP port (WebSocket is always +1) |
| `PORT_METRICS` | `8080` | Trust bootstrap page |
| `PORT_HTTPS` | `8443` | PWA + REST API |

---

## 🧅 DNS — The "Friendly Names"

Instead of remembering `20.211.27.68`, you can use `sydney.beanpool.org`. DNS records are hosted on **Cloudflare** (free tier) under the domain `beanpool.org`.

### How DNS records are managed

**They're automatic.** Every time a node starts, it calls the Cloudflare API and registers (or updates) its own A record. If a node's IP changes, the DNS record updates itself on next boot.

This is controlled by 3 environment variables:

| Env Var | What It Is |
|---------|-----------| 
| `CF_API_TOKEN` | Cloudflare API token with DNS edit permission |
| `CF_ZONE_ID` | The zone ID for `beanpool.org` |
| `CF_RECORD_NAME` | The subdomain this node claims (e.g. `sydney.beanpool.org`) |

### No domain? No problem.

If you omit the `CF_*` environment variables, the node automatically falls back to **self-signed certificates**. This is perfect for LAN-only or home server setups. See [docs/NODE_ADMIN_SETUP.md](docs/NODE_ADMIN_SETUP.md) for details.

---

## 🔒 TLS — Let's Encrypt Certificates

Each public node automatically provisions a Let's Encrypt certificate on first boot using the **DNS-01 challenge** via the Cloudflare API. The ACME flow is handled by `acme-client` v5 in `apps/server/src/tls.ts`.

### How it works

1. Node generates an ACME account key and server key
2. Creates an order with Let's Encrypt for its domain
3. Creates a `_acme-challenge.{domain}` TXT record via Cloudflare API
4. Waits 30s for DNS propagation
5. Completes the challenge and obtains the certificate
6. Cleans up the DNS TXT record
7. Certificate is saved to `data/tls/` and reused until 30 days before expiry

### Fallback

If Let's Encrypt fails (or no `CF_*` variables are set), the node falls back to a **self-signed certificate**. The Trust Bootstrap page (port 8080) provides a CA cert download for users to manually trust.

> [!CAUTION]
> ### ⚠️ Let's Encrypt Rate Limits — READ THIS
>
> **Do NOT rapid-fire deploy or restart containers during cert debugging.** Each failed ACME request counts against the LE rate limit. After **5 failures in 1 hour**, LE returns HTTP 429 with a `retry-after` of 60-90 minutes. The `acme-client` library **silently waits** for this period, making it look like a hang.
>
> **How to avoid problems:**
> 1. **Never wipe `data/tls/` between deploys** — `deploy.sh` preserves `data/`
> 2. **Use `DEBUG=acme-client` env var** to see the 429 response and retry-after header
> 3. If Step 2 ("Creating order...") hangs, it's **always a rate limit**, not a code bug
> 4. The **24-hour renewal scheduler** will auto-retry — just wait
>
> | Limit | Value | Window |
> |-------|-------|--------|
> | Failed Validations | 5 per domain | 1 hour |
> | Duplicate Certificates | 5 per domain | 7 days |
> | New Orders | 300 per account | 3 hours |

---

## 🔗 Sovereign Connectors — How Nodes Connect

BeanPool nodes are **sovereign by default** — each node is isolated and independent. The node admin has full control over which other nodes to connect to. There is no automatic discovery, no hardcoded bootstrap list, and no central coordination.

### Trust Levels

Each connector has a configurable trust level that determines how data flows between nodes:

| Trust Level | Label | Description | Data Flow | Use Case |
|-------------|-------|-------------|-----------|----------|
| **`peer`** | Peer | *"I trust your users to trade here."* Cross-community federation via CORS + API access | On-demand HTTPS queries — no data stored locally | Two communities enabling cross-marketplace browsing and trading |
| **`mirror`** | Mirror | *"I am a backup of you."* Full state replication for disaster recovery | All state synced every 15 min (members, posts, profiles, ratings) | Backup nodes and geographic resilience |
| **`blocked`** | Blocked | *"Do not allow this node's PWA to call my API."* | No CORS headers, API requests rejected | Disconnect from an untrusted node |

### Federation — Cross-Community Trading

When two nodes are connected as **peers**, their members can browse each other's marketplaces and trade across communities:

1. **Browsing:** The PWA queries the remote node's API directly (`sydney.beanpool.org/api/marketplace/posts`) — no data is stored on the home node
2. **Trading:** When accepting a remote offer, credits move on the **remote** node's ledger (mutual credit allows negative balances)
3. **Identity:** Ed25519 keypairs work everywhere — no separate accounts needed. Visitors appear as guest entries on remote ledgers
4. **No transitivity:** Each node must explicitly add peers. Being connected to Sydney doesn't automatically connect you to Sydney's peers

### Mirror — State Replication

When two nodes have `mirror` trust + mutual trust confirmed via handshake:
1. **Every 15 minutes**, each node compares its Merkle state hash with its peer
2. **If hashes differ**, the nodes exchange deltas (new members + new posts)
3. **Posts carry origin tracking** (`originNode`) so each node knows where data came from
4. **Initial sync** happens 30 seconds after boot

> ⚠️ **Mirror copies all data.** Use only for private backups or small clusters. Not recommended for general federation.

---

## 🚀 Deployment

### Deploy with deploy.sh

```bash
bash deploy.sh           # Deploy to all 3 nodes
bash deploy.sh 1         # Sydney only
bash deploy.sh 2         # Brisbane only
bash deploy.sh 3         # Debian (local dev) only
bash deploy.sh 1 2       # Sydney + Brisbane
```

### SSH Access

```bash
ssh -i ~/.ssh/id_azure_lattice azureuser@20.211.27.68   # Sydney
ssh -i ~/.ssh/id_azure_lattice azureuser@20.5.121.158   # Brisbane
ssh marty@192.168.1.219                                  # Debian (LAN)
```

### Check Logs

```bash
ssh ... "docker logs beanpool-beanpool-node-1 2>&1"
```

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Port mappings, env vars, volume mounts |
| `Dockerfile` | Multi-stage build: core → PWA → server |
| `deploy.sh` | Deploy script — supports Azure + Debian nodes |
| `docs/NODE_ADMIN_SETUP.md` | Step-by-step guide for new node operators |
| `apps/server/src/index.ts` | Main BeanPool Node — 5-stage boot orchestrator |
| `apps/server/src/tls.ts` | TLS certificate management — LE + self-signed fallback |
| `apps/server/src/state-engine.ts` | In-memory state engine with JSON persistence (members, posts, profiles, ratings, reports) |
| `apps/server/src/https-server.ts` | 30+ REST API endpoints |
| `apps/server/src/sync-protocol.ts` | Lazy state sync via libp2p streams |
| `apps/pwa/src/App.tsx` | PWA shell — identity gate, 5-tab bottom nav, header |
| `.env` | Cloudflare + admin secrets (gitignored) |
| `data/genesis.json` | Community identity + genesis hash (auto-generated) |

---

_Last updated: 2026-03-19 01:10 AEDT_
