## 2024-05-24 - [Remove Stack Traces from API Response]
**Vulnerability:** A catch block in the `adminDeletePost` API route was returning the full error stack trace to the client (`ctx.body = { error: e.message, stack: e.stack }`).
**Learning:** Returning stack traces in API responses exposes sensitive internal implementation details, such as file paths, libraries in use, and potentially internal architectural data, which can aid an attacker in finding further vulnerabilities.
**Prevention:** Catch blocks in API routes should log the detailed error internally and return a generic error message without exposing the stack trace to the client.
