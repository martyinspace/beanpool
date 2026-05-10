## 2025-05-10 - [Sentinel] Remove Hardcoded Secrets
**Vulnerability:** A hardcoded dev secret was exposed as a fallback value for the `DIRECTORY_API_KEY` in `apps/server/src/directory-publisher.ts`.
**Learning:** Hardcoded fallbacks pose significant risk if accidental production leaks occur or if external services can be invoked with a default dev key.
**Prevention:** Always ensure configuration requires environment variables for API keys and fails securely if they are not provided, avoiding string fallbacks.
