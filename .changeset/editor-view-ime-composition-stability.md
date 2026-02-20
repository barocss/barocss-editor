---
"@barocss/datastore": patch
"@barocss/dsl": patch
"@barocss/editor-core": patch
"@barocss/editor-view-dom": patch
"@barocss/editor-view-react": patch
"@barocss/extensions": patch
"@barocss/model": patch
"@barocss/renderer-dom": patch
"@barocss/renderer-react": patch
---

**Editor view IME composition stability**

- Improve IME composition handling in DOM and React editor views: use `beforeinput` composition state and `keydown 229` compatibility path instead of explicit composition event listeners.
- Stabilize selection/transaction behavior: selection-after resolution, history, and extension commands aligned with editor spec.
- Add regression tests for post-composition sync timing, keydown 229, and selection application flow.
- Docs: editor spec, input-selection stability matrix, React component rendering.
