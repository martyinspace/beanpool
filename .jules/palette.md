## 2024-03-24 - Accessibility on Delete Buttons
**Learning:** Found multiple instances where the "remove photo" buttons during project creation and editing were implemented as icon-only (SVG 'X') buttons without ARIA labels. This is a common pattern for small delete or dismiss buttons.
**Action:** Always ensure icon-only interactive elements (like remove, close, dismiss) contain descriptive `aria-label` attributes for screen readers.
