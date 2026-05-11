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
