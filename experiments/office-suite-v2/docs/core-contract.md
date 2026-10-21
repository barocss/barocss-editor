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
collation determines a winner. Canonical encoding sorts object keys and preserves
array order. Projection is recursively frozen and detached from caller objects.
`revision` is the exact canonical encoding of context and sorted unique events,
not a hash, save acknowledgment or monotonic revision number. It trades memory for
collision-free M0 cache binding; the scale probe must measure this cost.

## Structure, input and conflict rules

IDs never change or get reused, including after undo. Inserts anchor after an
observed identity (or null at the beginning). Concurrent siblings sort by creator
event ID; traverse each sibling and its descendants before the next sibling.
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
restores a workbook snapshot. A new conflicting event can turn an earlier tentative
insertion undo into a refusal on replay; all replicas decide from the same event set.
Structural undo conflict checks include surviving transitive descendants and
foreign formula references to the identity. Conservative refusal is permitted;
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
most 1048576 UTF-8 bytes; dependencies 100000; collection 100000 unique events;
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
