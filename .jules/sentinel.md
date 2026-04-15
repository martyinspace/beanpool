## 2026-04-15 - [Remove Stack Trace Exposure in Error Response]
**Vulnerability:** Found an endpoint in `apps/server/src/https-server.ts` that exposed the internal application stack trace to the client on error (`ctx.body = { error: e.message, stack: e.stack };`).
**Learning:** Returning stack traces directly to the client exposes internal application details and potentially sensitive information which can be a security risk.
**Prevention:** Ensure error handling mechanisms fail securely by only returning generic or sanitized error messages and logging the stack trace internally on the server instead.
