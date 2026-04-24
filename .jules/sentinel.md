## 2024-05-18 - CWE-598: Information Exposure Through Query Strings in Admin Endpoints
**Vulnerability:** Admin passwords were being passed via URL query parameters (`?password=...`) to the `/api/admin/reports` endpoint.
**Learning:** Passing credentials or sensitive tokens in the URL query string is a critical security vulnerability (CWE-598). These parameters are routinely logged in plaintext by reverse proxies, access logs, and can be retained in browser history, exposing the admin password.
**Prevention:** Always use HTTP headers (e.g., `Authorization: Bearer <token>`) or the request body (for POST/PUT requests) to transmit sensitive credentials or tokens.
