## 2024-05-08 - Authentication Bypass in Identity Verifier Middleware
**Vulnerability:** Several sensitive POST endpoints (e.g., `/api/ratings`, `/api/marketplace/transactions/reject`, `/api/commons/vote`) bypassed signature verification, and spoof checking was incomplete for various user identity fields.
**Learning:** The Koa middleware used an explicitly enumerated prefix list for `isProtected` which omitted new routes. Additionally, the spoof check hardcoded property names.
**Prevention:** Use broadly encompassing path prefixes (e.g., `/api/marketplace/`) for modular features. Dynamically check all variations of public key identifiers, or standardize on a single key name across the API (`publicKey`) to prevent newly added identifier fields from bypassing checks.

## 2024-05-08 - Authentication Bypass in Identity Verifier Middleware
**Vulnerability:** Several sensitive POST endpoints (e.g., `/api/ratings`, `/api/marketplace/transactions/reject`, `/api/commons/vote`) bypassed signature verification, and spoof checking was incomplete for various user identity fields.
**Learning:** The Koa middleware used an explicitly enumerated prefix list for `isProtected` which omitted new routes. Additionally, the spoof check hardcoded property names.
**Prevention:** Use broadly encompassing path prefixes (e.g., `/api/marketplace/`) for modular features. Dynamically check all variations of public key identifiers, or standardize on a single key name across the API (`publicKey`) to prevent newly added identifier fields from bypassing checks.
