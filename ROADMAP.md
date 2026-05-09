# 🗺️ BeanPool Roadmap

> Planned features and future work. Updated: 2026-05-09

---

## ✅ Recently Completed

- ✅ **Sanitized Syncing** — Automatic filtering of synthetic "Visitor" and escrow accounts from local databases and UI elements.
- ✅ **Map Clustering Stabilization** — Patched `react-native-map-clustering` to prevent marker disappearance on iOS during zoom and scroll interactions.
- ✅ **Offline Queue** — Built native SQLite capability to draft and save marketplace posts whilst offline, syncing automatically when connection restores.
- ✅ **Database Backup & Reset Safeguards** — Streaming `tar.gz` database snapshot downloads via the System tab, plus type-to-confirm and backup prompts to protect against accidental node resets.
- ✅ **Admin Branch Stats** — Inline stats chips (posts, msgs, deals) and expandable branch aggregate cards in the Audit tree, optimized with a single-pass SQL query.
- ✅ **Map Centering & Location Fixes** — Map now centers dynamically on the node's configured `serviceRadius` (defaulting to Mullumbimby), and Leaflet async "ghost pin" leak bugs were resolved.
- ✅ **People Tab** — replaced Invite tab with Friends, Community browser, Invites, Guardians
- ✅ **12-Word Seed Phrase** — BIP-39 mnemonic generation + deterministic Ed25519 key derivation
- ✅ **Recovery Mode** — enter 12 words + callsign to restore identity on any device
- ✅ **Landing Page Welcome Hub** — 3 clear paths (join, transfer, recover) + admin contact info. Newsletter signup using insert bypassed RLS constraints.
- ✅ **Admin Community Config** — name, email, phone in Settings → Community tab
- ✅ **Guardian Selection** — select up to 5 friends as recovery guardians (UI ready)
- ✅ **Native App (Expo)** — 7-tab React Native companion app achieving PWA parity: Map, Projects, Market (14 categories), Chat, People, Ledger, Settings
- ✅ **Native SQLite + SecureStore** — local data persistence and sovereign identity storage on device
- ✅ **Community Projects Tab** — native-only crowdfunding feature with progress tracking, atomic editing, and destructive rollback for escrow.
- ✅ **Marketplace Deals Hub** — Sync'd 1-step (Offers) and 3-step (Needs) atomic escrow handshake logic across both Native and PWA.
- ✅ **Smart CRM Inbox** — Converted messaging interfaces natively and functionally into transactional Deal tracking hubs (All/Transactions/Direct) with inline Object Attribution identifying post title and status parameters.
- ✅ **Moderation Centre** — Admin dashboard with reported posts, health-flagged wash trading (self-dealing, circular, rapid reciprocation), batch post operations, and member audit with client-side pagination (25/page).
- ✅ **Software Update Notifications** — Docker Desktop-style header badge, server-side GitHub polling, configurable auto-check interval (Hourly/6h/Daily/Weekly), copy-to-clipboard update instructions.
- ✅ **CI/CD Release Pipeline** — GitHub Actions auto-builds Docker images on `v*` tags, auto-creates GitHub Releases, injects version from git tag (no manual package.json bumps).
- ✅ **Deploy Model: Pull vs Build** — `deploy.sh` switched from `docker compose build` to `docker compose pull`, eliminating 2-5 min server-side compilation.
- ✅ **Admin Settings Extraction** — Moved all settings JS from inline `<script>` to standalone `static/settings.js` for maintainability.
- ✅ **Push Notifications** — Expo push token registration, DM/marketplace deal alerts, per-member notification preferences.
- ✅ **Guest Mode** — multi-node onboarding with membership probe endpoint, guest UI indicators in native and PWA headers.
- ✅ **Map Phase 6** — pin clustering, modern markers with category icons, elder glow effects for founding members (PWA + Native).
- ✅ **Marketplace UX Modernization** — horizontal category chips, author trust badges, active deals tracking (PWA + Native).
- ✅ **FTS5 Full-Text Search** — marketplace search with synonym mapping across titles, descriptions, and categories.
- ✅ **Directory Publisher** — nodes push metadata to beanpool.org Supabase global directory.
- ✅ **Community Search** — search and infinite scroll on the People/Community member list (native).
- ✅ **Escrow Demurrage Exemption** — escrow wallets exempt from circulation decay with DB persistence fix.
- ✅ **Self-Healing DB Migrations** — auto-repair corrupted ratings table schema on startup.
- ✅ **iOS Crypto Polyfill** — SHA-512 and Ed25519 signing polyfilled for iOS via `expo-crypto`.

---

## Identity & Security

- [ ] **Self-Healing Profile Synchronization** — Enable correct promotion of Visitor accounts to full member state when recovering locally before connecting to the node.
- [ ] **Social Recovery (Shamir 3-of-5)** — guardians reconstruct identity from secret shares when device is lost
- [ ] **Sign Out / Wipe Identity** — Button in PWA Settings to delete the local Ed25519 key from IndexedDB
- [ ] **Ban / Revoke Member** — Admin action to block a public key from transacting on the node
- [ ] **View Recovery Phrase** — Show stored 12-word phrase in Settings for existing mnemonic-based identities
- [ ] **Identity Backup Reminder** — Prompt users to export their identity if they haven't yet

## Marketplace

- [x] **Database Migration (SQLite)** — Replaced JSON state engine with `better-sqlite3`. Includes relational constraints and paging limits.
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
- [x] **Offline Queue** — Queue posts/transactions/messages when offline, replay on reconnect (save pending_upload to SQLite)

## Governance & Credits

- [ ] **Commons Fund Proposals** — UI for creating and voting on community proposals
- [x] **Transaction History Export** — Implemented `/api/ledger/export` CSV generation on Web and Native environments.

## Native App

- [x] **7-Tab Native Interface** — Map, Projects, Market, Chat, People, Ledger, Settings with neon-vine branded tab bar
- [x] **Native Identity Flow** — sovereign identity creation and 12-word recovery via Expo SecureStore
- [x] **Native SQLite Persistence** — `expo-sqlite` for posts, projects, messages, ledger
- [x] **Marketplace (14 categories)** — grid/list view, search, category filter, user blocking
- [x] **Community Projects** — crowdfund proposals with progress bars and funding badges
- [x] **Pillar Toggle MVP** — Background Merkle sync service for Android/iOS (Expo)
- [x] **Live Inbox Parity** — SQLite E2E text decryption, Background Sync Mutex Locking, & Native Tab Unread Badges
- [x] **Bean Ratings (Native)** — port 🫘 rating system to native app
- [x] **Abuse Reporting (Native)** — port reporting UI to native app
- [ ] **Federation (Native)** — remote marketplace browsing on native
- [ ] **App Store & Play Store Submission** — Polish and submit for formal distribution
- [x] **Push Notifications** — Message and trade alerts via Expo Push Notifications

---

_Suggestions? Open an issue or discuss with your node admin._
