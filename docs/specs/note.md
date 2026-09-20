---
work_id: note-product-foundation
artifact_type: product_spec
status: ready_for_build
owner_role: integration
source_request: "One office service, Note first, Notion-level writing with contextual editing tools."
last_updated: 2026-09-07
---

# Note product specification

Note is the first editing product of one office service: **Note → shared-module review → Word → Slides → Site**, followed
by additional products. Its target is Notion-level writing, knowledge organization and data work.
The first milestone is a meeting note that can be written, structured, closed and reopened without
losing content. The active package-agent work record is
[Note product foundation](../../.dev/plans/note-product-foundation/brief.md).

## Product boundaries

- `office-note` owns the writing schema, commands, editing session and contextual view.
- `schema` and `office-text` own reusable prose definitions and renderers. Note and Site opt into
  task items, disclosures and callouts; Word and Slides need not admit these node types.
- `apps/note` owns the document list, title, file interactions and storage lifecycle.
- Shared `documentLibrary` owns IndexedDB access. Account, permission, collaboration and cloud
  persistence will belong to the common service rather than a separate Note service.
- `/?lab=1` retains the original multi-editor fixture for regression checks. `/` is the product.

## Writing contract

A note contains a sequence of the blocks below and may contain a resources region. A nested
callout or disclosure must obey the prose content contract rather than admitting arbitrary canvas
or form nodes. Every admitted block needs a renderer and a user-facing insertion route.

<!-- note-contract -->
```json
{
  "blocks": ["heading", "paragraph", "list", "blockQuote", "codeBlock", "bTable", "noteDatabase", "horizontalRule", "picture", "mediaVideo", "mediaEmbed", "taskItem", "bDetails", "callout", "mathBlock", "proseColumns"],
  "commands": ["replaceText", "insertChecklist", "toggleChecklistItem", "insertDetails", "toggleDetails", "insertCallout", "insertTableBlock", "mergeCells", "splitCell"],
  "insertion": ["insertHeading", "insertBodyText", "insertBulletList", "insertNumberList", "insertQuote", "insertCode", "insertTableBlock", "insertNoteDatabase", "insertRule", "insertPicture", "insertVideo", "insertEmbed", "insertChecklist", "insertDetails", "insertCallout"],
  "tableKeys": ["Tab", "Shift+Tab"]
}
```

`test/spec-numbers.test.ts` keeps its historical filename but checks these product capabilities.
It no longer enforces source-line counts, a three-node ceiling or a two-shortcut ceiling. Earlier
measurements described an architecture demo and must not prevent product features from growing.
Behavioral and compatibility regressions remain test failures.

## Contextual editing

Shared module boundaries and visual rules are defined in [Office contextual UI](./contextual-ui.md).
Note supplies its commands and block properties to shared components instead of owning popup styling.

The product has no permanently visible formatting toolbar. Selecting text reveals formatting
controls near that selection; a caret alone does not. Block insertion uses the slash menu and an
adjacent add affordance. Clicking a block handle opens its action menu; block settings explicitly open the relevant properties.
All controls belong to the active editor instance and preserve the selection they operate on.
An explicit always-visible toolbar remains available in the regression lab.
Text formatting takes precedence over block properties. Properties follow nested blocks too,
can be dismissed, and never redirect field-editing keys into document deletion. Escape closes
the adjacent insertion menu. Pointer selection in the slash menu runs the clicked item.

- A checklist's checked state belongs to the document and participates in undo/redo. Enter creates
  an unchecked following item. Enter on an empty item exits to a paragraph.
- A disclosure has an editable `bSummary` followed by prose. `bDetails.open` is stored and
  undoable. Enter from its summary moves into its body rather than duplicating the summary.
- A callout has a type, an editable `calloutTitle` child and prose body blocks. Title runs use the
  same selection, formatting, links and history as body text. Legacy `attributes.title` is migrated
  on Note load/import; a canonical child takes precedence. Properties edit the callout type.
- Table selection, merge/split and keyboard navigation remain available.
- Block handles expose conversion, duplication, indent and outdent. Marks and links survive
  conversion; required callout/disclosure title and body boundaries cannot be broken by a move.
- Code blocks accept literal newlines, tabs and clipboard text. Language is stored with the block.
- Existing links can be inspected, changed and removed without losing their selected text.
- Simple tables expose header promotion, row/column insertion and deletion, cell color, themes
  and column width. Bottom drag growth commits once and can be undone once.

## Content typography

Ordinary Note documents and database item bodies share the same reading defaults: 16px text,
1.7 line height, 12px paragraph separation and a larger gap before section headings. Headings use
a distinct size and tighter leading. Lists, nested lists, tasks, disclosure bodies and callout text
follow the same baseline rhythm; code retains monospace text and literal whitespace with its own
padding and horizontal overflow. Korean prose wraps at word boundaries when space permits.

These are presentation defaults owned by `office-note`, independent of the smaller UI control
type scale. The shared renderer accepts default spacing through `--prose-space-before/after`;
explicit document spacing, including zero, takes precedence. Hosts without these variables retain
zero paragraph spacing, preserving Word's document layout.

## Databases and item editing

A database block points to a named dataset in the note's resources. The shared schema uses Site's
`dataset {name, fields, records}` structure and typed fields; table, board, gallery and calendar are views of those
same records. Filtering and sorting retain the original record index for edits. Site embedded
notes carry their local resources and export databases as readable HTML tables.

Opening an item in any database layout opens an item page in the shared `office-ui` `SidePeek`.
It is nonmodal, with no scrim: the database behind it remains interactive. The top rail contains
close/expand, the database breadcrumb, previous/next visible item navigation and an item menu for
independent duplication or deletion. The panel supports pointer and keyboard width resizing.

The page flows from a large, borderless multiline title through compact property rows to an actual
Note block body. Resting values are plain text, status chips or an empty-value affordance; clicking
a value opens its typed editor. Enter/blur commits, Escape cancels the active draft, and composing
Enter must not commit an unfinished IME input. Column headers and property labels open a contextual
field popup for name, type and choice options. Adding a property makes it available to all records
without replacing the item page. Portalled choices belong to their field popup and do not dismiss it.

Item bodies reuse `NoteEditor` and its ordinary block editing, selection and history. Stable item
IDs connect records to resource-backed prose; body saves use the item identity rather than a stale
row index. Closing, switching, duplication and file/reload persistence preserve the item body.
Site's existing modal `Drawer` remains a separate consumer and is not changed by this Note flow.

Supported types are text, number, date, checkbox, choice, relation, formula and rollup. A type
change must not silently discard an existing value. Relations target a dataset in the same Note
document and persist stable item IDs, not row positions or labels. Their searchable picker supports
one or multiple linked items, removal and opening an item in the existing SidePeek. Opening a
related item requires its database block to be present on the page; unavailable targets show an
explicit error. Rapid selections are queued against the latest selection and failed saves roll back.

Rollups select a relation, target property and count/sum/average/min/max. Formulas use an explicit
Apply step with property insertion, syntax errors and first-item result preview. The bounded parser
supports `prop("Name")`, arithmetic/comparisons, `if`, `empty`, `concat`, `round`, `abs`, `min`, `max`
and `toNumber`; this is a documented subset, not the full Notion formula language. No `eval` or
dynamic function execution is used. Calculation returns derived values and per-cell errors without
writing over raw records. Deleted references, cycles and invalid values remain visible errors.
Dependent property renames update references; unsafe property deletion is refused with a reason.

Each database block owns named table/board/gallery/calendar views, with independent nested AND/OR
filters, ordered multi-property sorts, grouping and a visible-property list. The title stays visible so every item remains accessible;
the SidePeek always shows all properties. Views can be created, renamed, duplicated and deleted
(except the last view). Older scalar settings open without migration writes. A shared schema reader
normalizes saved views for Note and static Site rendering, including hidden properties. View changes,
field changes and row operations participate in history and file/local persistence. Site's generic
data editor preserves advanced metadata and displays calculated values, while refusing unsupported
advanced edits; advanced configuration belongs to Note's field editor.

Gallery views offer small, medium and large cards with optional previews from the actual saved item
body, including its first supported image. Disabling previews or opening an empty body leaves no
large placeholder. Titles remain keyboard-accessible and open the same SidePeek item page.

Calendar views retain a date property per saved view, with month navigation and a Today action.
Adding on a day initializes that date; dragging an event reschedules through one undoable model
operation. Pending date writes lock further drags and rejected writes remain visible errors. Missing
or invalid dates remain in an accessible unscheduled list. An explicitly unset date property does not
silently select another field. Civil dates use the written date rather than timezone conversion.

The layout/query batch passes browser editing, native date drag, view isolation, reload and 390px
viewport checks. Shared Site output uses the same query and renders a readable table for all layouts.

## Page references and backlinks

Typing `[[` followed by a page title opens a contextual page picker. Arrow keys and Enter select a
page; Escape leaves the typed text alone, and IME composition is not interrupted. References are
inline `pageReference {pageId, title}` atoms. The page ID is authoritative and the stored title is a
readable fallback; the workspace resolves current titles without rewriting every referencing file.
Click or keyboard activation opens the page, including a read-only trash page that can be restored.
Missing targets are visibly unavailable. Search excludes trash while existing references retain
their IDs. Ordinary URLs and text resembling `[[...]]` do not create backlinks by inference.

Backlinks appear below a page's title with the referring page, count and surrounding text. Their
index is derived from actual references in live pages, excluding inherited trash. Database item
bodies are visited only through reachable database blocks and stable live row IDs, with local
resource scope respected. Deleted/orphan bodies do not create ghost backlinks, and multiple views
of the same dataset do not double-count them. Backlink navigation can reopen the originating item,
including a chain of nested items. Browser back/forward and inline navigation flush child editing
sessions from the innermost body outward before replacing the page.

Page references use an optional host contract on `NoteEditor`. Embedded hosts without a workspace
still render the stored title and can preserve the node in their document/HTML. Clipboard HTML
preserves the page ID and title in escaped data attributes; a schema that cannot admit the node
receives readable title text. Page references never generate executable or guessed external URLs.

## Document lifecycle

The product supports create/list/title/switch, local autosave, refresh recovery, JSON export and
file import. A document's stable identifier is independent of its title. A rapid switch must flush
pending changes to the old document, and the new document must never receive the old body.

The library supports title/body search, favorites, child pages, parent changes, trash and restore,
and blank/meeting/project templates. Page metadata is stored alongside the document in the shared
library record. Moving a page under itself or its descendant is refused. Trashing a parent hides
its subtree; restoration preserves the hierarchy. Search and favorites do not expose trashed pages.

A save is successful only when the IndexedDB transaction completes, not when its individual write
request succeeds. Aborts/errors must not display saved. Keep unsaved in-memory work available for
retry or file export. A reload while work is pending may require waiting for storage; this slice
provides no server durability guarantee.

Local saves compare the loaded revision and write inside one IndexedDB transaction. A stale tab
preserves the newer original and stores its own work in a separate recovery library. The conflict
status distinguishes this from a normal save. Readers can open the latest original, export their
draft or recover it as a new page after reload; self references are remapped to that new identity.
Recovery deletes the draft only after its replacement is durably stored. If draft storage fails,
unsaved work stays pending and the latest-version switch is blocked until retry/export. Reopening
the latest version creates a fresh editor session for both its title and body. This does not add
server synchronization or collaborative merge.

Imports must reject malformed or unsupported trees visibly without overwriting existing notes.
An unreadable stored note must not prevent opening healthy notes. Retain its original data and
provide original-file export and a reason for the failure, even if every stored note is unreadable.
Export/reimport must preserve supported text, marks, checkbox state, disclosure state and callouts.

New page files carry `note.attributes.pageId`; older files without it remain supported. Loading an
existing library row uses that row's identity, and renaming a page preserves the ID. Import into a
different library preserves a free file ID, allowing connected files to be imported in either order.
An occupied ID, including an unreadable original, creates a new page without overwriting that row;
only references to the imported page itself are remapped to the copy. Unrelated references remain
unchanged, and titles are never used to guess identity. This transfers references through files,
not through cloud sync; an absent target stays unavailable until the target page is imported.

## Session close

`NoteSession.close()` synchronously delivers the latest pending blocks to `onChange` before
releasing the editor. Normal editing still batches changes after an idle delay (350ms by default;
the product host may override it). Untouched and already-delivered sessions do not send again.
Repeated or reentrant close is harmless. Callback errors propagate, with editor cleanup guaranteed.

Delivery to `onChange` is not a disk/server persistence guarantee. The host owns storage and close
has no promise for asynchronous work the host starts. Site scopes its callback to the host/body so
closing an old session cannot send pending blocks to the next body.

## Evidence and remaining roadmap

- `packages/office-note/test/session.test.ts`: final edit delivery, reopen, repeat close and errors.
- `packages/office-note/test/writing-blocks.test.ts`: new block commands and round-trip behavior.
- `packages/schema/test/prose-schema.test.ts`: nested structure and opt-in vocabulary boundaries.
- `packages/office-site/test/prose-export.test.ts`: shared prose in exported Site HTML.
- `apps/site/tests/note-close.spec.ts`: real drawer close/reopen with idle delivery held back.
- Browser and package run results are recorded in the active work record after integration.

Current integration evidence covers writing, page organization, page references/backlinks,
related/computed database properties and named views in the active work record. Gallery/calendar,
compound filters, multiple sort priorities and local save-conflict recovery pass their browser checks.
Single-paragraph/inline paste across paragraph, list, callout and disclosure containers preserves the
unselected text, marks and required wrappers, with exact Undo/Redo. An explicit operation caret also
applies when the command receives its range before the editor's model selection is populated. Multi-block
clipboard fragments and table/resource boundary crossings remain outside this supported replacement path.
Final integrated Note browser scenarios pass 34/34; package tests pass 257/257. The active work record
records broader compatibility checks and remaining implementation boundaries.

Whole-library backup/restore now includes a preview, atomic insert-only restore, collision copies,
hierarchy/favorites/trash metadata, remapped internal references and unreadable original files. Recovery
drafts restore as independent new pages. Existing page bytes are never overwrite targets. Backup flushes
deepest item bodies and waits for local storage; it reads drafts before pages to cover concurrent
draft-to-page recovery. A stale restore preview is re-planned after a revision conflict without partial writes.

Current integration passes 46 runner scenarios (39 browser + 7 archive unit checks), and Note package
tests pass 258/258. Shared UI controls, icons and reduced-motion-aware transitions are described in
[the UI contract](contextual-ui.md). The [workspace architecture recommendation](office-workspace.md)
keeps specialized editor models within one future service; current product apps still have separate libraries.

Document navigation now provides current-body find, case sensitivity, wrapped next/previous matches
and a live heading outline. Adjacent formatted runs form one searchable phrase; blocks and inline
objects remain separate. The main body excludes database resource definitions, and each opened item
body has its own Cmd/Ctrl+F scope. CSS Highlight ranges are transient; the model, saved content and
undo history do not contain search state. Closed disclosures are temporarily revealed and restored
when navigation closes. On browsers without CSS Highlight support, the current matching block still
has an outline; full range highlighting depends on that browser capability. Find-and-replace and
workspace-wide database-content search are not part of this feature.

Text-flow correctness is shared, including the root wrapper: Note uses office-text's
`TEXT_FLOW_STYLE`, as do the common document renderer and Site page CSS. Repeated and trailing
spaces must remain visible and addressable by the caret. This is an editing requirement, not a
product theme. `test-support/prose-input.ts` checks literal spaces, subsequent insertion and
Backspace in standalone Note and Site's embedded Note; whitespace-normalizing text assertions
alone cannot verify this contract. Picker commands also terminate the DOM input layer's previous
typing burst, even when the picker intercepts Enter before the editor's keydown handler.

Selected text offers bold/italic/underline/strike, inline code, superscript/subscript, links,
text and background colors, and clear formatting. The shared color menu currently offers nine preset
colors for each purpose, with previews, names, active-state checks and independent defaults in a
separate keyboard-accessible popover. Superscript/subscript and clear formatting are under
additional formatting; paragraph/heading levels 1–6 are directly selectable. Font families and font sizes remain document typography choices. The old
four-mark restriction is superseded. `office-ui` supplies color choices and two-line menu label/description
layout; `office-editor-ui` retains selection and dispatches commands; Note declares its supported tools.

Multi-block operations, Markdown/HTML/CSV exchange, database keyboard and bulk operations are implemented.
Remaining Note milestones include cross-document and reciprocal relations;
attachments; and mobile workspace usability. Broader formula coverage remains unfinished. Accounts,
server sync, permissions, collaboration and service launch remain separate, unimplemented
common-service work.

### Markdown typing and page mentions (N24, 2026-09-07)

On a plain paragraph, `#`–`######` plus Space creates headings; three backticks with an
optional language plus Space or Enter creates a code block. Backticks around text create inline
code; `**text**`, `*text*`, and `~~text~~` create bold, italic, and strike. Prefixes `>`,
`-`/`+`/`*`, `1.`, and `[ ]`/`[x]` plus Space create quotes, lists and tasks.
Typing conversions are one undoable transaction and leave subsequent inline text unformatted.
They deliberately skip paste and IME composition. Inline-mark rules skip already formatted
runs and cross-run syntax. Whole-paragraph prefixes accept visual marks and split text runs,
but exclude code/link marks, inline atoms and text after the caret.
`@` opens current-workspace page suggestions; `[[` remains supported. Emails, URLs, escaped
triggers and inline code are excluded. People/date mentions require separate entity support.
Heading conversion preserves selected text, marks and inline objects across undo and reload.

### Multi-block operations (N25, first delivery)

A text selection crossing top-level blocks exposes an N-block menu. Its explicit actions apply
to the entire intersected blocks: move up/down, duplicate and delete. Order is preserved and
each action is a single undoable transaction. Deleting all blocks leaves a writable paragraph.
Database duplication reuses resource-copy semantics. Native text deletion is unchanged.
Dedicated block-handle selection, group dragging and multi-block clipboard remain pending.

### Block grips and clipboard (N25 follow-up)

Click a grip to anchor a block; Shift-click another grip selects the contiguous root-block
range and highlights it. Drag a selected grip to move the group, preserving order. Escape
clears the selection; undo/redo is available while the grip owns keyboard focus.
The N-block menu copies HTML and plain text through the shared copyBlocks command.
Browser tests verify bold text survives paste. Clipboard denial reports failure. Database
blocks intentionally disable clipboard copy; use resource-preserving block duplication.
Noncontiguous selection, resource-bearing database clipboard and cross-app fidelity remain pending.

### File exchange (N26 initial delivery)

File open accepts Note JSON, .md/.markdown, .html/.htm and .csv; imports create new pages.
Export format choice keeps Note JSON as the full-fidelity default. Markdown supports basic
paragraphs, headings, lists, quotes and fenced code; unsupported marks/objects refuse export.
HTML supports basic prose and inline formatting, while unsupported blocks require Note JSON.
CSV imports quoted multiline records into a simple table; export requires exactly one unmerged
table and serializes cell text. Database CSV, table styles in exchange and full Markdown dialect
coverage remain unfinished. Imported HTML removes active elements/event attributes and unsafe
URL protocols before parsing. Browser file tests verify import, download, new-page reimport and reload.

### Database CSV (N26 follow-up)

Each database has a CSV menu. Imports use exact unique field names from the first record;
unknown, duplicate, computed or relation headers refuse the import. Numbers and booleans
are parsed explicitly, text whitespace is preserved, choices use JSON string arrays. The
preview reports row count and requires an append action; one transaction appends records
with fresh row IDs, leaving existing records and IDs intact. Invalid rows abort the entire file.
Export includes all fields and all computed records regardless of filters, as quoted UTF-8
CSV with BOM. This is a value export, not a database-definition or item-body backup.
Relation IDs/computed values can be exported but cannot be imported into those field types.

### Database table navigation and bulk operations (N27)

Display cells accept arrow navigation in visible row/column order. Enter opens the focused
cell control; native inputs, IME and popup editors retain their key handling. Row buttons
and select-visible-all track stable item IDs. A visible selection toolbar applies one draft
property value or deletes selected rows in a single transaction; deleting item bodies is part
of the same undoable operation. Hidden/stale selections are removed from the active set.
Bulk UI supports ordinary scalar properties; relation/formula/rollup/choices/richText are
excluded. Non-table selection, spreadsheet range paste and advanced batch property editing
remain out of scope. Existing native Tab navigation is retained.

### Advanced database batch properties (N28)

Multi-select now has an option picker with search, checked states and clear-all in cells,
item pages and batch drafts. The field settings expose multi-select type and options.
Relations and multi-select support batch replace/add/remove; single relations hide append
and model validation rejects invalid cardinality or missing targets before mutation.
Formula and rollup can be selected in the batch toolbar to open their field configuration;
the UI states that configuration applies to all rows and disables direct result assignment.
Scalar/relationship changes recalculate formula and rollup results, including undo and reload.
Rich-text bulk edits remain excluded. Cell-range paste is specified below.

Configuration popups use the clicked trigger as their anchor, including WebKit where pointer
clicks do not necessarily move focus. Closing the saved-view menu with Escape restores its trigger.
Verified in Chromium and WebKit across advanced configuration, batch editing, undo and persistence.

### Cell-range paste (N29)

Focus a displayed database cell with Tab/arrow keys (Escape exits a text draft), then paste
spreadsheet TSV without headers. Values follow visible row order and visible columns from
that cell; hidden rows/columns remain untouched. Quoted tabs/newlines and empty trailing cells
are preserved. All values validate before one transaction: number, boolean, choice and choices
are checked; formula, rollup, relation and rich-text targets reject the entire range.
Overflow refuses changes with instructions to add rows/columns first. Text inputs retain native
paste. A successful paste returns focus to the grid; undo/redo restores the whole operation.

### Body math (N30)

Database formulas calculate record values. Body equations are a distinct inline/block LaTeX
feature requiring an entry point, preview/error feedback, re-editing and save/undo coverage.
Note exposes `/수식 블록` and `/인라인 수식`. Clicking an atom opens shared context controls
for size, block alignment and source editing. The source button opens the office-editor-ui
dialog for LaTeX, preview and apply. Invalid input disables Apply; Cancel keeps
the saved source. office-text owns insertion/source commands and placeholder renderers; the
shared UI uses KaTeX with trust disabled and bounded expansion. The Note format retains TeX
through save/reload and history. Word's OMML editing remains a separate representation.
Inline insertion supports one text run (including a selection within it); a selection spanning
runs is refused. HTML math exchange remains pending. Dollar shortcuts and Markdown exchange
are implemented below.

### Writing interactions and equation controls (N31)

Typing the closing dollar in `$x^2$` converts a plain text run into inline math atomically.
Escaped dollars, double dollars, edge whitespace, code and composition/paste remain literal.
Markdown import/export supports inline `$...$` and fenced `$$` blocks, including list/quote
nesting. Code remains literal; exported ordinary dollar signs are escaped. A round-trip boundary
check refuses ambiguous adjacent equations or following digits rather than dropping math.
Custom math size/alignment and paragraph alignment require Note JSON for lossless exchange.

Slash menus open only following a direct slash input, including an empty paragraph. Selecting
existing slash text does not open them. Escape closes and stays closed through cursor movement
and typing a query; a newly typed slash opens a new menu. The shared UI scopes input to its editor.

The first screen of the left paragraph/heading block menu provides left/center/right/justify through the shared alignment
command and renderer, with atomic history. Readonly/invalid alignment requests are refused.
Equation context controls offer 16/18/20/24/32/40/48px and block left/center/right alignment with
immediate application. Defaults are 18px inline and 24px block. Size/alignment persist in Note
format, and source editing retains these attributes. Inline math follows its paragraph alignment.

### Equation selection and caret boundaries (N32)

An equation remains a single inline atom, even when its TeX contains a fraction, sum and exponent.
Native text selection paints one background across the formula; individual KaTeX spans have no
separate selection paint. Source editing remains in the equation dialog. Leading/trailing and
adjacent math atoms receive empty editable text boundaries on insertion, input conversion and
loading. Arrow navigation uses the live DOM selection to avoid stale model offsets after a click.

### Independent prose columns (N34)

Slash entries 2단/3단/4단 create independent block containers. The shared office-text module owns
schema definitions, renderers and atomic insert/count/weight/move/flatten commands; office-editor-ui
owns column controls, drag targets and responsive presentation. Note opts into the shared vocabulary.
Click inside a column to expose its toolbar. Drag a column boundary or adjust its weight slider;
drag the selected block handle into another column or use its destination selector. Changing count
adds empty columns or moves removed columns' blocks into the last retained column in reading order.
Flattening moves all blocks into the parent in left-to-right order. No content is deliberately discarded.
At <=640px columns stack; desktop weights persist. Insertion inside existing layouts is refused.
Note JSON preserves the structure; Markdown/HTML export does not yet encode this layout.

Site integration inventory (2026-09-19): 319 browser test declarations. This count is not a claim that every scenario has passed in the current run.
