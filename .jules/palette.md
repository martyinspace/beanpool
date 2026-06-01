## 2024-05-11 - PWA Input Accessibility
**Learning:** Found that many inputs across the PWA, specifically in forms built with custom styling like in the `WelcomePage.tsx` entry sequence, were missing explicit `<label>` associations or relied solely on placeholders. This creates a poor experience for screen readers and breaks keyboard tap-targets for checkboxes.
**Action:** Always ensure that custom-styled PWA inputs have an explicit `id` and are either nested inside a `<label>` or are associated via `<label htmlFor="...">`. For array-generated inputs (like recovery words), `aria-label`s should be applied.

## 2026-05-21 - Close Buttons, Keyboard Navigation, and Icon Button Accessibility
**Learning:** During review of open accessibility and user interface pull requests, identified gaps in non-semantic interactive components and icon-only buttons across LedgerPage, InvitePage, CommonsInfoModal, ProjectsPage, and MarketplacePage:
1. **Close & Back Buttons:** Non-text buttons containing symbols like "✕" or "▼" are unreadable by screen readers unless given explicit descriptive `aria-label` tags.
2. **Icon & Text Action Buttons:** Actionable components (e.g., share, copy, edit, delete icons) must provide explicit action descriptions using both hover tooltips (`title`) and `aria-label` text to ensure they can be understood by screen readers and visually impaired users.
3. **Interactive Pseudo-elements:** Non-semantic HTML tags (like `<span>` or `<div>`) that handle clicks must act as fully keyboard-accessible buttons to ensure users navigating with keyboard alone are not locked out.

**Action:** Adopt the following rules for all client-side UI interactive features:
* **Rule 1 (Close Buttons):** Always augment symbolic close buttons or back icons with descriptive `aria-label` attributes (e.g., `aria-label="Close details"`, `aria-label="Close information modal"`).
* **Rule 2 (Action Icons):** For any icon-only interactive controls (e.g., ✏️, 🗑️, 📋, 📤), provide explicit `aria-label` (for screen readers) and `title` (for tooltips) specifying the exact action (e.g., `aria-label="Copy invite link"`).
* **Rule 3 (Interactive Spans/Divs):** When utilizing nested pseudo-elements (like custom `<span>` clear/delete triggers) that listen to click events:
  * Apply `role="button"` to inform screen readers of their interactive behavior.
  * Apply `tabIndex={0}` to place the element in the document's sequential keyboard focus tab order.
  * Handle the `onKeyDown` event to capture key events, and fire the action when `Enter` or Space (` `) are pressed (with `e.preventDefault()` to prevent scrolling/page actions).

## 2024-06-02 - Interactive Non-Semantic Elements
**Learning:** When using non-semantic tags like `div` or `span` for interactive components (like clicking a profile picture and name to view the profile), they completely fail for keyboard and screen reader users unless manually wired.
**Action:** Always add `role="button"`, `tabIndex={0}`, an `onKeyDown` handler (catching 'Enter' and 'Space'), an `aria-label`, and `focus-visible` styles when an element has an `onClick` handler.
