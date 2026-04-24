## 2026-04-24 - ARIA labels on Icon-only Buttons
**Learning:** Found multiple icon-only buttons (using emojis like ☀️/🌙, text symbols like ✕ and +, or SVGs) in the map and modal components lacking `aria-label` attributes, making them inaccessible to screen readers.
**Action:** Always verify that buttons lacking descriptive text content include an `aria-label` that clearly describes their action (e.g. 'Toggle map style', 'Close', 'New Post').
