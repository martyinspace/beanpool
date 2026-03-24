# Scaling BeanPool: Design Considerations

BeanPool is a decentralized mutual credit protocol designed for community-scale operation. As the network grows, the architecture is intended to scale horizontally without requiring centralized infrastructure.

This document describes the **planned scaling strategies** for handling increasing load. Some of these are implemented, others are design goals for future development.

## 1. GossipSub Topic Sharding (Geographic & Categorical)
Currently, all transactions, pins, and map updates are broadcast over a single global libp2p pub/sub channel (`TOPIC_LOCAL_MESH`). At massive scale, this would overwhelm individual nodes with irrelevant chatter.

To handle a million users, the GossipSub protocol employs **Topic Sharding**.
The chatter is mathematically divided into smaller, highly relevant channels:
*   **Geographic Tiles:** The global map is divided into regions (e.g., `topic:map:nsw-north`, `topic:map:arizona-phx`). A user in Byron Bay only subscribes to data relevant to their physical proximity.
*   **Categorical Filtering:** A backbone node in France doesn't need to process immediate updates for a "Lawn Mower Rental" in Mullumbimby, so that traffic naturally bypasses it.

By sharding the mesh, each server only processes the fraction of traffic that is actively requested by the clients connected to it.

## 2. Eventual Consistency and CRDTs
Traditional bank databases use "Strict Consistency"—every server must lock up and agree on an exact account balance before moving to the next split-second transaction. This creates massive bottlenecks at scale.

BeanPool relies on **Conflict-Free Replicated Data Types (CRDTs)** and cryptographic Merkle Syncs (`packages/beanpool-core/src/merkle.ts`).
If the Brisbane backbone gets hit with 10,000 transactions at once, it doesn't ask permission from the rest of the world. It processes them instantly against its local ledger, and then asynchronously synchronizes the cryptographic "proofs" (hashes) with other nodes in the background. If the mesh splits in half (e.g., an undersea cable breaks), CRDTs mathematically guarantee that when the network merges back together, every node will eventually compute the exact same state without destroying conflicting data.

## 3. Direct P2P Stream State Synchronization
When a node was offline and missed live GossipSub broadcasts, it will detect a Merkle Root mismatch. Instead of forcing the entire node network to re-broadcast a massive global state dump over the public Gossip channel, BeanPool uses direct stream protocols.

Nodes dial each other using a dedicated, private libp2p tunnel (e.g., `/beanpool/sync/1.0.0`) to silently transfer historical SQLite (`mesh.sqlite`) and ledger databases peer-to-peer.

## 4. Organic Infrastructure and Kademlia DHT
Because BeanPool is decentralized, the infrastructure scales organically alongside the user base. We do not have to pay cloud providers to spin up larger central servers for a million users.

Instead, tech-savvy citizens spin up their own **Local Nodes**. To ensure these nodes can find each other without relying entirely on hardcoded Azure "Lighthouse" bootstrap IPs, the protocol leverages the **Kademlia Distributed Hash Table (Kad-DHT)**.
Kad-DHT allows nodes to organically discover peers, route traffic around dead zones, and store offline messages in a distributed manner.

## 5. Edge Computing (Smartphones as Mini-Nodes)
The BeanPool Native App (`apps/native/`) is an early realisation of this concept. The React Native / Expo companion app runs a **background Merkle sync service** (Pillar Toggle) that periodically mirrors the community ledger onto the phone via delta exchange. This means smartphones already carry a local copy of the community state in SQLite, enabling offline read access and resilience.

In the future, at physical gatherings (farmers markets, community events), phones can use Bluetooth/Local Wi-Fi to gossip transactions directly, batching and relaying to a Backbone Node once connectivity is restored.

## 7. Persistent Embedded Databases (✅ Completed)
Backend state is maintained and synchronized using **better-sqlite3**, an embedded local disk database utilizing Write-Ahead Logging (WAL). The Native App mirrors this pattern with **expo-sqlite** on mobile devices.

## 8. Cryptographic Payload Signatures (✅ Completed)
Every action (creating a pin, sending mutual credit) is mathematically signed by the mobile app's Ed25519 private key. The mesh nodes actively verify this signature via an ingress middleware before processing the transaction.

---

## Next Scaling Milestones

**Priority 1: CRDTs & Sharding (Data Integrity)**
Expand the storage schema to handle vector clocks and geohashes for eventual consistency under load and network partitions.

**Priority 2: Kademlia DHT & Edge Computing (Organic Expansion)**
Enable smartphones and citizen-run hardware to discover each other without relying on centralized bootstrap nodes.

**Priority 3: Social Recovery (Guardian Protocol)**
Allow trusted community members ("Guardians") to vouch for a user and recover lost identities without centralized passwords.

---
**Note:** These are design goals, not guarantees. The current implementation handles community-scale load (hundreds of participants). The strategies above outline how the architecture could evolve for larger deployments.
