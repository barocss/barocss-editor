# Native Sheet preview — #533 Phase A

Scope: `office-v2-m0/sheet-preview-phase-a-v1`. Author: Execute Sheet Preview
`01a16153-cfa9-7d70-b2f9-4a9e702e78f2`. Parent is
`8380696bbf58adaf8471f8a21da00c457326c2da`, tree
`02221a0eac113ba627eab98e14aad8f82622a41d`. Author checkout:
`/Users/user/.codex/worktrees/533-sheet-preview/barocss-editor`, branch
`codex/533-sheet-preview`.

Only `preview/sheet/**` and this contract are author-owned. Existing engine,
product, package, config, lock, policy and verification paths are read-only.
Integration owns the standalone Vite runner, frozen dependency linkage, serial
browser resources and joined-source qualification. Primary planning WIP and the
Word 55262 preview/user document stay preserved.

## Entry and browser boundary

Planner and Integration agreed on `preview/sheet/index.html` loading `./main.ts`
as an ES module. There is no framework or dependency addition. Integration's
separate `scripts/sheet-preview.mjs` serves this entry at 127.0.0.1:55263 after
immutable intake. Its source pin must be the actual clean joined candidate.
Do not copy the runner into the author scope.

Frozen preparation receipt:
`/Users/user/barocss-editor/.omx/m0/533-frozen-dependency-receipt.json`.
Environment: Node 22.22.0, pnpm 8.15.0, Yjs 13.6.29, TypeScript 5.9.3, Vite 5.4.21.
The existing installed graph is linked. No installation, manifest/config/lock or
budget change is part of this work.

Runtime imports are `SheetReplica`, Core contracts/workbook diff, ReferenceIndex,
native parse/display and CalculationEngine. `collaboration.ts` has an existing
type-only durable-store import. It is erased. The preview never imports the
Node durable-store, PendingUpdates or Node built-ins at runtime. Integration's
launcher rejects those browser module paths.

## Document and calculation authority

`fixture.ts` creates two native sheets through actual `SheetReplica.commit`:
`sheet-budget` / Budget and `sheet-rates` / Rates, each with 32 native rows and
12 native columns. Axis IDs are `row-1` through `row-32` and `column-1` through
`column-12`, scoped by sheet. They remain stable within the example. The page
uses a fresh generation and session. Bootstrap inputs are one native typed batch,
not a second editable workbook or a projection snapshot.

Initial examples:

| Native cell | Input | Calculated result |
| --- | --- | --- |
| Rates!B2 | 12 | 12 |
| Budget!B2 | 3 | 3 |
| Budget!C2 | `=Rates!B2` | 12 |
| Budget!D2 | `=B2*C2` | 36 |
| Budget!D4 | `=SUM(D2:D3)` | 44 |
| Budget!D5 | `=IF(D4>40,"Review","Within budget")` | Review |

Changing Rates!B2 to 10 produces Budget!D4 = 38 and D5 = Within budget.
Native own-session Undo restores 12 / 44 / Review. Displayed formula text is
native `displayFormula` output; for example, `='Rates'!B2` is canonical.

`SheetController` keeps a read-only projection and ReferenceIndex. After a native
event, it obtains `replica.projection`, computes exact `diffWorkbook(before,after)`
and calls `CalculationEngine.update` with the source token. Recalculation and
read tokens bind the actual revision. An update/calculation refusal marks reads
stale. The value binding explicitly displays Stale or Not calculated and does
not substitute an older cached result. Error values such as #DIV/0!, #REF! and
#UNSUPPORTED! are actual native results.

Text binding accepts empty input as null, finite decimal/exponent numbers,
TRUE/FALSE, and other text as a string. A leading apostrophe forces string input.
Source rendering adds the apostrophe when required for type-preserving re-edit.
An initial `=` delegates the entire parse to native `parseFormula`. Invalid
syntax is refused before committing; the draft and previous projection remain.
Unsupported formula ASTs remain native inputs and show #UNSUPPORTED!. No UI
formula parser, solver, workbook reducer or snapshot collaboration adapter exists.

## Draft, selection and history

A draft captures the exact native CellKey, document generation and structure
epoch. Enter verifies all three and the selected native identity before commit.
Any structure change expires the draft. A shifted address cannot retarget it.
The user can cancel and start again. Draft text is not document authority.

Mouse selection, arrows and Tab use ReferenceIndex positions. Tab wraps columns
within native sheet bounds. Double-click, Enter, F2 or Edit cell starts an edit.
Typing replaces the selected cell draft. Enter commits and moves one row; Shift
Enter moves up. Tab commits and selects the next cell; Shift Tab selects the
previous cell. Escape cancels. A different cell/sheet selection cancels an
ordinary draft. An invalid/refused input keeps its draft for correction.

The DOM editor is one persistent input node. Scroll, draw and composition do not
replace it. A composition flag, `KeyboardEvent.isComposing` and keyCode 229 each
block commit. Composing Enter is left to the browser. Cell/sheet changes and
cancel are blocked while composition is active. Toolbar pointerdown cannot steal
focus from the composing editor. Composition end updates the draft only. The
user presses a separate Enter to apply. Start an edit before using IME; direct
IME initiation on the non-editable grid is not claimed. Hardware OS IME is NOT RUN.

Undo targets only successfully applied cell events created through this controller
in the current session. Bootstrap is excluded. Undo calls `SheetReplica.undo`,
checks the actual native outcome and never restores a snapshot. It is disabled
while editing; input-level Undo stays with the browser. The controlled peer test
uses actual native binary receive to show that own Undo preserves a foreign edit;
this test does not activate a two-tab UI or prove production transport/auth.

## Canvas, accessibility and observation

Canvas2D draws only the visible native viewport. Layout uses CSS pixels with
fixed 48px row headers, 30px column headers, 120px columns and 30px rows. Scroll
offsets feed both paint and hit testing. DPR scales only the canvas backing store.
Text is clipped per cell. The editor stays clipped to the visible cell area.

The DOM grid mirrors only visible rows/cells. `aria-rowcount`/`aria-colcount`
describe native bounds; row/column indices describe native positions. The grid
uses an active descendant and selected state. Cell accessible names contain the
address, actual value/error and read status. This is a bounded accessibility
surface, not a full-sheet DOM allocation or a screen-reader acceptance claim.

Stable browser contract:

| Identifier | Meaning |
| --- | --- |
| `#sheet-grid` | role grid, accessible name Sheet grid, keyboard focus target |
| `#sheet-scroll` | native scroll container; CSS coordinates come from grid origin |
| `#sheet-canvas` | aria-hidden Canvas2D viewport |
| `#cell-editor` | persistent input; dynamic name Cell input A1, etc. |
| `#sheet-tabs` | tablist Sheets; tabs Budget and Rates |
| `#undo` | button Undo my edit |
| `#cell-address` | selected native sheet and address |
| `#formula-source` | native input display, not the calculated value |
| `#cell-status` | selected calculation read status |
| `#preview-status` | actual controller action/error, role status |
| `[data-address="D4"]` | visible DOM gridcell with data-state fresh/stale/uncalculated |

`window.sheetPreview.inspect()` is a read-only derived observation. It returns
selectedKey, address, sheetName, generation, source, readStatus, value, draft,
visibleBounds, viewport, nativeEvents and canUndo. It exposes no mutation API or
replica. Tests must also use actual UI input, visible values and Canvas pixels.

## Focused verification and first failures

From `experiments/office-suite-v2`, using the frozen Node 22.22.0 executable:

```sh
node scripts/type-check.mjs preview/sheet
node scripts/test.mjs preview/sheet
```

Final author result: strict TypeScript 5.9.3, 8 roots/imports included,
0 diagnostics. Native Node tests: 3 files, 21 PASS, 0 FAIL, 0 skipped,
1451.024ms (last run, tool chunk `8c336d`). This covers actual controller/engine binding, keyboard handlers,
composition guards, draft invalidation, input cancellation/errors, own Undo and
geometry/DPR. Grid helper tests use a Canvas mock for geometry/backing-store
checks; they are not real pixel or browser evidence.

Preserved first failures before repair:

1. The first controller test run passed 10/11. A test expected `=Rates!B2`, but
   native displayFormula returned canonical `='Rates'!B2`. The oracle was corrected;
   native source was unchanged.
2. The first controller-only type check returned TS2345 because an unannotated
   UUID default inferred a UUID template-literal parameter, rejecting the test's
   arbitrary generation string. The test first used a fixed UUID. The author then
   explicitly typed the fixture generation parameter as string. Final types pass.
3. The first combined preview type check returned TS2339 at binding.test.ts:44:
   `Property 'text' does not exist on type 'never'`. A preceding equality assertion
   narrowed the getter to null across later method calls. The assertion now checks
   draft presence through Boolean, without changing source behavior or adding
   casts/suppression. That combined command stopped before running tests. The
   corrected combined command passed types and all 21 tests.

Original first-failure output references (the failed versions were not rerun):
controller test command `node scripts/test.mjs preview/sheet/controller.test.ts`,
tool chunk `2a9906`, exit 1, 10 PASS / 1 FAIL / 714.125208ms; expected
`=Rates!B2`, actual `='Rates'!B2`. Controller type command
`node scripts/type-check.mjs preview/sheet/controller.test.ts`, chunk `0627c1`,
exit 1, TS2345 at controller.test.ts:12:40: argument
`"controller-test-generation"` is not assignable to
`` `${string}-${string}-${string}-${string}-${string}` ``. Combined command
`node scripts/type-check.mjs preview/sheet && node scripts/test.mjs preview/sheet`,
chunk `7dfc6a`, exit 1, TS2339 above; tests did not start. Corrected combined
run chunk `f98585` returned exit 0 / 0 type diagnostics / 21 PASS.

A final read-only source check found unconditional pagehide disposal would leave
a BFCache-restored page without listeners. main.ts now disposes only when
`event.persisted` is false. This is a source correction; actual Back/Forward
browser restoration is not author-verified. Main-file strict types were rerun.

No engine, Word/Core profile, full-repo preflight, shared server or browser was
run by this author. Integration must still qualify real edit/recalculate/Undo,
sheet switch, keyboard, cancel/refusal, persistent composition input node,
scroll hit testing, DPR 1/2 and browser module boundaries on the joined immutable
candidate. Real browser/Canvas pixels, hardware OS IME, screen-reader behavior,
persistence and product acceptance remain unverified by the author.

## Inactive follow-up phases and release boundary

The UI states Session only and explicitly says reload discards changes. It never
claims saved, synced or durable state. It has no storage, network, BroadcastChannel,
relay, auth or snapshot adapter.

Phase B would use two independent replicas, identical immutable native bootstrap
bytes/context and controlled Yjs binary transport. Receive validation, missing-base
recovery, alternatives and own-session Undo are required. Broadcast acknowledgment
would not be durable acknowledgment. This is a contract note, not an active lease.

Phase C would use a disposable Node SQLite relay with the existing store: exact
update-ID/bytes retry, checkpoint/restart/reopen/re-edit and late-ACK correctness.
Node store/PendingUpdates must remain outside browser bundles. Browser-local
storage would require its own later design and would not replace server proof.

XLSX, general move/merge, broad formulas, production persistence, two-account
authorization and release are outside Phase A. M1/M2 products remain WAIT_M0.
Word100 sampled RSS FAIL and M0 OPEN remain unchanged. Preview implementation,
author checks, joined browser qualification and whole-Issue/M0 acceptance are
separate states. Planner owns the whole acceptance decision.
