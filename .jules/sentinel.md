## 2026-04-18 - Unauthenticated Admin Endpoints
**Vulnerability:** The `/api/admin/thresholds` GET endpoint exposed system configuration/threshold data without requiring authentication.
**Learning:** While POST endpoints used a `checkAdminAuth` wrapper function, some GET endpoints under `/api/admin/` were missing authentication checks entirely. The convention for GET endpoints is to read the password from the query string (`ctx.query.password`).
**Prevention:** Always verify that every new route under `/api/admin/` implements authentication, either via a middleware-like function or by explicitly checking the password parameter.
