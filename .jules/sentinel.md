## 2025-04-26 - [High] Use Authorization Header instead of URL parameters for secrets
**Vulnerability:** Admin passwords were being sent in URL query strings (`?password=xxx`) to GET requests (`/api/admin/reports`). This could expose credentials in browser histories, proxy logs, or server access logs (CWE-598).
**Learning:** For Koa-based admin panels serving vanilla JS fetch requests, ensure the `Authorization` header is used for any kind of tokens or passwords in GET requests, rather than passing them as query string arguments.
**Prevention:** Enforce header-based authentication for backend endpoints handling GET requests, while POST requests should parse credentials from `ctx.requestBody` properly.

## 2025-04-26 - [Medium] Remove Stack Traces from Error Payloads
**Vulnerability:** Caught exceptions in POST `/api/local/admin/posts/:id/delete` returned `e.stack` directly in the response payload.
**Learning:** Returning `e.stack` to HTTP responses exposes internal implementation details such as the file paths and library versions to end-users and potential attackers.
**Prevention:** Limit error payloads to generic messages (`e.message` or standard user-facing errors) and log the stack traces server-side instead.
