# BeanPool Security Audit

**Date:** 2026-06-03
**Scope:** Server node (`apps/server`), PWA client (`apps/pwa`), native app (`apps/native`)
**Type:** Read-only review. No fixes applied yet.

Each finding has a stable ID (`SRV-`/`PWA-`/`NAT-`/`X-` for cross-cutting), a severity, a
location, the concrete attacker path, and a fix direction. Confidence is noted where a
finding still needs hands-on verification.

Severity scale: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low/hardening

---

## Threat model (orientation)

- The **server node is the trust boundary.** Clients sign requests for authenticity, but a
  malicious actor won't use our client — so client-side correctness never substitutes for
  server enforcement.
- Identity = an Ed25519 keypair. The private key is the crown jewel (full account/identity
  takeover). It lives in `expo-secure-store` (native, OS-protected) and **plaintext IndexedDB**
  (PWA, JS-accessible — higher risk).
- Deployments are both **LAN (self-signed CA)** and **public (Let's Encrypt)**. Open ports:
  8080 (HTTP), 8443 (HTTPS API + WebSocket), 4001/4002 (libp2p).

---

## Cross-cutting

### X-1 🟠 Signed requests are not bound to a nonce/timestamp/method/path — replayable
**Where:** server [https-server.ts:190-206](apps/server/src/https-server.ts#L190); PWA [api.ts:23-34](apps/pwa/src/lib/api.ts#L23); native ~18 sites (see X-2).
**Attacker path:** the signature covers only `JSON.stringify(body)`. A captured signed request
(e.g. a transfer) can be replayed indefinitely, and a body signed for one endpoint can be
routed to another that accepts the same shape (e.g. `transactions/approve` ↔ `reject`).
**Fix:** bind `{method, path, timestamp, nonce}` into the signed payload; server rejects stale
/ reused nonces. **This is the keystone change — it couples the server and all three clients
and must ship in lockstep.**

### X-2 🟡 Native signing logic is duplicated across ~18 call sites
**Where:** native `_signedRequest` [db.ts:1920](apps/native/utils/db.ts#L1920) (+retry :1971), plus inline signers at db.ts:849, 952, 1033, 1097, 1221, 1698, 1756, 1824, 1897, 2501, 2548, 2575; welcome.tsx:340; settings.tsx:328; people.tsx:154/202; pillar-sync.ts:182.
**Why it matters:** X-1 cannot be applied safely until these collapse into one canonical signer.
**Fix:** refactor all sites through a single signer **before** landing X-1.

### X-3 🟢 Weak Content-Security-Policy amplifies client key-theft risk
**Where:** server [https-server.ts:115](apps/server/src/https-server.ts#L115) — `script-src 'unsafe-inline'` and `connect-src ... *`.
**Attacker path:** the PWA holds the private key in JS-readable IndexedDB; a weak CSP is what
turns a small injection (see PWA-1) into key exfiltration. Treat CSP + IndexedDB storage as one
linked risk.
**Fix:** drop `'unsafe-inline'`, replace `connect-src *` with an explicit allowlist.

---

## Server node (`apps/server`)

### SRV-1 🔴 Unauthenticated P2P state injection / ledger forgery
**Where:** sync handlers with no trust gate — [sync-protocol.ts:192](apps/server/src/sync-protocol.ts#L192) (payload), [:385](apps/server/src/sync-protocol.ts#L385) (delta), [:431](apps/server/src/sync-protocol.ts#L431) (event), [:471](apps/server/src/sync-protocol.ts#L471) (v1); self-attested verification in [state-engine.ts:2874-2885](apps/server/src/state-engine.ts#L2874); no connection gater in [p2p.ts:71-86](apps/server/src/p2p.ts#L71); account overwrite at [state-engine.ts:3085-3095](apps/server/src/state-engine.ts#L3085).
**Attacker path:** libp2p accepts any inbound connection (4001/4002). The sync handlers call
`importRemoteState()` with **no `isPeerTrusted()` check** (unlike federation/handshake). The
import "validates" only that the payload is signed by the `publicKey` embedded *in the payload
itself* — self-attestation. So an attacker signs a malicious payload with their own key, it
passes, and balances/members/transactions/posts/ratings/messages are written. Account balances
are overwritten with no last-writer-wins guard.
**Impact:** mint unlimited credits, forge membership, inject transactions, total loss of ledger
integrity. **Most severe finding.**
**Fix:** gate every sync handler with `isPeerTrusted(connection.remotePeer)`; verify the
payload `publicKey` maps to a known trusted connector PeerID; add a libp2p `connectionGater`.

### SRV-2 🟠 Full ledger disclosure, unauthenticated
**Where:** [https-server.ts:1181](apps/server/src/https-server.ts#L1181) → [state-engine.ts:4112](apps/server/src/state-engine.ts#L4112).
**Attacker path:** `GET /api/ledger/export` requires no auth (signature middleware only guards
mutating methods) and returns every member's pubkey, callsign, **balance**, and the **complete
transaction history**.
**Fix:** require admin auth (or signed member auth) on the export endpoint.

### SRV-3 🟡 Contact-visibility bypass via spoofed `requester`
**Where:** [state-engine.ts:929-934](apps/server/src/state-engine.ts#L929); route [https-server.ts:1096-1099](apps/server/src/https-server.ts#L1096).
**Attacker path:** "friends-only" contact info is gated on the unauthenticated `requester`
query param. The victim's friend list is public (`GET /api/friends/:publicKey`), so an attacker
passes `?requester=<a friend's pubkey>` to reveal hidden contact details.
**Fix:** derive the requester from the verified signature, not a query param.

### SRV-4 🟡 Broad unauthenticated read access / enumeration + unauthenticated WS feed
**Where:** GETs `/api/community/members`, `/api/members`, `/api/ledger/balance/:pk`,
`/api/ledger/transactions`, `/api/marketplace/transactions`, `/api/invite/tree` (social graph),
`/api/recovery/lookup/:callsign`; WS feed [https-server.ts:2471-2476](apps/server/src/https-server.ts#L2471).
**Attacker path:** anyone reaching :8443 can enumerate members and read balances/transactions
by pubkey; `/ws` streams live state changes with no auth (`/ws/logs` *is* authenticated — good).
**Fix:** decide a read-auth policy; at minimum gate balances/transactions and the WS feed.

### SRV-5 🟡 CORS allows credentials with prefix-matched origins
**Where:** [federation-api.ts:28-32](apps/server/src/federation-api.ts#L28).
**Attacker path:** `origin.startsWith(o) || o.startsWith(origin)` + `Allow-Credentials: true`
→ `https://goodpeer.com.evil.com` matches `https://goodpeer.com`. Lower real impact (auth is
header-based, not cookie-based) but still wrong.
**Fix:** exact-match origins.

### SRV-6 🟢 Anti-spoof identity check is heuristic (field-name based)
**Where:** [https-server.ts:221-229](apps/server/src/https-server.ts#L221).
**Risk:** binding relies on field-name suffixes; brittle for any future endpoint carrying the
actor in a differently-named field or URL param.
**Fix:** always use `ctx.state.actor`; never trust body-supplied identity.

### SRV-7 🟢 `foreign_keys = OFF` globally
**Where:** [db.ts:24](apps/server/src/db/db.ts#L24).
**Risk:** no referential integrity; sync importer can leave orphan rows. Amplifies SRV-1.
**Fix:** enable FK enforcement (audit existing data first).

### SRV-8 🟢 Schema integrity leans on a single CHECK
**Where:** `transactions.amount CHECK (amount > 0)` [schema.sql:42](apps/server/src/db/schema.sql#L42); pledge path [db.ts:455](apps/server/src/db/db.ts#L455); `accounts.balance` has no CHECK.
**Risk:** negative-amount abuse is blocked only because the transaction insert aborts. The route
guard `!parsedAmount` lets negatives through.
**Fix:** validate `amount > 0` at the route layer.

### SRV-9 🟢 Untrusted tar extraction on restore; admin brute-force; CSP (see X-3)
**Where:** restore [https-server.ts:750](apps/server/src/https-server.ts#L750); admin rate-limit only (60/min/IP).
**Fix:** validate archive paths (`--no-same-owner`, reject `../`); add lockout/backoff on admin auth.

---

## PWA client (`apps/pwa`)

> Private key is plaintext in IndexedDB ([identity.ts:18](apps/pwa/src/lib/identity.ts#L18)) — any
> script execution on the origin = full takeover. No `eval`/`dangerouslySetInnerHTML` found and
> React escaping holds, so there's no confirmed end-to-end key-theft path *today* — but the
> near-misses below are the routes to watch.

### PWA-1 🟠 `innerHTML` bootstrap sink
**Where:** [main.tsx:72-75](apps/pwa/src/main.tsx#L72).
**Attacker path:** an error message is interpolated into `root.innerHTML`. Any attacker-
influenced startup error string → script execution on the key-holding origin. Combined with
X-3 (weak CSP), this is the realistic key-theft route.
**Fix:** use `textContent` / `createElement`; never interpolate into `innerHTML`.

### PWA-2 🟠 Unvalidated avatar/photo URLs → CSS injection + forced beacons
**Where:** [avatar.ts:22-29](apps/pwa/src/lib/avatar.ts#L22); ~20 `<img src>` sites; CSS `background:url()` at [ProfilePage.tsx:130](apps/pwa/src/pages/ProfilePage.tsx#L130).
**Attacker path:** server-controlled URLs pass through verbatim. The CSS-string interpolation
allows CSS injection; all sites let a malicious node force clients to beacon arbitrary hosts
(deanonymization/tracking).
**Fix:** allowlist `https:`/`data:image` schemes; never interpolate URLs into inline `style`.

### PWA-3 🟠 Unsigned money-moving calls to unvalidated node URLs
**Where:** [api.ts:568-607](apps/pwa/src/lib/api.ts#L568) (`sendRemoteTransfer`, `sendFederationMessage`).
**Attacker path:** these POST unsigned to a server-supplied peer URL with no scheme/host check.
**Fix:** route through the signed `request()` path; validate peer URLs (`https://` + allowlist).

### PWA-4 🔴 Identity-import: XOR "encryption" + 4-digit PIN, possible wrong-store write
**Confidence:** needs verification (the store-mismatch behavior specifically).
**Where:** [SettingsPage.tsx:90-96](apps/pwa/src/pages/SettingsPage.tsx#L90); [identity-transfer.ts:26-32](apps/pwa/src/lib/identity-transfer.ts#L26).
**Attacker path:** import writes to `localStorage` while signing reads identity from IndexedDB;
the transfer "cipher" is unauthenticated XOR with a short PIN. A crafted `?import=` link + guessed
PIN could inject an attacker-controlled identity. *Note:* the PWA's export/transfer path uses
proper PBKDF2+AES-GCM — the inconsistency is worth resolving.
**Fix:** verify store behavior; replace XOR with AEAD + real KDF; write to the store signing reads.

### PWA-5 🟡 Open-redirect-ish navigation from server data; PWA-6 🟢 stray `dist/` artifacts; PWA-7 🟢 homemade non-BIP39 mnemonic crypto
**Where:** [MessagesPage.tsx:406](apps/pwa/src/pages/MessagesPage.tsx#L406); `apps/pwa/dist/` (source maps, `vite.log`); [mnemonic.ts:140-150](apps/pwa/src/lib/mnemonic.ts#L140).
**Fix:** validate `postId` and use router push; ship only hashed build output; use a vetted BIP-39 lib + real seed KDF.

---

## Native app (`apps/native`)

> Good baseline: key only in `expo-secure-store`, no WebView, no `eval`, no disabled TLS validation.

### NAT-1 🔴 Direct messages are plaintext, mislabeled "encrypted" — VERIFIED
**Where:** [db.ts:1677](apps/native/utils/db.ts#L1677) (`nonce = 'plaintext-v1'`, ciphertext is base64); receive path :1654-1656; UI claims "secure" :1682 / "[Encrypted Message]" :487.
**Attacker path:** the node operator and anyone on the LAN (cleartext, NAT-4) can read every DM.
The schema/UI imply E2E that does not exist.
**Impact:** most user-damaging finding — users are told messages are secure when they aren't.
**Fix:** implement real E2E (X25519 ECDH from the Ed25519 identities + AEAD) or stop claiming encryption.

### NAT-2 🔴 `google-services.json` tracked in git — VERIFIED
**Where:** `git ls-files` lists `apps/native/google-services.json`.
**Attacker path:** Firebase/FCM config committed to history.
**Fix:** `git rm --cached apps/native/google-services.json`; fix the ignore rule; rotate the key if repo is non-private.

### NAT-3 🟠 Keystore passwords in plaintext on disk — VERIFIED
**Where:** `apps/native/credentials.json` (exists; git-ignored so **not** in history — good — but plaintext on disk; referenced by `eas.json`).
**Attacker path:** anyone who obtains the file can re-sign malicious APKs as us.
**Fix:** move to EAS secrets / env; rotate credentials.

### NAT-4 🟠 Cleartext HTTP/`ws://` on LAN + fully-trusted anchor URL
**Where:** `usesCleartextTraffic: true` [app.json:88](apps/native/app.json#L88); http:// assembly in pillar-sync.ts:68-77/87, _layout.tsx:81, welcome.tsx:157/211, people.tsx:257, settings.tsx:505; WS [ws-client.ts:73](apps/native/services/ws-client.ts#L73); anchor trust [_layout.tsx:71-84](apps/native/app/_layout.tsx#L71).
**Attacker path:** on a shared LAN an attacker reads all traffic (incl. plaintext DMs, contact
info, push tokens) and can tamper. A malicious anchor URL set via deep link harvests every
subsequently-signed request. Partly architectural (self-signed LAN bootstrap).
**Fix:** scope cleartext to a dev-only network-security-config; require HTTPS/`wss://` for
non-loopback; pin the anchor to a verified registry/allowlist and show the origin prominently.

### NAT-5 🟡 Weak identity-transfer crypto (XOR + 4-digit PIN) over clipboard/share
**Where:** [native-crypto.ts:14-41](apps/native/utils/native-crypto.ts#L14); clipboard/share [settings.tsx:635-643](apps/native/app/(tabs)/settings.tsx#L635).
**Attacker path:** repeating-key XOR + double-SHA-256 of a 4-digit PIN over known-structure JSON
→ a leaked transfer code yields the private key offline in ms. Code goes to clipboard/share sheet.
**Fix:** real AEAD + strong KDF (match the PWA's PBKDF2+AES-GCM); prefer on-screen QR over clipboard.

### NAT-6 🟡 Recovery auto-completes on a server-controlled status string
**Where:** [recover-identity.tsx:71-73](apps/native/app/recover-identity.tsx#L71); guardian "guess" gate db.ts:2501.
**Fix:** require cryptographic proof of guardian approvals client-side, not a bare status string.

### NAT-7 🟡 Contact PII unencrypted in SQLite; NAT-8 🟢 seed/key & push token to clipboard/logs; NAT-9 🟢 `allowBackup="true"`
**Where:** db.ts:144-145/757; seed clipboard welcome.tsx:279; token log push-notifications.ts:67; AndroidManifest `allowBackup`.
**Fix:** SQLCipher or encrypt contact fields; avoid clipboard for secrets + auto-clear; verify backup-exclusion rules exclude the DB/AsyncStorage.

---

## Recommended remediation sequence

**Phase 0 — immediate, cheap, no coupling (do now)**
- NAT-2 untrack `google-services.json` (+ rotate)
- NAT-3 move keystore creds to secrets (+ rotate)
- NAT-1 stop labeling base64 DMs as "encrypted" (honesty fix now; real E2E is larger)

**Phase 1 — highest severity, server-only (no client coupling)**
- SRV-1 P2P sync trust gate + connection gater  ← **start here for impact**
- SRV-2 gate ledger export

**Phase 2 — the keystone protocol change (server + all 3 clients in lockstep)**
- X-2 refactor native to a single signer
- X-1 nonce/timestamp/method/path binding across server + clients
- PWA-3 / NAT-4 route mutating calls through the signed path + validate node URLs

**Phase 3 — client hardening**
- PWA-1 innerHTML sink, PWA-2 URL allowlist, X-3 CSP
- NAT-1 real E2E messaging, NAT-5 transfer-code crypto
- PWA-4 verify + fix import flow

**Phase 4 — remaining medium/low**
- SRV-3/4/5/6/7/8/9, NAT-6/7/8/9, PWA-5/6/7

---

## Status log
_(update as we go)_

| ID | Severity | Status |
|----|----------|--------|
| SRV-1 | 🔴 | Open |
| NAT-1 | 🔴 | Partial — honesty labels fixed (Phase 0); real E2E pending (Phase 3) |
| NAT-2 | 🔴 | Code fixed (untracked from git) — ⚠️ **manual: rotate the Firebase/FCM key** |
| PWA-4 | 🔴 (unverified) | Open |
| X-1 | 🟠 | Open |
| SRV-2 | 🟠 | Open |
| NAT-3 | 🟠 | ⚠️ **manual: rotate keystore password + migrate to EAS remote credentials** |
| NAT-4 | 🟠 | Open |
| PWA-1 | 🟠 | Open |
| PWA-2 | 🟠 | Open |
| PWA-3 | 🟠 | Open |
| X-2 | 🟡 | Open |
| X-3 | 🟢 | Open |
| SRV-3 | 🟡 | Open |
| SRV-4 | 🟡 | Open |
| SRV-5 | 🟡 | Open |
| SRV-6 | 🟢 | Open |
| SRV-7 | 🟢 | Open |
| SRV-8 | 🟢 | Open |
| SRV-9 | 🟢 | Open |
| NAT-5 | 🟡 | Open |
| NAT-6 | 🟡 | Open |
| NAT-7 | 🟡 | Open |
| NAT-8 | 🟢 | Open |
| NAT-9 | 🟢 | Open |
| PWA-5 | 🟡 | Open |
| PWA-6 | 🟢 | Open |
| PWA-7 | 🟢 | Open |
