---
"@barocss/dsl": minor
"@barocss/renderer-react": minor
---

Add full React component support for inline marks via `defineMark('type', external(ReactComponent))`. Extend `defineMark` to accept `ExternalDescriptor`, add `BlockComponentProps` / `MarkComponentProps` type interfaces, and update `buildMarkRunToReact` to render React components directly with `markType`, `attributes`, `text`, and `children` props.
