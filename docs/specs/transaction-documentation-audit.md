# Transaction documentation audit

## Scope and source

- Issue: [#353](https://github.com/barocss/barocss-editor/issues/353).
- Runtime source baseline: `895f0cf20582ccfe5aa0d797121740befa825365`.
- Integrated main documentation update `94a9496826d0ea5b1cd06714ff4da45aef7ec8af`
  before publication. It changes no runtime files; existing model README additions
  are preserved.
- Package: `@barocss/model` 1.0.3, with local packed dependency archives.
- Owner: Technical Writer. No runtime changes, merge or publication.
- Canonical example: `packages/model/README.md`.
- Reader guide: `apps/docs-site/docs/concepts/transactions.md`.

An npm version number is not proof of source/archive identity. This audit uses
local package archives and does not certify registry or hosted service behavior.

## Source evidence

| Contract | Implementation | Existing tests |
| --- | --- | --- |
| DSL before hooks, cancellation and operation flattening | `packages/model/src/transaction-dsl.ts` | DSL suites; browser integration fixture |
| Object-shaped editor input, wrapper event | `packages/editor-core/src/editor.ts`, `executeTransaction` | Browser canonical README example and boundary fixture |
| Overlay ownership, commit outcome, post-commit stages | `packages/model/src/transaction.ts` | `transaction/transaction-recovery.test.ts`, `transaction/transaction-commit.test.ts` |
| Ordinary commit schema validation | `TransactionManager.execute` | `transaction/schema-enforcement.test.ts` |
| Per-store lock | `packages/datastore/src/data-store.ts` | `transaction-lock-integration.test.ts` |
| Target injection and builder payloads | `transaction-dsl.ts`, `operations/insertText.ts`, `operations/applyMark.ts` | `transaction/dsl-control.test.ts`; packed README example |
| Successful callback does not collect an undo operation | `_executeOpFunction` in `transaction.ts` | Source-reviewed limitation; no new runtime behavior claimed |

## Corrections

- Removed raw examples using unsupported `offset` payloads and a bare operations
  array for `editor.executeTransaction`.
- Replaced an obsolete lifecycle that released the lock before notifications.
- Distinguished pre-commit rollback from committed post-processing errors.
- Removed the guarantee that no other reader can see intermediate overlay values.
- Explained that the lock is scoped to a DataStore, not all clients.
- Documented all four options without treating selection suppression as DOM-only.
- Explained the entry-point difference for before hooks and wrapper events.
- Kept local editing, saving and collaboration acknowledgements separate.
- Removed invented alias examples and private import requirements.

## Current limitations and ownership

| Area | Status | Boundary and next owner |
| --- | --- | --- |
| Documentation preparation | Ready for the checked local scope | Technical Writer; review remains pending |
| Undo/redo failure recovery | Incomplete in reviewed main | Existing #350; Developer implements, QA validates exact final head |
| External side effects | Not covered by document rollback | Host integration owner supplies its own recovery policy |
| Hosted persistence and collaboration | Unverified | Backend/provider owner and QA |
| Registry archive equivalence | Unverified in this audit | Release owner verifies exact published artifacts |
| Publication/customer notification | Not performed | Approved merge/publication process; PM confirms release scope |
| Product release readiness | Unverified | PM tracks existing #322; this adds no release gate |

Developer supplied pending PR [#354](https://github.com/barocss/barocss-editor/pull/354)
head `d9f73ad892a41ccd3f5f5443938f5d732f3da266` for #350 during this audit.
It remains separate from the reviewed main baseline. Its intended contract keeps
history position unchanged before commit failure and advances it after commit,
but this documentation task has not independently verified that PR. Recheck #346
history documentation against that exact head as the next task; do not describe
it as published before merge/release verification.

## Validation

- Focused existing model suites: 5 files, 69 tests passed.
- Node 22.22.0 `pnpm preflight`: passed; existing lint/type baselines retained.
  Source type checks report 42 projects and 3 known-broken projects.
- `pnpm docs:examples`: 36 complete TypeScript/TSX examples compiled against 31
  local archives after integrating #304. The Office CSS consumer build passed.
- Desktop browser executed both exact model README examples, then a separate
  packed-consumer fixture checked DSL cancellation, the wrapper's bypass of
  before hooks, a thrown before hook, and a post-commit hook failure. All passed.
- `pnpm docs:check`: four tests and public package coverage passed.
- `pnpm build:docs`: passed. Existing bundle-size, Browserslist and Docusaurus
  update-check notices remain; no check threshold changed.
- Browser navigation: guide → canonical example → guide → options → guide passed.
- Rebuilt the integrated site and reloaded the guide in the desktop browser.
- No mobile viewport checks or external provider tests.

Temporary evidence files are in the task worktree's ignored
`output/docs/examples-g36RU2`: `model-0.ts`, `model-1.ts`,
`transaction-check.ts` and `transaction-check.html`. They use public imports,
not source aliases. The canonical code remains in the README; the boundary
fixture does not modify product code.
