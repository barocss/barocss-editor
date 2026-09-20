# Shared Office UI documentation audit

Issue: [#336](https://github.com/barocss/barocss-editor/issues/336).
Reviewed main: `4661328fc6f20e44b5e42897499b12da3c9ad26b`, 2026-09-20.

## Scope

Expand the canonical English READMEs for office-ui, office-controls and office-editor-ui. Connect them through a Docs guide. Keep the runtime unchanged and record the actual public contracts rather than proposing a new design system.

The prior product integration PRs remain separate. No package versions, deployment settings or product UI features change.

## Evidence map

| Contract | Source | Focused existing tests |
| --- | --- | --- |
| Fields, commit and IME | `office-ui/src/controls.tsx` | `text-field-ime`, `number-field` |
| Floating ownership | `office-ui/src/floating.tsx` | `floating` |
| DOM anchors and handles | `office-ui/src/element-anchor.ts`, `range-anchor.ts`, `selection-handles.ts` | `element-anchor`, `range-anchor`, `selection-handles` |
| Tokens, motion and color | `office-ui/src/tokens.css`, `color-picker.tsx`, `color-formats.ts` | `tokens`, `color-formats` |
| Declarations and keyboard hints | `office-controls/src/index.ts`, `panel.ts`, `keys.ts` | `controls`, `panel`, `keys` |
| Command adapters | `office-editor-ui/src/use-controls.ts`, `controls.tsx` | `controls` |
| Drafts and queued properties | `office-editor-ui/src/use-editor-settings.ts`, `use-property-command.ts` | `editor-settings`, `property-command` |
| Editor selection ownership | `office-editor-ui/src/editor-context.ts`, `context-toolbar.tsx`, `use-node-rect.ts`, `capture-text-selection.ts` | `context-toolbar`, `capture-text-selection` |

Test names refer to each package's `test/<name>.test.ts`. All example imports are checked against package exports and locally packed libraries.

## Findings recorded

- UI primitives, declarations and editor bindings have separate responsibilities. Shared drawing does not move product coordinate calculations or commands into office-ui.
- The old Formatting README example declared a state reader without `mark`. The default adapter ignores that reader, so the example did not wire pressed-state display. It now supplies `mark`; a separate example explicitly forwards state readers to `useControls`.
- `can`/`onRun` override defaults, row `run()` does not guard its own disabled flag, and it returns void rather than async completion. Hosts must choose the appropriate failure/status path.
- Single-line text commits trim whitespace and use a synchronous callback contract. Multiline commits preserve content, await the callback and keep failed drafts.
- Settings drafts and property queues retire stale contexts but cannot cancel already started model transactions. A serialized queue is not atomic undo grouping.
- Portals, owned elements, focus retention and stable dismissal keys belong to the UI integration contract. Arbitrary canvas geometry, clipping shapes and CSS animation tracking remain outside generic DOM anchors.
- Color input formats are local picker state. Blend mode remains product state. Motion comes from shared CSS and is not a guarantee of animated unmount in every host.

## Validation

Verified with Node 22.22.0 from `.nvmrc`:

- `pnpm preflight`: passed with existing lint/source/test baselines unchanged.
- `pnpm docs:check`: four checks and coverage for 31 public packages plus the private release marker passed.
- `pnpm build:docs`: passed.
- `pnpm release:npm:prepare`: 31 libraries built and packed locally, without npm publication.
- `pnpm docs:examples`: 37 complete TS/TSX examples compiled against packed libraries; Office styling fixture built.
- Focused existing tests: office-ui 8 files/59 tests; office-controls 3 files/40 tests; office-editor-ui 5 files/35 tests. Total: 16 files/134 tests passed.
- Desktop browser mounted the exact extracted multiline and toolbar components. A real Note editor supplied the schema, store and selected model text. Default `mark` and explicit `state` controls followed actual bold on/off changes. The control identity example completed its assertion.
- Multiline browser checks preserved leading/trailing spaces and newlines in the accepted value; empty input returned failure without replacing the accepted value; Escape restored it and cleared the error.
- Guide → each of the three package example sections → guide navigation passed. All eight guide-to-package anchors exist in the built pages.
- The local browser verification host also passed TypeScript compilation with an explicit Note schema and DataStore.

Before publication, main advanced to `eeb0ab67390b2898e85d8aa1e028ce5b6a993ff2` through documentation/example PR #277. Its four files do not change the three reviewed UI package implementations or this PR's files. The reviewed source baseline above remains explicit.

No runtime fixes, mobile viewport checks, deployment or broad product acceptance are part of this task. Existing product input/menu issues remain open. The UI examples use in-memory state and an editor test host; they do not certify a storage backend or every product toolbar.
