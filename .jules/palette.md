## 2024-04-29 - Icon-only toggles need state attributes
**Learning:** Adding `aria-label` to icon-only toggle buttons is insufficient for screen readers; they also critically need `aria-pressed` or `aria-expanded` to convey their current state.
**Action:** Always pair `aria-label` with `aria-pressed` or `aria-expanded` on icon-only buttons that toggle application state or UI visibility.
