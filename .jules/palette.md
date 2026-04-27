## 2024-04-27 - Icon-only buttons lacking ARIA labels
**Learning:** Found multiple instances where interactive elements like `button` and `a` contain only emojis or icons but lack `aria-label` attributes for screen readers. E.g. in `InstallPrompt.tsx` dismiss button `>✕</button>` and `PublicProfileModal.tsx` close button.
**Action:** Adding `aria-label` to icon-only buttons to improve accessibility.
