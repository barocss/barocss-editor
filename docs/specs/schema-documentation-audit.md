# Schema documentation audit

Issue: [#308](https://github.com/barocss/barocss-editor/issues/308).
Source baseline: `558714a818ae8f0dcffc8436d8e7e30a66c93442` (main, 2026-09-20).

## Delivered documentation

- `packages/schema/README.md`: validation levels; complete custom structure, rejected structure, mark range, and open-fragment examples.
- `apps/docs-site/docs/concepts/schema-and-model.md`: current vocabulary, tree/store boundary, validation scopes, and policy responsibilities. Replaces the legacy unverified content.
- `apps/docs-site/docs/guides/schema-editing.md`: public capture/plan/apply workflow with a complete copy, stale rejection, move rejection, and Undo example.
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
| Owner reuse, capture, plan, stale apply, copy-only guard | `packages/model/src/editing/fragment-editor.ts` | `packages/editor-core/test/fragment-editing.test.ts`; guide runtime example |
| Clipboard transport integration | `packages/model/src/editing/clipboard.ts`, `packages/extensions/docs/copy-paste-cut-spec.md` | Main includes #264 through #284; do not equate this with DND completion |

These are evidence locations. Executed checks and their results belong in the PR. The guide examples are checked against artifacts built from this source, not a claim about every published npm version.

## Executed checks

- Node 22.22.0: repository preflight passed under the existing lint/type baselines. No baseline was increased.
- Static Docs build and 36 complete TypeScript/TSX snippets passed against 31 locally packed libraries. The final corrected snippet also passed consumer type checking.
- The browser executed the exact two new examples: valid/invalid/open schema checks matched, copy produced `tasourcerget`, Undo restored `target`, and move/stale plans were rejected.
- The runtime check exposed the current `Editor` initialization requirement for a `document` root. The guide now states this constraint and uses an empty-compatible root.
- Browser navigation passed from the guide to the schema README anchor, then to the schema/model concept and back to the guide. No mobile viewport checks were performed.

## Scope limits

No runtime behavior, package versions, editor schema contracts, or active DND specification changes are included. #265, #271–#273 remain implementation work. #294 owns the broader proposed SDK support tiers and adoption criteria; this audit does not establish those tiers or claim that issue complete.

The pending extension documentation PR #304 remains separate. This branch uses main and does not depend on its unmerged files. Existing published URLs remain in use.

The examples exercise specific source-defined results, not all policy combinations, OS IME, mobile behavior, or all product operations. Keep those distinctions when reporting documentation completeness.
