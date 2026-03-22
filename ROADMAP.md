# 🗺️ BeanPool Roadmap

> Planned features and future work. Updated: 2026-03-19

---

## ✅ Recently Completed

- ✅ **Map Centering & Location Fixes** — Map now centers dynamically on the node's configured radius (defaulting to Mullumbimby) instead of hardcoded Sydney, and Leaflet async "ghost pin" leak bugs were resolved.
- ✅ **People Tab** — replaced Invite tab with Friends, Community browser, Invites, Guardians
- ✅ **12-Word Seed Phrase** — BIP-39 mnemonic generation + deterministic Ed25519 key derivation
- ✅ **Recovery Mode** — enter 12 words + callsign to restore identity on any device
- ✅ **Landing Page Welcome Hub** — 3 clear paths (join, transfer, recover) + admin contact info
- ✅ **Admin Community Config** — name, email, phone in Settings → Community tab
- ✅ **Guardian Selection** — select up to 5 friends as recovery guardians (UI ready)

---

## Identity & Security

- [ ] **Social Recovery (Shamir 3-of-5)** — guardians reconstruct identity from secret shares when device is lost
- [ ] **Sign Out / Wipe Identity** — Button in PWA Settings to delete the local Ed25519 key from IndexedDB
- [ ] **Ban / Revoke Member** — Admin action to block a public key from transacting on the node
- [ ] **View Recovery Phrase** — Show stored 12-word phrase in Settings for existing mnemonic-based identities
- [ ] **Identity Backup Reminder** — Prompt users to export their identity if they haven't yet

## Marketplace

- [ ] **Database Migration (SQLite)** — Replace JSON state engine with `better-sqlite3`. Includes Spatial Bounding-Box indexing, continuous scroll Pagination (`LIMIT/OFFSET`), and robust relational constraints for nodes.
- [ ] **Photo Compression Pipeline** — Server-side image optimisation for marketplace post photos

## Data Lifecycle & Storage

- [ ] **Post Completion Cleanup** — When a need/offer is fulfilled, delete associated photos after a grace period (7 days)
- [ ] **Stale Post Archival** — Auto-archive posts older than X days (configurable), remove photos to free disk space
- [ ] **Storage Dashboard** — Show total data/photos disk usage in admin System tab with warnings
- [ ] **Photo Size Limits** — Enforce max file size per photo and max photos per post at upload time
- [ ] **Message Retention Policy** — Auto-prune old messages/conversations beyond a configurable age

## Network & Federation

- [x] **Federation Protocol — Phase 1** — Trust levels (mirror/peer/blocked), CORS, `/api/node/info`
- [x] **Federation Protocol — Phase 2** — Remote marketplace browsing, Connected Communities UI, node badges
- [x] **Federation Protocol — Phase 3** — Cross-node trading (Accept Offer on remote node) with Libp2p identity verification
- [x] **Federation Protocol — Phase 4** — Cross-node E2E messaging and mesh fund validation over authenticated Noise streams
- [ ] **Offline Queue** — Queue transactions/messages when offline, replay on reconnect

## Governance & Credits

- [ ] **Commons Fund Proposals** — UI for creating and voting on community proposals
- [ ] **Transaction History Export** — CSV/PDF export of credit ledger

## Native App

- [ ] **App Store & Play Store Inclusion** — Develop and polish the React Native / Expo app for formal marketplace distribution.
- [ ] **Pillar Toggle MVP** — Background sync service for Android/iOS (Expo)
- [ ] **Push Notifications** — Message and trade alerts via Firebase Cloud Messaging

---

_Suggestions? Open an issue or discuss with your node admin._
