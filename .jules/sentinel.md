## 2024-05-15 - [Error Handling] Removed Stack Trace Leak in Admin Post Deletion
**Vulnerability:** The `/api/local/admin/posts/:id/delete` endpoint in `apps/server/src/https-server.ts` leaked stack traces (`e.stack`) in error responses. Similar leak in `apps/server/src/connector-manager.ts` logs.
**Learning:** Returning stack traces in HTTP responses exposes internal server implementation details which can be leveraged by attackers.
**Prevention:** Avoid passing `e.stack` to `ctx.body` in Koa error handlers. Instead, log the stack trace server-side and return generic error messages to the client.
