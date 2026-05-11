# Sentinel Security Backlog

This document tracks potential security vulnerabilities discovered during automated audits of the codebase.

## Critical
*(No critical vulnerabilities discovered in current scope.)*

## High
### Cross-Site Scripting (XSS)
- **Vulnerability:** Unsanitized variables concatenated directly into `innerHTML` calls, potentially allowing execution of arbitrary scripts if malicious data is present.
- **Location:**
  - `apps/server/static/settings.js` line 154 (`searchResults.innerHTML = ...`)
  - `apps/server/static/settings.js` line 245 (`list.innerHTML = ...`)
  - `apps/server/static/settings.js` line 549 (`grid.innerHTML = ...`)
  - `apps/server/static/settings.js` line 561 (`wEl.innerHTML = ...`)
  - `apps/server/static/settings.js` line 571 (`fEl.innerHTML = ...`)
  - `apps/server/static/settings.js` line 798 (`list.innerHTML = ...`)
  - `apps/server/static/settings.js` line 1048 (`el.innerHTML = ...`)
  - `apps/server/static/settings.js` line 1099 (`el.innerHTML = ...`)
  - `apps/server/static/settings.js` line 1193 (`el.innerHTML = html;`)
  - `apps/server/static/settings.js` line 1437 (`el.innerHTML = ...`)
  - `apps/server/static/settings.js` line 1580 (`listEl.innerHTML = html;`)
  - `apps/server/static/settings.js` line 1629 (`messagesEl.innerHTML = ...`)

## Medium
*(No medium vulnerabilities discovered in current scope.)*

## Low
*(No low vulnerabilities discovered in current scope.)*
