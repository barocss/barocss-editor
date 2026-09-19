# @barocss/editor-view-react

## 0.1.3

### Patch Changes

- 481a3d0: Publish built ESM entries, declarations, and CSS for every library. Keep runtime dependencies external and validate packed packages in an isolated consumer before npm publication.
- b9534a1: Wait for range nodes to render before restoring the model selection. Cancel stale restores when selection ownership changes or the view unmounts.
- Updated dependencies [481a3d0]
  - @barocss/dsl@1.1.1
  - @barocss/editor-core@1.0.3
  - @barocss/renderer-react@0.2.1
  - @barocss/shared@1.0.1
  - @barocss/text-analyzer@0.1.1

## 0.1.2

### Patch Changes

- 05878b8: Fix type-check TS2774 in selection-handler: remove redundant querySelector check (HTMLElement always has it).
- Updated dependencies [6aa573f]
- Updated dependencies [c7caa64]
  - @barocss/dsl@1.1.0
  - @barocss/renderer-react@0.2.0
  - @barocss/editor-core@1.0.2

## 0.1.1

### Patch Changes

- 99009d6: **Editor view IME composition stability**

  - Improve IME composition handling in DOM and React editor views: use `beforeinput` composition state and `keydown 229` compatibility path instead of explicit composition event listeners.
  - Stabilize selection/transaction behavior: selection-after resolution, history, and extension commands aligned with editor spec.
  - Add regression tests for post-composition sync timing, keydown 229, and selection application flow.
  - Docs: editor spec, input-selection stability matrix, React component rendering.

- Updated dependencies [99009d6]
  - @barocss/dsl@1.0.1
  - @barocss/editor-core@1.0.1
  - @barocss/renderer-react@0.1.1
