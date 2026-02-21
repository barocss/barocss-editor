# @barocss/renderer-react

## 0.2.0

### Minor Changes

- 6aa573f: Add full React component support for inline marks via `defineMark('type', external(ReactComponent))`. Extend `defineMark` to accept `ExternalDescriptor`, add `BlockComponentProps` / `MarkComponentProps` type interfaces, and update `buildMarkRunToReact` to render React components directly with `markType`, `attributes`, `text`, and `children` props.

### Patch Changes

- Updated dependencies [6aa573f]
  - @barocss/dsl@1.1.0

## 0.1.1

### Patch Changes

- 99009d6: **Editor view IME composition stability**

  - Improve IME composition handling in DOM and React editor views: use `beforeinput` composition state and `keydown 229` compatibility path instead of explicit composition event listeners.
  - Stabilize selection/transaction behavior: selection-after resolution, history, and extension commands aligned with editor spec.
  - Add regression tests for post-composition sync timing, keydown 229, and selection application flow.
  - Docs: editor spec, input-selection stability matrix, React component rendering.

- Updated dependencies [99009d6]
  - @barocss/dsl@1.0.1
