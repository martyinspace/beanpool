# Mirroring, Failover & Merging Nodes

Because BeanPool's internal state engine (Ledger, Members, Web of Trust, and Posts) is built entirely on top of **Conflict-Free Replicated Data Types (CRDTs)**, node operators have incredibly flexible options for backing up, failing over, and even merging communities together.

---

## 🪞 1. Setting Up a Mirror (Disaster Recovery Backup)

A `mirror` connector silently maintains a mathematically identical, real-time copy of your primary node's `state.json`. If your primary node goes offline, the mirror can take over instantly with zero data loss.

**Steps to set up a bi-directional mirror:**
1. **Provision a Blank Node:** Deploy a brand new BeanPool node on a separate server or VPS (e.g., `backup.yourcommunity.org`).
2. **Get the Peer IDs:**
   - Log into the Admin Settings of your **Primary Node**. Copy its `PeerID`.
   - Log into the Admin Settings of your **Blank Node**. Copy its `PeerID`.
3. **Bridge the Primary to the Backup:** 
   - On the Primary Node, go to the **Connectors** tab. 
   - Add the Blank Node's Public URL and `PeerID`. 
   - Set the Trust Level to **`mirror`**.
4. **Bridge the Backup to the Primary:** 
   - On the Blank Node, go to the **Connectors** tab. 
   - Add the Primary Node's Public URL and `PeerID`. 
   - Set the Trust Level to **`mirror`**.

**What happens next?** 
The nodes will instantly handshake over the Yamux stream protocol. They will exchange their Merkle tree root hashes, identify the state deltas, and stream the missing CRDT events. The blank node will immediately populate with all members, balances, and posts. Any future transaction on either node streams to the other instantly.

---

## 🚦 2. Automated Failover (Cloudflare Load Balancing)

Because both nodes now possess the identical live state, you can automate failover at the DNS layer so your community never experiences downtime.

**How to automate it using Cloudflare:**
1. In your Cloudflare Dashboard, go to **Traffic -> Load Balancing**.
2. Create a new **Load Balancer** for your primary domain (e.g., `mullum.beanpool.org`).
3. Set up an **Active-Passive (Failover)** pool:
   - **Primary Server:** `mullum1.beanpool.org` (or directly its IP address)
   - **Backup Server:** `mullum2.beanpool.org` (or directly its IP address)
4. Configure a **Health Check** to ping your primary server every 60 seconds.

When your users type `mullum.beanpool.org` into their phone, Cloudflare instantly routes them to `mullum1`. If `mullum1` accidentally loses power, Cloudflare detects the failed health check and instantly, seamlessly re-routes all `mullum.beanpool.org` traffic straight to `mullum2`. Since the backup has the exact same mirrored CRDT state, the community won't even notice the primary node went down.

*(Note: Active-Active Load Balancing across both nodes simultaneously is not formally recommended due to WebSocket pinning and libp2p PeerID identity splits, though the CRDTs would technically handle the sync state successfully).*

---

## 🧬 3. Merging Two Separate Communities

What if Community A (50 users) and Community B (50 users) decide they want to permanently join forces and become a single 100-user community?

Because of the CRDT event log architecture, **merging communities is just as simple as mirroring!**

1. Ensure both communities are running the exact same version of BeanPool.
2. Follow the Mirroring steps above — configure Node A to trust Node B as a `mirror`, and Node B to trust Node A as a `mirror`.
3. **The CRDT Merge:** The nodes will mathematically resolve the event logs without any data collisions. 
   - Bob's posts from Node A will interleave with Alice's posts from Node B.
   - The Ledger will expand to contain all 100 mutual credit balances.
   - The Web of Trust trees will merge into a single continuous forest.

Once synced, Administrator A and Administrator B are now co-hosting an identical merged community. Either admin can choose to shut down their physical server, map their domain to the surviving node, and the merge is complete!

---

## 🔄 4. Rolling Updates (Zero Downtime)

When a new version of BeanPool is released, you can update your mirrored array without your community ever experiencing a single second of downtime!

Because the state log is built entirely on backwards-compatible CRDTs, the mirror will happily tolerate being out of sync with the primary node's software version for the few minutes it takes to deploy. The standard operational procedure is a **Rolling Update**:

1. **Update the Backup Node First:** Run your deployment script targeted *only* at the backup node (e.g. `bash deploy.sh 1`). 
2. **Cloudflare Takes Over:** While the backup node restarts, Cloudflare's health check will briefly mark it as "Down" and route 100% of community traffic safely to your Primary node.
3. **The Catch-Up Sync:** When the backup node finishes booting, it will instantly re-establish its libp2p connection to the Primary node and safely sync any new posts or messages that happened while it was restarting.
4. **Update the Primary Node:** Now, deploy to your Primary node (e.g. `bash deploy.sh 3`). 
5. **The Failover:** While the primary restarts, the Cloudflare Load Balancer instantly detects the drop and seamlessly routes 100% of your users to the newly-updated backup node!

Once the primary finishes booting, the two nodes will sync back up perfectly. Your community stays online the entire time!
