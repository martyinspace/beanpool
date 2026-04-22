## 2024-05-15 - Icon-only Button Accessibility
**Learning:** The settings.html interface relied on several icon-only buttons (like password visibility, delete, and reject buttons) that lacked accessibility labels, and the password toggle explicitly disabled keyboard navigation with `tabindex="-1"`.
**Action:** Always check interactive elements that only use icons for `aria-label` and `title` attributes, and ensure they are reachable via keyboard navigation unless explicitly intended to be skipped.
