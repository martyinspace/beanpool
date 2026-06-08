## 2024-06-08 - Accessible Clickable DIVs
**Learning:** This application sometimes relies on custom non-semantic HTML like `div` elements handling `onClick` events for critical interactions like opening a marketplace item. These elements previously broke keyboard navigation, hurting a11y severely.
**Action:** Always verify that `div`s with `onClick` handlers have `role="button"`, `tabIndex={0}`, `onKeyDown` with Enter/Space handling and focus states (`focus-visible:ring-2` via Tailwind).
