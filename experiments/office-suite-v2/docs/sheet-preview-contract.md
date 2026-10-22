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

Initial author result at `d1feb609`: strict TypeScript 5.9.3, 8 roots/imports included,
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

## P2 status preservation follow-up

Planner found `d1feb609` called cancel on every changed selection, even without
a draft. Enter/Tab successfully committed native values, then selection movement
overwrote Applied with Edit cancelled. Movement could also hide an existing
refusal message. The initial source/helper reviews and 21 tests missed this
status behavior. Initial candidate and Integration's predecessor join remain
preserved; they are not the corrected candidate.

Before source repair, two new binding regression tests ran against the actual
`d1feb609` controller. Command `node scripts/test.mjs preview/sheet/binding.test.ts`
returned exit 1, 5 PASS / 2 FAIL / 307.324916ms, tool chunk `45aa52`. First failure:
expected Applied in this session. Reload discards changes.; actual Edit cancelled.
Cell content is unchanged. Second failure: expected the initial Session only
message; actual Edit cancelled. These are actual status regressions, separate
from the initial test-oracle/type failures.

Minimum repair: select cancels only when a draft exists and the native key changes.
No draft, IME, engine API or native value rule changes. Regressions verify actual
binding Enter/Tab movement retains Applied, normal draft-free movement retains
initial/applied/actual missing-cell refusal status, and movement with a real draft
still cancels without changing the projection. They do not fabricate a native
calculation-resource failure.

Final focused commands on the corrected source, using Node 22.22.0:

```sh
node scripts/type-check.mjs preview/sheet/controller.ts preview/sheet/binding.test.ts
node scripts/test.mjs preview/sheet/binding.test.ts preview/sheet/controller.test.ts
```

Result: 2 type roots/imports included, 0 diagnostics; 2 test files, 18 PASS,
0 FAIL, 0 skipped, 601.288291ms, tool chunk `4d2476`. Unchanged grid helper source
and its 5 tests retain the initial immutable evidence above. Real browser checks
remain Integration-owned and were held until this follow-up. No amend/reset,
engine edits, broad checks, server or browser were used for this repair.

## Original Phase A follow-up plan and release boundary

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

## Phase B implementation continuation

Direct human request on 2026-10-22 activates two-tab native editing and each
session's Undo. Planner's exact dispatch preserves the Phase A record above and
assigns this same sole author scope. New checkout:
`/Users/user/.codex/worktrees/533-sheet-preview-phase-b/barocss-editor`, branch
`codex/533-sheet-preview-phase-b`, parent
`1638944c6db0d39e994ba5f12367a4b56714f958`, tree
`629e43f773bcab257e98d2d9f2061101244b56f6`. Frozen receipt:
`/Users/user/barocss-editor/.omx/m0/533-sheet-preview-phase-b-frozen-receipt.json`.
The old author checkpoint, Word55262, Sheet55263 and user documents stay preserved.
Integration joins only in its new 522-sheet-bc-integration checkout. No native
engine, shared/root/config/lock/relay/protocol/verification files are author writes.

### Entry and native identity

Integration owns `scripts/sheet-collaboration.mjs --source-head <exact> --mode peer`
at separate 127.0.0.1:55264. It injects a meta element named
`sheet-collaboration-mode` with content `peer`. Without that meta element the
entry retains the original Phase A startup. `durable` mode is explicitly not
implemented in this B candidate; it cannot silently fall back to peer storage.

With peer mode, a fresh URL shows Start shared session. This explicit action
creates a UUID room and one real native bootstrap. The creator exports those
original Yjs bytes, destroys the temporary bootstrap replica and creates an
independent editing replica with a distinct session identity. History changes
the URL to `?room=<UUID>` without navigation. Open second screen opens that same
room URL. Every URL with a room, including creator reload, is join-only. A missing
room waits for a live peer. An invalid room refuses. Neither path silently seeds.
After the last peer disappears, no durable recovery is claimed; Start another
room is a separate explicit new-room action.

Peers share the exact original bootstrap bytes and context; generation is the
room UUID. An incoming full native state must validate through SheetReplica and
contain the declared original bootstrap. An established peer also compares its
bootstrap byte-for-byte. A join adopts only validated original native state.
Full Yjs state is merged through receive; there is no workbook snapshot restore,
event re-authoring, competing parser, calculation engine or editable mirror.

### Binary delivery and recovery

`peer-session.ts` is a controlled same-origin BroadcastChannel protocol. The wire
has version, roomId, from, kind and optional target, original event ID and binary
payload. The kinds are hello, state, update, ack and leave. Payload parsing checks
fields and bounds before use. Native SheetReplica.receive validates a trial
before live state changes. Wrong context, malformed bytes, omitted/mismatched
bootstrap or the same packet ID with different bytes refuses without replacing
the current projection. Accepted duplicates are idempotent.

The controller forwards every actually appended native commit/Undo result before
reporting its outcome, including pending/refused native events. Invalid parse
appends nothing and sends nothing. An observer exception leaves the native result
and local work intact, with an explicit delivery warning. Remote updates are not
rebroadcast as newly authored events. The existing exact Core diff/calculation
token path refreshes derived values.

The pending map retains exact original event ID and copied bytes. Missing Yjs
dependencies leave the live projection unchanged; the same packet is deferred
and a hello requests the original native full state. The sender sends that state
and its original outstanding packets. After validation, the receiver retries the
same deferred bytes/ID and acknowledges only admitted packets. The lost original
packet also receives its own receipt. Invalid deferred packets remain bounded
and inspectable rather than being silently deleted.

Pause tab link blocks both sends and native receive advancement. Local native
events and incoming delta packets remain queued. Resume requests native state,
retries original bytes and sends original outstanding deltas. This permits real
independent concurrent edits to the same native cell. An ACK clears only its own
pending ID; a late ACK cannot clear a newer packet. ACK means one controlled peer
received the native delta. It is never saved/durable proof or an all-peer guarantee.

Limits are explicit: 1,000,000 bytes per native delta and per combined
bootstrap/state message, 256 entries and 8,000,000 bytes in each bounded packet
collection, 64 observed peer identities. A full pending queue leaves the newest
native edit local and reports a sticky blocked notice. A full receipt cache or
oversized state refuses additional transport; there is no chunking/unlimited
session claim. Observed peers are not authoritative liveness or authenticated
users. Browser tab delivery is neither a server nor production authorization.

### Drafts, alternatives and session Undo

Remote receive invokes native synchronize and render without focus/selection
changes or reconstructing the editor. Existing CellKey/generation/structure guards
and composition rules remain. The DOM editor value is not assigned when it already
matches the draft and is never assigned during composition. Actual DOM/focus/caret
proof remains an Integration browser check; native tests verify controller state.

The selected cell history displays up to 12 actual native retained entries with
Current, Concurrent alternative, Earlier edit or Undone state and a session label.
Display uses the native typed input/AST. Each controller records only its own
local cell event IDs; bootstrap and received foreign IDs are excluded. A pending
local ID remains recorded so it becomes eligible for native own Undo if dependencies
later apply it. Undo chooses the latest currently applied local event. It never
removes another session's contribution or restores a snapshot. A reloaded tab uses
a fresh session/history and cannot undo the former tab's work.

### Observer and DOM contracts

Existing Phase A identifiers remain. New controls are `#create-room`, `#open-peer`
(anchor, target blank), `#pause-link`, `#retry-link`, `#peer-status` (role status),
`#peer-session`, `#peer-controls` (data-phase) and `#alternatives` within
`#alternative-panel`. The status separates local application from temporary peer
receipts; it never displays Saved. `#sheet-workbook` stays hidden until a native
replica has been admitted.

`sheetPreview.inspect()` adds actual Core nativeRevision, context, nativeEventIds,
nativeSheets, nativeCells, selectedAlternatives, sessionId and transportWarning.
Core revision is its exact canonical context/event-body encoding, never a local
counter. Private verification can compare/hash actual native structures, inputs,
ASTs and identities. Published metadata must contain hashes rather than user text.

`sheetPeer.inspect()` returns only read-only peer metadata: room/session/context,
phase, observed peer count, original bootstrap SHA256/byte length, pending/received/
recovered counts and queued packet IDs/lengths/SHA256. Hash can be null while the
asynchronous digest is pending. No raw packet bytes, credentials or mutation API
are exposed. Bootstrap SHA256 uses the original bytes, not a synthetic workbook.
Retry asks for native peer state; it does not create a new seed. Pagehide preserves
BFCache input state and pauses delivery, pageshow requests recovery; actual
BFCache behavior is unverified.

### Phase B first failures and checks

The first transport test run returned 5 PASS / 3 FAIL, 1661.341083ms, chunk
`377513`. Two test mistakes were corrected to native semantics: call actual
recalculate before read, and include retained bootstrap history when inspecting
all alternatives. The third was a real delivery defect: native full state recovered
content but a lost original packet was not resent and its receipt stayed missing
(expected two received packets, actual one). Its oracle was preserved. The sender
now resends original pending packets after its state reply. Missing-base recovery
tests verify preserved pre-recovery projection, exact ID/bytes and receipts.
The first transport type check returned TS2379, chunk `8530a7`: an optional byte
copy might be undefined under exactOptionalPropertyTypes. The queue now checks
bytes and ID before copying; no suppression or relaxed contract was added.

The controller tests first passed 8/8. An added actual pending→applied→own Undo
regression then returned 8 PASS / 1 FAIL, 1024.848292ms, chunk `23b66a`, because
Undo returned false after the local event applied. The repair records all appended
local cell IDs and chooses only currently applied ones for Undo. The same
regression now passes. Native engine sources and Undo rules were not changed.

Final author commands from experiments/office-suite-v2, Node 22.22.0:

```sh
node scripts/type-check.mjs preview/sheet
node scripts/test.mjs preview/sheet
```

Result at source handoff: TypeScript 5.9.3, 11 roots/imports included, 0 diagnostics;
5 test files, 45 PASS, 0 FAIL, 0 skipped, 4836.376208ms, chunk `ca3071`. This is
changed-preview native/controller/transport/geometry evidence. It includes no
author server/browser/full-root/Word/Core profile run. Integration must still
qualify actual independent pages, pointer/keyboard input, matching native/visible
results, concurrent alternatives and both Undo paths, late join/reload/no-peer
behavior, remote DOM draft/composition/caret preservation and runtime boundaries.
Synthetic composition and mock Canvas checks remain distinct from hardware IME
and real pixels. Phase B browser/whole-scope acceptance is not claimed here.

### Phase C dependency boundary

The broader human goal authorizes C next, but C client edits/runtime wait for
B qualification and its exact dependency pin. Collaboration #534 owns the shared
browser-neutral `src/sheet-preview-protocol.ts` and Node relay. Its P1 contracts-only
pin is `6768f95decf5f49168639184c06fec2fd42e6681`; service/runtime are separate.
This B candidate neither imports nor duplicates those HTTP DTOs. Future persisted
pending/ACK-unknown records with a missing/refused original credential must stay
preserved with an error; a fresh-session fallback is prohibited. Local outbox
persistence and peer ACK are not server durability. No Node store/PendingUpdates
runtime import, SQLite, durable receipt, production adoption or M0 acceptance is
included in B. Existing Word RSS FAIL and M1/M2 holds remain unchanged.

### Phase B initial peer status correction

Integration source review of `81960494` found the peer controller retained the
standalone initial message Reload starts a new example. Actual room reload was
join-only, but the message described the wrong behavior. Before source repair,
a new controller-peer regression returned 9 PASS / 1 FAIL, 1724.1205ms, chunk
`7f9632`. Expected Two-screen session. Reload joins a live peer. Nothing is saved.;
actual Session only. Reload starts a new example. This is a source/status finding,
not an actual browser failure. The original candidate is preserved.

The one-line correction initializes peer-mode status when the native local-event
observer is supplied. Standalone status is unchanged. It runs before calculation,
so a genuine calculation refusal still takes precedence. Native input, room,
transport and Undo behavior are unchanged.

Final correction commands: `node scripts/test.mjs preview/sheet/controller-peer.test.ts`
and `node scripts/type-check.mjs preview/sheet/controller.ts preview/sheet/controller-peer.test.ts`.
Node22.22 result: 10 PASS / 0 FAIL / 0 skipped, 1192.734541ms; strict 2 roots,
0 diagnostics, chunk `f2e819`. The earlier 45-test source result remains historical;
this follow-up reruns the changed controller area only. Browser qualification
waits for this immutable corrected delta.

### Manual Pause across page lifecycle

Planner source review found `826b5532` resumed every persisted pageshow, even when
the user had manually paused the link before pagehide. That could transmit queued
work without the explicit Resume action. The unchanged original transition was
first extracted from main into the small PeerLifecycle helper and wired back into
the same listeners for a deterministic state regression. This is equivalent
source behavior, not a claim that Node executed an actual browser BFCache event.
With real PeerSession/native queued bytes, first run returned 1 PASS / 1 FAIL,
486.868875ms, chunk `21c8c0`: expected paused after restore, actual ready.

PeerLifecycle now records the pause choice before automatic suspension and restores
that choice. A live link returns live. A manually paused link stays paused, keeps
its pending native IDs and revision and sends zero messages until explicit Resume.
Main still disposes only on non-persisted pagehide. No transport, engine, capacity
or chunking expansion accompanies this correction. Actual BFCache remains NOT RUN.

Changed-area commands: `node scripts/test.mjs preview/sheet/lifecycle.test.ts` and
`node scripts/type-check.mjs preview/sheet/lifecycle.ts preview/sheet/lifecycle.test.ts preview/sheet/main.ts`.
Node22.22 result: 2 PASS / 0 FAIL / 0 skipped, 267.084875ms; strict 3 roots,
0 diagnostics, chunk `a4562c`. Earlier controller/transport evidence remains bound
to its unchanged sources; a full preview rerun was not used for this small change.

B's 1MB limit applies to an individual delta and combined bootstrap/state message.
It is not a pre-commit cap on the accumulated live document. Repeated admitted
deltas can make a later state transfer/join/reload refuse while current live peers
still hold their native work. Existing peers can merge deltas; this does not imply
reopen or saving guarantees. The 64 observed-peer identity limit is separate from
the 256 deferred sender/packet records and each collection's 8MB bound. C's separate
full-accepted-state 1MB pre-COMMIT admission remains a C server requirement; no B
cap increase, native engine change or chunking is added to hide this boundary.

## Phase B acceptance and Phase C client preparation

Planner accepted bounded B at joined source
`11f6204f91978d0784db5b11c513592947c76736`, tree
`85ab39842b749ed3eb90fdba551b87d9403040ad`. Actual B receipt V2 is primary
`.omx/m0/533-b-browser/actual-browser-receipt-v2.json`, SHA256
`25c7ec8c7a26a8d3705f92c8a9d6272b6a09469514a7b3ff6e40818d4fe3dea9`.
Its 11 actual PASS records, 12 PNG byte hashes and 16 runtime JS responses were
independently checked. Two harness failures and corrected V1 Buffer-JSON hash
metadata remain preserved. B private pages/server are closed; that room is not
a user-ready link. Old Word55262 and Sheet55263 documents remain unchanged.

C client source uses the same exact base in a new managed checkout
`/Users/user/.codex/worktrees/533-sheet-preview-durable/barocss-editor`, branch
`codex/533-sheet-preview-durable`. Frozen preparation receipt is primary
`.omx/m0/533-sheet-preview-durable-frozen-receipt.json`. The two author-owned
path families remain unchanged. P1 `6768f95decf5f49168639184c06fec2fd42e6681`
is consumed read-only. The later direct human HOLD on #534 preserves its backend
WIP and forbids further backend execution/adoption. C source preparation is
independent. Actual browser IDB, relay, durable receipts and process-restart
recovery remain NOT RUN until a released immutable server candidate is joined.

### C identity, persistence and delivery

Integration's durable-mode meta tag selects the HTTP adapter. `?client=<UUID>`
names a browser outbox namespace; it is not a credential. `&new=1` permits a
fresh client only when that namespace has no client or packets. Once admitted,
the page removes this flag. An existing namespace always resumes its original
opaque server credential, identity, context and bootstrap descriptor. A missing,
corrupt, orphaned or denied original blocks opening. There is no fresh fallback.
Open second screen generates a different client namespace and server session.

A named browser Web Lock is required before IndexedDB reads or session issuance.
A duplicate writer or unavailable locking blocks the page. The editor is admitted
only after the controlled session record finishes its IDB transaction. The private
database is `wonffice-sheet-preview-outbox-v1`: clients are keyed by clientId and
packets by clientId/updateId. A new packet and monotonically increasing ordinal
are stored atomically. Resolve only on transaction complete; request success or
transaction error alone is not completion. Validation and cryptographic hashes
run outside IDB transactions. CAS detects unexpected concurrent record changes.

Each native local callback retains original bytes synchronously, including native
pending/refused events and Undo. Hashing/enqueue uses a separate serialized write
queue so a pending network response cannot block later local persistence. HTTP
delivery starts after packet transaction completion and sends the exact original
ID/context/admission/bytes/hash under its original session. Rejected and uncertain
records remain. An old receipt cannot confirm a newer record. Server-confirmed
state requires a validated per-ID receipt and completed outbox result transaction.
Accepted remote state merges through native SheetReplica, never re-authors cells.

P1 bounds remain: 1,000,000 bytes per update/full accepted state, 1,500,000 bytes
per bounded HTTP response, and decoded frontier 1..64,000 bytes (base64 preguard
85,336 characters). The outbox retains at most 256 packets and 8,000,000 original
bytes **over the client lifetime**, including confirmed/rejected history. It has
no pruning or reset API. At capacity or IDB failure, original new bytes remain in
this tab as Local only, further editing blocks, and reload has no persistence
guarantee for those bytes. The UI never labels them saved. No cap increase,
chunking, storage compaction or alternate engine is added.

Controller mode is explicit: local, peer or durable. A callback alone does not
imply a transport or durability. Applied native edits remain applied if delivery
fails. Normal asynchronous IDB writes leave keyboard focus/editing intact; only
an actual persistence failure freezes further editing. Pending input and server
confirmation have separate status. The toolbar Undo history starts fresh when a
controller mounts after reload. Original native Undo records/targets remain in
the document/outbox; NEW edits after reopen use current-session selective Undo.
No persistent toolbar-history reconstruction is part of C.

### C page lifecycle and observer

Controls: `#create-client`, `#open-client`, `#pause-relay`, `#retry-relay`,
`#new-client`, `#client-identity`, `#durable-status`, `#save-state`, `#outbox-state`
and `#durable-controls[data-phase]`. The workbook stays hidden before admission.
Poll accepted state at 1.5-second intervals. Pause stops new network requests;
original local persistence can finish. Retry uses retained records. Manual pause
survives lifecycle suspension. An opening page defers BFCache suspension until
admission, so it cannot strand an interrupted opening request. Actual BFCache
behavior is not claimed by source or Node lifecycle models.

Nonpersisted pagehide freezes editing, aborts networking and drains both task
queues before destroying the view/native replica, closing IDB and releasing the
writer lock. A late lock grant after pagehide is released without opening data.
Beforeunload warns when unpersisted original bytes remain. Forced process exit
cannot guarantee completion of an unfinished browser transaction.

`sheetDurable.inspect()` is read-only metadata: client/session/actor/context,
identity, phase, lockState, acceptedSequence/state hash, immutable bootstrap
descriptor, localOnly/pending/ACK-unknown/rejected/confirmed counts and
persistenceBlocked. Per packet: original updateId, SHA256, byteLength, state,
sequence, persisted and receiptFrontierSha256. Persisted refers to completion of
the original packet transaction, not server acceptance. Credentials and raw
packet/frontier bodies never enter this observer. `sheetPreview.inspect()` keeps
its actual native revision, projection and draft observation contract.

C remains controlled local experimental work. Production authorization, backup,
installation, release, physical IME, accessibility and whole-M0 acceptance are
separate. #535 remains read-only; Integration owns all actual runtime resources.

### C first failures and changed-area evidence

Source review found three paths before C qualification: a stalled network request
could block later outbox persistence in one shared queue; marking the workbook
inert during each transient write could lose keyboard focus; and an IDB error
event could settle the completion Promise before terminal abort. The final source
uses separate write/network queues, freezes only actual persistence failure, and
waits for complete/abort. These are source-review findings, not recorded red
browser results. Native vector decoding/canonical encoding and packet-clock
coverage also guard receipts; bounded base64 alone cannot confirm a packet.

First C HTTP test run, chunk `65b78f`, was 9 PASS / 1 FAIL, 1732.035417ms. The
late-ACK test expected localOnly=0 immediately at the memory store's completion
hook; actual was 1, before the caller's await continuation removed its RAM mirror.
The hard assertion already proved two stored packets before the first network
reply was released. Keep that assertion. The corrected observation waits until
the second request has entered, then proves old confirmed/new pending. No source
change was needed for this test timing error. First type run, chunk `fbcb50`, had
four TS2540 diagnostics in controlled faulty-response fixtures: sha256,
byteLength, frontierBase64 and bootstrap.updateId retained readonly DTO types
through structuredClone. Explicit mutable nested test copies fixed the fixtures;
P1/native contracts were not changed. These failures remain historical.

Final helper runs: outbox 13 PASS / 1189.615875ms and 2 roots / 0 diagnostics,
chunk `91cc0f`; controlled HTTP 12 PASS / 1612.127625ms, chunk `06cbc5`, and
2 roots / 0 diagnostics, chunk `1d727c`. These use Node transaction/event models,
MemoryOutbox and injected HTTP responses. They do not exercise real browser IDB
or a durable server. Parent modeled-page tests verify denied/unsupported locking
and late lock grant after pagehide without opening IDB/network. They are not
actual browser lifecycle or focus proof.

Final author changed-preview commands, frozen Node22.22.0:

```sh
node scripts/test.mjs preview/sheet
node scripts/type-check.mjs preview/sheet
```

Chunk `ec8b06`: 11 files, **80 PASS**, 0 FAIL/skipped, 6543.472375ms; strict
TypeScript5.9.3 **22 roots/imports included, 0 diagnostics**. This is a fresh
changed-preview run on the complete C client source, including retained A/B
tests. It is not full-root preflight, an integrated runner check or actual C
browser/server/IDB/restart acceptance. Integration must qualify the exact joined
candidate, continuous input/focus, per-ID delayed/lost ACK, original outbox reload,
duplicate writer refusal, native recovery/re-edit/new own Undo and module bounds
when the held server is released. No author server/browser/install/profile ran.
