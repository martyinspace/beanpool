## 2026-04-26 - Found Icon-Only Buttons Missing Accessible Names
**Learning:** In the PWA, many interactive icon-only buttons (like map toggles, list/grid switchers, or settings) rely solely on the `title` attribute for tooltip context but lack `aria-label`s for screen readers.
**Action:** Always verify that buttons containing only SVG icons or emojis explicitly include an `aria-label` matching their `title` to maintain accessibility parity.
