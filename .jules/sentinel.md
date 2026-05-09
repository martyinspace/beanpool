## 2024-05-18 - [Use of GET Request Method With Sensitive Query Strings]
**Vulnerability:** A password to access admin reports was sent in the query parameter (CWE-598).
**Learning:** Query parameters are frequently logged by web servers, proxies, and browser history, exposing sensitive authentication tokens. The frontend was constructed to use a simple URL string interpolation rather than securely transmitting credentials.
**Prevention:** Avoid putting credentials or sensitive tokens in the query string or URL path for any HTTP method. For sensitive endpoints, consider migrating to POST requests using JSON body authentication, or use standard Authorization headers for GET requests.

## 2024-05-09 - [Missing Signature Checks for Public Keys]
**Vulnerability:** A critical vulnerability existed where identity spoofing could happen because Koa endpoints verified `pubKeyHex` (`X-Public-Key`) via `requireSignature`, but many other identifier fields (`creatorPubkey`, `raterPubkey`, etc) in the body were NOT compared to `pubKeyHex`.
**Learning:** In `@beanpool/server` Koa API routes protected with the `requireSignature` middleware, we MUST explicitly verify ALL user public key identifiers in the request body against the authenticated `pubKeyHex`. Otherwise attackers could spoof other members.
**Prevention:** Check for any remaining `.pubKey` or `PubKey` usages in `ctx.requestBody` across backend, and always validate them against the auth header in middleware.
