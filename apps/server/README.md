# BeanPool Server Node

> Gateway, REST APIs, WebSocket state feeds, Libp2p mesh networking, and lazy CRDT state sync.
> Everything a community admin needs to understand and deploy their own BeanPool node.

---

## 🏗️ Architecture Overview (Key Files)

| File | Purpose |
|------|---------|
| `src/index.ts` | Main boot orchestrator — 5-stage startup |
| `src/tls.ts` | **TLS certificate management** — LE via acme-client + self-signed fallback |
| `src/state-engine.ts` | In-memory state: members, posts, profiles, conversations, messages, invites, ledger, ratings, reports |
| `src/https-server.ts` | 30+ REST API endpoints: community, marketplace, friends, ratings, reports, admin |
| `src/http-server.ts` | HTTP endpoint (port 80) for Let's Encrypt validation, LAN QR Poster, and HTTPS redirect |
| `src/p2p.ts` | Core libp2p node instantiation, bootstrap logic, and gossipsub |
| `src/connector-manager.ts` | Sovereign connectors with federation trust levels (peer/mirror/blocked) |
| `src/federation-api.ts` | Federation CORS middleware + `/api/node/info` |
| `src/federation-protocol.ts` | Secure Libp2p authenticated Noise streams for cross-node mesh routing |
| `src/handshake.ts` | Mutual trust verification + latency via yamux streams |
| `src/sync-protocol.ts` | Lazy state sync — Merkle hash + delta exchange |
| `src/local-config.ts` | Admin auth (scrypt) + node config |
| `src/dns-shim.ts` | Captive portal DNS responder to resolve `beanpool.local` locally |
| `src/genesis.ts` | Initializes node configuration and creates the immutable genesis block |
| `src/seed-organic.ts` | Test script to seed the database with mock organic marketplace posts |
| `static/settings.html` | Admin settings page — 4-tab layout, health dashboard, abuse reports, connectors |

---

## 🛠️ Node Administration & Setup

### Prerequisites

| What | Why |
|------|-----|
| **Linux server** (Ubuntu 22+, Debian 12+, etc.) | Runs the Docker container |
| **Docker + Docker Compose** | Container runtime |
| **SSH access** to the server | Remote management |
| **Port forwarding** (or cloud firewall rules) | Expose services to the internet |

### Ports Required

| Port | Protocol | Purpose |
|------|----------|---------|
| **80** | HTTP | Redirect to HTTPS + QR poster page |
| **443** | HTTPS | PWA, API, admin settings |
| **4001** | TCP | Node-to-node gossip (libp2p) |
| **4002** | TCP | Yamux multiplexed streams |

---

### Option A: Public Node (with Domain + Let's Encrypt)

This is the **recommended** setup for internet-facing nodes. Free auto-renewing TLS certs from Let's Encrypt.

#### Step 1: Get a Domain + Cloudflare DNS

1. Register a domain (e.g. `mycommunity.org`) — or use a subdomain of one you own
2. Add the domain to **[Cloudflare](https://dash.cloudflare.com)** (free tier works)
3. Create an **A record** pointing to your server's public IP:
   - Name: `bean` (or whatever subdomain, e.g. `bean.mycommunity.org`)
   - Content: your server's public IP
   - Proxy: **OFF** (DNS only, grey cloud)
4. Get your Cloudflare credentials:
   - **API Token**: Cloudflare → My Profile → API Tokens → Create Token → "Edit zone DNS" template
   - **Zone ID**: Cloudflare → your domain → Overview → right sidebar under "API"

#### Step 2: Install Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then verify:
docker --version
docker compose version
```

#### Step 3: Create the Project Directory

```bash
mkdir -p ~/BeanPool && cd ~/BeanPool
```

#### Step 4: Create `docker-compose.yml`

```yaml
services:
  beanpool-node:
    image: ghcr.io/martyinspace/beanpool-node:latest
    ports:
      - "80:8080"
      - "443:8443"
      - "4001:4001"
      - "4002:4002"
    environment:
      - PUBLIC_IP=${PUBLIC_IP}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - BEANPOOL_DATA_DIR=/data
      - CF_API_TOKEN=${CF_API_TOKEN}
      - CF_ZONE_ID=${CF_ZONE_ID}
      - CF_RECORD_NAME=${CF_RECORD_NAME}
    volumes:
      - ./data:/data
    restart: unless-stopped
```

#### Step 5: Create `.env` File

```bash
cat > .env << 'INNEREOF'
PUBLIC_IP=YOUR_SERVER_PUBLIC_IP
ADMIN_PASSWORD=choose-a-strong-password-here
CF_API_TOKEN=your-cloudflare-api-token
CF_ZONE_ID=your-cloudflare-zone-id
CF_RECORD_NAME=bean.mycommunity.org
INNEREOF
```

> **Important:** Replace all values with your actual credentials. The `CF_RECORD_NAME` must exactly match the A record you created in Cloudflare.

#### Step 6: Start the Node

```bash
# Pull the latest image
docker compose pull

# Start in background
docker compose up -d

# Watch the logs
docker compose logs -f
```

#### Step 7: Access Your Node

- **PWA**: `https://bean.mycommunity.org`
- **Admin Settings**: `https://bean.mycommunity.org/settings.html`
- **QR Poster** (for printing): `http://bean.mycommunity.org` (HTTP, for LAN access)

---

### Option B: LAN-Only Node (No Domain Required)

For local networks, home servers, or testing. Uses **self-signed certificates** — no domain or Cloudflare needed.

#### Step 1: Install Docker

Same as Option A Step 2.

#### Step 2: Create the Project Directory

```bash
mkdir -p ~/BeanPool && cd ~/BeanPool
```

#### Step 3: Create `docker-compose.yml`

```yaml
services:
  beanpool-node:
    image: ghcr.io/martyinspace/beanpool-node:latest
    ports:
      - "80:8080"
      - "443:8443"
      - "4001:4001"
      - "4002:4002"
    environment:
      - PUBLIC_IP=YOUR_LAN_IP
      - ADMIN_PASSWORD=choose-a-strong-password
      - BEANPOOL_DATA_DIR=/data
    volumes:
      - ./data:/data
    restart: unless-stopped
```

> **Note:** No `CF_*` variables — the node detects this and automatically falls back to self-signed certificates.

#### Step 4: Start the Node

```bash
docker compose pull
docker compose up -d
docker compose logs -f
```

#### Step 5: Access Your Node

- **PWA**: `https://YOUR_LAN_IP` (browser will warn about self-signed cert)
- **Admin Settings**: `https://YOUR_LAN_IP/settings.html`

### ⚠️ Self-Signed Certificate Warning

To avoid this, you can install the CA certificate:
- Visit `http://YOUR_LAN_IP` (HTTP, not HTTPS)
- Download the CA certificate from the trust page
- Install it on each device

---

### Post-Setup: First-Time Configuration

#### 1. Set Your Admin Password
Navigate to `https://your-node/settings.html` and log in with the password you set in `.env`.

#### 2. Create the Genesis Block
1. Go to Settings → choose a **community name**
2. Set the **initial credit limit** (how many Ʀ credits each member can go into debt)
3. Click **Initialize** — this creates the immutable genesis block

#### 3. Configure Community Info
In Settings → **Community** tab, set: Community Name, Admin Email, Admin Phone

#### 4. Generate Seed Invite Codes
- In Settings → **Invite Codes**, generate codes for your founding members
- Use one on your own phone to bootstrap the network, creating your deterministic Ed25519 member identity via a 12-word seed phrase recovery method.

#### 5. Connect to Other Nodes (Optional)
Settings → **Sovereign Connectors**. Choose **Peer** trust (federation) or **Mirror** (backup).

---

### Maintenance & Troubleshooting

#### Let's Encrypt Rate Limits
Let's Encrypt allows **5 duplicate certificates per domain per week**. If you hit the limit:
- The node will log `⚠️ Let's Encrypt failed — falling back to self-signed`
- It will automatically retry every 24 hours

#### Backups
All persistent data is in `./data/`. Copy this folder to natively backup all SQLite databases.

---

## 🪞 Mirroring, Failover & Merging Nodes

Because BeanPool's internal state engine (Ledger, Members, Web of Trust, and Posts) is built entirely on top of **Conflict-Free Replicated Data Types (CRDTs)**, node operators have incredibly flexible options for backing up, failing over, and even merging communities together.

### 1. Setting Up a Mirror (Disaster Recovery Backup)

A `mirror` connector silently maintains a mathematically identical, real-time copy of your primary node's `state.db` (SQLite). 

**Steps:**
1. Log into the Admin Settings of both your Primary Node and your Backup Node and exchange `PeerID`s.
2. Bridge Primary to Backup: Connectors Tab -> Public URL + PeerID -> `mirror`.
3. Bridge Backup to Primary: Repeat inverted process.

The nodes will instantly handshake over the Yamux stream protocol, exchange Merkle tree root hashes, identify the state deltas, and stream the missing CRDT events seamlessly.

### 2. Automated Failover (Cloudflare Load Balancing)

Because both nodes now possess the identical live state, automate failover at the DNS layer:
1. In Cloudflare, go to **Traffic -> Load Balancing**.
2. Create an **Active-Passive (Failover)** pool:
   - Primary: `mullum1.beanpool.org`
   - Backup: `mullum2.beanpool.org`
3. Configure a **Health Check** to ping your primary server every 60 seconds.

If `mullum1` loses power, Cloudflare instantly re-routes to `mullum2` transparently with zero data inconsistency.

### 3. Merging Two Separate Communities

1. Connect Node A to Node B via explicit Mutual Trust set to `mirror` on both boxes.
2. **The CRDT Merge:** The nodes will mathematically resolve the event logs. Bob's posts from Node A will simply interleave cleanly alongside Alice's posts from Node B. Balances expand organically without zero-sum collisions.

### 4. Rolling Updates (Zero Downtime)

For infrastructure upgrades or standard node bin-pull deployments without user disruption:
1. Deploy new container code to Backup Node.
2. Down-time trips the Load Balancer -> Users map to Primary.
3. Catch-Up sync kicks off organically when Backup reconnects.
4. Deploy new container code to Primary Node.
5. Failover flips users back to Backup Node while Primary updates.

### 5. Federating with a Mirrored Community

Neighboring communities scaling federation can elegantly federate through a single point:
1. External node (`review`) adds ONE connector pointing to `mullum.beanpool.org` (the Load Balancer).
2. The admins residing across the Target Mirrored infrastructure must log into BOTH `mullum1` and `mullum2` to explicitly establish mutual trust `peer` rules referencing `review`'s public attributes.

---

## 🌐 Live Network Topology

The project maintains 4 live sovereign nodes spanning bare-metal LAN deployments and Azure VMs. 

| # | Flag | Callsign | IP Address | DNS Name | Type | PWA |
|---|------|----------|-----------|----------|------|-----|
| 1 | 🇦🇺 | Mullum 2 | `20.211.27.68` | `mullum2.beanpool.org` | Azure VM | [Open](https://mullum2.beanpool.org) |
| 3 | 🏠 | Mullum 1 | `192.168.1.219` | `mullum1.beanpool.org` | Bare Metal (LAN) | [Open](https://mullum.beanpool.org:8443) |
| 4 | 🇺🇸 | Review | `20.96.126.56` | `review.beanpool.org` | Azure VM (US) | [Open](https://review.beanpool.org) |

### Deployment Commands
The root `deploy.sh` manages upgrades across the mesh:
```bash
bash deploy.sh           # Deploy to all 4 nodes
bash deploy.sh 1         # Mullum 2 only
bash deploy.sh 3         # Mullum 1 only
bash deploy.sh 4         # Review (US) only
```

### SSH Access
```bash
ssh -i ~/.ssh/id_azure_lattice azureuser@20.211.27.68   # Mullum 2 (Azure)
ssh marty@192.168.1.219                                  # Mullum 1 (LAN)
ssh -i ~/.ssh/id_azure_lattice azureuser@20.96.126.56   # Review (Azure US)
```

**Check Container Logs:**
```bash
ssh -i ~/.ssh/id_azure_lattice azureuser@20.211.27.68 "docker logs beanpool-beanpool-node-1 2>&1"
```
