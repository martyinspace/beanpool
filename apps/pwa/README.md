# BeanPool PWA (Web Client)

> The primary Progressive Web Application for the BeanPool protocol. It serves as the community gateway interface for identity management, local marketplace discovery, and peer-to-peer messaging.

---

## 📱 Features

- **Map:** Leaflet/OSM map with marketplace pins, dynamic root locations, and post form with photo upload.
- **Marketplace:** 13-category Deals Hub with "My Market" segment controls, radius filters, and unread inbound request counters.
- **Messaging (Chat):** Direct messages and group chats representing Transactional CRM (smart mapping to parent marketplace posts).
- **People:** Community browser, Friends, Invites (hierarchical code management), and Guardians.
- **Ledger:** Mutual credit balances, raw transactions, and fund transfers.
- **Profile:** Editable profiles with camera/gallery avatar uploads, callsigns, bios, and 3-tier visibility settings.
- **Identity:** Deterministic Ed25519 identity generation and 12-word seed phrase recovery locally stored in IndexedDB.

---

## 📁 Source Architecture (Key Files)

| File | Purpose |
|------|---------|
| `src/App.tsx` | Shell — identity gate, 5-tab bottom nav (Map, Market, Chat, People, Ledger), header |
| `src/pages/MapPage.tsx` | Leaflet/OSM map with marketplace pins, post form with photo upload |
| `src/pages/MarketplacePage.tsx` | Marketplace list + search + radius filter + post detail + edit own posts + bean ratings + abuse reporting |
| `src/pages/MessagesPage.tsx` | Conversations list + chat view (DMs + groups) |
| `src/pages/PeoplePage.tsx` | People tab — Friends, Community browser, Invites, Guardians sub-views |
| `src/pages/LedgerPage.tsx` | Balance, transactions, send credits |
| `src/pages/ProfilePage.tsx` | Editable profile — avatar (camera/gallery), callsign, bio, contact |
| `src/components/MarketplaceCard.tsx` | Post tile with primary photo + bean rating |
| `src/components/RadiusPickerPage.tsx` | Facebook-style map radius picker (Leaflet circle + slider) |
| `src/lib/api.ts` | Typed client for all 30+ REST endpoints (incl. friends, guardians, members) |
| `src/lib/identity.ts` | Ed25519 identity — mnemonic-derived keys, IndexedDB persistence |
| `src/lib/mnemonic.ts` | BIP-39 mnemonic generation + WebCrypto PKCS8 key derivation |
| `src/lib/e2e-crypto.ts` | Plaintext v1 encoding (E2E-ready data model) |
| `src/lib/marketplace.ts` | 13-category config, MarketplacePost type |
| `src/lib/geo.ts` | Haversine distance, radius settings persistence |

---

## 🛠️ Development

```bash
cd apps/pwa
pnpm install
pnpm dev
```
