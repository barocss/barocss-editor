# Native Sheet Core v1 — #523

Scope `office-v2-m0/core-v1`. Contract C is based on scaffold
`9b390602d90e07f496b7b699915b7d605582d8a4`. `src/contracts.ts` is the only
common type authority. Formula and Collaboration consume it without copies.
C freezes types, limits, key codec and the following semantics. Core runtime is
delivered separately in `src/workbook.ts`; C alone is not runtime verification.

## Event authority and API

The runtime exports `createWorkbookContext`, `validateEvent`, `createEvent`,
`requestUndo`, `projectWorkbook`, `diffWorkbook` using the corresponding capitalized
function types in contracts.ts. `encodeCellKey`/`decodeCellKey` are exported there.
Cell keys are JSON tuples `[sheetId,rowId,columnId]`; never concatenate IDs.

Context binds document/workbook/generation and contract/engine/schema/adapter
versions, all 1. Bootstrap an empty projection with normal `sheet.insert`, then
`axis.insert` events for two sheets and their rows/columns. There is no second
editable seed. Actor and session IDs are independent; a reload uses a new session.
Transport may use Yjs, but only the Core projector selects native state.

Each event is immutable. Dependencies can be the full observed set or a sufficient
causal frontier. All referenced creations/targets must be causally observed.
Missing dependencies and their descendants stay pending; a cyclic dependency
component also stays pending. Validation handles syntax/context only; it does not
drop an event because its dependencies have not arrived. Valid refused events also
remain in the authoritative event set and projection outcomes.

Project unordered events by causal topological order, then code-unit event ID order
among ready peers. Identical retries deduplicate. Same ID/different body fails the
entire projection explicitly; callers preserve the input for recovery. Invalid
events/context also fail projection. No clock, provider arrival order or locale
collation determines a winner. Canonical encoding sorts object keys, preserves
array order and uses JSON's negative-zero-to-zero canonicalization. Admission clones
through that wire representation so local and transported native numbers agree.
Other invalid/unknown values are rejected, not normalized. Projection is recursively
frozen and detached from caller-owned mutable data. Internally admitted immutable
events/inputs may be shared between projections; callers cannot forge admission by
freezing an object.
`revision` is the exact canonical encoding of context and sorted unique events,
not a hash, save acknowledgment or monotonic revision number. It trades memory for
collision-free M0 cache binding; the scale probe must measure this cost.

## Structure, input and conflict rules

IDs never change or get reused, including after undo. Inserts anchor after an
observed identity (or null at the beginning). A causally later same-anchor insert
precedes observed existing siblings. Concurrent siblings sort by creator event ID
using a reverse-causal topological order with an ascending code-unit ready queue;
traverse each sibling and its descendants before the next sibling. Thus inserting
after row1 in an observed row1,row2,row3 yields row1,newRow,row2,row3. This clarifies
the initial C wording: ID ordering applies to concurrent siblings, not all siblings.
Tombstones keep anchors/descendants in place. Deleted parents cannot gain new
causally later live children; a concurrent insertion anchored to a deleted row
still has deterministic placement. Axis IDs are unique within sheet/axis;
sheet IDs are unique within the workbook. Tombstones remain enumerable.

Cell commits are atomic typed literal/formula/invalid inputs; batches are atomic.
Formula AST plus parsing context is the authority. Formula source display and
calculated values are derived, never independently mutable fields. Among active
cell commits, a causal successor supersedes its predecessors; concurrent maximal
commits use the last topological/event-ID winner. Every alternative, superseded
and undone input remains recoverable. Deleting an axis hides affected cells but
retains their inputs, including a concurrent commit; causally later edits to a
known deleted target refuse. Empty cells require no records; literal null is an
explicit sparse record rather than physical deletion.

Undo is an event targeting an applied event of the same actor AND session. It
must observe its target, cannot target another undo, and repeated undo refuses.
Cell undo removes only that operation's contribution; later remote inputs remain.
Insertion undo tombstones the created identity only if no surviving foreign-session
contribution uses it, including concurrent or later edits/insertions. Otherwise it
refuses `UNDO_CONFLICT` and preserves the content. Deletion undo removes only its
own deletion marker and restores the SAME ID if no other deletion marker remains.
This makes references live again only after explicit successful undo. Undo never
restores a workbook snapshot. A new concurrent conflicting event can turn an earlier
tentative insertion undo into a refusal on replay; all replicas decide from the same
event set. An edit causally after the undo cannot block it: the edit observes the
tombstone and refuses instead. Already refused/pending inputs are not blockers.
For a not-yet-replayed concurrent candidate, Core evaluates eligibility in that
candidate's complete causal closure, which strictly excludes the current undo.
This lookahead terminates on a smaller set; no oscillating fixed point is used.
Sheet undo protects foreign content throughout its descendant axes/cells. Axis
undo retains anchored descendants through the tombstone; foreign direct anchored
inserts and foreign formula references to the identity also protect it. Conservative refusal is permitted;
silent loss of another session's contribution is not.

General row/column moves and merges are `unsupported` commands with explicit
`UNSUPPORTED` outcomes. They are not inferred from provider messages. Other unknown
commands or versions reject at validation. Sheet deletion/rename and redo are not
M0 commands. Do not emulate them by replacing snapshots or reusing IDs.

## Formula seam

Scalar refs store sheet/row/column IDs, absRow/absColumn and sheetQualified. Display
address follows live ordering. Deleted targets yield #REF!; fresh IDs cannot revive
them. A range is a forward same-sheet live interval between stable endpoints:
interior insert joins, outside endpoint insert does not. Cross-sheet endpoints and
reversed live endpoints are rejected by Formula resolution; Core preserves the
typed AST and leaves positional/reference validity to Formula.

Formula owns copy/cut relocation through FormulaTransformHook. It receives the
complete pre-mutation snapshot plus source→target map. Copy displaces relative
axes only; unqualified refs use destination sheet, qualified refs keep the named
sheet. Cut follows moved content even for absolute refs and rewrites affected
external formulas. Overlap reads the snapshot. Submit all resulting changes in
one cells.commit; Core does not duplicate the reference solver.

Projection cells are enumerable JSON-keyed records with O(1) own-property access.
diffWorkbook reports changed cell keys including deletion/restoration and affected
structure sheets. A Formula cache binds context identity, engine version and
revision; stale tokens cannot authorize a cached result.

## Admission limits and errors

CORE_LIMITS exposes: IDs 1..128 UTF-16 units; text at most 32768 units; event at
most 1048576 UTF-8 bytes; dependencies 100000; collection 100000 supplied events;
atomic batch 10000 cells; formula AST depth 64 and node count 10000 per input.
Combined limits all apply. IDs are opaque strings; no provider/account semantics.
Duplicate dependencies/batch keys, self-dependency, unknown fields, unknown versions,
non-finite numbers, sparse arrays, undefined, symbols, accessors, class instances,
cycles and non-JSON values reject. Only plain own enumerable JSON data is admitted.
ValidationResult is ok/event or false/code/message. Runtime helpers throw TypeError
for invalid constructor/projection input; valid native refusals use outcomes.
Server current-access and authenticated actor binding belong to Collaboration's
admission seam; syntactic Core validation never grants authorization.

## Evidence boundary

C verifies the contract source with the frozen targeted strict checker. Runtime
tests follow in the Core candidate: permutation convergence, two sheets, sparse
atomic input/alternatives, ID/tombstone rules and conditional session undo. Controlled
native tests do not prove Office auth, durable save, product UI, M0 or release.

The projector recomputes from the event set. It uses a min-heap for event order,
reverse-causal sibling graphs for insertion position, and an observed-prefix fast
path for causal reachability. Concurrent undo lookahead can project smaller causal
closures; hot-cell alternative selection can compare many historical inputs. Those
costs, exact revision memory and full diff scanning are not certified for the M0
scale profile by small functional tests. Verification measures the real source;
future optimization must preserve these semantics and cannot silently prune history.

## Core runtime candidate evidence

Parent is Integration correction I1
`1d443e47f39d9e6009a7f0ae8724d7cc9f9e05da`, which contains exact C
`6ad373b4c31b7ec7aa97b75d8f6cb89b7174fc0e`. The runtime delta owns only workbook.ts,
the two leased tests and this manual. contracts.ts is unchanged from C.

Node 22.22.0 / pnpm 8.15.0 / frozen TypeScript 5.9.3:

```
pnpm --ignore-workspace type-check -- src/contracts.ts src/workbook.ts test/workbook.test.ts test/structure.test.ts
pnpm --ignore-workspace test -- test/workbook.test.ts test/structure.test.ts
```

Final result: strict 0 diagnostics; native 28/28 PASS, 0 skipped. The test runner
uses single-file concurrency. All 24 independent structure-event permutations and
all 6 non-transitive sibling-case permutations converge. Tests also cover causal
interior insertion, concurrent value/formula alternatives, remote input after local
undo, same-account other-session refusal, concurrent deletion markers/restoration,
post-undo edit refusal without revival, invalid/pending blocker exclusion, atomic
batch refusal, JSON/dependency/AST/byte limits and immutable projections.

No initial R targeted command failed. First semantic defects were source-review findings:
the initial all-sibling ID order broke interior insertion (Formula), and raw
foreign payload lookahead could revive a row after successful undo (Planner).
Both were corrected and have explicit native regressions above. A patch application
with mismatched manual context failed before writing files; the corrected patch
was applied. This is tooling evidence, not a native-runtime failure.

Full repository checks, provider/durability integration, Formula calculation and
copy/cut runtime checks, the required scale benchmark and genuine Office flows are
NOT RUN by this lane. Formula and Collaboration must consume this actual runtime;
Integration owns their common source base and combined checks. No M0, Issue closure,
product, release or deployment acceptance follows this Core candidate.

## 2026-10-22 bounded allocation investigation

Scope remains #523 / core-v1, with the same five leased paths. Analysis and candidate
base is exact final checkpoint `f4ed8eddafdca39290b4d9a7b8ec14eb1405907f`, tree
`b0093963b96cccf62c2595dca09417e8cab0306d`. The author worktree fast-forwarded cleanly
from R; no inherited WIP, dependency, contract or other lane source was edited.

The resumed assignment reports approximately 866 ms cold projection, 883 ms edit
projection, 543 ms edit diff and 0.047 ms dirty calculation for the real 10k-row /
50k-cell / 10k-formula probe, with a 12.46 MB revision and 10152 events. These are
received observations, not a new author measurement or a qualified latency budget.

Source evidence at f4, ranked by direct support:

1. `workbook.ts:137` validation walks descriptors and AST, serializes for the byte
   limit, serializes again for JSON clone, reparses/rechecks and freezes each event.
   `workbook.ts:263` does this again for all input events on every projection, then
   serializes them a third time for bodies. This includes immutable events already
   returned by Core admission. Repeated payload-size work and allocations are
   directly visible; their exact share of elapsed time is not instrumented.
2. `workbook.ts:497` diff serializes both versions of every cell and each whole
   sheet structure. A single cell edit therefore allocates full comparison strings
   for unchanged inputs and axes as well. It does not exploit immutable input identity.
3. `workbook.ts:272` still rebuilds causal graph/order; `workbook.ts:479` rebuilds
   all structure/cell projections and `workbook.ts:494` assembles the full exact
   revision. These are independent whole-state costs. Causal maxima per hot cell
   can take quadratic history comparisons, and structural undo lookahead can replay
   smaller closures. The supplied profile does not isolate those worst cases.

The narrow correction preserves replay, public signatures, all refusal/undo rules,
error precedence, version bounds and the complete collision-free revision:

- Admission computes one exact canonical body and privately records it against the
  detached deeply frozen event clone in a WeakMap. Projection reuses that event and
  body only for this private provenance and exact canonical context equality.
  Mutable/raw, caller-frozen, reparsed and incompatible-context inputs still take
  full admission. validateEvent itself continues to detach and validate its input.
- Core privately recognizes its own immutable projection roots in a WeakSet. Diff
  between two native roots compares actual JSON structure without serialized copies;
  immutable shared subtrees have an identity fast path. JSON-native finite values,
  canonicalized signed zero, object key sets and ordered arrays have exactly the
  same equality as the original canonical comparison. If either projection was
  externally built/reparsed, the original canonical comparison remains in use.

These are derived memoized facts, not a second editable workbook or a persistent
incremental engine. Weak keys do not retain dead events/projections. Live admitted
events do retain their canonical bodies, so retained-body memory is O(retained
payload bytes); this cost must be included in Verification measurements. Every
projection still replays, rebuilds records and emits the complete exact revision.
Diff still scans/sorts the key union and scans structures. No speedup or capacity
claim follows from the source change alone. An externally reparsed event on each
call does not gain cross-call admission reuse; the Collaboration API is unchanged.

Targeted validation uses the same four roots and two Core test files listed above.
Final result: strict 0 diagnostics; native 31/31 PASS, 0 skipped. The original 28
cases remain, plus native cold/warm/permuted JSON replay and exact revision/diff
equivalence, mutable/shallow-frozen raw input isolation and context rejection, and
external projection key-order/signed-zero/mutation fallback coverage. Assertions
compare observable results, not private cache entries or timing thresholds.

First Phase C failures are preserved separately: an initial diagnostic asserted
shared input reference identity on the old engine and failed (29/30). Planner asked
for observable equality regressions rather than implementation assertions; that
diagnostic was replaced by cold/warm projection equality. The next targeted type
run reported four TS2322 diagnostics because the new mutable raw-event fixture's
literal discriminants widened to string; native 30/30 already passed. The fixture
now uses `satisfies WorkbookEvent` without casts/suppression, and the final expanded
31-case run plus strict check passed. Neither is a claimed protocol failure or a
permission to relax the existing semantic tests.

No whole repository suite, other lane tests or full-scale/timing profile ran here.
Integration owns combined source checks; Verification owns before/after measurement
on exact immutable candidates in a bounded window. M0 and performance acceptance
remain open, including the separate Word timeout and unqualified environment.
