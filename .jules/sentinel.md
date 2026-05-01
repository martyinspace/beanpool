## 2024-05-01 - Error Handling & Information Disclosure
**Vulnerability:** Stack trace exposure in `/api/local/admin/posts/:id/delete`. `ctx.body = { error: e.message, stack: e.stack }` leaked the full Node.js stack trace directly to the client.
**Learning:** Returning unhandled or broadly caught error objects, especially with `.stack`, to clients allows potential attackers to understand server internals and directory structures.
**Prevention:** Never include `.stack` in API responses. Log errors server-side (e.g., `console.error`) and return generic error messages (e.g., "An error occurred") to clients.

## 2024-05-01 - Sensitive Credentials in URLs (CWE-598)
**Vulnerability:** The `/api/admin/reports` endpoint authenticated users via a `password` query parameter (e.g., `fetch('/api/admin/reports?password=' + auth)`).
**Learning:** Sending sensitive information (like passwords or tokens) in URL query strings can leak them into server logs, proxy logs, browser histories, or `Referer` headers.
**Prevention:** Always transmit credentials in HTTP headers, typically the `Authorization` header, or in the request body for POST/PUT requests.
