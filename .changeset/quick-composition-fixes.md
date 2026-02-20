---
"@barocss/editor-view-dom": patch
"@barocss/editor-view-react": patch
---

Improve IME composition handling in both DOM and React editor views by relying on
`beforeinput` composition state and `keydown 229` compatibility path instead of
explicit composition event listeners. This stabilizes IME input handling across
environments and adds regression tests for post-composition sync timing and keydown
229 behavior.

