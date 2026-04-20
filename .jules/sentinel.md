## 2025-04-20 - [Removed stack traces from error responses]
**Vulnerability:** The server was directly returning internal error stack traces (`e.stack`) in HTTP 500 error responses in `apps/server/src/https-server.ts`.
**Learning:** Developers sometimes pass the whole Error object back to the client for debugging purposes but forget to clean it up.
**Prevention:** In a future refactor, a global error handling middleware could be introduced to format errors consistently and strip out stack traces except in development environments.
