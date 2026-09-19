---
work_id: note-product-foundation
artifact_type: execution_brief
status: qa_ready
owner_role: integration
source_request: "Finish Note, reassess common modules, then Word → Slides → Site. Check roadmap and progress on every delivery."
last_updated: 2026-09-07
---

# Note product foundation

This is the active execution record. Product behavior determines package work. Finishing one
package is not a stopping point; integrate it into the running app, verify the user flow, then
take the next highest-priority unfinished item. Preserve other agents' edits and declare ownership
before changing shared files. Older constraints that kept Note a tiny demo are historical.

## Acceptance criteria

Current order (latest user steering): **Note → shared-module review → Word → Slides → Site**.
Check this brief and docs/ROADMAP.md before choosing work, then update delivered behavior,
verification and remaining gaps after integration. Older product orders below are historical.

- N1: Create and name a meeting note; find and reopen it from the document list.
- N2: Write text, checklist items, toggle sections and callouts with usable insertion controls.
- N3: Checkbox and disclosure state changes are model operations and survive undo and reload.
- N4: Switching notes immediately after typing preserves the final text in the correct document.
- N5: Local save status reflects completed storage; errors are visible and do not erase edits.
- N6: Export and reopen a note file, retaining its blocks and state.
- N7: Embedded Site notes continue to render and round-trip the same prose vocabulary.
- N8: Keep the product preview available; retain the former demo under `?lab=1` for regression tests.
- N9: The product has no fixed formatting toolbar. Text selection reveals formatting, block
  handle menus expose relevant properties, and slash/adjacent add affordances insert blocks.
- N10: Convert, duplicate, indent and outdent supported prose blocks without losing text or marks.
- N11: Edit code, links and clipboard content at the intended caret; undo restores text and structure.
- N12: Search, favorite, nest, trash, restore and reopen pages with consistent library metadata.
- N13: Edit typed database fields and records in table/board/gallery/calendar views; filter and sort target the same records.
- N14: Open database items as nonmodal shared SidePeek pages: title, click-edit properties and an
  actual Note block body; keep the underlying database interactive without a scrim.
- N15: Database resources survive Note file/reload and embedded Site HTML export.
- N16: Configure same-document relations, rollups and bounded formulas; edit linked items and see
  recalculated values without overwriting raw records. Preserve IDs through rename/reload/duplication.
- N17: Create, rename, duplicate and delete named views with independent filtering, sorting and
  visible properties; preserve the same active view in Note reload and Site static output.
- N18: Insert stable page references with `[[`, follow renamed/trashed targets, and find live
  backlinks with context, including references inside database item bodies.
- N19: Flush inner editing sessions before page navigation and reopen the referenced item through
  backlinks and browser history without losing last input.
- N20: Preserve page identities across file transfer, copy on identity collision without overwriting
  readable or unreadable originals, and remap a copied page's self references only.
- N21: Search the current body across formatted runs, highlight and step through matches, and
  navigate a live heading outline without modifying saved content or undo history. Nested item
  editors own their own search scope, and IME confirmation remains text input.
- N22: Preserve repeated/trailing spaces in the rendered body and subsequent caret edits. Inserting
  a page reference ends the previous typing burst; subsequent typing and deletion use its new caret.
  Verify standalone Note and embedded Site prose with the same browser input contract.
- N23: Slash-menu labels remain legible beside long descriptions on narrow screens. Text selection
  exposes inline code, superscript/subscript, text/background colors and clear-formatting with durable marks.

## Package ownership

| Lane | Agent | Owned scope | State |
|---|---|---|---|
| Shared prose | note_shared_blocks | schema opt-in vocabulary, office-text blocks/renderers, Note/Site schemas | integrated |
| Editing | architecture | Note kit/commands/view; necessary extensions | integrated |
| Product app | product_state | Note workspace, local persistence adapter, legacy app tests | integrated |
| Integration | root | shared storage transaction semantics, cross-layer tests, documentation and preview | verified |

Schema contract: taskItem.checked; bDetails.open with bSummary; callout.type with editable calloutTitle child.
Reuse shared prose definitions in Note and Site without requiring Word/Slides to admit them.

## Delivery queue

1. Preserve last input on Note close — implemented; 33 Note unit checks, 22 Note browser checks,
   and Site close/reopen regression passed in the preceding slice.
2. Checklist/toggle/callout across schema → command → UI → persistence — integrated.
3. Note workspace create/list/title/switch/save/reopen/import/export — integrated.
4. Meeting-note browser scenario and contextual toolbar — verified; N1–N9 delivered for this slice.
5. Writing, page organization and initial database workflows — integrated, including shared right-side item editing.
6. Same-document relations, rollups, safe formulas and named views — integrated.
7. Page references/backlinks, nested item navigation and portable page identities — integrated.
8. Gallery/calendar layouts, nested AND/OR filters and multi-property sorting — verified.
9. Local save-conflict protection and core selection-range paste — verified.
10. Whole-library backup/restore, crisp shared UI and icons, common surface motion, Site final-input
    export delivery — integrated; evidence below.
11. Document find and outline (N21), shared space preservation and picker-caret repair (N22) — verified.
    Slash-menu readability and richer selection formatting (N23) — integrated and verified.
    Next: multi-block operations, with shared input/rendering regressions retained as delivery gates.
12. Remaining: Markdown/HTML/CSV exchange; database keyboard/bulk operations;
    cross-document/reciprocal relations; attachments; mobile workspace.
    Broader formulas remain unfinished. Account/server-sync/permission/collaboration launch is a separate
    unimplemented common-service milestone.

Parallel platform direction: [one workspace, specialized editors](../../../docs/specs/office-workspace.md).
Validate global document identity and editor lifecycle adapters with Note and a second product before
building combined navigation. Continue moving remaining generic UI into office-ui; do not call the
current independent apps an integrated account/team/sharing service.

## Verification rules

Run affected unit/type/browsing checks and distinguish existing type debt from new errors.
No claim of full Notion parity, server persistence, collaboration or service launch from this slice.
Do not replace meaningful compatibility checks with arbitrary size/count ceilings.

## Integration evidence — 2026-09-07

- Note browser suite: 30/30 passed on stable source, including four contextual product scenarios.
- Site embedded Note: close/reopen and shared-prose state scenarios 2/2 passed.
- Note unit suite: 41/41; shared storage 11/11; prose schema 4/4; task splitting 3/3;
  slash menu 9/9; Site prose export and conformance 4/4 passed.
- Note production build passed. App type budget 0/0; Note package 9/9 existing session-test
  diagnostics, with no new diagnostics. Vite still reports a large bundle warning.
- Site tests require their package configuration (jsdom). A root Node-environment invocation
  failed on missing DOMParser/document; rerunning with the declared package config passed.
- Preview remains at http://127.0.0.1:5183/; the old multi-editor fixture is at /?lab=1.
- Fixed integration findings: pointer slash-menu selection, missing tooltip context, atomic-block
  Delete leaking into property/title input, Enter in a property inserting body text, stale property
  drafts on block switches, nested property anchors, and partially unreadable library recovery.

## Shared contextual UI follow-up — 2026-09-07

User steering: reusable contextual UI belongs to the three shared UI modules; fix the unbalanced
property panel and its close button. [Shared design contract](../../../docs/specs/contextual-ui.md).

- UI1: Keep declarations in office-controls, primitives/design in office-ui, editor bindings in office-editor-ui.
- UI2: Note and Site use the same ContextToolbar with product-owned Control arrays.
- UI3: Formatting, insertion and properties reuse shared placement, theme, dismissal and input primitives.
- UI4: Independent editor selection, saved link range, nested anchors and persistence remain correct.
- UI5: Property title and close align in one header, fields align below, actions occupy a separate footer.

Implementation is integrated. UI1–UI5 are verified: shared UI 101/101 unit tests, editor UI
11/11 unit tests, Note 30/30 browser tests before the explicit-menu follow-up and the four affected
Note product scenarios afterward. The close-button alignment is checked with real DOM geometry.
Notion reference review then corrected automatic properties to explicit block-handle menu → settings.
The earlier Site automatic-panel obstruction is resolved: all five affected Site browser flows pass
with the final explicit interaction. Note production build passes; known package type budgets remain
unchanged. Preview remains available on port 5183.

## Next verified gap to investigate

### Product editing follow-up — 2026-09-07

User reported incomplete table management, awkward callout title input, hidden tooltips and clipped
object selection controls. This slice integrates existing commands into a usable editing flow:

- Table lane (`note_shared_blocks`): row/column/cell action menus, correct target retention,
  safe minimum structure and merge guards, outside-table positioning.
- Prose lane (`product_state`): native calloutTitle schema/rendering, legacy migration, shared table
  appearance commands and persistent table themes, static/export compatibility.
- Integration (`root`): native title Enter semantics, shared IME/menu keys, hover insertion target, tooltip
  stacking token, isolated editor layers, unclipped shared table handle host, product/browser QA.

Product completion remains broader than these controls. The next editing milestone must include
table header settings, block conversion/duplication, nesting and paste, and editable
code blocks. Page hierarchy/search/trash and database table/board/filter/sort workflows follow this
writing milestone. Server sync, access control and collaboration are launch milestones after the
local product flows are dependable. Existing simple tables are not database tables.

### Keyboard/input audit

macOS native Shift+Home selects to document start; browser tests now use Cmd+Right and
Cmd+Shift+Left for line selection. This was a test-platform assumption, not a callout-only key bug.
The independent text audit additionally covers six prose containers, marks, multi-run deletion,
Unicode graphemes, required title/body boundaries, inline atoms and Undo/Redo.

### Table interaction follow-up

Wide bottom click/drag row growth, insertion at row/column boundaries, pointer/keyboard column
width, cell backgrounds and persistent themes are integrated through shared commands. Each drag
commits once and can be canceled. Themes render newly added rows; per-cell color overrides take
precedence. A cell's width follows its column, preserving the table grid.

### Final evidence for native titles and table interaction — 2026-09-07

- Note full browser suite: 36/36 passed; Note unit suite: 115/115 passed.
- Shared UI/editor UI: 114/114; shared table selection: 12/12.
- Site embedded Note browser: 2/2; Site/Word/Slides conformance: 3/1/1 passed.
- Independent text review fixed title/body Enter caret, atom-only suffix typing, selected inline atom
  deletion and grapheme deletion. Datastore move replay now preserves final overlay child ordering;
  datastore suite 817/817 and model selection/transaction checks 53/53 passed.
- Note production build passed. App types 0/0, Note 9/9, model 511/511 existing budgets.
  Existing office-text test cast diagnostics (2) and large-bundle build warning remain.
- Insertion-undo intermediate caret warnings were checked: history restores the original run and
  offset before view application; all three insertion tests verify final caret restoration.
- Preview remains at port 5183; user document was not changed by integration tests.


## Writing, organization and database delivery — 2026-09-07

N10–N15 are integrated. Ownership for this follow-up:

- `architecture`: pure block actions, typed database model and shared Site schema helpers; header/link
  and dataset integrity review.
- `note_shared_blocks`: code editing, clipboard range serialization, HTML conversion and paste fidelity.
- `product_state`: page-library metadata/UI, database views, SidePeek item pages, contextual field settings and input focus/history.
- `root`: Note command/view integration, table headers, link UI, clipboard DOM range capture,
  caret navigation regression, Site static database renderer, product E2E and delivery record.

The initial Site-style form Drawer was superseded after product feedback. Table and board titles
now open a nonmodal shared `office-ui` `SidePeek` item page, with no scrim and an interactive database
behind it. Close/expand, database breadcrumb, previous/next visible item and a duplicate/delete menu
share the top rail; pointer and keyboard resizing adjust panel width.

A large borderless multiline title leads into compact type-icon/name/value property rows and an
actual Note block body. Values rest as text, chips or empty affordances and only show an editor when
selected. **속성 추가**, column headers and property labels open contextual field configuration while
the item page stays mounted. Portalled field choices are owned by the popup. Escape cancels the
active text draft before dismissing the page; IME Enter does not prematurely commit.

The item body reuses NoteEditor in an independent session. Stable item IDs target resource-backed
prose, preventing delayed saves from reaching a different row. Duplication copies both properties
and body independently. A renderer-owned placeholder contains an intact React mount island,
preserving input state across model renders. Body keyboard events belong to the child editor;
committed property history belongs to the database, and uncommitted drafts retain native input undo.

Database writes respect read-only mode. Prose insert/move commands keep `resources` last. Duplicating
a database or a container containing one clones the resource with a new source name, so editing the
copy does not change the original. Each operation has a reversible transaction.

Additional common fixes verified in this delivery:

- Paste captures the visible DOM selection synchronously rather than a debounced earlier model range.
- A delayed typing restore cannot overwrite an arrow-key navigation that ended the typing burst.
- Clipboard slices trim both ends, clamp mark offsets, and preserve emoji, whitespace and paragraphs.
- Partial link removal preserves the linked text outside the selected interval.
- Promoting a one-row table header preserves the prior caret and stable child IDs across Undo/Redo.

Earlier integrated verification (before the SidePeek redesign):

- Note package: 18 files / 168 tests passed; database UI includes 10 checks.
- Common final sweep: datastore 828, converter 112, relevant model 59 (999 total) passed.
- DOM typing/input/clipboard-adjacent regression: 82 tests passed.
- Site data/embedded database export/conformance: 42 passed; shared schema: 175 passed.
- Site embedded Note browser: 2 passed; Word and Slides conformance: 1 each passed.
- Note production build passed. App type budget 0/0, Note 9/9 and editor UI 2/2 retain their existing
  diagnostics. DOM package type budget 104/104 remains unchanged; build still warns about bundle size.

Current SidePeek verification:

- The new browser scenario passes item properties, real block-body editing, table/board reflection
  and reload persistence. The nonmodal background database remains interactive.
- Database UI regression tests cover resting/editing states, contextual field ownership, title
  commit/cancel/IME, item navigation, duplication and the body injection boundary.
- Integrated Note Playwright run: 49/49 passed (43 browser scenarios and 6 workspace helper checks).
- Note package: 178/178 tests across 18 files passed. Common FloatingSurface/SidePeek: 22/22 passed.
- A focused browser regression verifies fast item switching, parent Undo followed by fresh typing,
  whole-Note navigation, and reload persistence. Unmirrored item typing also participates in the
  browser's existing unsaved-change protection; browser navigation cannot rely on React cleanup.
- Site embedded Note: 2/2 browser regressions passed. Disclosure marker/Space/Enter now commit
  directly, avoiding the queued native `toggle` event being lost when the item closes immediately.
- Session reload regression verifies both debounce and close flush use the current root. Parent
  history synchronization resets local item history and compares the host's own saved tree shape.
- App build passed. App and shared UI type checks are 0/0; Note retains its 9 existing test diagnostics.
- Final screenshot review: borderless body aligns beneath the title and properties, with a separate
  block-control gutter; item content and top-rail controls have no visible clipping.

Remaining limits are explicit: cross-container paste spanning incompatible structural boundaries is
safely refused; arbitrary child blocks under a text-only paragraph are not admitted; database views
currently use one equality filter, sort and grouping field. Relations/rollups/formulas, page backlinks,
accounts, cloud synchronization, permission management and live collaboration are not claimed complete.

## Content readability follow-up — 2026-09-07

The shared renderer emitted zero paragraph margins even when no document spacing was authored,
overriding Note's stylesheet. Absent margins now use host prose variables with a zero Word fallback;
authored spacing, including zero, remains authoritative. Note defines readable spacing on the actual
rendered block classes, including div-based lists.

Ordinary and database item prose now share 16px / 1.7 leading, 12px paragraph separation, distinct
heading sizes and section gaps, nested list marker alignment, and padded monospace code. Korean
words stay together when possible. Database table values use 14px, and the workspace writing area
uses the same white canvas as the document. Desktop and 390px item-page captures show consistent
leading and no horizontal body overflow.

The taller content also exposed long floating menus extending below the viewport. Their scrollable
height now respects the space below their actual top, and keyboard navigation reveals the focused
item. Shared text tests: 281/281. Common floating/SidePeek tests: 23/23. The focused menu and link
browser regressions pass. The final 17-scenario editing sweep passed in full, and the Note production
build passed. Shared UI type checking remains 0/0.

## Related data and saved views — 2026-09-07

N16–N17 now run in the Note product. Package lanes delivered shared dataset metadata/calculation
(`note_shared_blocks`), Note commands and Site compatibility (`architecture`), advanced properties
and field settings (`product_state`), and named-view chrome/integration/browser coverage (`root`).

- Relation properties choose a dataset in this document, then search/link/unlink stable item IDs.
  Following a linked title switches the single SidePeek to the target item. Rapid selection uses
  the latest intended IDs and a serial save queue, with failure recovery and focus restoration.
- Rollups expose count/sum/average/min/max. Formula editing includes explicit Apply, reference
  insertion, syntax/reference errors and a first-record preview. The safe, bounded parser supports
  the documented arithmetic/comparison/function subset and does not execute arbitrary JavaScript.
- Computed display records and errors are separate from raw data. Missing references and cycles
  are visible; dependent field deletion is rejected, renames repair references and saved settings.
  Database duplication remaps internal relations while retaining external relations.
- Named table/board tabs have independent filter/sort/group/hidden properties. Create, rename,
  duplicate and delete use model history; the last view and title entry point remain available.
  Imported mismatched legacy scalar attributes use the active saved profile consistently. Shared
  normalization also controls Site static output, including computed values and hidden columns.
- Site generic input preserves advanced metadata and refuses unsupported edits. Stable-ID datasets
  use Note's duplication command; Site's generic duplicate is disabled for these datasets to avoid
  copying identities/body resources incorrectly.

Final evidence:

- Note unit suite: 21 files / 200 tests passed, including 24 database model/view-profile checks,
  advanced properties and serial-selection UI regressions.
- Shared schema: 13 files / 210 tests passed, including 35 bounded evaluation cases.
- Site affected model/export checks: 41 passed; conformance: 3 passed. Embedded local resources,
  calculated value 14, active saved filter and hidden properties are covered by static HTML tests.
- Product browser regression: the existing 17 writing/table/item scenarios passed; both new advanced
  data/saved-view scenarios passed after correcting fixture assertions. Connected budget 10→15
  recalculates rollup 30→35 and formula 90→105; reload/export retain the formula and raw stable IDs.
  The 390px formula popup remains within the viewport with its Apply button accessible.
- Site browser: close/reopen and prose editing 2/2 passed. Note app type budget: 0/0; Note package:
  unchanged 9/9 existing session-test diagnostics; schema type-check passed. Production build passed
  with the existing large-chunk warning. No new dependency, commit or user document mutation.

Evidence captures are in `/tmp/note-advanced-verified`; compatibility browser output is in
`/tmp/site-note-advanced-check`. The preview remains available on port 5183. Relations currently
target this document, and opening a relation requires the target database block on the page.
Reciprocal/cross-document relations, full Notion formula coverage, compound filters, other view
layouts, backlinks and the common service layer remain in the delivery queue.

## Page references and backlinks — 2026-09-07

N18–N20 are integrated. The input follows the `[[` page-link flow described in
[Notion's links and backlinks guide](https://www.notion.com/help/create-links-and-backlinks).
This delivery covers workspace page references; it does not add cross-document database relations.

- `architecture`: shared inline pageReference schema/renderer, insertion with marked-run range
  replacement, caret/undo/delete/paste semantics, safe HTML clipboard and Site fallback.
- `note_shared_blocks`: durable optional pageId in Note files, legacy compatibility and ID validation;
  reviewed navigation flush order, reachable resource indexing and unreadable-original collisions.
- `product_state`: contextual page picker, current-title decoration, trash/missing states, keyboard
  navigation, shared floating UI, explicit body flush handshake and nested item reveal routes.
- `root`: workspace identity/import policy, live backlinks and excerpts, nested resource traversal,
  browser history, model flush registration, original-data preservation and product verification.

Backlinks derive from explicit atoms in live prose and reachable database item bodies. Repeated
views do not duplicate references; orphan resources and pages in inherited trash are excluded.
Opening a backlink reconstructs the chain of database items containing its reference. Navigation
flushes mounted item sessions in reverse nesting order before the workspace replaces its editor.
Rename resolves through the live page registry, while fallback labels remain readable outside it.

Files retain stable page IDs. Importing into another library reconnects references independent of
import order; an ID collision makes a separate copy and remaps only self references. Collision
checks include unreadable originals, which remain available for original-file export. Page creation
and file import wait for active item bodies to flush. The file picker is disabled during initial load.

Verification on integrated source:

- Note unit suite: 25 files / 240 tests passed, including page reference model/UI, file identity and
  navigation failure tests. Schema: 210 passed. HTML converter: 36 passed. Clipboard extension:
  7 passed. Site reference/export/conformance: 4 passed.
- Existing 19 product browser scenarios plus the first 3 reference flows passed together (22/22).
  Final reference browser suite: 7/7, covering keyboard insertion/undo, rename/backlinks/history,
  trash/restore, cross-library file transfer, clipboard roundtrip, unreadable-ID collisions, nested
  item navigation and a 30-result picker inside a 390px viewport. Clipboard passed 3 repeated runs.
- Workspace metadata/index helpers: 10 passed. Site embedded Note browser compatibility: 2/2.
- Note app type budget remains 0/0; Note package remains at its existing 9/9 session-test diagnostics.
  Production build passed with the existing large-chunk warning; diff whitespace checks passed.

Initial browser validation caught duplicate React keys between the backlinks section and editor;
the keys are now distinct through trash/restore. Clipboard validation follows both native copy and
Clipboard API paths after verifying the actual selection, without replacing the system clipboard.
The long-list fixture waits for library loading before import and checks selected-row scrolling.

Evidence: `/tmp/note-reference-copy-combined`, `/tmp/note-picker-mobile`, `/tmp/site-page-references`.
Preview remains on port 5183. No user document was used as a test fixture and no commit was made.
At this checkpoint, richer layouts/filters were still pending; the next batch below supersedes that
queue. Reciprocal/cross-document relations, broader formulas and the common service remain unfinished.


## Gallery/calendar, query controls and durability — 2026-09-07

Current batch status: integrated and verified. Earlier sections record earlier checkpoints and the
diagnostic steps that led to the final evidence below.

- Gallery cards use real saved item-body previews and optional first-image covers, with per-view
  preview and size settings. Empty or disabled previews do not reserve a large blank area.
- Calendar views retain their date property, show invalid/missing dates in an unscheduled list,
  support month/Today navigation and date-initialized row creation, and reschedule by one undoable
  drag command. Explicitly unset dates stay unset; civil dates do not shift with timezones.
- All layouts open the same nonmodal SidePeek item page. Original record indices remain authoritative
  through derived values, filtering and sorting.
- Saved views support nested AND/OR filter groups and ordered multi-property sorts; legacy scalar
  settings remain compatible. Draft Apply/Cancel, per-view isolation, native date drag, reload and
  390px popup/card/calendar bounds pass browser checks. Shared Site output applies the same query
  and renders all layouts as a readable table.
- Local save-conflict protection preserves newer stored pages and keeps conflicting local work in
  a separate durable recovery library. Two-tab tests cover reload, new-page recovery/self-reference
  remapping, opening the latest body and continuing to edit, and quota-failure retry. Workspace
  editor instances remount when recovering/opening the latest revision so old body views cannot persist.
- Core single-paragraph/inline range paste preserves structure, marks, exact undo/redo across
  paragraph/list/callout/disclosure parents. Multi-block clipboard and table/resource boundaries
  remain rejected. A single browser caret assertion failed once; repeated normal and delayed-frame
  checks did not reproduce that exact failure. A deterministic unit test did prove a related contract
  defect: explicit paste ranges worked while a null model selection suppressed the operation's caret.
  Transaction resolution now honors explicit selectionAfter regardless of the previous selection;
  the implicit created-block fallback retains its previous guard. Final browser validation passes.

Ownership in this batch: architecture owns shared schema/model/query contracts; product_state owns
new gallery/calendar components and their focused tests; note_shared_blocks owns the shared revision
store and workspace recovery flow; root owns layout/settings integration, compound-filter UI and
integrated browser checks. Shared editing changes remain with architecture. No competing plan
replaces this canonical record.

Current evidence: Note 27 files / 255 unit tests, schema 212 tests, shared 165 tests pass. Note app
type budget is 0/0 and package budget remains at its existing 9/9 session-test diagnostics. Production
build passes with the existing large-chunk warning (about 1.21 MB before gzip). New data/advanced
view and conflict browser cases pass together (7); existing product checks pass 25/26 with the
long-page-picker keyboard race under investigation. Site disclosure focus theft was repaired by
preserving summary focus during the toggle transaction; close/reopen and prose browser scenarios
  pass twice each (4). Final integrated results will supersede these intermediate counts below.

The picker failure was isolated to result ordering, not a missed ArrowUp: the keyboard selected the
last result, while savedAt ordering made that result vary. Titles now sort naturally with a stable ID
tie-break before the 30-result limit. UI unit 6/6 and the unchanged browser scenario repeated 3/3 pass.

Cross-editor review found a separate Slides identity defect: switching a loaded deck to a template
or linked deck could retain the old library name and overwrite it on save. The Slides app now assigns
the destination identity for local jumps and clears it for templates/external files. Site still needs the active Note-field draft flushed before JSON/HTML export, and the
Word app still needs to connect its existing library API for reload restoration. These are concrete
follow-up product tasks, not claims of delivered functionality.

Final integrated evidence (supersedes the intermediate counts above):

- Note browser: 34/34 in one stable-source run, covering previous writing/table/reference flows,
  gallery/calendar, compound filters, multi-sort, cross-container paste, and two-tab recovery.
- Note unit: 27 files / 257 tests. Shared schema: 212 tests. Shared library/utilities: 165 tests.
  Model transaction suite: 12 files / 162 tests; focused model/Note paste: 16 tests. All passed.
- Site close/reopen and prose scenarios: 4/4 across two repeated runs. Disclosure Space/Enter no
  longer loses summary focus to the previous text caret.
- Slides identity browser: all 3 failed before the fix and passed afterward. Existing file/template
  scenarios: 12/12. Original A bytes remain unchanged after template/local-B/remote replacement save.
- Note app type budget: 0/0. Note package: unchanged 9/9 existing session-test diagnostics. Model
  type checking passed. Note production build passed with the existing large-chunk warning.
- Calendar consumes its internal drop and transfers a private MIME type, so dragging out of the
  calendar cannot paste a raw row index into prose. Original paragraph/item-body export remains exact.

Evidence: `/tmp/note-delivery-verified`, `/tmp/note-calendar-drop-protection`,
`/tmp/note-picker-order-final`; Slides browser coverage is in
`apps/slide/tests/library-identity.spec.ts`. Temporary diagnostics were removed. The user document
was not used as a fixture, no commit was made, and the Note preview remains on port 5183.

Next product priorities are whole-library backup/restore, Markdown/HTML/CSV exchange, database
keyboard/bulk operations, reciprocal/cross-document relations, find/outline, multi-block operations,
attachments and mobile workspace usability. Account, server synchronization, permissions,
collaboration and service launch remain unimplemented common-service work, outside local durability.

## Workspace backup, shared design and export delivery — 2026-09-07

This delivery supersedes the earlier whole-library backup and Site export follow-up items above.

- Shared storage `snapshots()` reads a consistent library and `keepMany()` compares every revision
  before atomically inserting all rows. It resolves on transaction completion; conflicts, quota,
  structured-clone and abort failures produce no partial restore.
- Note backs up hierarchy, favorites, trash, raw unreadable files and conflict drafts. Restore previews
  the content, creates new identities on collision and remaps archived internal references together.
  Missing/cyclic parents detach; recovery drafts become independent pages. Existing bytes remain intact.
- Nested bodies flush deepest first before snapshots and exports. A failed flush blocks the download.
  Backup reads recovery drafts before pages to avoid the draft-to-page handoff gap. Browser history
  navigation during the operation is deferred instead of replacing the prior visited entry.
- Design uses compact sidebar rows, aligned title/body edges, thin separators, quieter common buttons
  and fewer enclosing rounded boxes. Body typography remains 16px/1.7. TextField/Choice now supply the
  workspace search/title/template/parent controls and query value fields. Direct Note SVG and symbol
  icons were replaced with office-icons. Native product-specific controls still remain; this is not
  a claim that every HTML control is migrated.
- office-ui owns surface duration/easing, short menu/tooltip/SidePeek entry and Radix fade exit.
  Centered dialogs keep their placement, FloatingSurface animates only after placement and unmounts
  immediately on close, and reduced-motion disables motion. Controls retain the common color feedback.
- NoteSession.flush delivers without closing or resetting editing history. NoteEditor registers nested
  body delivery through a host-independent snapshot hook. Site awaits those bodies and host command
  writes before JSON/HTML/ZIP export; false/error stops the download and preserves input for retry.
  Cmd/Ctrl+S also works inside an open embedded Note field.

Verification on integrated source:

- Note runner: 46/46 (39 real browser scenarios + 7 pure archive checks), including portable restore
  into another browser context, identity collision after preview, injected second-write quota failure,
  exact original preservation, deepest body final input, continued editing and mobile dialog bounds.
- Note package: 27 files / 258 tests. office-ui: 12 files / 117 tests. Shared utilities/library:
  16 files / 167 tests. All passed.
- Shared library real IndexedDB: independent-connection conflict and rollback scenarios 2/2 passed.
- Site: final integrated close/prose/save/HTML/ZIP/nested failure-and-retry browser 7/7 passed.
  Shared editor UI 15/15 and Site menu/keymap 28/28 passed in the owner lane.
- App type budget 0/0. Note retains 9 existing session-test diagnostics with no increase. Shared
  library and office-ui type checks passed. Production Note build passed; the large JS chunk warning
  remains (about 1.23 MB raw). Site retains pre-existing dependency type debt; owner files added no errors.
- Review found the draft/page snapshot ordering gap and deferred-history issue; both are fixed.
  Final focused race and motion evidence follows after owner verification.

Evidence: `/tmp/note-backup-design-final`, `/tmp/site-note-final-motion`,
`/tmp/note-final-shared-layout`, `/tmp/note-final-shared-design`,
`/tmp/document-library-bulk-final`. All browser fixtures use isolated storage contexts; user documents
were not test fixtures. Note preview remains at port 5183. No commit or service deployment was made.

The new workspace architecture document records a recommendation, not a completed shared service or
an approved pricing model. Common document identity, lifecycle, account/team/permissions, server sync
and collaboration remain explicit future platform work.

Final focused owner evidence:

- `apps/note/tests/workspace-backup-races.spec.ts`: 2/2 browser checks passed. The first holds an
  actual completed snapshot while Back is requested and verifies C→B→A history afterward. The second
  recovers a draft in another tab between backup snapshots and verifies exact draft bytes remain in
  the archive with the original page intact. Total Note browser coverage this delivery is 41 scenarios.
- `packages/office-ui/test/motion.browser.ts`: 3/3 passed for normal/reduced motion, actual exit
  events, focus/placement and Drawer overlay opacity. Drawer keeps its existing 0.5 opacity through
  both animation boundaries; the initial shared fade-to-1 discontinuity found in review is fixed.

## Note body find and outline — 2026-09-07

Latest user steering changes the delivery order to Note → shared-module review → Word → Slides → Site.
The current Note milestone is N21. Implementation provides the header's body-find/outline actions,
Cmd/Ctrl+F scoped to the active Note body, literal cross-run matching, case sensitivity, result stepping,
live result updates, and heading hierarchy navigation. Database item bodies own their own search scope.

The reusable navigation controls live in office-ui and use common buttons, fields, icons, surface motion
and search color tokens. Read-only multi-run search is in office-text; Note owns heading interpretation
and DOM navigation. Existing Word find/replace APIs remain unchanged. This is routine reuse while
building Note; the broader cross-product module review remains a distinct step after Note basics.

Search uses browser CSS Highlight ranges without decorating the model or writing document marks.
Disclosures revealed by search/outline are transient and return to their stored state on dismissal.
Opening/closing preserves the writer's caret and existing undo history. Other page visits discard stale
navigation requests. A browser without CSS Highlight still gets a current-block outline; range highlighting
requires CSS Highlight support. Replacement and search inside unopened database resources are not included.

Initial browser checks found focus was attempted while the floating surface was still hidden. Focus now
runs after placement. Verification also distinguishes changing export timestamps and harmless empty
serializer fields from actual document changes; persisted bytes are checked unchanged during search,
and a single undo after navigation removes the prior real text edit.

Verification so far: integrated Note browser 28/28 (navigation, everyday editing, tables, references and
backup); Note package 28 files / 259 tests; office-ui 117 tests; shared text find 21 tests. App type budget
0/0, Note unchanged 9/9 existing test diagnostics, office-ui type check and production build passed.
The existing 1.23 MB JS bundle warning remains. Final lifecycle and Site compatibility checks passed
in the input-repair integration below.
Evidence: `/tmp/note-navigation-final` and `/tmp/note-navigation-lifecycle`. Mobile outline was visually
inspected at 390px; all controls remain inside the viewport. User documents were not used as fixtures.

Note basic-product checklist (not a claim of full Notion parity or service readiness):

- [x] Writing and contextual editing, page organization, typed databases and local durability.
- [x] Whole-library backup/restore and conflict draft protection.
- [x] N21 body find and live heading outline — lifecycle and Site compatibility verified.
- [x] N22 repeated spaces and picker-caret repair — standalone and embedded browser checks passed.
- [x] N23 readable slash descriptions and richer text formatting — browser persistence and narrow-screen checks passed.
- [x] Multi-block selection and operations — N25–N26.
- [x] Markdown/HTML/CSV exchange with fidelity boundaries — N27–N31.
- [x] Database keyboard navigation and bulk operations — N28–N29.
- [ ] Attachment management and mobile workflow completion.
- [ ] Remaining database capability gaps and common UI exceptions assessed and tracked explicitly.

## Shared whitespace and post-picker caret repair — 2026-09-07

User reports: Backspace appears to move the caret without removing text; page links resist deletion;
repeated spaces collapse and trailing spaces disappear, despite a previous Site repair.

Confirmed causes and scope:
- Note reused the shared text blocks but supplied its own root without whitespace preservation.
  Literal spaces existed in the model/DOM while CSS `white-space: normal` collapsed their display
  and made browser caret positions unreliable. The previous Word-root and Site-CSS fixes did not
  apply to the independent Note root. `office-text/TEXT_FLOW_STYLE` now supplies all three roots.
- The page-reference picker intercepts Enter before the editor keydown handler. Replacing its typed
  query could leave the input handler's old burst offset attached to the same now-empty run, causing
  subsequent typing to target an invalid offset. The shared DOM handler now ends a typing burst
  before non-replaceText commands, including picker insertion and deletion.
- Existing references between text runs already passed Backspace/Delete. Added browser coverage
  for freshly inserted references, subsequent typing, repeated deletion, undo/redo and reload.
  No speculative changes were made to the range-delete model operations.

Pre-fix browser tests demonstrated `normal` whitespace and missing text after picker insertion.
The same literal-space/caret helper now runs in standalone Note and Site's embedded Note. It avoids
whitespace-normalizing assertions, checks computed CSS and checks the exact subsequent edit positions.
This is a shared input acceptance contract to retain when introducing new product roots.

Final verification:
- Note Chromium: 17/17 deletion, navigation and page-reference scenarios (`/tmp/note-input-navigation-final`).
- Note WebKit: 6/6 input/deletion/space scenarios (`/tmp/note-input-webkit-final`).
- Site Chromium: 2/2 embedded input and close/reopen scenarios (`/tmp/site-input-final`).
- Word Chromium: 4/4 IME commit, Backspace, Enter and arrow scenarios (`/tmp/word-input-shared-final`).
- Note package: 28 files / 259 tests. Shared DOM typing regression: 4/4 tests.
- Note app type budget 0/0; shared DOM source tsc passed. Its existing test-type debt remains
  104/104, unchanged. Note production build and diff whitespace check passed.
- An accidental all-browser invocation also attempted unavailable Firefox; its six cases never
  launched. Firefox compatibility is not claimed. The final targeted Chromium/WebKit runs are above.

No live user document was edited for verification. Next product milestone remains multi-block editing,
then the recorded Note gaps, followed by common-module review → Word → Slides → Site.

## Slash-menu readability and selection formatting — 2026-09-07

The prior menu gave labels a shrinking/truncated column beside unrestricted descriptions. The shared
office-ui `MenuActionText` now stacks label and description, and the shared slash menu has a viewport-clamped
320px width. Both lines wrap rather than competing for width. Verified at 390px, including simultaneous
geometry checks after entrance animation completes.

The former four-mark restriction was an early product constraint, now superseded. Note registers existing
shared code/color extensions and exposes code, superscript/subscript, clear formatting, and nine text /
nine background color presets alongside existing marks and links. office-ui owns color choices and icons;
office-editor-ui retains the selection and runs commands. The contextual surface wraps within the viewport.
Font family/size controls and custom color entry are not included in this increment.

Verification: 14/14 Note browser scenarios covering deletion/spaces, formatting/menu, callout text and tables
(`/tmp/note-writing-final`); final focused menu/formatting checks 2/2 (`/tmp/note-format-verified`) also assert
the rendered red text, stored marks, undo, reload and clearing. Both narrow-screen screenshots were inspected.
office-ui source type check and Note production build passed; the existing bundle-size warning remains.

After these Note basics, review document identity, editor lifecycle, shared UI/controls and schema
boundaries before advancing to Word, then Slides, then Site. Account, permissions, server sync and
collaboration remain separate common-service work. Every subsequent delivery checks and updates this
record and docs/ROADMAP.md, with completed behavior separated from unverified implementation.

## N24 — Color controls and writing shortcuts — 2026-09-07

- [x] Shared office-ui color picker: named previews, current-value checks, independent defaults,
  keyboard radio navigation; editor-ui owns range retention and separate floating positioning.
- [x] Shared color removal is idempotent on mixed selections and preserves other marks.
- [x] Markdown direct-typing rules, headings 1–6 and fenced code; one-step undo, literal paste/IME.
- [x] @ workspace-page mention suggestions and existing [[ behavior, excluding emails/URLs/code.
- [x] Heading level selector preserves selection/marks/atoms; additional formatting keeps the bar compact.
- [x] Shared transaction respects explicit ranges after block insertion. Shared keydown skips
  event.isComposing as well as legacy IME signals; Enter/Backspace/Delete regression covered.

Evidence: Note 292 unit tests; input/color/deletion browser 10; heading/mention + existing
page-reference browser 9; transaction focused 22; shared keyboard focused 19.
Note app type budget remains 0/0; production build passes (existing bundle-size warning).
390px color-popover screenshot inspected. Existing repository-wide type debt remains.
Next priorities remain multi-block operations, exchange fidelity and database keyboard/bulk work.
People mentions and complete Markdown parsing are not claimed by these direct-typing shortcuts.

### N24 follow-up — bare fence Enter regression (2026-09-07)

Reproduced a failure converting three backticks in a paragraph with a visual mark and
an empty sibling text run. Prefix rules incorrectly required a single unformatted run.
They now inspect the entire paragraph up to the caret and require an empty suffix,
while refusing inline-code/link contexts and non-text atoms. Inline-mark shortcuts retain
their existing formatted-run restriction. Unit input rules 17/17 and WebKit 4/4 pass.

Chromium Markdown/deletion regression 10/10 and Note app type budget 0/0 also pass.

## N25 — Multi-block operations, first delivery — 2026-09-07

Native text selection crossing root blocks exposes an explicit whole-block action menu built
with office-ui. Move up/down, duplicate and delete preserve ordering and commit atomically;
full deletion supplies a writable paragraph. Common editor-ui invalidates retained selections
whose nodes were removed, fixing a browser crash discovered during batch deletion.
Verified initial batch unit tests 6/6 and Chromium batch + existing formatting browser 3/3,
including undo and save/reload. Note type budget remains 9/9; app 0/0.
Remaining N25 scope: dedicated block-handle selection, group drag, multi-block clipboard.

Final evidence: full Note unit suite 299/299, WebKit batch browser 1/1, production build passed.

## N25 follow-up — grips, group dragging and clipboard — 2026-09-07

- Shift-click grip ranges, block highlights, ordered group drop and atomic undo/redo.
- Shared copyBlocks writes HTML + plain text, reports clipboard rejection, and refuses
  database-resource transfer through HTML. Note offers resource-safe duplication instead.
- Found and fixed Enter after a block-only undo: paragraph insertion must install the
  visible keydown selection before executing its selection-based model operation.
- Full Note unit suite 302/302. Chromium group/clipboard integration 2/2; WebKit input
  and deletion 10/10. Copy tests use a clipboard adapter, leaving the system clipboard alone.
- Remaining: noncontiguous/keyboard range selection, database clipboard resource transfer,
  cross-product exchange fidelity. Next roadmap milestone: Markdown/HTML/CSV exchange.

Final checks: WebKit group/clipboard 2/2; shared clipboard/paragraph tests 15/15; production build passed.

## N26 — File exchange, initial delivery — 2026-09-07

Implemented a package-level Note exchange API plus workspace format choice and file import.
Uses markdown-it 14.1.0 (already used by the repository) and shared HTML conversion, adapting
legacy list nodes to the Note schema. CSV handles BOM, CRLF, quoted delimiters/newlines and
empty cells with malformed quote errors and row/column limits. Unsupported exports report
JSON fallback instead of discarding blocks. JSON stays the default full-fidelity format.
Scope: prose Markdown/HTML and single simple-table CSV; database CSV and wider fidelity pending.
Evidence: Note 306/306 unit tests, Chromium file lifecycle3/3, production build passes.

WebKit exchange lifecycle3/3 also passes. Type budgets unchanged: apps/note0/0, office-note9/9.

## N26 follow-up — Database CSV — 2026-09-07

Database-local CSV menu offers previewed append and all-row value export. Exact field-name
matching, number/boolean conversion, multiline/space preservation, JSON multi-choice arrays,
unknown/duplicate/prototype header refusal and full-file validation happen before mutation.
Append preserves existing records/IDs and adds fresh row IDs in one undoable transaction.
Repeated file selection discards stale asynchronous reads. Relation/formula/rollup import and
item-body/schema backup remain exclusive to full Note data, not CSV.
Focused tests2/2 and Chromium full UI lifecycle1/1 pass, including rejection, undo/redo, reload
and downloaded values. Next priority remains database keyboard navigation and bulk operations.

Final evidence: full Note308/308, WebKit CSV1/1, build passed, type budgets unchanged (Note9/9, app0/0).

## N27 — Database table keyboard and bulk actions — 2026-09-07

Added directional navigation for display cells, with input/IME/popup boundaries. Visible row
selection and select-all use stable row IDs; filters clear hidden selections. Bulk scalar
updates and removal are atomic; removal includes item bodies and undo restores them.
Stale IDs and readonly requests refuse changes before mutation. Shared office-ui controls
and icons are reused. Advanced properties and spreadsheet-style range paste remain pending.
Evidence: full Note311/311; focused bulk3/3; Chromium bulk lifecycle1/1 and CSV regression1/1.
Build passed; original Note type debt9/9 is unchanged.

Final: WebKit bulk lifecycle1/1 passes; hidden row retained after deleting visible selection. App type budget0/0.

## N28 — Advanced properties in bulk editing — 2026-09-07

Implemented relation and multi-choice drafts with replace/add/remove modes; choices now have
a searched checkbox menu instead of a JSON input, and the field-type menu exposes choices.
Formula/rollup toolbar choices open existing validated configuration, clearly scoped to all
rows; computed cells remain read-only. Final collection values are validated for relation
cardinality/target existence before committing. Tests cover preserved choices, targeted removal,
formula→rollup recomputation and undo, plus UI settings and reload.
Evidence: full Note312/312, focused advanced/bulk7/7, Chromium bulk2/2, build passed.

Final browser regression: Chromium4/4 and WebKit4/4 passed (advanced settings, bulk advanced, saved views, scalar bulk). Firefox could not launch because its Playwright executable is not installed. WebKit revealed activeElement was an unreliable popup anchor: add-field and bulk configuration now pass the actual trigger; Escape restores the view trigger. Shared Button click typing exposes its native event, and the motion fixture now supplies a real DOMRect. office-ui117/117; type budgets Note9/9 unchanged and office-ui0/0.

## N29 — Cell-range paste — 2026-09-07

Implemented tab-delimited clipboard range paste from a focused display cell using visible row
identities and columns. Validate every value before one transaction; reject overflow/stale IDs/
computed and relation targets with actionable errors. Keep native input paste, preserve text
whitespace and quoted line breaks, and restore grid focus for undo. No automatic row insertion.
Evidence: full Note315/315, Chromium range lifecycle1/1, build passed; Note type debt9/9 unchanged.
Body inline/block LaTeX equations are a separate pending requirement, not database formulas.

Final: WebKit range lifecycle1/1 also passed; final Note type budget9/9 unchanged.

## N30 — Body LaTeX equations — 2026-09-07

Implemented slash/block insertion entries for inline and block equations. office-text owns
LaTeX atom rendering placeholders and insertion/source commands; office-editor-ui owns KaTeX
rendering and a shared office-ui Dialog for source editing, preview, cancel and apply. Source
persists in the Note tree, not generated HTML. Re-editing after render uses dedicated portal
mounts and pointer isolation to avoid lost WebKit clicks. Inline insertion handles run boundaries
and preserves suffix text with one undo. Invalid syntax disables Apply; trust is disabled.
Evidence: full Note319/319; shared preview3/3; Chromium1/1 and WebKit1/1 lifecycle checks;
Note build passed. Type budgets Note9/9, editor-ui2/2 unchanged; office-text0/0 after correcting
two existing fixture casts. Dollar-sign shortcuts, cross-run inline replacement and Markdown/HTML
math exchange remain pending. Note native format and workspace reload are covered.

Final polish: math slash entries consume their trigger in the same insertion transaction. WebKit lifecycle and focused math/contract9/9 passed after this change.

## N31 — Math exchange, writing interactions and direct equation controls — 2026-09-07

Implemented `$...$` inline input, Markdown inline/block equation import/export, and token-aware
code/escape handling. Added the missing shared HTML blockquote parser registration for nested
Markdown quotes. Round-trip validation rejects ambiguous math boundaries and unsupported custom
presentation. Slash activation now follows actual input, not cursor revisions; Escape remains
closed. Empty paragraphs and existing text are browser-covered. Paragraph/heading settings use
the shared alignment command, with readonly and enum guards.
Equation click now opens shared office-editor-ui context controls for size (16–48px), block
alignment and source editing. Defaults 18px inline/24px block; changes apply immediately and
persist. The source dialog remains for TeX preview/edit. WebKit click handling now selects the
context on pointerdown, avoiding the prior reload/re-edit click loss.

Evidence: full Note329/329, shared alignment5/5, final Chromium7/7. WebKit dollar/slash, alignment and four exchange cases passed; the revised context/source lifecycle also passed1/1 after fixing the earlier click loss. Note build passed; editor-ui type debt2/2 unchanged.

## N32 — Direct alignment and equation selection — 2026-09-07

Left paragraph/heading block menus show four alignment buttons immediately, with active state and labels.
Inline equations have editable text boundaries on insertion, dollar conversion and loading; normalization
is idempotent. Shared arrow navigation reads live DOM selection, fixing WebKit click/selection timing.
Dragged selection paints each whole equation once without exposing KaTeX layout span highlights.

Validation: Note unit tests330/330; Chromium equation lifecycle, caret, range paint and direct alignment4/4;
WebKit direct alignment passed, followed by both caret/range tests2/2 after the DOM selection fix.
Package tsc remains blocked by existing repository type errors; no errors reported in the changed files.
Final Chromium caret/range/direct-menu rerun3/3 and Note production build passed.

N32 follow-up: shared office-ui Button/IconButton selected states keep accent ink and darken the accent on hover/press. Fixed quiet-tone hover overriding the selected background. Chromium direct-alignment/persistence test now also verifies selected hover colors; passed1/1.

## N33 — Basic-product completion audit — 2026-09-07

Reviewed existing input/deletion, whitespace, callout, table, database, selection, exchange,
workspace conflict and recovery scenarios. Added an isolated 500-paragraph browser scenario
covering editing, deletion, grouped undo/redo and reload persistence.

Fixed validation drift: slash tests now type the trigger; downloaded-file reimport retains its
real filename; toolbar checks include inline math and require a selection for clear formatting.
Math normalization tests compare document semantics instead of changing load timestamps.
Removed all 11 Note-owned test type diagnostics and lowered the ratchet from9 to0.

Evidence: full Note330/330; Note test type check0/0; production build passed (existing bundle size
warning remains). Initial complete Chromium run110/115; all five failures subsequently passed
in targeted runs after three test corrections. The added 500-paragraph scenario passed in both
Chromium and WebKit. WebKit deletion/IME-event/whitespace, paste, recovery and long-document11/11.
No user documents were changed. Synthetic composition checks do not certify real OS IME behavior;
500 paragraphs establish functional coverage, not a production latency SLA.

Status: desktop local editing has a verified baseline, not full Notion parity or service launch.
Remaining product work: attachment lifecycle, end-to-end touch/mobile workflow, cross-document
and reciprocal relations, broader formulas and supported exchange fidelity. Remaining release
work: real-device IME/accessibility checks, larger-document profiling and shared dependency type
debt. Accounts, server storage/sync, permissions and collaboration remain service work. Proceed
with shared-module review against this baseline; keep these gaps visible for release planning.

Final stability check: the two initially intermittent scenarios (hovered-block insertion and recovery-save failure) each passed five consecutive Chromium runs10/10. Their initial full-run failures are retained above; no unconditional full-suite-green claim.

## N34 — Independent prose columns — 2026-09-07

Implemented shared proseColumns/proseColumn definitions and Note integration. Slash2/3/4 create
columns; a shared context toolbar changes count, adjusts widths, moves selected blocks and flattens
the layout. Boundary dragging previews width and commits one change on release. Native block drag
and a keyboard-operable destination selector move blocks between columns. Empty source columns
retain an editable paragraph. Reducing the column count and flattening preserve content order and
undo. Narrow viewports stack columns without modifying stored weights. No nested insertion.

Evidence: Note331/331; Note type ratchet0/0. Chromium lifecycle passes actual block drag and
boundary drag, reduce/merge/undo/reload/mobile stacking. Existing shared dependency type errors
remain; no diagnostic points to the new columns files. Native JSON is the layout interchange format;
Markdown/HTML layout export and cross-product layout adoption remain future work.

WebKit full column lifecycle passed after supporting mouse events following native block drag (WebKit suppresses the corresponding pointer path in this sequence). Drag preview retains its calculated weight independently of renderer refreshes. Production build passed.


### 2026-09-08 — Math editor integration follow-up

- Retained existing shared `LatexEditor` / `MathSourceEditor` integration; parser and structural model belong to `math-editor`.
- A popup owns one math session across source/visual switches. Source imports are undoable and invalid imports preserve source and the prior visual draft. Merely opening does not canonicalize stored LaTeX.
- Empty formulas open visual editing on click; existing formulas support double-click and Enter. Single-click retains contextual size/alignment tools.
- Both inline and block formulas expose common structure tools, with expanded tools on demand. Apply/Cancel remain visible while the modal body scrolls.
- Verification: browser6/6 across scoped runs, Note command/exchange/input units36/36, preview units3/3, math-editor and Note builds passed. Updated existing browser tests for the direct blank-formula flow and current parser support (named functions now load; unsupported color syntax tests fallback).
- Shared TypeScript check still reports pre-existing dependency diagnostics; changed math UI files have no diagnostics. Arbitrary TeX support, direct in-document structural editing, and whole-product certification are not claimed.


### 2026-09-08 — Math popup usability correction

The native surface did not match the product site's rich React editor. Note now mounts React MathEditor and uses its importLatex handle, retaining it across source tabs. Site tools, templates, symbol browser, token hints and descriptive suggestions are preserved. Common RibbonTabs replace mode buttons; modal font-size editing is removed and preview is fixed18px. Common portal geometry handles transformed modal hosts, clipping and stable direction. Input selection wrapping supports arrows/Enter and active-option scrolling. Inactive tabs suppress portals through showPopovers.

Validation: Note workflows4 checks, popup geometry/keyboard3 checks, standalone math-demo React import2 checks; package and Note builds. Shared TypeScript baseline diagnostics remain outside the changed math UI files.


### 2026-09-08 — In-place math and keyboard ownership

Note edits math directly in its document, with local draft history and one host transaction on delivery. The shared DOM view excludes nested editor input/composition/selection/mutations. Focused math hides host context tools; the host no longer duplicates fraction/root/power controls. Input and preview fonts share the same size variable, including scripts. Apply/cancel, outside delivery, popup handoff and persistence are verified. Note browser14/14 across scoped runs, DOM input regressions78/78, math-demo2/2 and both builds pass. Shared TypeScript baseline diagnostics remain; actual OS IME testing is still open.


## 2026-09-08 — Desktop local-editing phase closed; Word is next

The user requests closing the current Note feature pass and proceeding through Word, Slides and Site. Close the desktop local-editing baseline, retain regression/data-loss fixes, and move new product delivery to Word. This does not claim full Notion parity or a released service.

Fresh verification: office-note units332/332; selected browser scenarios initially19/20 across daily authoring, item-body delivery, storage conflicts/recovery, database range paste, columns and in-place math. The block conversion scenario timed out while its page reloaded during the menu click; two separate repeats passed2/2. Retain the initial failure in this record. Note production build passed, with the existing bundle-size warning. This was not a full browser-suite rerun or a real-device IME/mobile/accessibility certification.

Deferred product work: attachment lifecycle; mobile/touch and accessibility; cross-document/reciprocal database relations; broader formulas and exchange fidelity. Release work: real OS IME, long-document performance thresholds and shared TypeScript debt. Service work: account/team, global document identity, permissions, server persistence/sync, sharing and collaboration. See docs/specs/product-phase-handoff.md for explicit next-product gates.
