## 2023-10-27 - [Command Injection Mitigation in HTTPS Server]
**Vulnerability:** Command injection risks existed in `apps/server/src/https-server.ts` where `execSync` was used to execute shell commands with user-influenced file paths (e.g., `tar -xzf "${tarPath}" -C "${tmpDir}"`).
**Learning:** `execSync` executes a command within a shell, making it susceptible to injection if arguments aren't strictly sanitized. Even in admin-authenticated endpoints, this represents a significant risk.
**Prevention:** Use `execFileSync` (or `spawn`) and pass arguments as an array rather than a single string. This bypasses shell interpolation. Additionally, handle standard streams programmatically (e.g., `{ stdio: ['ignore', 'pipe', 'ignore'] }`) instead of using shell redirects like `2>/dev/null`.
