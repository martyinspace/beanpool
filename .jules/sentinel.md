## 2026-04-27 - [CWE-598] Credentials via URL Query Parameters
**Vulnerability:** Admin passwords were sent in URL query params via GET requests to '/api/admin/reports'.
**Learning:** Koa routes often assume tokens via query for simplicity, which exposes them to logs and history.
**Prevention:** Ensure that all sensitive authentication material is sent securely in HTTP headers (e.g. Authorization header) instead of the URL, and update all matching fetch calls in the client.
