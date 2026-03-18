# 🗺️ BeanPool Roadmap

> Features planned but not yet built. Updated: 2026-03-18

---

## Identity & Security

- [ ] **Sign Out / Wipe Identity** — Button in PWA Settings to delete the local Ed25519 key from IndexedDB, logging the user out of that device
- [ ] **Ban / Revoke Member** — Admin action to block a public key from transacting on the node (via abuse reports panel)
- [ ] **Identity Backup Reminder** — Prompt users to export their identity if they haven't yet

## Marketplace

- [ ] **Database Migration** — Move from JSON state file to SQLite for scalability (posts, photos, search, radius queries)
- [ ] **Photo Compression Pipeline** — Server-side image optimisation for marketplace post photos

## Data Lifecycle & Storage

- [ ] **Post Completion Cleanup** — When a need/offer is marked as fulfilled, delete associated photos from the server after a grace period (e.g. 7 days)
- [ ] **Stale Post Archival** — Auto-archive posts older than X days (configurable in admin settings), remove their photos to free disk space
- [ ] **Storage Dashboard** — Show total data/photos disk usage in the admin System tab with warnings at configurable thresholds
- [ ] **Photo Size Limits** — Enforce max file size per photo and max photos per post at upload time
- [ ] **Message Retention Policy** — Auto-prune old messages/conversations beyond a configurable age

## Network & Sync

- [ ] **Multi-Node Marketplace Sync** — Propagate marketplace posts across trusted connectors
- [ ] **Offline Queue** — Queue transactions/messages when offline, replay on reconnect

## Governance & Credits

- [ ] **Commons Fund Proposals** — UI for creating and voting on community proposals
- [ ] **Transaction History Export** — CSV/PDF export of credit ledger

## Native App

- [ ] **Pillar Toggle MVP** — Background sync service for Android/iOS (Expo)
- [ ] **Push Notifications** — Message and trade alerts via Firebase Cloud Messaging

---

_Suggestions? Open an issue or discuss with your node admin._
