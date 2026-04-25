
## 2024-05-24 - [Avoid Information Exposure Through Query Strings]
**Vulnerability:** The `/api/admin/reports` endpoint was accepting the `password` in the URL query string (GET request), exposing it to logs, browser history, and network monitoring tools (CWE-598).
**Learning:** In the `@beanpool/server` backend (Koa), admin authentication checks should be performed using the `checkAdminAuth` helper function, which correctly reads the password from the request body (POST request) via `ctx.requestBody`.
**Prevention:** Always use POST requests with the password passed in the JSON body when authenticating admin actions. Use the existing `checkAdminAuth` helper to enforce this securely and consistently across admin endpoints.
