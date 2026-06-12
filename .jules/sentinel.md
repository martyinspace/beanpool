## 2024-05-24 - [CRITICAL] Fix Stored XSS in Admin Dashboard
**Vulnerability:** The admin dashboard constructed HTML directly using `innerHTML` and interpolated user-controlled data such as post titles, user callsigns, and message plaintexts without sanitization, leading to a Stored Cross-Site Scripting (XSS) vulnerability.
**Learning:** Even internal admin dashboards are vulnerable if they display user-generated content without proper escaping. `innerHTML` is inherently dangerous when mixed with user data.
**Prevention:** Always escape user-controlled data before interpolating it into HTML strings, or use DOM APIs that inherently escape content (e.g., `textContent`).

## 2025-05-10 - [Sentinel] Remove Hardcoded Secrets
**Vulnerability:** A hardcoded dev secret was exposed as a fallback value for the `DIRECTORY_API_KEY` in `apps/server/src/directory-publisher.ts`.
**Learning:** Hardcoded fallbacks pose significant risk if accidental production leaks occur or if external services can be invoked with a default dev key.
**Prevention:** Always ensure configuration requires environment variables for API keys and fails securely if they are not provided, avoiding string fallbacks.

## 2026-05-11 - [Sentinel] Fix Command Injection in Backup/Restore
**Vulnerability:** Command injection risks existed in `apps/server/src/https-server.ts` where `execSync` was used to execute shell commands with user-influenced file paths (e.g., `tar -xzf "${tarPath}" -C "${tmpDir}"`).
**Learning:** `execSync` executes a command within a shell, making it susceptible to injection if arguments aren't strictly sanitized. Even in admin-authenticated endpoints, this represents a significant risk.
**Prevention:** Use `execFileSync` (or `spawn`) and pass arguments as an array rather than a single string. This bypasses shell interpolation. Additionally, handle standard streams programmatically (e.g., `{ stdio: ['ignore', 'pipe', 'ignore'] }`) instead of using shell redirects like `2>/dev/null`.

## 2026-05-11 - [Sentinel] Final XSS Hardening of Admin Dashboard
**Vulnerability:** Remaining `innerHTML` injection points were discovered in the administrative dashboard (`settings.js`), including Nominatim location search results, Trusted Connectors management, health alert descriptions, and moderation reports.
**Learning:** Initial security patches often miss secondary or "edge" data display points. A comprehensive audit specifically targeting dangerous sinks like `innerHTML` is necessary for full remediation.
**Prevention:** Standardized the use of a global `esc()` helper for all user-controlled data. Hardened `onclick` action handlers by escaping IDs to prevent JS string break-outs. Fixed message rendering logic to handle escaping internally while preserving system-generated HTML formatting.

## 2026-05-20 - [CRITICAL] Fix Authorization Bypass in requireSignature Middleware
**Vulnerability:** Multiple sensitive POST endpoints — `/api/ratings`, `/api/reports`, `/api/friends/*` (including guardian assignment, an identity-takeover primitive), `/api/recovery/*`, `/api/push-tokens`, `/api/members/preferences`, `/api/commons/vote`, and the entire `/api/marketplace/transactions/*` family — were missing from the explicit `isProtected` allowlist in the `requireSignature` middleware. Attackers who knew a user's public key (publicly visible via `/api/members`) could bypass Ed25519 signature verification and impersonate any user. Several client callsites in the native app also POSTed to these routes without signing, meaning the server fix alone would silently break legitimate flows.
**Learning:** This is the fifth sentinel ticket on the same class (see closed PRs #30, #32, #34, #56, #57). The proximate cause is a hand-maintained "protect-list" pattern that defaults new routes to unauthenticated. The deeper root cause is that authentication is opt-in on both sides of the wire: the server route must be added to `isProtected` *and* the client callsite must be wired through a signing helper. Either omission silently fails open. There is also a second drift-prone list inside the middleware itself: a hand-maintained set of body-field spoof checks (`publicKey`, `raterPubkey`, `ownerPubkey`, ...) that must be updated whenever a new identity field name enters a request body. Two append-only critical-path lists is one too many.
**Prevention:** Broadened the protect-list to cover every currently-vulnerable route, added an exported `signedRequest` helper on the client to centralize signing, and shipped a standalone `scripts/verify-auth-boundary.mjs` that POSTs unsigned/forged/spoofed requests to every protected route and exits non-zero if any boundary check fails. Follow-up work tracked separately: flip the middleware to deny-by-default with a small public allowlist, move handlers off body-field identity onto a verified `ctx.state.actor`, and add proof-of-possession to `/api/invite/redeem*`.

## 2026-05-21 - [Sentinel] Fix Sensitive Data Exposure in Restore Endpoint
**Vulnerability:** The admin database restore endpoint (`/api/local/admin/restore`) previously accepted the administrative password as a URL query parameter (`?password=...`), exposing the credential to server access logs, browser history, proxy logs, and network referrer headers.
**Learning:** Passing credentials or high-privilege administrative keys via URL query strings is insecure because HTTP paths are frequently logged or transmitted to third parties (e.g., via Referer headers or browser extensions).
**Prevention:** Relocated administrative authorization to a custom HTTP request header (`X-Admin-Password`). Updated the server to parse the password from this header and updated `settings.js` to transmit the key in the HTTP headers of the `POST` restore request rather than in the URL.

## 2026-05-21 - [Sentinel] Deny-by-Default Boundaries & Cryptographic P2P Sync Hardening
**Vulnerability:** 
1. The `requireSignature` auth filter previously used an "opt-in" allowlist, meaning new mutating API routes were unauthenticated by default.
2. Naive body spoof checks blocked legitimate cross-identity fields like rating targets (`targetPubkey`) and recovery keys (`oldPubkey`).
3. P2P sync data was imported directly into SQLite without peer cryptographic verification, exposing nodes to replica-poisoning/spoofing.
**Learning:** 
1. High-security boundaries must fail-secure (deny-by-default) rather than relying on developer opt-in.
2. Spoof protection must distinguish between the request initiator and other entities.
3. Decentralized sync must cryptographically assert peer identity using stable node keypairs rather than blindly trusting transport channels.
**Prevention:**
1. Flipped middleware to deny-by-default, allowlisting only public and admin password routes.
2. Implemented precision-scoped body spoof checking by matching initiator keys while excluding non-sender fields (`target*`, `old*`, `to*`, `invited*`).
3. Refactored mutating routes to consume verified `ctx.state.actor`.
4. Cryptographically secured P2P sync using Ed25519 payload signing (`exportSyncState`) and public key protobuf verification (`importRemoteState`).
5. Added administrative sliding-window rate limiting (60 req/min per IP) and standard global modern security headers.


## 2024-05-24 - [Identity Import Store Mismatch]
**Vulnerability:** Identity import functionality wrote directly to `localStorage` while the rest of the application read from IndexedDB. Device wiping only removed the `localStorage` entry.
**Learning:** This mismatch left the private key permanently stored in IndexedDB but logically "wiped" from the UI's perspective. It could also lead to issues where imported keys were easily exposed to XSS attacks (since `localStorage` is easily accessible).
**Prevention:** Ensure all operations pertaining to sensitive storage use a single source of truth (in this case, wrapper functions like `saveIdentity`/`importIdentity` around IndexedDB).
