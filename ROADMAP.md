# 🗺️ BeanPool Roadmap

> Planned features and future work. Updated: 2026-05-20

---

## ✅ Recently Completed

- ✅ **Sentinel Security Hotfix: Auth Bypass Mitigation** — Closed a critical authorization bypass in the `requireSignature` middleware. Expanded the protect-list to cover 17 sensitive endpoints (social recovery, friends/guardians, transaction approvals, push tokens) and broadened prefix-spoofing coverage.
- ✅ **Auth Boundary Verifier** — Shipped `scripts/verify-auth-boundary.mjs` verifying all 37+ protected routes with 111 checkmarks against local running server instances.
- ✅ **Client-side Signing Lockstep** — Signed the 4 key callsites affected by the expanded protect-list in the native app.
- ✅ **Monorepo Flat Linting** — Implemented monorepo-wide Flat config `eslint.config.mjs` to automate cleaner code standards.
- ✅ **Author Request Review Flow** — Enhanced deals management allowing sellers to review buyer requests with integrated messaging and standardized decline reasons.
- ✅ **Ledger UI Enhancements** — Corrected credit slider visual representation for negative balances and improved feedback for locked 'Send Credits' functionality.
- ✅ **Cross-platform Avatar Sync** — Implemented `bundled://` protocol for avatars, fixing missing pin icons and broken clustering on Android.
- ✅ **Native Quadratic Voting** — Restored native QV governance engine, CommonsInfoModal, voting stepper, and dual progress bars.
- ✅ **Sybil Hardening v3** — Implemented funnel detection, ghost velocity gate, and interactive audit filters.
- ✅ **Profile Completeness Enforcement** — Added server-side enforcement for profile completeness.
- ✅ **Onboarding UX Overhaul** — Refined into a friendly 3-step onboarding flow.
- ✅ **Haptic Feedback** — Phase 1 essentials implemented for native app interactions.
- ✅ **Admin Dashboard Reorganization** — Redistributed System tab settings to contextual tabs; fixed login ReferenceError.
- ✅ **Continuous Health Ping** — Added offline red dot indicator and continuous health ping to mobile app header, mapped using unique public keys to prevent UI collisions.
- ✅ **Sentinel Security Hardening** — Mitigated Stored XSS vulnerabilities across the Admin Dashboard and fixed Command Injection in server backup routines. Established `.jules/sentinel.md` as a continuous security audit journal.
- ✅ **Relational Filtering Optimization** — Fixed an O(N^2) performance bottleneck for array filtering on relational data elements.
- ✅ **PWA Accessibility** — Added missing ARIA attributes and labels to the WelcomePage inputs.
- ✅ **PWA Community Status Indicator** — Health popover on header tap showing node status, member count, and membership badge.
- ✅ **PWA Avatar Trust Badges** — Author avatars with initials fallback on marketplace cards and posts, navigating to public profile on click.
- ✅ **PWA People Page Parity** — Search filter, avatar circles, relative dates ("3d ago"), and 💬 message button on friend rows.
- ✅ **PWA Synonym-Expanded Search** — 417-entry synonym map enables marketplace discovery across related terms (e.g., "lemon" → fruit, citrus, produce).
- ✅ **PWA Blocked User Filtering** — Posts from blocked users hidden via `localStorage` blocklist.
- ✅ **PWA Security Settings** — Backup reminder card, private key viewer (reveal/hide + copy), wipe identity with double-confirm.
- ✅ **Native Invite Share Fix** — Share text now includes Node URL for manual invite code entry.
- ✅ **Decentralized Directory Auth** — Replaced hardcoded shared API keys with node-specific Libp2p Ed25519 cryptographic signatures and UTC timestamp verification to prevent spoofing and replay attacks.
- ✅ **Admin Node Restore** — Implemented system restoration via `.tar.gz` database upload for admins.
- ✅ **Offline Profile Healing** — Restored offline-first profile synchronization.
- ✅ **A11y & Stability** — Fixed P2P stream crash loops and applied accessibility improvements across components.
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
- ✅ **Social Recovery (3-of-N)** — Cryptographically secure identity recovery mechanism requiring quorum approval from trusted friends. Includes Guardian Knowledge Check to prevent spoofing and a 24-hour security cooldown.
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
- ✅ **Commons Demurrage Persistence** — COMMONS_BALANCE now persists to `accounts` table, restored on startup, saved every 5 min + on every transfer.
- ✅ **Project System Unification** — Admin Commons UI now reads from the live `projects` SQL table instead of deprecated JSON config blob.
- ✅ **Profile Photo Server Sync** — Profile updates (including avatar) now push to server and propagate to all devices via sync.
- ✅ **Android Marker Pipeline** — Pre-rendered PNG map markers via `react-native-view-shot` delivered through Google Maps `BitmapDescriptor`, eliminating Android JSX snapshot clipping. Cluster counts pre-rendered 2–99 with "99+" overflow.
- ✅ **Profile Navigation Consistency** — Author names and avatars are tappable across all marketplace surfaces (cards, map preview, community list, projects), navigating to Trust Profile with correct data params.

---

## 🔴 Critical / High Priority

> These items represent data integrity risks, security gaps, or significant UX blockers for real users.

### Identity & Security

- [ ] 🔴 **Deny-by-default Middleware** — Restructure the `requireSignature` middleware to default-deny all POST/DELETE routes. This eliminates the fragile opt-in protect-list pattern and prevents future endpoint additions from accidentally leaking unauthorized access.
- [ ] 🔴 **`ctx.state.actor` Migration** — Refactor ~25 authenticated endpoint handlers to read the actor's identity from `ctx.state.actor` instead of custom request body parameters, shutting down any potential impersonation vectors.
- [ ] 🔴 **View Recovery Phrase** — Show stored 12-word phrase in Settings for existing mnemonic-based identities. _Users currently have no way to see their seed words after initial creation. If they didn't write them down, identity loss is permanent on device failure._ **Note:** PWA now has a private key viewer as a partial mitigation.
- [x] 🔴 **Identity Backup Reminder** — Prompt users to export their identity if they haven't yet. _Implemented in PWA Settings as an amber warning card._
- [ ] 🔴 **Ban / Revoke Member (Enforcement)** — `adminSetUserStatus('disabled')` exists but doesn't actually block transactions or posting. Disabled members can still transact. _Need to enforce status checks in transfer/post/messaging pathways._
- [ ] 🔴 **`/api/invite/redeem*` Proof-of-Possession** — Implement a cryptographic challenge-response check on the supplied `publicKey` during invite redemption to ensure the client actually holds the corresponding private key.
- [ ] **Visitor Account Audit** — Investigate signup flow for ghost/unnamed accounts; consider enforcing mandatory profile info or redirecting to profile settings on first login.
- [ ] 🟡 **PWA sendRemoteTransfer unsigned POST** — Fix long-standing bug where the PWA client posts to `/api/ledger/transfer` without signature headers.

### Data Lifecycle & Storage

- [ ] 🔴 **Photo Size Limits** — No upload size enforcement exists. Large base64 images (including profile avatars) are stored as-is, creating unbounded storage growth and sync payload bloat.
- [ ] 🟡 **Stale Post Archival** — Auto-archive posts older than X days (configurable), remove photos to free disk space. _Without this, node storage grows indefinitely._
- [ ] 🟡 **Post Completion Cleanup** — When a need/offer is fulfilled, delete associated photos after a grace period (7 days).
- [ ] **Photo Compression Pipeline** — Server-side image optimisation for marketplace post photos.
- [ ] **Message Retention Policy** — Auto-prune old messages/conversations beyond a configurable age.
- [ ] **Storage Dashboard** — Show total data/photos disk usage in admin System tab with warnings.

---

## 🟡 Important

### Governance & Credits

- [ ] 🟡 **Mobile Voting UI** — Native app interface for community members to vote on funding rounds. _Admin voting UI exists in settings.html, but phone users cannot currently participate in governance — this is a major participation gap for a community currency._
- [ ] **Self-Healing Profile Synchronization** — Enable correct promotion of Visitor accounts to full member state when recovering locally before connecting to the node.

### Identity & Security

- [x] **Sign Out / Wipe Identity** — `wipeIdentity()` implemented in native app Settings with type-to-confirm safeguard and full state cleanup. PWA equivalent added with double-confirm → `localStorage` clear → page reload.

---

## Backlog

### Marketplace

- [x] **Database Migration (SQLite)** — Replaced JSON state engine with `better-sqlite3`. Includes relational constraints and paging limits.

### Network & Federation

- [x] **Federation Protocol — Phase 1** — Trust levels (mirror/peer/blocked), CORS, `/api/node/info`
- [x] **Federation Protocol — Phase 2** — Remote marketplace browsing, Connected Communities UI, node badges
- [x] **Federation Protocol — Phase 3** — Cross-node trading (Accept Offer on remote node) with Libp2p identity verification
- [x] **Federation Protocol — Phase 4** — Cross-node E2E messaging and mesh fund validation over authenticated Noise streams
- [x] **Offline Queue** — Queue posts/transactions/messages when offline, replay on reconnect (save pending_upload to SQLite)
- [ ] **Federation (Native)** — remote marketplace browsing on native

### Governance & Credits

- [x] **Transaction History Export** — Implemented `/api/ledger/export` CSV generation on Web and Native environments.

### Native App

- [x] **7-Tab Native Interface** — Map, Projects, Market, Chat, People, Ledger, Settings with neon-vine branded tab bar
- [x] **Native Identity Flow** — sovereign identity creation and 12-word recovery via Expo SecureStore
- [x] **Native SQLite Persistence** — `expo-sqlite` for posts, projects, messages, ledger
- [x] **Marketplace (14 categories)** — grid/list view, search, category filter, user blocking
- [x] **Community Projects** — crowdfund proposals with progress bars and funding badges
- [x] **Pillar Toggle MVP** — Background Merkle sync service for Android/iOS (Expo)
- [x] **Live Inbox Parity** — SQLite E2E text decryption, Background Sync Mutex Locking, & Native Tab Unread Badges
- [x] **Bean Ratings (Native)** — port 🫘 rating system to native app
- [x] **Abuse Reporting (Native)** — port reporting UI to native app
- [x] **Push Notifications** — Message and trade alerts via Expo Push Notifications
- [x] **App Store & Play Store Submission** — Published to both stores (v1.0.39, build 50).

---

_Suggestions? Open an issue or discuss with your node admin._
