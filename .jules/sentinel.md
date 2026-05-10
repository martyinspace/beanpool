## 2025-05-10 - [Sentinel] Remove Hardcoded Secrets
**Vulnerability:** A hardcoded dev secret was exposed as a fallback value for the `DIRECTORY_API_KEY` in `apps/server/src/directory-publisher.ts`.
**Learning:** Hardcoded fallbacks pose significant risk if accidental production leaks occur or if external services can be invoked with a default dev key.
**Prevention:** Always ensure configuration requires environment variables for API keys and fails securely if they are not provided, avoiding string fallbacks.

## 2024-05-24 - [CRITICAL] Fix Stored XSS in Admin Dashboard
**Vulnerability:** The admin dashboard constructed HTML directly using `innerHTML` and interpolated user-controlled data such as post titles, user callsigns, and message plaintexts without sanitization, leading to a Stored Cross-Site Scripting (XSS) vulnerability.
**Learning:** Even internal admin dashboards are vulnerable if they display user-generated content without proper escaping. `innerHTML` is inherently dangerous when mixed with user data.
**Prevention:** Always escape user-controlled data before interpolating it into HTML strings, or use DOM APIs that inherently escape content (e.g., `textContent`).
