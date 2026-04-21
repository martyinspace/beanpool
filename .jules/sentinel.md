
## 2024-05-18 - Admin Password in Query Parameters
**Vulnerability:** The GET endpoint `/api/admin/reports` accepted the admin password as a plain text URL query parameter (`?password=...`).
**Learning:** Sending sensitive credentials via URL query parameters exposes them in web server access logs and browser history. We should never accept passwords, secrets, or tokens in query parameters, even for read-only endpoints.
**Prevention:** Always use HTTP POST with JSON body payloads or Authorization headers (e.g. `Authorization: Bearer <token>`) for transmitting sensitive data. I updated this endpoint to a POST request and used the existing `checkAdminAuth` helper function.
