# @barocss/extensions

## 1.0.2

### Patch Changes

- Updated dependencies [c7caa64]
- Updated dependencies [b2be06d]
  - @barocss/editor-core@1.0.2
  - @barocss/model@1.0.2
  - @barocss/converter@1.0.2
  - @barocss/datastore@0.1.2

## 1.0.1

### Patch Changes

- 99009d6: **Editor view IME composition stability**

  - Improve IME composition handling in DOM and React editor views: use `beforeinput` composition state and `keydown 229` compatibility path instead of explicit composition event listeners.
  - Stabilize selection/transaction behavior: selection-after resolution, history, and extension commands aligned with editor spec.
  - Add regression tests for post-composition sync timing, keydown 229, and selection application flow.
  - Docs: editor spec, input-selection stability matrix, React component rendering.

- Updated dependencies [99009d6]
  - @barocss/datastore@0.1.1
  - @barocss/editor-core@1.0.1
  - @barocss/model@1.0.1
  - @barocss/converter@1.0.1
