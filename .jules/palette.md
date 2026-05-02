## 2026-05-02 - [Added ARIA attributes to icon-only toggle buttons in App.tsx]
**Learning:** Found that the app uses icon-only buttons for toggling location and settings without accessible names or state indicators. Adding `aria-label`, `aria-pressed` and `aria-expanded` significantly improves screen reader experience.
**Action:** Ensure all future icon-only interactive elements receive descriptive `aria-label` attributes and correct ARIA states where applicable.
