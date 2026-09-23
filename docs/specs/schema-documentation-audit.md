# Schema documentation audit

Issue: [#308](https://github.com/barocss/barocss-editor/issues/308).
Source baseline: `94a9496826d0ea5b1cd06714ff4da45aef7ec8af` (main, 2026-09-23).

## Delivered documentation

- `packages/schema/README.md`: validation levels; complete custom structure, rejected structure, mark range, and open-fragment examples.
- `apps/docs-site/docs/concepts/schema-and-model.md`: current vocabulary, tree/store boundary, validation scopes, and policy responsibilities. Replaces the legacy unverified content.
- `apps/docs-site/docs/guides/schema-editing.md`: public capture/plan/apply workflow with copy, a local text move, stale rejection, and Undo.
- The documentation consumer check compiles the new guide in addition to README and onboarding examples.

## Evidence map

| Contract | Implementation | Existing behavioral evidence |
| --- | --- | --- |
| Schema public validators and types | `packages/schema/src/index.ts` | Public package compilation |
| Content sequence, alternatives and repetition | `packages/schema/src/content-match.ts` | Schema content-match tests |
| Recursive fragment, marks and open boundaries | `packages/schema/src/editing-validation.ts` | `packages/schema/test/editing-validation.test.ts` |
| Tree findings are structure/attribute diagnostics | `packages/schema/src/validate-tree.ts` | Source review; distinguish from editing mark validation |
| Policy fields, request/decision/plan types | `packages/model/src/editing/types.ts` | Public guide example |
| Policy priority, conflicts, freezing | `packages/model/src/editing/policy.ts` | Model fragment editing tests |
| Owner reuse, capture, plan, stale apply, local move | `packages/model/src/editing/fragment-editor.ts`, `move.ts` | `packages/editor-core/test/fragment-editing.test.ts`, `packages/model/test/transaction/fragment-move.test.ts`; guide runtime example |
| Clipboard transport integration | `packages/model/src/editing/clipboard.ts`, `packages/extensions/docs/copy-paste-cut-spec.md` | Main includes #264 through #284; clipboard and DND have distinct source/session contracts |
| Shared DND integration | `packages/extensions/src/fragment-drag.ts`, shared DOM/React view input | `packages/extensions/test/fragment-drag.test.ts`, `apps/editor-react/tests/fragment-drag.spec.ts`; product handle UI remains separate |

These are evidence locations. Executed checks and their results belong in the PR. The guide examples are checked against artifacts built from this source, not a claim about every published npm version.

## Executed checks

- Node 22.22.0: repository preflight passed on this merged head under the existing lint/type baselines. No baseline was increased.
- Static Docs build and link validation passed. The documentation consumer check compiled 37 complete TypeScript/TSX snippets against 31 locally packed libraries, including the refreshed guide.
- A temporary Vitest harness executed the exact schema README and fragment guide snippets through their public imports: four schema validation outcomes matched, copy and move produced `tasourcerget`, stale apply failed, and both Undo calls restored the expected text. The harness was removed after the check.
- The model move and position suite passed 17 tests. The example preserves the `document` root required by current `Editor` initialization.
- Desktop browser navigation passed from the guide to the schema README anchor, then to the schema/model concept and back to the guide. No mobile viewport checks were performed.

## Scope limits

No runtime behavior, package versions, editor schema contracts, or DND specification changes are included. The reviewed main includes shared DND integration, but this PR does not certify product handle UI or every product path. #271–#273 remain separate structural-editing work. #294 owns the broader proposed SDK support tiers and adoption criteria; this audit does not establish those tiers or claim that issue complete.

Extension documentation is tracked separately. This branch uses current main and does not depend on another unmerged Writer PR. Existing published URLs remain in use.

The examples exercise specific source-defined results, not all policy combinations, OS IME, mobile behavior, or all product operations. Keep those distinctions when reporting documentation completeness.
