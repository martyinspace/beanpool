# BeanPool Native App

> Full-featured React Native / Expo companion app — achieving visual and functional parity with the BeanPool PWA.

---

## Purpose

The BeanPool Native App is a **full native client** for Android and iOS, built with Expo Router and React Native. It mirrors the PWA's tab-based interface with native UI controls, SQLite-backed data persistence, and Expo SecureStore for identity management. A background sync service (Pillar Toggle) periodically mirrors the community ledger via Merkle delta exchange.

## Architecture

```
apps/native/
├── app/
│   ├── _layout.tsx              # Root layout — IdentityContext gate
│   ├── IdentityContext.tsx       # Global identity provider (SecureStore)
│   ├── welcome.tsx              # Onboarding: Create / Recover identity
│   ├── new-post.tsx             # Create marketplace post form
│   ├── propose-project.tsx      # Propose community crowdfund project
│   ├── chat/[id].tsx            # Individual chat conversation
│   ├── post/[id].tsx            # Post detail view
│   └── (tabs)/
│       ├── _layout.tsx          # Tab navigator — neon-vine branded bar
│       ├── index.tsx            # 🗺️ Map — Leaflet/OSM via WebView
│       ├── projects.tsx         # 🌱 Projects — community crowdfunding
│       ├── market.tsx           # 🤝 Market — 14-category marketplace
│       ├── chats.tsx            # 💬 Chat — conversations list
│       ├── people.tsx           # 👥 People — community browser
│       ├── ledger.tsx           # 📊 Ledger — balance & transactions
│       └── settings.tsx         # ⚙️ Settings — profile, node, identity
├── components/
│   ├── GlobalHeader.tsx         # Shared header with branding
│   ├── Map.tsx                  # Native map stub (placeholder)
│   ├── Map.web.tsx              # Web-only Leaflet map
│   ├── MapPinTail.tsx           # Custom map marker with tail
│   └── SyncStatus.tsx           # Background sync status indicator
├── services/
│   ├── pillar-sync.ts           # Delta-only Merkle sync engine
│   └── background-task.ts       # Expo BackgroundFetch registration
├── utils/
│   ├── db.ts                    # SQLite database (expo-sqlite)
│   ├── identity.ts              # Ed25519 keypair + BIP-39 mnemonic
│   ├── crypto.ts                # Crypto utilities (SHA-256, signing)
│   └── identity-transfer.ts     # Cross-device identity transfer
└── assets/
    └── images/
        └── neon-vines-banner.png  # Tab bar background artwork
```

## Tabs

| Tab | Emoji | Screen | Purpose |
|-----|-------|--------|---------|
| Map | 🗺️ | `index.tsx` | Community map with marketplace pins (Leaflet via WebView) |
| Projects | 🌱 | `projects.tsx` | Community crowdfunding — propose and fund shared goals with Beans |
| Market | 🤝 | `market.tsx` | 14-category marketplace — grid/list view, search, category filter, block users |
| Chat | 💬 | `chats.tsx` | DM and group conversations |
| People | 👥 | `people.tsx` | Community member browser |
| Ledger | 📊 | `ledger.tsx` | Mutual credit balance, transaction history, send credits |
| Settings | ⚙️ | `settings.tsx` | Profile editing, node config, identity management (hidden from tab bar) |

## Key Features

- **Sovereign Identity** — Ed25519 keypair from BIP-39 12-word mnemonic, stored in Expo SecureStore
- **SQLite Persistence** — all posts, projects, messages, and ledger data stored locally via `expo-sqlite`
- **14-Category Marketplace** — Food, Services, Labour, Tools, Goods, Housing, Transport, Education, Arts, Health, Care, Animals, Energy, General (PWA has 13; native adds Care ❤️)
- **Community Projects** — crowdfund tab with progress bars, funding badges, and proposal creation
- **Branded Tab Bar** — neon-vine artwork background with semi-transparent overlay
- **Post Detail View** — full-screen view with photos, credits, author info
- **Global Notifications** — red tab bar badges dynamically map to internal SQLite `last_read_at` unread calculations across inactive threads
- **Live Thread Syncing** — optimized 3-second polling hooks inside Active Chat fragments safely establish WebSocket-like responsiveness without hammering the background Node
- **SQLite Concurrency Mutex** — robust `dbSyncLock` javascript queue guarantees zero memory locks when background `applyDelta` daemons inherently overlap with foreground UX reads
- **Local User Blocking** — client-side block list stored in SecureStore securely hides target callsigns and listings

## Background Sync (Pillar Toggle)

```
Every 15 min (iOS) / configurable (Android):
  1. Wake up in background
  2. Connect to BeanPool node
  3. Request node's Merkle root hash
  4. Compare with local hash
     → Match? Done. (0 bytes, ~1 second)
     → Differ? Pull delta only
  5. Apply delta, prune to 1,000 tx
  6. If > 20 seconds: checkpoint & abort
```

| Rule | Value | Why |
|------|-------|-----|
| **Timeout** | 20 seconds | iOS kills tasks > 30s |
| **Pruning** | 1,000 transactions | Protect phone storage |
| **Checkpoint** | Auto | Resume aborted syncs |

## Deep Link & Onboarding Architecture

To gracefully bypass Apple and Google's URL parameter stripping during uninstalled app boundary crossings, BeanPool implements a 3-tier deep-link mitigation flow carefully balancing reliability and user privacy constraints.

1. **Deferred Deep Linking (Clipboard Inference)**
   - Apple strictly drops URL parameters if a user must install the app completely from scratch. 
   - We solve this by having the `WelcomePage.tsx` Web Trampoline inject `navigator.clipboard.writeText()` onto the "Download App Store" buttons.
   - On the very first native cold boot, `welcome.tsx` queries `Clipboard.hasStringAsync()`. If it spots an `INV-` or `BP-` token, it silently injects it into the workflow without aggressively dumping the user. This is permanently disabled via `AsyncStorage`'s `hasLaunched` flag to stop creepy polling.

2. **Bypassing Expo Router Hydration Drops**
   - Relying on `useLocalSearchParams()` on Android leads to intent drops, as standard router hydration intrinsically races during cold-boot states, losing the `?invite=` query argument.
   - We forcefully bypass the router by having the Welcome screen natively pull `Linking.useURL()` on purely the first mount tick.

3. **Android Intent Parser Safe Payloads**
   - The Android Deep Link parser destructively munches standard Base64 characters (`+`, `/`, `=`) turning them into whitespace inside URL parameters.
   - Offline cryptographic tickets are entirely encoded in `Base64URL` natively by the PWA and safely reversed exactly before the backend triggers Ed25519 parsing. Invite formats are distinguished primarily by length (Tickets > 20 characters) and fallback legacy genesis codes (`INV-XXXX`).

## Quick Start

```bash
cd apps/native
pnpm install
npx expo start --web --port 8082   # Web preview
npx expo start                      # Native dev client
```

## Parity Status (vs PWA)

| Feature | PWA | Native | Notes |
|---------|-----|--------|-------|
| Map with pins | ✅ | ✅ | WebView+Leaflet on native |
| Marketplace (grid/list) | ✅ | ✅ | Native has 14 categories (adds Care) |
| Post creation | ✅ | ✅ | Photo upload, location pin |
| Post detail view | ✅ | ✅ | |
| Chat (DM + groups) | ✅ | ✅ | Base64 E2E plaintext-v1 encoding |
| Live Chat Response Polling | ✅ | ✅ | 3-sec foreground hook interval |
| Unread Notification Badges | ✅ | ✅ | Tab bar indicator with JS Date Timezone corrections |
| People browser | ✅ | ✅ | Connects to `/api/members` dictionary for Callsign resolutions |
| Ledger & send credits | ✅ | ✅ | |
| Identity (create/recover) | ✅ | ✅ | SecureStore on native |
| Community Projects | — | ✅ | Native-only feature |
| Settings / Profile | ✅ | ✅ | |
| Bean ratings | ✅ | 🔜 | In progress |
| Abuse reporting | ✅ | 🔜 | In progress |
| Federation (remote markets) | ✅ | 🔜 | Planned |

---

_Last updated: 2026-03-24 21:15 AEDT_
