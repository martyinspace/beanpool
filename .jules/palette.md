## 2024-05-07 - Toggle Buttons Require Accessibility State Attributes
**Learning:** Icon-only toggle buttons with an `aria-label` are not enough for screen readers. They need state attributes like `aria-pressed` or `aria-expanded` to convey their current state (e.g. on/off) to assistive technologies.
**Action:** Always include `aria-pressed={state}` or `aria-expanded={state}` on custom toggle buttons alongside `aria-label` to ensure proper accessibility.
