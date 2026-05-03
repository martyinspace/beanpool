## 2024-05-03 - Add aria states to icon toggle buttons
**Learning:** Icon-only toggle buttons in the beanpool-pwa app require `aria-pressed` or `aria-expanded` attributes in addition to `aria-label` to properly convey state changes to screen readers, preventing ambiguity around button interaction states.
**Action:** Always include the corresponding state attribute (`aria-pressed`, `aria-expanded`) alongside `aria-label` when designing or fixing icon-based toggle controls in the UI.
