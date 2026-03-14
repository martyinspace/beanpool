# 🌐 BeanPool Network

> A guide to the BeanPool live network — nodes, ports, DNS, connectors, and sync.

---

## 🍌 The Banana-Simple Version

BeanPool is a **federation of sovereign nodes** — each node is independently operated and controlled by its host admin. There is no central server and no automatic mesh. Each node decides which other nodes to trust and connect to. When your phone opens the BeanPool app, it connects to your local node. Nodes sync state lazily via Merkle hash comparison.

---

## 🗺️ The Nodes

Every node runs the same software in a Docker container. Each one has:
- A **public IP** — the raw network address
- A **DNS name** — a human-friendly alias (like `sydney.beanpool.org`)
- A **callsign** — the name shown on the dashboard

| # | Flag | Callsign | IP Address | DNS Name | PWA |
|---|------|----------|-----------|----------|-----|
| 1 | 🇦🇺 | Sydney | `20.211.27.68` | `sydney.beanpool.org` | [Open](https://sydney.beanpool.org) |
| 2 | 🇰🇷 | Korea | `20.194.24.118` | `korea.beanpool.org` | [Open](https://korea.beanpool.org) |

Both nodes are Azure cloud VMs running Docker containers with Let's Encrypt TLS.

---

## 🔌 The Ports

Every BeanPool node listens on **4 ports**:

| Port | Protocol | What It Does | Who Uses It |
|------|----------|-------------|-------------|
| **4001** | TCP | **P2P Communication** — nodes sync state and verify trust via libp2p | Other nodes |
| **4002** | TCP | **WebSocket P2P** — same as 4001 but via WebSocket for browsers | Browsers, mobile |
| **8080** | HTTP | **Trust Bootstrap** — landing page with QR codes for cert trust and PWA install | New users |
| **8443** | HTTPS | **PWA Host** — the community interface (map, marketplace, messaging, ledger) | Everyone |

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

---

## 🔗 Sovereign Connectors — How Nodes Connect

BeanPool nodes are **sovereign by default** — each node is isolated and independent. The node admin has full control over which other nodes to connect to. There is no automatic discovery, no hardcoded bootstrap list, and no central coordination.

### Trust Levels

Each connector has a configurable trust level that determines what data is shared:

| Trust Level | Name | Description | Data Shared | Use Case |
|-------------|------|-------------|-------------|----------|
| **`read_only`** | Observer | View public activity, no transactions | Public ledger entries only | Monitor a community without participating |
| **`credit_verification`** | Trading Partner | Cross-community credit verification (default) | Balance checks | Two communities enabling member-to-member trade |
| **`full_sync`** | Full Mirror | Complete data replication for redundancy | All state (members, posts, profiles) | Backup nodes and geographic resilience |

### Lazy State Sync

When two nodes have `full_sync` trust + mutual trust confirmed via handshake:
1. **Every 15 minutes**, each node compares its Merkle state hash with its peer
2. **If hashes differ**, the nodes exchange deltas (new members + new posts)
3. **Posts carry origin tracking** (`originNode`) so each node knows where data came from
4. **Initial sync** happens 30 seconds after boot

---

## 🚀 Deployment

### Deploy to both nodes
```bash
cd /Users/marty/projects/beanpool
tar -czf /tmp/beanpool-deploy.tar.gz --exclude='node_modules' --exclude='.git' ... -C . .
scp -i ~/.ssh/id_azure_lattice /tmp/beanpool-deploy.tar.gz azureuser@<IP>:/tmp/
ssh -i ~/.ssh/id_azure_lattice azureuser@<IP> "cd BeanPool && tar xzf /tmp/beanpool-deploy.tar.gz && sudo -E docker compose -p beanpool up -d --build"
```

### SSH Access
```bash
ssh -i ~/.ssh/id_azure_lattice azureuser@20.211.27.68   # Sydney
ssh -i ~/.ssh/id_azure_lattice azureuser@20.194.24.118  # Korea
```

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Port mappings, env vars, volume mounts |
| `Dockerfile` | Multi-stage build: core → PWA → server |
| `apps/server/src/index.ts` | Main BeanPool Node — 5-stage boot orchestrator |
| `apps/server/src/state-engine.ts` | In-memory state engine with JSON persistence |
| `apps/server/src/sync-protocol.ts` | Lazy state sync via libp2p streams |
| `apps/pwa/src/App.tsx` | PWA shell — identity gate, 5-tab bottom nav, header |
| `deploy.sh` | Deploy script for Azure nodes |
| `.env` | Cloudflare + admin secrets (gitignored) |
| `data/genesis.json` | Community identity + genesis hash (auto-generated) |
