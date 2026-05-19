## 2024-05-11 - PWA Input Accessibility
**Learning:** Found that many inputs across the PWA, specifically in forms built with custom styling like in the `WelcomePage.tsx` entry sequence, were missing explicit `<label>` associations or relied solely on placeholders. This creates a poor experience for screen readers and breaks keyboard tap-targets for checkboxes.
**Action:** Always ensure that custom-styled PWA inputs have an explicit `id` and are either nested inside a `<label>` or are associated via `<label htmlFor="...">`. For array-generated inputs (like recovery words), `aria-label`s should be applied.

## 2024-05-17 - PWA Icon Buttons Accessibility
**Learning:** Found multiple instances of icon-only buttons (like ✕) used for dismissing modals or clearing inputs that lacked `aria-label`s. These fail to provide context for screen reader users. Additionally, using `<span>` elements as interactive clear buttons nested inside `<button>` tags creates accessibility and HTML validation issues if not handled carefully with `role="button"`, `tabIndex`, and `onKeyDown` listeners.
**Action:** Always add descriptive `aria-label` attributes to icon-only interactive elements. When nested buttons are unavoidable, properly configure pseudo-buttons using `<span>` or `<div>` with ARIA roles and full keyboard support (Space and Enter key handlers).
