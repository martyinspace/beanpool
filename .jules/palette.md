
## 2024-05-24 - Accessibility on Modal Close Buttons
**Learning:** Found multiple instances of icon-only close buttons ("✕") in modal components (`MyDealsModal.tsx` and `PublicProfileModal.tsx`) missing `aria-label` attributes, which prevents screen readers from conveying the button's purpose to visually impaired users.
**Action:** Ensure all icon-only interactive elements (like modal close buttons) always include descriptive `aria-label` attributes.
