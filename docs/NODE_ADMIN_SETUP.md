# BeanPool Node — Admin Setup Guide

> Everything a community admin needs to deploy their own BeanPool node.

---

## Prerequisites

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

## Option A: Public Node (with Domain + Let's Encrypt)

This is the **recommended** setup for internet-facing nodes. Free auto-renewing TLS certs from Let's Encrypt.

### Step 1: Get a Domain + Cloudflare DNS

1. Register a domain (e.g. `mycommunity.org`) — or use a subdomain of one you own
2. Add the domain to **[Cloudflare](https://dash.cloudflare.com)** (free tier works)
3. Create an **A record** pointing to your server's public IP:
   - Name: `bean` (or whatever subdomain, e.g. `bean.mycommunity.org`)
   - Content: your server's public IP
   - Proxy: **OFF** (DNS only, grey cloud)
4. Get your Cloudflare credentials:
   - **API Token**: Cloudflare → My Profile → API Tokens → Create Token → "Edit zone DNS" template
   - **Zone ID**: Cloudflare → your domain → Overview → right sidebar under "API"

### Step 2: Install Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then verify:
docker --version
docker compose version
```

### Step 3: Create the Project Directory

```bash
mkdir -p ~/BeanPool && cd ~/BeanPool
```

### Step 4: Create `docker-compose.yml`

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

### Step 5: Create `.env` File

```bash
cat > .env << 'EOF'
PUBLIC_IP=YOUR_SERVER_PUBLIC_IP
ADMIN_PASSWORD=choose-a-strong-password-here
CF_API_TOKEN=your-cloudflare-api-token
CF_ZONE_ID=your-cloudflare-zone-id
CF_RECORD_NAME=bean.mycommunity.org
EOF
```

> **Important:** Replace all values with your actual credentials. The `CF_RECORD_NAME` must exactly match the A record you created in Cloudflare.

### Step 6: Start the Node

```bash
# Pull the latest image
docker compose pull

# Start in background
docker compose up -d

# Watch the logs
docker compose logs -f
```

You should see:
```
🚀 BeanPool starting...
🔒 Step 2: Creating order...
🔒 TLS: Let's Encrypt (bean.mycommunity.org)
🌐 HTTPS server listening on port 8443
✅ BeanPool ready!
```

### Step 7: Access Your Node

- **PWA**: `https://bean.mycommunity.org`
- **Admin Settings**: `https://bean.mycommunity.org/settings.html`
- **QR Poster** (for printing): `http://bean.mycommunity.org` (HTTP, for LAN access)

---

## Option B: LAN-Only Node (No Domain Required)

For local networks, home servers, or testing. Uses **self-signed certificates** — no domain or Cloudflare needed.

### Step 1: Install Docker

Same as Option A Step 2.

### Step 2: Create the Project Directory

```bash
mkdir -p ~/BeanPool && cd ~/BeanPool
```

### Step 3: Create `docker-compose.yml`

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

### Step 4: Start the Node

```bash
docker compose pull
docker compose up -d
docker compose logs -f
```

You should see:
```
🔒 TLS: Self-signed (beanpool.local)
🌐 HTTPS server listening on port 8443
✅ BeanPool ready!
```

### Step 5: Access Your Node

- **PWA**: `https://YOUR_LAN_IP` (browser will warn about self-signed cert — click "Advanced → Proceed")
- **Admin Settings**: `https://YOUR_LAN_IP/settings.html`

### ⚠️ Self-Signed Certificate Warning

When users first visit a self-signed node, their browser will show a security warning. They need to:

1. Click **"Advanced"** or **"Show Details"**
2. Click **"Proceed to site"** (or "Accept the Risk")
3. The warning only appears once per browser

To avoid this, you can install the CA certificate:
- Visit `http://YOUR_LAN_IP` (HTTP, not HTTPS)
- Download the CA certificate from the trust page
- Install it on each device

---

## Post-Setup: First-Time Configuration

### 1. Set Your Admin Password

Navigate to `https://your-node/settings.html` and log in with the password you set in `.env`.

### 2. Create the Genesis Block

On first boot, the node needs to be initialized:
1. Go to Settings → choose a **community name**
2. Set the **initial credit limit** (how many Ʀ credits each member can go into debt)
3. Click **Initialize** — this creates the immutable genesis block

### 3. Configure Community Info (Optional)

In Settings → **Community** tab, set:
- **Community Name** — shown on the landing page
- **Admin Email** — contact email for member support
- **Admin Phone** — fallback contact for recovery help

### 4. Generate Seed Invite Codes

- In Settings → **Invite Codes**, generate codes for your founding members
- Each code is single-use
- Share codes via the QR poster or direct link

> **Invite Tree Hierarchy:**
> - Your node is the **genesis** (root of the tree)
> - Seed invite codes from Settings are the **first generation**
> - Use one seed code on your **own phone** to create your personal member identity
> - From your personal identity, you can invite more people organically from the People tab
> - Every member can generate invites, creating branches in the tree

### 5. Set Up Your Own Phone

1. Generate a seed invite code in Settings
2. Open the PWA on your phone (`https://your-node`)
3. Enter the invite code + choose your callsign
4. **Write down your 12-word recovery phrase** — this is the only way to recover your identity if you lose your phone
5. Tap "Continue" — you're now a member with your own keypair

### 6. Connect to Other Nodes (Optional)

To join the mesh network:
1. Settings → **Sovereign Connectors**
2. Enter the other node's address (e.g. `sydney.beanpool.org:4001`)
3. The nodes will perform a mutual trust handshake
4. State sync begins automatically every 15 minutes

---

## Maintenance

### Updating Your Node

```bash
cd ~/BeanPool
docker compose pull                    # Get latest image
docker compose down && docker compose up -d   # Restart with new image
docker compose logs -f                 # Verify startup
```

> ⚠️ **Each restart triggers a new Let's Encrypt cert request.** Don't restart more than a few times per day to avoid rate limits (see below).

### Let's Encrypt Rate Limits

Let's Encrypt allows **5 duplicate certificates per domain per week**. If you hit the limit:
- The node will log `⚠️ Let's Encrypt failed — falling back to self-signed`
- It will automatically retry every 24 hours
- The self-signed fallback keeps the node running — just with a browser warning

### Viewing Logs

```bash
docker compose logs -f                 # Live logs
docker compose logs --tail 50          # Last 50 lines
```

### Backing Up Data

All persistent data is in `./data/`:
```bash
cp -r ~/BeanPool/data ~/beanpool-backup-$(date +%Y%m%d)
```

This includes: TLS certificates, member data, ledger, marketplace posts, messages, and invite codes.

### Stopping the Node

```bash
cd ~/BeanPool
docker compose down
```

Data is preserved in `./data/` and will be loaded on next start.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **Node hangs on "Creating order..."** | Let's Encrypt rate limit. Wait 1-2 hours, it will fall back to self-signed automatically |
| **Can't access from outside LAN** | Check firewall/port forwarding for ports 80, 443, 4001, 4002 |
| **"Connection refused" on HTTPS** | Check `docker compose logs` — the node may still be starting up |
| **Browser security warning** | Normal for self-signed certs. Accept it, or switch to Option A with a domain |
| **Lost admin password** | Stop the node, edit `.env`, restart |
| **"Permission denied" on Docker** | Run `sudo usermod -aG docker $USER` and log out/back in |

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PUBLIC_IP` | ✅ | Server's public IP (or LAN IP for local nodes) |
| `ADMIN_PASSWORD` | ✅ | Password for admin settings page |
| `CF_API_TOKEN` | For LE | Cloudflare API token with DNS edit permission |
| `CF_ZONE_ID` | For LE | Cloudflare Zone ID for your domain |
| `CF_RECORD_NAME` | For LE | Full domain name (e.g. `bean.mycommunity.org`) |
| `BEANPOOL_DATA_DIR` | — | Data directory inside container (default: `/data`) |
