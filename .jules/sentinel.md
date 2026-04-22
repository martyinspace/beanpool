## 2024-05-18 - [Use of GET Request Method With Sensitive Query Strings]
**Vulnerability:** A password to access admin reports was sent in the query parameter (CWE-598).
**Learning:** Query parameters are frequently logged by web servers, proxies, and browser history, exposing sensitive authentication tokens. The frontend was constructed to use a simple URL string interpolation rather than setting headers correctly on the fetch API.
**Prevention:** Avoid putting credentials or sensitive tokens in the query string or URL path for any HTTP method. For GET requests, use standard Authorization headers (e.g. `Authorization: Bearer <token>`).
