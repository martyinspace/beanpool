---
description: how to safely deploy BeanPool to live nodes without breaking LE certs
---

# Safe Deploy Procedure

> **⚠️ Every deploy to a live node triggers a new Let's Encrypt cert request.** Deploying too frequently WILL rate-limit the domain and cause a 5-minute outage while the node falls back to self-signed. This has happened multiple times.

## The Golden Rule

**Batch all changes into ONE commit and deploy ONCE.** Never deploy multiple times in quick succession.

## Before You Deploy

// turbo
1. Verify the GH Actions build has succeeded:
```bash
gh run list --limit 1
```

2. Ask yourself: **Is this deploy necessary?** If you're just fixing a typo or a minor bug, wait and batch it with other changes.

3. If the node currently has a valid LE cert, deploying WILL wipe it and request a new one. The new request may be rate-limited if previous deploys failed.

## Deploy Commands

// turbo
4. Deploy to specific node(s):
```bash
bash deploy.sh 1         # Sydney only
bash deploy.sh 2         # Korea only
bash deploy.sh 3         # Debian (local dev) only
bash deploy.sh 1 2 3     # All nodes
```

## After Deploying

5. Wait 2 minutes for the node to boot and attempt the LE cert.

// turbo
6. Check the logs:
```bash
ssh -i ~/.ssh/id_azure_lattice azureuser@20.211.27.68 "docker logs beanpool-beanpool-node-1 2>&1 | tail -20"   # Sydney
ssh -i ~/.ssh/id_azure_lattice azureuser@20.194.24.118 "docker logs beanpool-beanpool-node-1 2>&1 | tail -20"  # Korea
ssh marty@192.168.1.219 "sudo docker logs beanpool-beanpool-node-1 2>&1 | tail -20"                            # Debian
```

7. Look for one of these outcomes:
   - `✅ Let's Encrypt cert obtained` — **success**, green padlock
   - `⚠️ Let's Encrypt failed — falling back to self-signed` — node is online with cert warning, LE will auto-retry in 24h
   - Stuck at `Step 2: Creating order...` — **rate-limited**, just wait 5 minutes for the timeout

## If Something Goes Wrong

> **DO NOT restart or redeploy.** That makes rate limiting worse.

- If stuck at "Step 2: Creating order..." — the 5-minute timeout in `tls.ts` will fire and fall back to self-signed. The node will come online. The 24-hour renewal scheduler will get the real cert once the rate limit clears (~60-90 min).
- If the node is completely unresponsive after 6 minutes — check Docker: `docker ps` and `docker logs`.
- To debug ACME: `DEBUG=acme-client` env var shows all HTTP requests, 429 responses, and retry-after headers.

## LE Rate Limits to Remember

| Limit | Value | Window |
|-------|-------|--------|
| Failed Validations | 5 per domain | 1 hour |
| Duplicate Certificates | 5 per domain | 7 days |
| New Orders | 300 per account | 3 hours |
