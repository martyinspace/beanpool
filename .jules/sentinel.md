## 2024-05-18 - [Use of GET Request Method With Sensitive Query Strings]
**Vulnerability:** A password to access admin reports was sent in the query parameter (CWE-598).
**Learning:** Query parameters are frequently logged by web servers, proxies, and browser history, exposing sensitive authentication tokens. The frontend was constructed to use a simple URL string interpolation rather than securely transmitting credentials.
**Prevention:** Avoid putting credentials or sensitive tokens in the query string or URL path for any HTTP method. For sensitive endpoints, consider migrating to POST requests using JSON body authentication, or use standard Authorization headers for GET requests.
