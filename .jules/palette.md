## 2024-05-11 - PWA Input Accessibility
**Learning:** Found that many inputs across the PWA, specifically in forms built with custom styling like in the `WelcomePage.tsx` entry sequence, were missing explicit `<label>` associations or relied solely on placeholders. This creates a poor experience for screen readers and breaks keyboard tap-targets for checkboxes.
**Action:** Always ensure that custom-styled PWA inputs have an explicit `id` and are either nested inside a `<label>` or are associated via `<label htmlFor="...">`. For array-generated inputs (like recovery words), `aria-label`s should be applied.
## 2024-11-20 - Ensure Aria Labels for App-Specific Modals
**Learning:** Found multiple modals in the app (like  and ) using custom  or SVG close buttons without  attributes. This is a common pattern in custom modal implementations that breaks screen reader accessibility for dismissing dialogs.
**Action:** When reviewing custom modal components, always verify the presence of  on generic dismiss/close buttons.
## 2024-05-24 - Ensure Aria Labels for App-Specific Modals
**Learning:** Found multiple modals in the app (like `ProjectsPage.tsx` and `CommonsInfoModal.tsx`) using custom `✕` or SVG close buttons without `aria-label` attributes. This is a common pattern in custom modal implementations that breaks screen reader accessibility for dismissing dialogs.
**Action:** When reviewing custom modal components, always verify the presence of `aria-label` on generic dismiss/close buttons.
