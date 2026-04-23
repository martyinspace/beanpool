## 2024-05-18 - Added aria-label to close button
**Learning:** Found an icon-only close button in PublicProfileModal.tsx lacking an aria-label.
**Action:** Always add aria-labels to buttons containing only emoji or special characters (like ✕) to ensure screen reader users understand the button's purpose.
