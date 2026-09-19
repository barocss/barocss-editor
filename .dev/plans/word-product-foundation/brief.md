# Word product foundation

Product order: Note → shared-module review → Word → Slides → Site.

Current checkpoint (2026-09-13): table work remains paused at W6b-15.
W6c-1 format painting and default page geometry, W6c-2 paragraph styles,
W6c-3 bookmarks/cross-references, W6c-4a DOCX styles and W6c-4b DOCX bookmarks/REF
fields are delivered within the scopes below. W6c-5 writing/review acceptance passed
for the desktop Chromium flows below. Accessibility acceptance is deferred by user request.
W6c-6 caption insertion/automatic numbering and W6c-7 caption tables of figures are delivered.
W6c-7 also connects body-picture resize handles. W6c-8 adds caption-specific cross-references.
Product focus now moves to Slides by user decision. DOCX SEQ/TOC and caption-reference exchange remain deferred follow-up work. Continue Word input/storage regression fixes.
Word → Slides → Site remains the product order. The dated sections retain historical
results; current acceptance is in `docs/specs/word-toolbar-capabilities.md`.

Shared-module checkpoint: continue to reuse office-ui controls/dialogs, office-icons,
office-editor-ui file/selection UI, office-text writing commands and shared documentLibrary.
Note prose columns must not replace Word's paginated section columns. Word's existing pagination,
ribbon, ruler, page setup, tables, comments and tracked changes are the starting implementation.
No full-product or DOCX compatibility claim follows from their existence.

## W1 — Document library entry point

Connect existing Word library APIs to visible save-copy and library-open actions. Library entries
persist in IndexedDB. Before opening a stored entry, save the currently displayed document as an
independent snapshot. A failed read/save prevents replacement. Use explicit snapshots until stable
workspace document identity and conditional revision writes are integrated; do not imply autosave.
The existing download/open/new flows remain available.

## Delivery roadmap

- W1: visible local library, safe switching, reopen after reload.
- W2: stable document identity, autosave, conflict/draft protection, recovery and workspace navigation.
- W3: real writing audit: Korean composition, deletion, selection, paste, undo across pages and tables.
- W4: page layout audit: section sizes/margins, headers/footers/page numbers, page breaks, print.
- W5: interoperability: assess DOCX import/export fidelity and expose explicit supported boundaries.
- W6: comments/tracked changes and long-document accessibility/performance acceptance.

Service accounts, permissions and live collaboration remain separate shared-service work.

W1 delivered: shared Button/Dialog library UI now saves independent snapshots and lists stored
Word documents. Opening validates the source, saves the current document, then replaces it.
Chromium lifecycle passed persistence across reload, save-before-switch, injected IndexedDB put
failure, unchanged current title on failure, and successful retry. The error is shown inside the
open dialog. Word Vite production build passed (existing bundle-size warning); app type check
reports shared dependency debt but no new document-library diagnostic.
W2 remains open: this is explicit snapshot storage, not automatic saving or multi-tab conflict handling.

## W2 — Automatic saving and conflict drafts

Word now uses stable URL document IDs and shared IndexedDB conditional revision writes.
Content snapshots are captured on changes before switching identity; writes serialize and pending
newer snapshots inherit the successfully committed revision. New/imported documents receive new
identities. Reload restores the URL identity. Conflicts preserve the newer original and save local
work into a separate recovery library; the library restores a draft into a new document without
deleting its recovery source. Failed writes remain pending with retry UI and an unload warning.
Library listing flushes pending edits so its titles and opened versions agree.

Scope: same-browser local durability and conflict detection, not collaborative merge or cloud sync.
Abrupt browser/OS termination before a pending IndexedDB write is not guaranteed recoverable.

W2 verification: Chromium3/3 passed: two-tab revision conflict and restore-as-new; injected storage
failure and retry/reload; existing snapshot library regression. The library now flushes before listing
and before manual copy creation. Async reads refuse to overwrite edits made during restoration and
ignore stopped controllers. Word was opened in the user's in-app browser at localhost:5180; the live
Word editor and saved status were inspected. The Note tab was retained. Production build passed;
no new autosave/library diagnostic in the app type check (shared pre-existing type debt remains).

## W3 — Writing and persistence audit — 2026-09-08

Added a browser lifecycle combining CDP Korean composition, repeated spaces, Backspace,
clipboard paste, table typing, automatic saving and reload. It preserves both paragraph and cell
content. Existing coordinate-driven input tests now scroll the target paragraph into view before
clicking: the added library chrome had moved it outside the viewport. The corrected14 input
scenarios pass. The other15 targeted editing/mark/table scenarios passed in the initial run.
Word unit tests557/557 after updating measured schema/command counts and recognizing clipboard
copy and clearing already absent color as non-mutating fixture cases. Shared color reset behavior
remains covered in the Note suite. This audit uses browser composition automation; real OS IME,
touch/accessibility and full cross-browser certification remain separate checks.

## W4 — Page setup and print-path audit — 2026-09-08

Chromium47/47 passed across caret page breaks, section page setup, page furniture and browser
print DOM: orientation, paper size, invalid margins, headers/footers, numbering, fields/TOC,
header editing, screen-to-print page counts and text continuity across printed pages. This verifies
the browser print path, not external printer drivers or DOCX interoperability. No new pagination
implementation was needed in this batch. W5 DOCX fidelity assessment/implementation is next;
W6 review workflows and long-document performance remain open.

## W5a — Basic DOCX export — 2026-09-08

Implemented a browser-independent Word package exporter (`word-docx.ts`, fflate ZIP) and an
app action using office-ui Button/Dialog. Download is preceded by a visible fidelity report.
The export snapshot never replaces or modifies the active document. Supports plain/marked text,
escaping and significant whitespace, tabs/breaks, basic paragraph alignment/spacing, resolved
named-style inheritance, horizontal table merges and section page sizes/margins. Tables use a
basic grid. Unknown inline/block elements become readable text/placeholders with notices.

Unsupported: DOCX import, full style fidelity, numbering, vertical table merges/widths/themes,
images, OMML equations, footnotes, headers/footers, comments and tracked revision semantics.
These remain open W5 tasks; JSON is still the native preservation format. This is not a DOCX
round-trip or Microsoft Word layout certification. Package structure follows Microsoft Learn's
WordprocessingML document/body/paragraph/run/text model:
https://learn.microsoft.com/en-us/office/open-xml/word/how-to-open-and-add-text-to-a-word-processing-document

Validation: four converter tests cover package relationships/XML well-formedness, range formatting,
Unicode/whitespace, table merges, sections, invalid input and source immutability. Chromium download/
cancel/source preservation test passes. The downloaded sample is readable with macOS textutil.
Full Word suite561/561 and production build pass. Existing shared TypeScript debt remains; no
new word-docx/docx-export diagnostics. Import and advanced fidelity are explicitly next.

## W5b — Basic DOCX import and math-editor integration — 2026-09-08

DOCX import now decodes the standard word/document.xml part, with a 10MB file/part cap,
XML declaration checks and explicit fidelity notices. Supports paragraphs/headings, direct
run formatting, significant whitespace, basic tables with horizontal spans and section paper
settings. A preview precedes opening as a new document; current autosave is flushed first.
Invalid files, vertical merged tables and nested tables are rejected without replacement.
Named style definitions, numbering, images, equations, fields and review metadata remain
outside import fidelity. The original DOCX is never modified. Hash-only navigation still needs
reload; the persistence test reloads the original URL to verify its separately saved contents.

Decision: retain Word's inline OMML rendering/editing; mount math-editor in an office-ui Dialog
for deliberate structural editing. Two independent live input/IME/undo owners are not nested
inside the same contenteditable. The popup owns a draft. Apply translates slots directly to
OMML-shaped nodes and commits once; cancel discards the draft, stale/read-only targets refuse
application, and one undo restores the original. The bridge belongs to office-word; reusable
math UI stays in math-editor, and modal/button design stays in office-ui.

Supports fractions, square roots, superscript/subscript, brackets, sums/products/integrals and
matrices. Unsupported existing constructs/formatting refuse popup conversion so the original
inline editor remains usable. Multiline/aligned/cases output is not yet mapped. Added optional
math-editor React host configuration: excludedStructures filters toolbar/suggestions and guards
insertion; multiline=false prevents Enter from creating additional top-level lines. Default
behavior remains unchanged for standalone math-editor. Pasted drafts still undergo host validation.
Word's popup hides aligned/cases tools and uses single-line mode.

Validation: Word unit suite567/567; independent DOCX fixture parse/load, invalid-file rejection,
math structure conversion and undo/stale-target checks. Chromium DOCX import/export plus math
insert/cancel/edit/undo/reload and fraction reopen lifecycle4/4 passed before final host-option
polish. math-editor suite91/91 and both package/app builds pass. New files have no reported type
diagnostics; shared pre-existing app TypeScript debt remains. Advanced DOCX math/image fidelity,
full popup structure coverage, and Note/Site adoption of this new editor remain future work.

Final host-option verification: math popup lifecycle2/2 passed with hidden unsupported tools and
Enter in single-line mode. The first concurrent build/browser run timed out while a closing
Dialog was still visible; a standalone rerun passed both cases. In-app Word UI was inspected:
DOCX import action and math popup are visible, unsupported toolbar actions are hidden, modal
layout fits the viewport, and cancelling returns to the original editor. No document edits were
applied during that inspection. Existing source files in math-editor were extended only with
optional host configuration; standalone defaults are preserved.


## W5d — New-document formatting and functional audit (2026-09-08)

User report: changing a paragraph into a heading did not change its appearance; UI readiness needed actual functional verification.

- Root cause: the starter referenced Body but contained no styles/resources. The shared heading command changed only the semantic node type; it retained Body instead of selecting a Heading style. Samples concealed both faults by shipping their own complete styles.
- Word owns default resources and fills only missing definitions at its load boundary, including restored/imported files. Existing definitions/direct formatting take precedence. Legacy headings with no original heading definition recover the matching style. The caller's document tree is not mutated.
- Word's style commands apply Heading1–6 or Body across selected paragraphs in one history transaction. The ribbon exposes all six levels. The shared paragraph extension accepts an optional after-heading formatting callback; Word supplies the named next style, while other products keep their existing behavior.
- Shared setAttrs history now records the resolved node ID rather than a temporary alias. Browser checks caught Enter undo failing when its formatting inverse referenced an expired alias. Edge paragraph insertion now retains its block/text IDs in replay history, so redo can also replay subsequent typing into that paragraph. Browser checks cover two undo steps followed by two redo steps.
- CommentsPane now reads the current root after document replacement. Previously a successful comment insert could remain absent from the panel because it read the old root.
- Unit tree-shape checks now focus on the body when testing drawing placement. The command conformance comparison sorts object keys; attribute key insertion order is not a document change. Chrome CSS token fallbacks and obsolete open-pane/toolbar-row test assumptions were corrected.

Verification: browser57/57 across blank formatting, menus, toolbar/font/colour/list/indent, typing/backspace, library shell and DOCX; final all-level heading and Enter/undo checks3/3. Word full unit571/571; final command/style checks12/12 after redo identity repair. Shared model48/48 and paragraph/heading10/10. Vite production build passed. Existing saved user document was reopened in the in-app browser and the formerly plain heading visibly renders larger and bold.

Remaining: full Word browser suite (including page furniture, drawings, review and input stress cases) has not been rerun in this batch. Shared TypeScript diagnostics still prevent a clean whole-app type check. W6 must audit those scenarios and advanced DOCX fidelity before any product-complete claim. The later Note in-place integration is recorded separately; Word retains its popup bridge and needs a regression check against current shared math-editor changes.


## W5e — Grouped command ribbon (2026-09-08)

- Shared office-ui RibbonTabs/Group/Action own accessible tabs, group captions and launchers, compact/labeled icon geometry and keyboard behavior. Office-icons owns the added search/page/spacing/launcher/print glyphs.
- Word Home presents font/size, character and paragraph controls in two rows, style previews and find. Insert includes page breaks, a configurable table dialog, shapes, frames and math; Layout opens page/paragraph/border settings. Review reports tracking state; View exposes panes, zoom and print.
- Menus add insertion/review commands and reflect open panels. No menu declares an unregistered command. Table dimensions are bounded and insert as one document operation, with save/reload verified.
- ToolbarToggle now supports keyboard/assistive activation as well as selection-preserving pointer activation. Keyboard undo/redo and tab arrow/Home/End navigation are browser-verified.
- Verified: Word browser43 unique tests across menus/formatting/context, toolbar/product shell, new workflows, five-tab geometry and math popup; shared four-product chrome2/2; Word menu/command/toolbar units46/46; Word Vite build. The first math run hit a temporarily missing UI export during implementation; the export was corrected and both math workflows passed. Two older UI checks were updated for semantic groups and intentional style previews. The menu model caught a duplicate global label, which was corrected.
- The whole-app type check retains existing diagnostics outside modified source files. W6 remains open. Clipboard workflows, ribbon customization, full contextual table/shape tabs, richer style management and unimplemented Word capabilities remain subsequent product work; this milestone does not certify MS Word feature parity.


## W5f — Authoring inputs and command contracts (2026-09-08)

The user correctly identified that the grouped ribbon did not define a complete authoring surface. Added shared command/payload/availability declarations and real input dialogs for selected-text links, local pictures, footnotes/endnotes and comments. Added clear formatting and Replace access. The corresponding keyboard bindings now open host-owned forms instead of running payload-dependent commands without a payload. Forms retain a cloned selection, support cancel/error feedback and use office-ui primitives; link logic reuses office-editor-ui helpers.

Found and fixed FindPanel retaining a previous document root after load. Six authoring browser workflows and30 existing ribbon/menu/format/geometry checks passed across scoped runs;44 menu/command contract unit checks and Word build passed. Whole-app TypeScript diagnostics remain outside modified source files. An immediate automated typing then Shift+Home sequence lost selection; final shortcut validation used mouse selection. This remains an input synchronization investigation, not a passed rapid-input claim.

The scoped delivery is complete, but toolbar/product completeness is not claimed. See docs/specs/word-toolbar-capabilities.md for per-tab coverage and prioritized gaps: clipboard, header/footer/page numbers, TOC and contextual table/shape tools.


## W5g — Next active delivery after Note phase close (2026-09-08)

Status at selection: selected next work; implementation/verification not yet complete at that point.
The delivery record below supersedes this for W5g-1 and line spacing; other work remains open.

1. Reproduce rapid typing → keyboard range selection → formatting/link/comment on a fresh blank document. Preserve the visible target through dialogs and undo/redo; inspect the shared input boundary before product-specific patches.
2. Complete clipboard actions with browser-permission/fallback behavior and saved selection, then discoverable header/footer/page-number and TOC authoring. Each visible action must have an input contract, availability, cancel/error behavior, persisted result and undo coverage.
3. Complete contextual table/image dimensions and layout controls against real document selections.
4. Proceed to W6: comment/revision workflows, long-document behavior and supported DOCX/print fidelity. Recheck Word math popup after shared math-editor changes; do not automatically adopt Note's nested editor or prose columns.

The product handoff requires a fresh document → headings/body → table/image/math → review → save/reopen → print/DOCX workflow within explicitly stated fidelity limits. Existing W1–W5f evidence is a starting point, not certification of W5g/W6. Shared dependency type errors and actual OS IME remain explicit release gates.

## W5g-1 and direct line spacing — delivered 2026-09-08

Reproduced typing → Shift+Home → link shortcut failure without a settling delay. DOM held the new
range while the model still held a caret. Added shared `office-editor-ui.captureTextSelection` to
snapshot a focused editor's native range for host authoring shortcuts. It refuses other surfaces,
embedded input owners and object selections. Word skips form/embedded/composing shortcuts.

Keyboard formatting already received the range as a payload, but the transaction preserved the
old model caret and collapsed the selection afterwards. The shared DOM view now synchronizes the
range before command execution, without writing it back to the DOM. Navigation ends the typing
undo group: replacement → fresh selection → deletion now undoes the deletion alone. IME candidate
navigation does not split history. These are shared fixes, not a separate Word input engine.

Home → Paragraph now offers 1/1.15/1.5/2-line presets through office-ui ChoiceSelect and the existing
paragraph spacing command. It writes only line/rule, keeps before/after spacing, reads a custom
imported multiplier, and supports undo/redo and save/reload. Compact placement was inspected in the
in-app browser; the saved user document was preserved. Existing page setup already includes column
count/gap; the roadmap now distinguishes that from missing section/page-furniture authoring.

Full Word units found an obsolete fixed keyboard count, outdated toolbar inventory and missing CSS
token fallbacks. Corrected those. A standalone closed CommentsPane also exposed Tip requiring an
external provider; office-ui now supplies one when absent and Toolbar uses the shared provider.
Legacy review browser tests now open the comment panel/review tab and use current labels. Their
document assertions remain intact; the last formatting review case now returns to Home.

Verification:
- Word unit suite 574/574; shared input handlers 59/59; key/composition boundary 6/6;
  selection/context ownership 5/5. Fast link workflows also passed 6 repetitions across normal/4x CPU.
- Word final broad browser run 61/62, with one obsolete Home-tab navigation in a review test;
  corrected and separately rerun 1/1. An earlier broad run was interrupted after confirming legacy
  UI-path failures. Do not report a single clean 62-test run.
- Note daily writing + in-place math regression 15/15. Word production build passed, with the existing
  chunk-size warning. No TypeScript diagnostics in the new capture helper or changed Word/Tip/Toolbar
  UI; whole-app TypeScript remains failing in existing shared sources.
- office-ui broad units 115/117. Two existing style-door inventory checks still fail: math-editor is
  newly a CSS exporter, and the checker scans CSS imports but misses math-demo's TSX side-effect CSS
  imports. This cross-host test maintenance remains open; it is not evidence of a new Word rendering
  failure or a clean full shared-UI suite.

Next delivery: W5g-2 clipboard actions/fallback and format painter, then W5g-3 page/TOC authoring and
W5g-4 table/picture dimensions. W6 long-document/accessibility/OS IME and expanded DOCX fidelity
remain open. Basic DOCX currently does not preserve pictures, equations, review metadata or page
furniture; local editing completion must not imply full business-document interchange readiness.


## W5g-2 clipboard tools — delivered 2026-09-09

- Home ribbon and Edit menu share clipboard actions from office-editor-ui. Icons are in office-icons; fallback forms use office-ui. Preserve the native range, show availability, and prevent duplicate clicks while an API request is pending.
- Shared copy no longer creates a transaction or reports success after a rejected write. Shared cut writes first, verifies the target, and uses the same reversible deletion operations as Backspace. This replaces the product command's old model cut path, which deleted text without collapsing the selection and had no multi-run inverse. The new browser case restores paragraph structure and bold marks exactly after one undo, then redoes the cut.
- Tracked cut writes actual clipboard data before adding moveFrom marks. Failed writes keep the original text and add no revision marks.
- Clipboard failures show a manual copy field or literal-text paste form. Paste keeps the captured range, rejects document changes, supports cancel and undo, and preserves spaces/Markdown punctuation literally. Target checks cover root, endpoint nodes and serialized selected content during permission waits.
- Compact Home grouping fits the app's1127px view. Fixed the ribbon's spacing rule being overridden by host toolbar CSS, and kept toolbar/ruler boundaries visible. Checked the saved user document visually without editing it.

Validation: shared clipboard12/12; Word574/574; clipboard browser11/11; Note daily/paste8/8; production build passed. A broader Word authoring run was20/21, with one wrong test fixture insertion offset (15 versus16). The corrected stale-target case and an added keyboard copy/cut/paste/undo case pass in the final11/11 run. Clipboard APIs are mocked to leave the OS clipboard untouched. Whole-app TypeScript remains blocked by existing shared diagnostics; none name the changed clipboard sources. This is focused coverage, not a full browser-suite or release claim.

Next: format painter, then W5g-3 page/TOC authoring and W5g-4 table/picture tools. W6 must also cover complete rich/multi-paragraph tracked paste and move pairing, actual clipboard permission/platform behavior, and keyboard failure feedback beyond the menu/ribbon fallback. Do not mark Word or W5g-2 as fully complete yet.


## W5g-2 character format painter — 2026-09-09

Delivered Home/Format entry, captured source sample, one-shot drag application, explicit keyboard target/application, Escape/Cancel, typing cancellation and same-instance document-reload cancellation. Product-neutral interaction lives in office-editor-ui; primitives and brush icon use office-ui/office-icons. Word resolves inherited character styles and handles its review contract.

Capture does not edit the source or add history. Application creates a persisted character style, replaces supported visual marks only inside the target, and retains target text/links/review anchors. Partial-range marks outside the target survive. Tracked formatting now records the before state in the same transaction, so one undo restores both content formatting and the revision record. The new command is applyCopiedFormat; Word spec inventory is172 commands (160 provided by the kit).

Evidence: Word578/578; focused painter tests expanded to5/5; Chromium painter/clipboard/spacing18/18; same-instance document reload1/1; production build passed. The first drag fixture omitted flow surface kind and exercised canvas object selection; corrected to the product document kind. The tracked-format two-step undo was a product defect and is now one transaction. Existing shared TypeScript errors remain; no new painter diagnostic. Visual inspection confirmed the1127px Home ribbon retains its one-row group layout and ruler boundary.

Remaining painter scope: paragraph alignment/spacing, repeated painting, resource deduplication, broader mark vocabulary and exchange fidelity. Mixed source selections use the first sampled character. These do not count as completed Word/MS Word parity. Next primary delivery is W5g-3 header/footer/page-number creation and editing, then TOC; table/picture dimensions and W6 remain open.


## W5g-3 page furniture authoring — 2026-09-09

Delivered Insert ribbon/menu entries and office-ui dialogs for header/footer creation, in-document editing, section unbinding and page-number configuration. Default/first/even variants use existing surface references and switches. New setPageFurniture command preserves existing content, avoids duplicate number fields, validates section/root and inserts resource+reference in one undoable transaction. Word now registers173 commands (161 kit-specific).

The app exposes editFurniture on its mount result and reports mode changes to the shell. A visible body-return button and Escape restore the previous body selection. Clicking the body uses its native caret; document replacement exits the mode. Empty-header typing and local save/reopen are exercised. New office-icons mappings distinguish the three tools.

Validation: full Word units583/583; scoped conformance/furniture/spec17/17, then expanded furniture5/5. Browser initial UI3/3, expanded UI5/5. Existing page/chapter/print with initial UI45/46; failure was an off-viewport coordinate click after adding the status row. The corrected scroll-then-click scenario passes1/1. Build passes. Existing shared TypeScript errors remain; changed callback typing was corrected. This is scoped coverage, not a full browser-suite or release claim.

Next primary unit: W5g-3 section-break authoring and heading-based TOC insertion/refresh. W5g-4 table/picture dimensions and W6 remain. Furniture rich render fidelity, linked-section copy/unlink UX, unused resource cleanup, automatic number continuation, and DOCX preservation are not complete.


## W5g-3 section breaks and TOC — 2026-09-09

Delivered insertSectionBreak and setTableOfContents. Body caret splitting preserves following block IDs/page settings/furniture bindings and restores text/marks in one undo. TOC insertion, settings, removal, document/section scope and automatic title/page updates are connected to References/Insert. Keyboard navigation focuses actual model text. Inventory175 commands (163 Word-specific),1,035 attribute slots.

Fixed shared deleteNode overlay handling and editor-owned root proxy refresh. Added parent commit/rollback and same-root replacement regressions. The standalone renderer reproduction passed; fault was in the view's old root proxy, so the temporary diagnostic test was removed.

Evidence: Word589/589; datastore830/830; model46/46; view27/27; new browser3/3, furniture5/5 and print6/6 across scoped runs. Outline/TOC11 passed,1 skipped after updating fixtures for collapsed panes/View tab. Root-directory Playwright invocations without app config were stopped and do not count as verification. Build passes. Shared TS baseline remains; no diagnostic names new structure/dialog/app sources.

In-app sample opened separately: http://localhost:5180/?sample#word=6cd8b8bb-424b-4fb9-a9e1-76df0fd0256d. Original documents were not test fixtures. UI screenshot: /tmp/word-toc-settings.png. Remaining boundaries are in word-toolbar-capabilities.md. Next: W5g-4 table/picture dimensions, then W6. Word and service launch are not complete.

Follow-up shared-layer verification: Note daily-work/paste-boundaries8/8 passed on isolated documents.


## 2026-09-09 — TOC composition and deletion history

Generated TOC markup now has an explicit noneditable input boundary. `installTocCompositionPreview` updates existing entry labels from the model while composition is active. It does not render or replace the IME paragraph. Original labels are restored before the renderer resumes, including composition cancellation. Entry membership and page numbers settle after composition; an initially empty TOC gains entries on commit. The installer returns a disposer for hosts that unmount it.

Explicit `deleteTextRange` operations no longer coalesce with typing or other deletions. Undo restores each deleted grapheme. Ordinary typing and IME updates retain their existing grouping. The reported whole-heading restoration was reproduced before this change. Erasing all heading text did not remove the TOC node in the isolated reproduction; the tests now cover its empty placeholder and an additional Backspace at that boundary.

Evidence: TOC browser5/5; existing structure/navigation3/3 and composition completion4/4; Note deletion6/6 after changing its old combined-undo expectation. Word589/589 and production build pass. Core full run332 passed/10 skipped with one stale cast-count assertion; lowering its ceiling from357 to356 gave2/2 on the affected file. History regressions11/11 passed. Shared TypeScript diagnostics remain, with none in the changed TOC/history/app files. Browser IME uses Chromium CDP, not physical OS IME certification. Original user documents were not edited by the tests. Next remains W5g-4 table/picture tools.


## 2026-09-09 — W5g-4a: contextual table and picture layout

Selecting a table opens **표 레이아웃**; clicking a picture selects the inline object and opens **그림 서식**. Context controls use office-ui NumberField, ChoiceSelect, ToolbarToggle and RibbonGroup with office-icons. They are held in office-word, not reimplemented in the app.

- Table: width in centimetres, left/centre/right alignment, content fit, body-width fit and fixed width. Changing a fixed width scales existing column proportions. Automatic fit clears the old fixed grid. Alignment clears an explicit left indent.
- Picture: width and height in centimetres; aspect ratio preserved by default, with an independent-size toggle; inline, left/right text wrapping and top/bottom placement. Unsized pictures use their rendered CSS dimensions for the initial ratio. Ratio lock is a per-selection UI preference, not a new document attribute.
- One `setWordObjectLayout` command validates the current document, selected object, object type and finite 0.1–55cm dimensions before one transaction. Data remains in standard Word twips. Invalid, stale and read-only edits do not mutate the document. Current registry:176 commands,164 Word-specific; schema unchanged.

Browser testing found that keyboard dispatch substituted a DOM text range for a held object selection. Shared view dispatch now preserves whole-node/cell/table selections. Shared deletion accepts selected inline leaf objects while block/canvas selections keep their own commands; locked inline objects remain protected. Deletion moves the caret to surrounding text, or creates an empty run when needed, so typing can continue. Undo restores the object.

Remaining W5g-4b: row height and column width controls, equal column distribution, margins inside cells, image crop/reset, accessibility text editing, broader wrapping/print/DOCX fidelity. The current fit uses CSS table layout; it is not a complete MS Word layout engine. No product-completion or launch claim.


Verification: Word595/595; shared deletion20/20; view keyboard/IME dispatch4/4; contextual ribbon4/4, new object layout3/3, table selection6/6 and authoring6/6 across scoped browser runs; Note deletion6/6. Earlier fixture failures (missing bTableBody and page margins) were corrected. The image keyboard deletion failure was a real dispatch/guard defect and passes after the shared fixes. Production build passes. Existing shared TypeScript diagnostics remain; no new diagnostic in the object controls/command or changed dispatch statements. Screenshots: /tmp/word-table-layout.png and /tmp/word-picture-layout.png. Original user documents were not modified by tests.


## 2026-09-09 — W5g-4b: row/column dimensions and picture crop

Delivered row height (automatic/minimum/exact), individual column width and equal column distribution in the contextual table ribbon. Measurements use centimetres in office-ui controls and twips in the document. Shared office-text helpers preserve the total width when rounding equal columns. Existing grids take priority over rendered measurements. Each dimension change uses an undoable command.

Picture format now provides square, 16:9 and 3:4 crop presets, horizontal/vertical crop position and reset. Cropping uses the shared image renderer with object-fit/object-position. It preserves the source image and original frame dimensions, including through local save/reopen. Reset restores the original frame. This is preset cropping; freeform drag handles are not implemented. Inventory remains176 commands (164 Word-specific),108 nodes; five optional image attributes bring the schema to1,040 attribute slots.

Evidence: Word597/597; object-layout Chromium5/5, including save/reopen, undo, column distribution and crop reset; production build passed with the existing chunk-size warning. Whole-package TypeScript still fails in existing shared sources; no diagnostic names the changed dimension/crop files. Crop-position conformance exemptions were removed because the harness already detects their render reads.

Live in-app verification: the user's open Word tab at localhost:5180 displays the updated table ribbon. Selected its existing table, opened the column menu and switched the UI target to2열. New controls fit the1127px view. Document content was not changed. Isolated test screenshots: /tmp/word-table-dimensions.png and /tmp/word-image-crop.png.

Remaining W5g-4: cell padding and picture alternative-text editing. Freeform crop, advanced wrapping and print/DOCX fidelity remain open. Next implement cell padding and alternative text, then W6 integrated editing/save/print, long-document and accessibility checks. Word, W6 and service launch are not complete. Delivery order remains Word → Slides → Site.

Acceptance rule: after each feature, verify the current development code in the visible in-app editor as well as automated tests. Use an isolated document for destructive or content-changing test scenarios.


## 2026-09-09 — Table boundary dragging

Table dimensions now have an in-document pointer path. Hover within6px of a cell's right/bottom boundary, then drag horizontally/vertically. A shared office-text adapter renders a guide and centimetre preview outside the editable DOM. The Word adapter converts unzoomed pixels to twips and uses the existing dimension commands. Release commits once; Escape/pointer cancellation discards the preview. Column dragging adjusts that column and the table total; other column widths stay fixed. Row dragging sets a minimum height, so cell content is not clipped. Ribbon fields remain the precise-input and keyboard-access path.

The adapter accounts for document zoom, suppresses read-only handles, refuses stale document/attribute targets and cleans up on editor destruction. Shared CSS lives in office-text. Vertically merged cells target their last row when that row has an editable cell; rows covered entirely by row spans have no resize target from that merged edge. Full multi-page split-table/row-span geometry is still a W6 verification item.

Verification: Word597/597; focused browser13/13 (dimensions, Escape, undo, persistence,75% zoom, read-only and existing cell selection); build passed. Shared TypeScript baseline remains, with no diagnostics in new resize sources. Initial browser failures were test coordinates sampled before the contextual ribbon had settled; tests now wait for the selected tab. The current in-app Word document contains the new resize layer and updated table tools. In-app automation does not expose pointer drag, so gesture assertions use the isolated Chromium run; do not describe this as a manual drag in the user's document. Screenshot: /tmp/word-table-boundary-drag.png.


## 2026-09-09 — W5g-4c: cell margins and picture accessibility

Delivered **셀 안쪽 여백** in Table Layout and **대체 텍스트** in Picture Format. Both use office-ui dialogs and controls, office-icons, and the existing setWordObjectLayout command. No new command or attribute count:176 commands,164 Word-specific,108 nodes and1,040 attribute slots.

Cell margins support selected cells or every cell of the selected table, four directions in centimetres, partial changes and reset to inherited defaults. Changes remain drafts until Apply; Cancel does not write. Captured cell IDs keep the target stable while the dialog owns focus. Root ancestry, existing cells, scope and read-only state are checked before one transaction. Reset removes direct margins and restores table/style defaults. Blank fields mean inherited or mixed values; editing one side leaves other attributes intact.

Picture descriptions update the existing image alt attribute. A decorative option writes an explicit empty alt. Local save/reopen and undo preserve both forms; source image and dimensions remain unchanged. This is HTML accessibility/local persistence, not certified screen-reader coverage or DOCX preservation.

Browser testing exposed a Word schema mismatch: cells rendered paragraph children, but inherited inline-only content validation rejected cell attribute transactions. Word cell/header-cell content now accepts `(block|inline)*`, preserving legacy direct inline content. The shared schema is unchanged. Updated the older inline-only premise test while retaining frame/drawing insertion regressions. Object-layout units now use the same schema-backed DataStore as the app. An initial overly strict payload-key check also rejected the selection field injected by Editor.run; known conflicting property checks replace it.

Evidence: Word599/599; focused browser15/15 covering new dialogs, save/reopen, reset, undo, existing dimensions/crop/drag/zoom/read-only and cell selection; production build passed. Whole-package TypeScript still fails in existing shared files; no diagnostic names the changed property/dialog/schema files. Screenshots: /tmp/word-cell-margins.png and /tmp/word-image-alt.png.

Visible app: restarted the stopped Word server on5180. The old tab showed a connection-error data page that the browser tool could not inspect, so opened the same document URL in a new visible tab. Opened cell margins, entered0.5cm, confirmed Apply enabled, then cancelled. Original document content was preserved; the new tab remains available.

Next: W6 integrated authoring/review/save/reopen/print checks, with long and multi-page tables and supported DOCX round-trip limits. W5g table/picture core controls are connected; freeform crop, advanced wrapping and full exchange fidelity remain open. Word and service launch are not complete. Continue Word → Slides → Site.


## 2026-09-09 — W6a: 통합 작성과 긴 표 인쇄

변경 추적으로 본문을 편집하고 모두 적용한 뒤, 48행 표의 셀 여백을 바꾸고 저장·재열기·인쇄하는 브라우저 시험을 추가했다. 재열기 후 문서 내용·서식·마크를 비교한다. 인쇄 영역의 ROW-001–048이 한 번씩 순서대로 보이고, PDF 페이지 수가 화면의 4페이지와 같은지 확인한다. 문서 노드 ID는 세션 값이므로 내용 비교에서 제외한다.

발견한 제품 결함 두 가지를 수정했다.

- editor-view-dom: IME 변경을 추가 타이머로 미루면서 조합 종료 렌더가 아직 저장되지 않은 글자를 덮었다. 조합 중 DOM 변경은 MutationObserver의 현재 microtask에서 반영한다. 일반 입력 배치와 중첩 편집기 제외 규칙은 유지한다.
- office-word: 표 높이에서 모든 chrome 요소를 빼면서 colgroup의 높이까지 뺐다. 열 너비가 있는 긴 표를 약 1px로 측정하는 원인이었다. 해당 표의 페이지 간격·반복 머리행 TR만 높이에서 뺀다.

검증 과정에서 기존 IME 시험 3개의 화면 밖 클릭을 먼저 스크롤하도록 수정했다. 통합 시험의 PDF 생성 전에는 명시적 screen 미디어 강제를 해제한다. 인쇄 CSS 변경은 필요하지 않았다. 시험의 잘못된 bTableHead 이름은 실제 스키마의 bTableHeader로 고쳤다.

브라우저의 별도 문서 'Word 통합 검증'에서 한글·연속 공백·Backspace·줄바꿈, 변경 추적과 모두 적용, 40행 표 삽입, 1열 너비 4cm, 페이지 경계, 저장 후 새 탭 재열기를 확인했다. URL: http://localhost:5180/#word=bd9399a1-96cd-4c25-a62f-c50d4db7de5a. 원래 사용자 문서는 테스트 입력 대상으로 쓰지 않았다. 이 UI 입력은 OS 한글 IME 수동 시험을 대신하지 않는다.

다음 W6b: 여러 페이지에 걸친 병합 셀·반복 머리행·드래그 치수, Word 수식 팝업 회귀, 키보드/접근성 검증. 기본 DOCX 시험 통과와 고급 DOCX 보존은 구분한다. 전체 Word 기능, 공동 편집 서비스와 출시 검증은 완료 상태가 아니다. 제품 순서는 Word → Slides → Site를 유지한다.


W6a 최종 검증: Chromium 69/69 통과(작성·저장/재열기·보관함·댓글/답글/해결·변경 추적·목차/한글 조합·구역/페이지 장식·기본 DOCX·인쇄). Word 단위 599/599, 공통 조합 경계 7/7, Word Vite 빌드 통과. 로그: /tmp/word-w6-final.log, /tmp/word-w6-unit.log, /tmp/word-w6-composition-unit.log, /tmp/word-w6-build.log. 인쇄 산출물: /tmp/word-integrated-report.pdf, /tmp/word-integrated-print.png. 공통 모듈 변경에 대한 Note/Site 브라우저 회귀와 실제 OS IME·전체 접근성·성능 예산 검증은 이번 범위에서 완료하지 않았다. 기존 공통 TypeScript 진단도 출시 전 해결 대상이다.


## 2026-09-09 — W6b-1: Word 수식 다이얼로그 공통화

사용자의 수식 입력 요청을 우선했다. Word의 기존 math-editor 다이얼로그를 Note가 쓰는 office-editor-ui의 MathSourceEditor로 연결했다. 시각 편집과 LaTeX 원문을 전환하고, LaTeX를 직접 적용할 수도 있다. 공통 탭·편집 영역·스크롤 레이아웃을 재사용한다. 문서 크기 설정은 이 다이얼로그에 넣지 않는다.

제품 결정: Word는 다이얼로그 초안을 기본으로 유지한다. Note의 본문 내 직접 편집 방식은 자동으로 옮기지 않는다. 다이얼로그에서 math-editor가 입력과 Undo를 처리한다. 적용할 때만 구조를 Word의 OMML 형태 노드로 변환하고 한 트랜잭션으로 반영한다. 기존 수식 재편집, 취소/Escape, 문서 Undo와 저장·재열기를 유지한다. 문서 안 배치는 기존 Word 수식 모델과 명령을 사용한다.

지원하는 구조는 분수·루트·지수·첨자·소괄호·대괄호·절댓값·합·곱·적분·행렬이다. Word에서 보존하지 못하는 구조 도구는 숨긴다. 붙여넣기/LaTeX는 적용 시 다시 검증한다. 잘못된 구문, 여러 줄, 경우 나누기, 정렬식과 미지원 구조는 원본을 변경하지 않고 초안과 오류를 표시한다. 개별 분수의 dfrac/tfrac 표시 스타일도 조용히 버리지 않고 거부한다. 모든 LaTeX나 고급 DOCX 수식 교환을 지원한다는 뜻은 아니다.

검증: Word 단위 600/600 및 Vite 빌드 통과. Word 수식 브라우저 17개 중 기존 16개가 통과했고, 옛 Linear 버튼을 찾던 시험은 현재 삽입 → 수식 표시 경로로 고친 후 별도 재실행에서 통과했다. 신규 3개 시험은 LaTeX/시각 전환, 직접 적용, 재열기, Undo, 미지원 구문과 취소의 원본 보존, 자동완성 ArrowDown/Enter와 모드 전환 시 팝업 닫힘을 검증한다. Note 공통 편집/팝업 배치 브라우저 6/6 통과. 로그: /tmp/word-w6b-word.log, /tmp/word-w6b-linear.log, /tmp/word-w6b-note.log, /tmp/word-w6b-unit.log, /tmp/word-w6b-build.log.

실제 브라우저: Word 통합 검증 문서에서 x/2+y/2=30을 LaTeX로 불러와 시각 편집으로 확인하고 적용했다. 문서의 수식을 다시 열어 분수 구조가 유지됨을 확인했다. 편집 다이얼로그를 열린 상태로 남겼다. http://localhost:5180/#word=bd9399a1-96cd-4c25-a62f-c50d4db7de5a

남은 W6b: 병합 셀의 페이지 경계·반복 머리행·드래그 치수, 키보드 접근성 전체 흐름, 실제 OS IME. 수식은 미지원 구조 변환과 문서 배치 UX를 후속 범위로 유지한다. Word 전체 완료나 Slides 착수를 선언하지 않는다. Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-2: Word 본문 수식 편집

W6b-1의 다이얼로그 기본 결정을 확장했다. 기존 Word의 oMath/분수/슬롯 모델과 office-text 수식 렌더러를 유지한다. 수식 더블클릭 또는 삽입 → 본문 수식에서 math-editor 초안을 해당 위치에 연다. 빈 본문 커서에서도 같은 도구로 인라인 수식을 삽입한다. 기존 시각 편집/LaTeX 다이얼로그는 유지한다.

office-editor-ui의 MathInlineInput은 초안 입력, 자동완성 키보드, 조합 중 완료 방지와 적용/취소 UI를 맡는다. office-word의 useWordMathInplace는 임시 입력 영역과 Word 타깃을 연결한다. WordMathTarget/bridge/session은 원본 변경 검사, 구조 변환, 한 트랜잭션 적용과 수식 뒤 커서를 맡는다. Note의 tex 원자 모델을 Word에 복사하지 않는다. 입력 중 임시 DOM은 data-editor-input-owner 경계 안에서만 변경하고, 적용/취소 후 경계를 제거한다.

Enter는 자동완성이 열려 있으면 항목을 선택하고, 닫혀 있으면 수식을 적용한다. Esc는 자동완성을 먼저 닫고, 그 다음 초안을 취소한다. 외부 클릭은 초안을 먼저 적용한다. 빈 초안은 취소한다. 적용 후 Word 렌더러로 돌아오고 수식 뒤에서 본문 입력을 계속한다. 초안 입력은 Word 원본과 실행 취소 기록을 변경하지 않는다. Word가 변환하지 못하는 구조는 오류로 알리고 원본을 유지한다. 기존 Word 슬롯 직접 입력과 수식 표시 전환도 유지한다.

검증: Chromium 수식 22/22 통과. 인라인 5개, 다이얼로그 5개, 기존 Word 수식 12개를 함께 실행했다. 입력/Backspace 격리, 자동완성 ArrowDown/Enter, 취소, 한 번의 Undo, 수식 뒤 입력, 저장/재열기, 분수 구조 보존을 포함한다. Word 단위 시험은 599/600 통과 후 CSS 토큰 오류를 수정했고 해당 파일 2/2 재검증을 통과했다. Vite 빌드 통과. 기존 저장소 TypeScript 오류는 남아 있으며 이번 변경 파일의 진단은 해소했다. 로그: /tmp/word-inline-final.log, /tmp/word-inline-unit.log, /tmp/word-inline-chrome.log, /tmp/word-inline-build.log. 스크린샷: /tmp/word-math-inline.png.

남은 범위: 실제 OS IME, 페이지 경계에서 커지는 긴 수식, 모든 고급 Word 수식의 양방향 변환. W6b 표 병합/반복 머리행/접근성 검증은 별도 미완료다. 전체 Word 완료를 의미하지 않는다. 제품 순서는 Word → Slides → Site다.


## 2026-09-09 — W6b-3: 커서 기반 수식 도구 모음

수식 내부에 커서 또는 해당 수식 안의 선택 범위가 있으면 `수식 바로 편집` 도구를 표시한다. Word가 대상 수식을 결정하고 office-ui의 FloatingSurface, Button, Icon이 표면과 위치를 처리한다. 버튼은 대상과 커서를 유지한 채 기존 인라인 math-editor를 연다. 편집 중, 수식 밖 커서, 다른 입력창 포커스에서는 숨긴다. Esc로 닫은 도구는 같은 커서 상태에서 자동으로 다시 열리지 않는다. 수식을 다시 클릭하면 열린다. 적용 후 즉시 도구를 다시 띄우지 않는다.

새 시험에서 수식 뒤 문단 맨 앞의 커서가 Chromium의 getTargetRanges에서 앞 수식 끝으로 정규화되는 입력 결함을 발견했다. 공통 editor-view-dom은 단순 insertText의 접힌 범위에서 화면 커서와 모델 커서가 일치하고, 대상이 다른 부모의 이전 텍스트 끝으로 바뀐 경우에만 화면의 명시적 커서를 유지한다. 교체 범위와 같은 부모의 일반 서식 경계는 기존 동작을 유지한다. 인라인 수식 적용 후 포커스 복귀 시에도 모델 커서를 화면에 적용한다.

검증: Word Chromium 24/24, 공통 입력 단위 63/63, Vite 빌드 통과. Note 수식 회귀는 9/10 통과 후, 구조 선택이 토큰 입력창 대신 편집 표면에 포커스를 두는 현재 동작에 맞게 테스트를 수정했다. 해당 시험 1/1 재실행 통과. 제품 Note 코드는 변경하지 않았다. 기존 저장소 TypeScript 진단은 남아 있고 이번 변경 부분의 진단은 해소했다. 로그: /tmp/word-context-final.log, /tmp/word-context-core.log, /tmp/word-context-note.log, /tmp/word-context-note-target.log, /tmp/word-math-context-build.log.

실제 열려 있는 Word 통합 검증 문서에서 수식 커서 → 도구 모음 → 인라인 편집 → 취소를 확인했다. Word 원본 수식의 렌더링을 유지한다. W6b의 고급 수식 변환, 실제 OS IME와 페이지 경계·표 병합 검증은 계속 남아 있다.


## 2026-09-09 — W6b-4: 긴 표의 여러 줄 머리행 반복

반복 머리행을 한 행으로 합치던 렌더링을 수정했다. 원본 행 순서와 colspan/rowspan을 유지한다. 반복 복사본의 rowspan은 머리행 범위로 제한한다. 계속되는 페이지의 본문 공간에서 머리행 높이를 먼저 확보한다. 복사본에도 원본의 측정 높이를 적용하여 페이지마다 위로 밀리는 현상을 막는다. 첫 페이지에서는 머리행과 첫 본문 행을 함께 배치한다.

반복 셀은 원본 셀에서 계산된 배경색·글자색·글꼴·테두리·정렬·여백을 사용한다. 모델 본문을 복제하지 않고 편집/복사 대상에서 제외한 장식 행으로 표시한다. 머리행 내용·구조·서식·높이가 바뀌면 다시 그린다. 반복이 해제되거나 페이지 경계가 사라지면 관련 장식 행을 모두 제거한다. 반복 셀의 내용은 아직 텍스트만 복사하므로 셀 내부의 그림·수식·복합 인라인 서식을 모두 보존하는 기능은 포함하지 않는다.

검증: 페이지 분할/다단/긴 문단/긴 표/저장·재열기·인쇄 Chromium 29/29 통과. 서식 보존 추가 후 머리행·통합 인쇄 2/2 재검증, 마지막 타입 수정 후 머리행 1/1 재검증 통과. 새 시험은 병합된 2줄 머리행과 40행 표의 페이지 본문 경계, 배경색, 원본 모델 유지, 재렌더 안정성, 인쇄에서 각 행이 한 번씩 표시됨, 머리행 반복 해제 시 장식 제거를 확인한다. Word 단위 602/602 및 Vite 빌드 통과. 저장소의 기존 TypeScript 오류는 남아 있다. 이번 변경의 Word 페이지/표 파일 진단은 해소했다. 로그: /tmp/word-header-regression.log, /tmp/word-header-style.log, /tmp/word-header-final.log, /tmp/word-header-unit-final.log, /tmp/word-header-build.log, /tmp/word-header-types.log. 인쇄 화면: /tmp/word-repeated-headers-print.png.

실제 앱에서는 별도 샘플 문서의 표에 행을 추가하여 다음 페이지로 넘겼다. 다음 페이지 본문 시작 위치에서 파란색 병합 머리행이 반복되는 것을 확인했다. URL: http://localhost:5180/?sample#word=cbb8bdbd-306b-42e7-b2fd-d262f09c073e. 기존 사용자 문서는 이 시험에서 수정하지 않았다.

다음 W6b: 본문 병합 셀이 페이지 경계에 걸릴 때의 분할·행 높이 드래그, 키보드 접근성, 실제 OS IME 검증. 여러 단을 가로지르는 긴 표와 머리행 내부의 복합 콘텐츠 보존도 남은 범위다. Word 전체 완료는 아니며 Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-5: 본문 병합 셀의 페이지 경계와 행 높이 드래그

페이지 분할에 세로 병합 셀의 범위를 반영했다. 같은 행 그룹 안에서 rowspan이 걸친 경계는 분할하지 않는다. 겹치는 병합 범위도 함께 유지한다. 남은 페이지 공간에 들어가지 않으면 병합된 행 묶음을 다음 페이지로 이동한다. 반복 머리행의 높이 예약과 함께 동작한다. 한 페이지보다 큰 병합 묶음은 현재 넘침을 허용하되 그 다음 행은 다음 페이지로 계속 배치한다. 큰 병합 셀 내부를 여러 페이지로 나누는 구현은 아직 없다.

행 높이 드래그는 화면의 장식 행을 포함한 인덱스 대신 문서의 행 ID로 대상을 찾는다. 세로 병합 셀의 아래쪽 경계는 병합 범위의 마지막 행 높이를 바꾼다. 병합으로 자체 셀이 없는 행도 직접 setAttrs 트랜잭션으로 높이를 설정한다. 위쪽 원본 행은 변경하지 않는다. 드래그 중 표 구조나 셀 병합 속성이 바뀌면 적용하지 않는다. 공통 포인터 도구는 유지하며 Word의 단위 변환과 명령 연결만 수정했다.

검증: Word 단위 607/607 및 Vite 빌드 통과. 표 치수/머리행/병합 브라우저 12/12 통과. 일반 페이지/다단/긴 문단/표/저장·재열기·인쇄 회귀 30/30 통과. 병합 표 인쇄 검증 추가 후 관련 2/2 재실행 통과. 새 시험은 3행 세로 병합을 페이지 본문 안에 유지하고, 하단 드래그에서 마지막 행만 변경하며, Undo와 저장·재열기로 복원되는 것을 확인한다. 전 열을 병합하여 하위 행에 셀이 없는 경우도 검증한다. 인쇄에서 병합 셀과 전후 행의 문구가 한 번씩 순서대로 표시됨을 확인한다. 기존 저장소 TypeScript 오류는 남아 있으나 변경한 Word 파일의 진단은 없다. 로그: /tmp/word-merged-unit.log, /tmp/word-merged-browser.log, /tmp/word-merged-regression.log, /tmp/word-merged-print.log, /tmp/word-merged-build.log, /tmp/word-merged-types.log. 화면: /tmp/word-merged-row-resize.png.

실제 앱에서는 별도 샘플 문서의 A1/A2 셀을 세로 병합하고 하단 경계를 드래그했다. 아래 행 높이가 1.93cm로 늘어나고 위 행은 유지됨을 확인했다. 확인 화면을 브라우저에 남겼다. URL: http://localhost:5180/?sample#word=cf0b5279-e57b-444c-8fab-7cee8e2aac91.

다음: 키보드로 표/수식 도구 진입·이탈·Escape·Undo 흐름과 상황별 리본 상태 점검. 큰 병합 셀의 페이지 간 분할, 다단 안의 긴 표, 반복 머리행 내부의 복합 콘텐츠, 실제 OS IME와 전체 접근성 검증은 남아 있다. Word 전체 완료나 출시 완료로 표시하지 않는다. 제품 순서는 Word → Slides → Site다.


## 2026-09-09 — W6b-6: KaTeX 표시와 math-editor 편집 분리

Word 문서의 수식 표시는 공통 office-editor-ui의 KaTeX 렌더링 함수를 사용한다. oMath/슬롯 모델과 DOCX 원본은 유지한다. 문장 안 수식은 inline, oMathPara는 display 모드로 표시한다. 원본 DOM은 화면에서 숨기고 표시용 DOM만 추가한다. 표시용 DOM은 입력 수집 경계로 구분한다. 저장 데이터와 실행 취소 기록에는 KaTeX DOM을 넣지 않는다. 지원하지 않는 구조나 속성은 기존 렌더러로 표시한다.

표시용 변환은 편집용 bridge와 분리했다. 일반 구조는 기존 변환을 재사용하며 literal, 굵게, 수학 글꼴은 표시용 LaTeX에 보존한다. 문자열은 math-editor의 이스케이프 경로를 통과한다. 사용자 문자열을 LaTeX 명령으로 실행하지 않는다. 편집용 bridge의 보존 검사를 완화하지 않았다. math-editor가 보존할 수 없는 서식의 수식은 도구에서 기존 슬롯 편집으로 전환하고, 수식 밖을 선택하면 KaTeX 표시로 돌아간다.

KaTeX 수식은 전체 객체로 선택한다. 선택 도구의 ‘수식 바로 편집’, 더블클릭, Enter/F2로 편집한다. 일반 수식은 math-editor 초안을 적용/취소한다. 적용 후 본문 입력을 계속한다. 좌우 화살표는 인라인 수식 앞뒤 본문으로 이동한다. Delete/Backspace는 선택 수식을 삭제한다. Esc로 닫은 도구는 명시적으로 다시 선택할 때 열린다. 기존 표/수식 공통 UI와 원본 모델을 유지한다.

검증: Word 단위 610/610 통과. 최종 수식/초안/다이얼로그/선택 도구 Chromium 16/16 통과. 기존 서식 수식의 슬롯 편집 및 수식 표시 전환 12/12, 페이지 분할 27/27, 제품 통합·인쇄 1/1도 확인했다. 초기 실패는 KaTeX의 숨긴 원본 DOM을 대상으로 하던 검사, 폰트 로드 전 페이지 수 비교, 선택 수식 삭제 명령과 기존 편집 전환 경계를 수정한 뒤 재검증했다. KaTeX의 접근성 MathML과 시각 HTML로 인해 전체 textContent가 중복되는 점을 고려하여 원본 슬롯과 표시 DOM을 따로 검증한다. Undo 비교에서는 로드 시각 메타데이터와 빈 marks의 정규화 차이를 제외하고 문서 구조·텍스트·서식을 확인한다. Vite 빌드 통과. 저장소 기존 TypeScript 오류는 남아 있으나 이번 수식 파일의 진단은 없다.

근거: /tmp/word-katex-unit.log, /tmp/word-katex-editor-final.log, /tmp/word-katex-final.log, /tmp/word-katex-regression.log, /tmp/word-katex-build.log, /tmp/word-katex-types.log. 브라우저에서는 기존 샘플의 근의 공식과 괄호 분수를 확인하고, 괄호 분수의 선택 도구 → math-editor → Esc 취소를 확인했다. URL: http://localhost:5180/?sample#word=cf0b5279-e57b-444c-8fab-7cee8e2aac91.

남은 범위: 모든 OMML 구조의 KaTeX 변환, 모든 서식의 math-editor 양방향 편집, 좁은 페이지와 긴 수식의 줄 나눔, 편집/표시 크기 일치, 실제 OS IME와 전체 접근성. KaTeX 표시 도입이 math-editor 자체의 조판 개선을 의미하지 않는다. 한 페이지보다 큰 병합 셀의 내부 분할, 다단 긴 표와 복합 반복 머리행도 계속 남아 있다. Word 전체 완료나 출시 완료로 표시하지 않는다. Word → Slides → Site 순서를 유지한다.


### W6b-6 표시 크기 보정

KaTeX 기본 글자 크기를 본문 대비 1em에서 1.25em으로 늘렸다. 인라인·독립 수식과 인쇄에 같은 비율을 적용한다. 문서에 저장된 글자 크기나 수식 데이터는 변경하지 않는다. 기존 브라우저의 샘플 수식 표시를 확인했고, 수식 표시·편집·Undo·저장·재열기·인쇄 회귀 4/4를 통과했다. 로그: /tmp/word-katex-size.log.


### W6b-6 인라인 분수 조판 보정

전체 배율만 늘려도 textstyle 분자·분모가 작게 남는 문제를 확인했다. 인라인 배치는 유지하고 표시용 LaTeX에 displaystyle을 적용했다. 독립 수식의 displayMode와 저장 원본은 유지한다. 최상위 분수의 분모 글자 크기가 수식 기본 크기와 일치하는지 브라우저에서 측정한다. 기존 샘플의 분수와 괄호 크기를 실제 앱에서 확인했다. 큰 수식의 표시 DOM을 페이지 측정 전에 준비하도록 연결했다. 최초 검증에서 확인한 페이지 위치 오차를 수정했다. 첫 줄 검증은 분수의 개별 글자 대신 수식 전체 상자를 함께 측정한다. 수식·페이지 회귀 31/31, Word 단위 610/610 및 Vite 빌드 통과. 로그: /tmp/word-math-fraction-size.log, /tmp/word-math-fraction-unit.log, /tmp/word-math-fraction-build.log.


### W6b-6 수식 선택 테두리 보정

수식의 선택 요소가 일반 inline 상자라서 테두리가 글자 기준선 높이로만 표시되었다. KaTeX가 적용된 수식 요소를 inline-block으로 변경하여 분수·근호·괄호 전체 높이를 포함한다. 선택 전후 위치·크기가 같고 선택 상자가 표시 수식을 감싸는지 검증했다. 수식 표시·선택 도구·편집·키보드·인쇄 회귀 11/11 통과. 로그: /tmp/word-math-selection-box.log.


## 2026-09-09 — W6b-7: 확장 수식의 양방향 편집

Word의 math-editor bridge에 n제곱근, 위·아래 첨자 동시 입력, 중괄호, 노름, 각괄호를 추가했다. n제곱근은 mathDeg/mathElement와 hideDegree=false로 저장하고, 동시 첨자는 mathSubSup의 본체·아래·위 슬롯으로 저장한다. 새 구조는 공통 수식 편집기의 도구와 자동완성에서 사용할 수 있으며 LaTeX 원문에서도 입력할 수 있다. Word에 별도 수식 도구 UI를 복제하지 않았다. KaTeX 표시도 같은 구조 변환을 재사용한다.

비어 있지만 표시하도록 설정한 근 지수는 유지한다. 숨긴 지수에 원본 내용이 있는 경우에는 편집 변환을 거부하여 내용을 버리지 않는다. 개별 분수 스타일, 수식 글꼴·서식 전체의 양방향 변환과 조건식/여러 줄 수식은 여전히 미지원이다. DOCX 교환 범위를 이번 작업으로 확대했다고 주장하지 않는다.

검증: Word 단위 615/615, 확장 수식·기존 팝업·KaTeX 브라우저 10/10, Vite 빌드 통과. 확장 수식을 원문으로 입력한 뒤 시각 편집으로 전환하고 적용했다. 인라인 편집에서 근 지수 3을 4로 바꾼 뒤 Undo, 저장·재열기, 다시 편집과 취소를 검증했다. 빈 attributes의 저장 정규화 차이는 제외하고 구조·내용·속성을 비교한다. 기존 저장소 TypeScript 진단은 남아 있으나 변경한 수식 파일에는 진단이 없다. 로그: /tmp/word-math-extended-unit.log, /tmp/word-math-extended-final.log, /tmp/word-math-extended-build.log, /tmp/word-math-extended-types.log.

실제 브라우저에서는 ‘Word 확장 수식 검증’ 문서를 만들고 n제곱근·동시 첨자·노름·각괄호·중괄호를 포함한 수식을 입력했다. 원문 → 시각 편집 → 적용 → KaTeX 표시 및 저장됨 상태를 확인했다. URL: http://localhost:5180/?sample#word=bd0e1d5c-dbdf-4e75-a219-647a7b5a6457.

다음 범위는 수식 내 일반 텍스트·서식의 보존, 긴 수식과 좁은 페이지의 배치, 편집/표시 크기 일치다. 큰 병합 셀 내부 분할, 다단 긴 표, 복합 반복 머리행, 실제 OS IME와 전체 접근성은 계속 미완료다. Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-8: 수식 안의 일반 텍스트와 글꼴

math-editor의 textGroup, roman, bold를 Word mathRun의 literal=true, style=p, style=b와 연결했다. `\text{조건: x > 0}`, `\mathrm{sin}`, `\mathbf{AB}`를 원문 또는 공통 시각 편집기로 입력하고 다시 편집할 수 있다. 한글, 공백, 특수문자와 빈 텍스트 그룹을 보존한다. Word 전용 편집 UI나 새 저장 스키마는 추가하지 않았다.

표시용 LaTeX에서도 literal 텍스트는 text 모드로 변환하여 문구의 공백을 유지한다. 화면 검증 중 `\boldsymbol{\mathrm{AB}}`가 로만체로 덮여 굵게 나오지 않는 문제를 확인했다. 직립 굵은 글자는 `\mathbf`, 굵은 literal 문구는 `\textbf`로 표시하도록 수정했다. 브라우저 검증은 저장 속성뿐 아니라 실제 글자 굵기 700도 확인한다.

지원 범위는 각 글꼴 그룹 안의 텍스트다. 분수/첨자를 글꼴 그룹 전체로 감싸거나 글꼴을 중첩하면 적용을 거부하고 초안을 유지한다. 분수 내부의 텍스트에 글꼴을 적용하는 것은 지원한다. 복합 원본 서식과 미지원 글꼴은 기존 Word 직접 편집 경로를 유지한다. 조건식·여러 줄·전체 글꼴 계열 및 DOCX 수식 교환은 이번 완료 범위가 아니다.

실제 브라우저: ‘Word 수식 텍스트·서식 검증’ 문서에서 원문 → 시각 편집 → 적용 → 인라인 재편집으로 조건 값을 0에서 10으로 바꿨다. 빌드 후 재로드된 화면에서 저장 내용, 조건 문구, 로만체와 굵은 AB를 확인했다. URL: http://localhost:5180/?sample#word=d98c6b0e-ab59-4c8f-bff2-5688081df154.

다음 우선순위는 긴 수식과 좁은 페이지 배치, 편집/표시 크기 일치다. 큰 병합 셀 내부 분할, 다단 긴 표, 복합 반복 머리행, 실제 OS IME와 전체 접근성은 미완료다. Word → Slides → Site 순서를 유지한다.

검증: Word 단위 621/621, 수식 팝업·인라인·선택 도구·키보드·확장 서식 브라우저 30/30 및 Vite 빌드 통과. 조건 문구 수정 시 다른 글꼴 속성이 유지되는지, Undo·저장·재열기·취소와 화면 글자 굵기를 확인했다. 기존 직접 편집 검증 문서는 이제 지원되는 literal 단독 대신 실제 미지원 복합 서식을 사용한다. 최초 회귀에서 문서 재로드 후 배치 완료 전에 클릭하던 검증을 고쳤으며, 배치 완료를 기다린 최종 회귀가 통과했다. 전체 TypeScript 검사는 기존 저장소 오류로 실패하지만 변경한 수식 파일의 진단은 없다. 로그: /tmp/word-math-text-unit.log, /tmp/word-math-text-final.log, /tmp/word-math-text-build.log, /tmp/word-math-text-types.log.


## 2026-09-09 — W6b-9: 긴 수식 배치와 편집 기본 크기

Word의 인라인 수식 편집기는 표시된 KaTeX의 기본 글자 크기를 읽어 사용한다. 수식이 없는 위치에 초안을 만들 때도 표시와 같은 1.25배를 사용한다. 기존 본문 크기만 읽어서 편집 진입 시 20% 작아지던 차이를 제거했다. 글꼴과 구조 조판 엔진 자체는 다르므로 모든 글리프와 복합 구조의 픽셀 단위 일치를 완료했다고 보지는 않는다.

너비를 넘는 수식은 문단 안에서 가로로 이동한다. 짧은 수식의 기준선과 배치는 유지한다. 긴 분수에는 위아래 여유와 가로 스크롤바를 제공하고, 스크롤바 조작은 수식 선택 이벤트가 가로채지 않는다. 편집 영역도 문단 너비를 넘지 않으며 내부 수식을 가로로 이동할 수 있다. 공통 MathInlineInput을 그대로 사용하고 Word의 크기·배치 규칙만 조정했다.

인쇄에서는 긴 수식을 문단 너비에 맞게 축소한다. 축소 비율과 넘침 표시는 임시 표시 DOM에만 두며 저장한 Word 원본을 변경하지 않는다. ResizeObserver와 기존 페이지 측정 준비 단계에서 너비 변경을 반영한다. 인쇄 중에는 화면용 너비를 다시 계산하지 않아 축소/확대 반복을 막는다. 매우 긴 수식은 인쇄 글자가 작아질 수 있다. 수학적 의미에 따른 자동 줄 나눔, 페이지 높이를 넘는 행렬 분할은 이번 범위가 아니다.

실제 브라우저에서 ‘Word 긴 수식·크기 검증’ 문서를 만들었다. 긴 분수를 LaTeX로 입력하고, 문단 너비 안의 표시·스크롤바와 인라인 편집 영역을 확인했다. URL: http://localhost:5180/#word=7bf3c9c6-f192-47fe-ad5d-964d65ad3da4. 기존 텍스트·서식 검증 문서는 별도 탭에 유지했다.

다음은 Word의 남은 페이지 구성 항목을 다시 우선순위화한다. 큰 병합 셀 내부 분할, 다단 긴 표, 복합 반복 머리행, 실제 OS IME와 전체 접근성은 미완료다. 수식의 조건식/여러 줄, 복합 글꼴, DOCX 수식 교환도 별도 범위다. Word → Slides → Site 순서를 유지한다.

검증: Word 단위 621/621, 수식·페이지 나눔 Chromium 59/59 통과. 스크롤바와 수식 위아래 여유를 최종 보정한 후 관련 Chromium 13/13 및 Vite 빌드 통과. 기본 글자 크기, 취소 전후 원본·위치·크기, 가로 휠 스크롤, 좁아짐/넓어짐에 따른 넘침 전환, 불필요한 세로 스크롤 없음, 인쇄 너비와 원본 불변을 확인했다. 기존 전체 TypeScript 오류는 남지만 변경한 수식 파일에는 진단이 없다. 로그: /tmp/word-math-layout-unit.log, /tmp/word-math-layout-final.log, /tmp/word-math-layout-controls.log, /tmp/word-math-layout-build.log, /tmp/word-math-layout-types.log.


## 2026-09-09 — W6b-10: 확대·축소 중 수식 편집 상태 유지

문서 확대·축소는 표시 배율만 바꾼다. 수식 초안, 문서에 저장한 글자 크기와 원본 구조는 유지한다. 보기 탭, 확대·축소 버튼, 비율 입력, 보기 메뉴와 Ctrl+휠은 인라인 초안을 적용하거나 취소하지 않는다. 버튼을 클릭해도 수식 입력 포커스와 커서를 유지한다. 비율 입력란은 숫자 입력을 위해 포커스를 받을 수 있다. 다른 리본 탭이나 본문으로 이동할 때의 기존 적용 동작은 유지한다.

공통 math-editor의 React/PureJS 메뉴가 상위 요소의 transform, 크기 변경, 스크롤과 visualViewport 변경을 따라간다. 메뉴 내부 스크롤은 재배치 이벤트에서 제외하여 키보드 선택을 유지한다. Word의 도형 선택 테두리도 배율 변경을 다시 측정하며 스크롤 좌표를 중복 차감하지 않는다. 수식에는 도형 크기 조절 핸들을 표시하지 않는다.

실제 앱 검사에서 높이 1132px 창의 확대 버튼이 편집 중 수식을 화면 밖으로 보내는 문제를 추가로 찾았다. 공통 useWheelZoom은 버튼/메뉴 입력 직전에 최신 위치를 읽고, 제품이 지정한 편집 지점을 기준으로 확대할 수 있게 했다. Word는 활성 수식 입력 위치를 제공한다. 휠은 기존 포인터 기준을 유지한다. 실제 열린 문서에서 75% → 100% → 125% 동안 입력 포커스와 화면 내 수식 위치를 확인했다. 검증 후 100%로 복원하고 초안을 취소했다. 기존 원본은 수정하지 않았다. URL: http://localhost:5180/?sample#word=d98c6b0e-ab59-4c8f-bff2-5688081df154.

검증: Word 단위 621개, math-editor 단위 548개 통과. Word 수식/확대·축소 Chromium 24개, 도형 선택·범위 선택·크기 조절 3개, React/PureJS 메뉴 6개 통과. 마지막 커서 기준 확대 보정 후 Word 관련 11개와 Slides 확대·축소 3개를 재검증했다. math-editor 패키지 빌드와 최종 Word Vite 빌드 통과. 전체 TypeScript 검사는 기존 저장소 오류로 실패하며 이번 변경 파일의 진단은 없다. visualViewport는 Chromium CDP 1.25배와 창 크기 변경으로 검증했다. 모든 OS/브라우저의 확대 제스처를 검증한 것은 아니다. 로그: /tmp/word-math-zoom-final.log, /tmp/word-zoom-drawing-final.log, /tmp/word-zoom-math-browser.log, /tmp/word-zoom-anchor.log, /tmp/word-zoom-slide.log, /tmp/word-zoom-build-final.log, /tmp/word-zoom-types-final.log.

다음은 큰 병합 셀 내부 분할, 다단 긴 표와 복합 반복 머리행 등 Word의 남은 페이지 구성이다. 수식의 조건식/여러 줄, 복합 글꼴, DOCX 수식 교환, 실제 OS IME와 전체 접근성도 미완료다. Word 전체 완료나 출시 완료로 표시하지 않는다. Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-11: 수식별 크기 설정

Word 수식 선택 도구에 50~300% 크기 입력과 기본 크기 복원을 추가했다. 수식의 oMath.fontScale 속성으로 저장하고, 기본 크기는 속성을 제거하여 주변 문서의 글자 크기를 상속한다. 화면 확대·축소와 별도 값이다. 공통 office-ui NumberField/Button과 FloatingSurface를 사용한다. 수식 크기를 바꾸면 실제 글자 크기와 문서 흐름의 너비·높이가 변경된다. 도형 선택 핸들을 재사용하지 않는다.

공통 office-text 수식 렌더러가 크기를 적용하므로 KaTeX 표시와 기존 Word 렌더러가 같은 값을 사용한다. 인라인 편집기는 표시된 글자 크기를 읽고, 적용할 때 수식의 기존 속성을 보존한다. 수식 초안의 내용 편집과 크기 변경은 각각 실행 취소할 수 있다. 버튼과 자동완성 메뉴는 수식 크기와 별도로 UI 글자 크기를 유지한다. 앱 문서 저장·재열기와 기본 크기 복원을 확인했다. DOCX 수식 크기 교환은 이번 구현에 포함하지 않는다.

실제 열린 문서에서 100% → 200% 크기 설정, 선택 테두리, 인라인 편집 진입과 버튼 크기를 확인했다. 편집 초안은 취소하고, 200% 수식 크기는 저장했다. 수학 내용은 변경하지 않았다. 최종 화면은 200% 수식의 선택 도구다. URL: http://localhost:5180/?sample#word=d98c6b0e-ab59-4c8f-bff2-5688081df154.

검증: Word 수식·편집·확대 관련 Chromium 17개 통과 후, UI 크기·인쇄·대체 렌더러까지 포함한 크기 전용 4개 통과. 서로 다른 브라우저 시나리오는 총 18개다. Word 단위 624개 통과: 마지막 전체 실행 614개와 math-editor/react 모듈 해석 실패로 수집되지 않은 두 파일의 재실행 10개를 합한 수다. 공통 수식 렌더러 검사 4개와 최종 Word Vite 빌드 통과. 새 속성을 conformance의 편집 가능한 속성 목록에 등록했고 문서의 속성 수를 1,041개로 수정했다. 전체 TypeScript 검사는 기존 오류가 남지만 변경 파일의 진단은 없다. 로그: /tmp/word-math-size-final-browser.log, /tmp/word-math-size-extra.log, /tmp/word-math-size-final-unit.log, /tmp/word-math-size-recheck.log, /tmp/word-math-size-renderer.log, /tmp/word-math-size-build.log, /tmp/word-math-size-types.log.

수식별 크기 설정은 완료했다. 다음 주력은 큰 병합 셀 내부의 페이지 분할이며, 이후 다단 긴 표와 복합 반복 머리행을 진행한다. 수식 조건식/여러 줄, 복합 글꼴과 DOCX 수식 교환은 별도 후속 범위다. 실제 OS IME와 전체 접근성도 남아 있다. Word 전체 완료나 출시 완료는 아니며 Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-12: 표 전체 너비를 차지하는 긴 병합 셀

한 페이지보다 긴 전체 너비 셀을 문단 경계에서 나누어 다음 페이지에 이어 표시한다. 전체 열을 합친 셀과, 아래의 빈 행을 포함하는 세로 병합을 지원한다. 원본 행·셀·문단은 유지한다. 병합 셀 안에 페이지 간격 장식을 넣고, 배경과 옆 테두리가 페이지 사이로 이어지지 않도록 가린다. 다음 페이지에는 머리행을 반복한다. 페이지 측정 중에는 CSSOM 규칙으로 간격 장식만 숨기므로 편집 DOM 변경이나 입력 기록을 만들지 않는다.

적용 범위는 단일 단 문서의 직접 문단/제목을 가진 전체 너비 셀이다. 행 분할 금지, 고정 행 높이, 명시한 셀 가운데/아래 정렬은 기존 배치를 유지한다. 제목의 기본 keepNext와 문단에 직접 지정한 keepNext는 해당 경계에서 분할하지 않는다. 일반 행 경계 분할도 유지한다. 여러 열에 다른 셀이 함께 있는 세로 병합, 한 문단 자체가 페이지보다 긴 경우, 중첩 표·목록, 다단 문서와 복합 문단 스타일은 다음 범위다. 큰 병합 셀 전체 지원 완료로 표시하지 않는다.

실제 브라우저에 한국어 문단 54개를 가진 2열·3행 병합 예제를 열었다. 4페이지 분할, 마지막 페이지의 머리행, 병합 뒤의 일반 행과 본문을 확인했다. 49번째 문단에 검증 문구를 입력하고 메뉴로 실행 취소했다. 최종 화면에 페이지 경계와 원래 문단을 표시했다. URL: http://localhost:5180/?sample=merged-cell#word=bf8ec4a6-68d6-4918-965d-f36de095aaa1. 기존 수식 검증 문서는 변경하지 않았다.

검증: 기존 Word 단위 624개와 추가 분할 조건 단위 8개 통과. 표·머리행·페이지 Chromium 32개 통과. 마지막 분할 조건 보완 후 전용 Chromium 2개와 단위 8개 재검증 및 최종 Vite 빌드 통과. 확대·축소 후 페이지 수와 원본 유지, 다음 페이지 입력·실행 취소·저장·재열기, 인쇄에서 문단 72개가 각각 한 번씩 표시되는 것을 확인했다. 브라우저 기본 middle 값을 문서 정렬로 취급해 발생한 중간 검사 실패는 수정 후 재검증했다. 전체 TypeScript 검사는 기존 저장소 오류로 실패하며 변경한 페이지 분할 파일의 진단은 없다. 로그: /tmp/word-cell-pages-unit.log, /tmp/word-cell-pages-guards-final.log, /tmp/word-cell-pages-final-browser.log, /tmp/word-cell-pages-final-recheck.log, /tmp/word-cell-pages-build-final.log, /tmp/word-cell-pages-types-final.log.

다음 우선순위는 다른 열의 셀이 함께 있는 병합 그룹과 긴 셀 내부 문단의 분할이다. 이후 다단 긴 표와 복합 반복 머리행을 진행한다. 수식 조건식/여러 줄·복합 글꼴·DOCX 교환, 실제 OS IME와 전체 접근성도 미완료다. Word 전체 완료나 출시 완료가 아니며 Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-13: 병합 셀 안의 긴 문단을 줄 단위로 분할

전체 너비 병합 셀의 한 문단이 페이지 본문 높이를 넘으면 줄 경계에서 다음 페이지로 이어 표시한다. 기존 본문 페이지 분할의 줄 측정과 텍스트 위치 계산을 재사용한다. 원본 셀·문단·텍스트 노드를 복제하거나 나누지 않는다. 페이지보다 짧은 문단은 기존처럼 문단 경계에서 분할한다. 문단 keepLines, 떠 있는 객체 뒤의 안전한 경계, 문단 시작·끝의 외톨이 줄 방지 조건을 반영한다.

셀 내부 페이지 간격은 텍스트 위치에 붙는 인라인 장식이다. 반복 머리행의 실제 텍스트 노드가 커서 위치에 포함되는 문제를 브라우저 입력 검사로 확인했다. 해당 머리행은 CSS 생성 콘텐츠로 표시하여 본문 텍스트 오프셋을 유지한다. 장식 내부 배경에도 chrome 표식을 지정해 HTML 복사에서 반복 머리행 구조까지 제거한다. 표 밖의 일반 머리행과 원본 머리행은 그대로 둔다.

실제 브라우저에 한국어 문장 80개를 한 문단으로 만든 4페이지 예제를 열었다. 첫 페이지와 다음 페이지의 줄 연결·반복 머리행을 확인하고, 두 번째 페이지 문장에 검증 문구를 입력한 뒤 편집 메뉴로 실행 취소했다. 최종 화면은 페이지 경계와 원래 문단이다. URL: http://localhost:5180/?sample=merged-cell-lines#word=7631c4f8-93c4-4f2b-b316-7a1f98102ed5. 기존 병합 셀·수식 검증 문서는 유지했다. 이 검사는 한국어 문자열 입력이며 실제 OS IME 조합 검증 완료를 뜻하지 않는다.

검증: Word 단위 634개, 표·페이지 Chromium 33개 및 Vite 빌드 통과. 긴 문단의 중간 입력, 실행 취소, 확대·축소 후 페이지 수와 원본 유지, 저장·재열기, 복사에서 장식 제외를 검사했다. 인쇄 복제본의 각 글자 위치를 확인하여 전체 원문과 순서·개수가 일치함을 검증했다. 실행 취소의 빈 marks 배열과 재로드의 loadedAt은 비교 시 정규화하고 문서 내용·구조·속성을 비교했다. 전체 TypeScript 검사는 기존 저장소 오류로 실패하며 변경한 페이지 분할 파일의 진단은 없다. 로그: /tmp/word-cell-lines-unit-final.log, /tmp/word-cell-lines-regression.log, /tmp/word-cell-lines-build.log, /tmp/word-cell-lines-types.log. 화면: /tmp/word-merged-cell-long-paragraph.png.

다음은 다른 열의 셀이 함께 있는 병합 그룹이다. 다단 긴 표, 중첩 내용과 복합 반복 머리행은 미완료다. 수식 조건식/여러 줄·복합 글꼴·DOCX 교환, 실제 OS IME와 전체 접근성도 후속 범위다. Word 전체 완료나 출시 완료는 아니며 Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — 표 크기 조절과 셀 선택의 분리

열·행 경계의 크기 조절은 현재 선택과 별도로 동작한다. Word 어댑터가 드래그 시작과 적용 시 셀을 강제로 선택하던 코드를 제거했다. 경계에서 결정한 표·열·행에 크기 속성만 트랜잭션으로 적용한다. 선택 기반 도구의 표 그리드 속성 생성은 공통 함수로 재사용하며, 기존 도구의 선택 검증은 유지한다.

공통 office-text 경계 어댑터는 문서 캡처 단계에서 해당 편집기 안의 경계 동작을 먼저 처리한다. 등록 순서 때문에 셀 선택 어댑터가 같은 드래그를 시작하던 문제를 수정했다. 기존 커서와 선택을 유지하고, 크기 조절 경계의 클릭·드래그·Esc 취소·적용·실행 취소는 새로운 셀 선택을 만들지 않는다. 일반 셀 내부의 드래그 선택은 유지한다.

검증: 객체 배치 단위 10개, 크기 조절·일반 셀 선택·병합 행 Chromium 19개 및 최종 Vite 빌드 통과. 현재 열린 병합 셀 문서에서 표 밖 문단에 커서를 놓고 열 경계를 드래그했다. 홈 리본과 커서가 유지되며 셀 선택 없이 너비가 바뀌는 것을 확인했다. 검증 후 실행 취소로 기존 너비를 복원했다. 로그: /tmp/word-resize-selection-unit.log, /tmp/word-resize-selection-final.log, /tmp/word-resize-selection-build-final.log. 다음 기능 우선순위는 다른 열의 셀이 함께 있는 병합 그룹으로 유지한다.


## 2026-09-09 — W6b-14: 여러 열의 긴 병합 셀을 함께 페이지 분할

같은 행에서 시작해 같은 행까지 병합된 여러 셀을 다음 페이지로 이어 표시한다. 각 열에서 글자가 없는 공통 문단 경계를 찾아 페이지 간격을 함께 넣는다. 문단 시작점이 조금 달라도 이전 문단의 끝과 다음 문단의 시작 사이가 겹치면 분할할 수 있다. 한쪽 열의 줄바꿈 뒤에 큰 빈 페이지가 생기던 중간 구현을 실제 화면에서 확인하고 공통 빈 구간 측정으로 보완했다. 페이지보다 긴 문단의 기존 줄 위치도 안전한 후보로 사용한다.

각 열의 원본 셀과 텍스트는 유지한다. 내용이 끝난 열에는 불필요한 간격을 넣지 않는다. 첫 번째 활성 셀의 장식이 표 전체 너비의 배경·테두리와 머리행을 한 번만 표시한다. 다른 활성 셀은 같은 높이의 빈 간격만 가진다. 첫 열이 먼저 끝난 경우에도 다음 활성 열에서 전체 너비를 계산한다. 확대·축소 비율을 측정에서 제외한다.

이번 범위는 단일 단 문서, 위쪽 정렬, 직접 문단/제목, 같은 시작·끝 행의 병합이다. 행 분할 금지, 고정 행 높이, 문단 keepNext 조건은 유지한다. 서로 다른 행에서 시작하거나 끝나는 세로 병합, 공통 분할 위치가 없는 복합 내용, 중첩 표·목록, 다단 표는 아직 지원 범위 밖이다. 일반적인 모든 병합 표의 분할을 완료한 것으로 표시하지 않는다.

검증: Word 단위 640개, 표·페이지·크기 조절·셀 선택 Chromium 26개와 최종 Vite 빌드 통과. 2열·3열, 먼저 끝나는 열, 한쪽 열의 줄바꿈, 다음 페이지 입력·실행 취소, 확대·축소, 저장·재열기를 검사했다. 인쇄에서는 88개 문단이 열별 순서대로 한 번씩 표시되는 것을 검사했다. 중간 회귀 실행의 재로드 문서 ID 불일치는 코드 수정과 실행이 겹친 상태에서 발생했으며, 코드 변경 없이 전체 26개를 재실행해 통과했다. 전체 TypeScript 검사는 기존 저장소 오류로 실패한다. 이번에 변경한 페이지 분할 파일의 진단은 없다.

실제 앱에 한국어 54문단·34문단의 2열 예제를 열었다. 오른쪽 셀에 검증 문구를 입력해 줄바꿈과 페이지 이어쓰기를 확인하고 실행 취소했다. 브라우저에는 원본 내용의 페이지 경계를 표시했다. URL: http://localhost:5180/?sample=merged-cell-columns#word=5c4d7a09-c80c-4c1a-9ef3-136048790280. 이는 한국어 문자열 입력 검사이며 실제 OS IME 조합 검사 완료를 뜻하지 않는다.

근거: /tmp/word-parallel-unit-final.log, /tmp/word-parallel-regression-final.log, /tmp/word-parallel-build-final.log, /tmp/word-parallel-types-final.log. 화면: /tmp/word-parallel-merged-cells.png.

다음 우선순위는 서로 다른 행에 걸친 병합과 공통 분할 구간이 없는 열의 독립 페이지 계획이다. 이후 다단 표·중첩 내용·복합 머리행을 진행한다. 수식 조건식/여러 줄·복합 글꼴·DOCX 교환, 실제 OS IME와 전체 접근성도 남아 있다. Word 전체 완료나 출시 완료는 아니며 Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6b-15: 연속 세로 병합 셀과 일반 행의 페이지 분할

여러 행을 합친 연속 세로 병합 셀 옆에 일반 행들이 있는 표를 다음 페이지로 이어 표시한다. 일반 행 경계와 병합 셀의 문단 사이에서 공통 빈 구간을 찾는다. 병합 셀과 다음 일반 행에 같은 페이지 간격을 넣고, 머리행·배경·테두리는 전체 표 너비로 한 번만 표시한다. 병합 셀이 왼쪽 또는 오른쪽에 있는 경우와 병합 셀의 내용이 먼저 끝난 경우를 처리한다. 원본 행·셀·텍스트 구조를 바꾸거나 추가 행으로 rowspan을 변경하지 않는다.

일반 셀의 내용이 행 높이를 결정하거나 문서에 지정한 최소 높이가 행 높이를 결정하는 경우에 적용한다. 브라우저가 병합 셀의 초과 높이를 여러 행에 배분한 경우는 아직 제외한다. 최소 행 높이의 빈 공간은 다음 페이지의 내용 뒤에 별도 장식으로 유지하여 페이지 간격을 흡수하지 않게 한다. Word의 행 높이 드래그 시작값은 페이지 장식을 숨긴 상태에서 읽는다. 따라서 페이지 사이의 빈 공간을 행 높이 속성으로 저장하지 않는다.

이번 범위는 단일 단 문서, 위쪽 정렬, 직접 문단/제목, 병합 구간 전체를 잇는 셀과 옆의 일반 행이다. 행 분할 금지·고정 행 높이·문단 keepNext는 유지한다. 서로 다른 행에서 시작하고 끝나는 여러 병합이 교차하는 표, 공통 분할 위치가 없는 복합 내용, 병합 셀이 일반 행보다 훨씬 길어 높이를 배분해야 하는 경우, 중첩 표·목록과 다단 표는 남아 있다. 모든 병합 표의 분할 완료가 아니다.

검증: Word 단위 648개, 표·페이지·크기 조절·셀 선택 Chromium 29개, 최종 Vite 빌드 통과. 신규 조건 단위 8개와 브라우저 3개를 포함한다. 오른쪽 병합, 일반 셀의 줄바꿈, 다음 페이지 입력·실행 취소, 확대·축소, 저장·재열기, 페이지를 잇는 행의 높이 드래그를 검사했다. 인쇄에서는 병합 셀 문단 48개와 일반 셀 문단 48개의 순서·개수를 확인했다. 검사 중 일반 셀에 rowspan="1"이 렌더링되는 것을 반영해 테스트 선택자를 보정한 뒤 최종 29개를 재검증했다. 전체 TypeScript 검사는 기존 저장소 오류로 실패하며 이번에 변경한 표 분할·크기 조절 파일의 진단은 없다.

실제 브라우저에 24행을 합친 셀과 옆의 일반 행 24개를 가진 예제를 열었다. 다음 페이지의 일반 셀에 QA를 입력하고 실행 취소했다. 이어지는 행의 하단 경계를 20px 드래그해 높이 변경과 분할 유지를 확인하고 도구의 실행 취소로 복원했다. 검증 전에 있던 텍스트는 유지했다. URL: http://localhost:5180/?sample=merged-cell-rows#word=f2c3a7be-0e53-49ae-a134-96ad2f55ec9b.

근거: /tmp/word-staggered-unit-final.log, /tmp/word-staggered-regression-final.log, /tmp/word-staggered-build-final.log, /tmp/word-staggered-types.log. 화면: /tmp/word-staggered-merged-cells.png.

다음은 서로 다른 높이의 병합이 교차하는 표와 열별 독립 분할 계획이다. 이후 다단 표·중첩 내용·복합 머리행을 진행한다. 수식 조건식/여러 줄·복합 글꼴·DOCX 교환, 실제 OS IME와 전체 접근성도 남아 있다. Word 전체 완료나 출시 완료가 아니며 Word → Slides → Site 순서를 유지한다.


## 2026-09-09 — W6c-1: 문단 서식 복사와 연속 적용

사용자 요청에 따라 표 확장은 W6b-15에서 보류한다. 교차 병합·독립 분할·다단 표의 남은 범위는 보류 목록으로 유지한다. 아래 우선순위가 이전 기록의 “다음 표 작업”을 대체한다.

- 이번 구현: 글자 서식 복사에 문단 정렬·들여쓰기·앞뒤 간격·줄 간격 복사를 추가했다. 메뉴와 리본 이름은 “서식 복사”로 통일했다.
- 사용 방법: 기준 문단에 커서를 두고 홈의 서식 복사를 누른다. “문단 서식 포함”을 켜고 대상 문단을 클릭한다. 텍스트 범위를 선택하면 글자 서식도 적용한다. “연속 적용”을 켜면 여러 대상에 적용한다. Esc·취소·본문 입력·문서 교체로 종료한다.
- 문단 형식 복사는 제목 레벨·스타일 ID·목록 구조·페이지 나눔 속성을 바꾸지 않는다. 텍스트 링크는 대상에 유지한다. 글자 서식은 원본 선택 시작점의 서식을 사용한다.
- 각 적용은 별도 실행 취소 단계다. 변경 추적 중 문단 속성의 이전 값을 기록하고 거부 시 복원한다. 글자와 문단 변경은 별도 검토 항목이다. 변경 추적 중 비어 있는 문단에는 검토 표시를 고정할 텍스트가 없어 적용하지 않는다.
- 공통 모듈: office-editor-ui가 반복·취소·선택 복원을 맡는다. Word는 복사할 속성을 결정한다. 옵션 버튼과 상태 영역은 office-ui를 사용한다. 툴바로 포커스가 이동한 뒤 범위를 읽는 기능은 명시적으로 요청한 서식 복사에만 허용한다. 다른 에디터·수식 입력의 범위는 제외한다.
- 검증: Word 단위 652개, 공통 선택/툴바 단위 7개, Chromium 작성·클립보드·서식·검토 회귀 68개 통과. 서식 복사 브라우저 8개는 이 68개에 포함된다. 문단 클릭·키보드 대상 선택·연속 적용·단계별 Undo/Redo·Esc·저장/재열기를 검사했다. Word Vite 빌드 통과. 전체 TypeScript 검사는 기존 공통 소스 오류로 실패하며, 이번 수정 파일에 대한 진단은 없었다.
- 실제 앱 검증: `http://localhost:5180/?sample=format-painter#word=ea5a2657-13fd-4799-9f1d-17d441f63c7b`에서 두 문단의 정렬·간격 적용과 Esc 종료를 확인했다. 적용 결과가 있는 예제 탭을 열어 두었다.

다음 순서: (1) 스타일 생성·수정·현재 서식으로 업데이트와 문서 전체 반영, (2) 책갈피·상호 참조, (3) DOCX 지원 범위를 명시한 저장/교환 및 작성·검토 마감 검증. Word 전체 기능이나 출시 완료를 의미하지 않는다.


### 2026-09-09 — W6c-1 페이지 기본 여백 수정

서식 복사 예제처럼 용지 크기·여백을 생략한 구역에서 본문이 종이 왼쪽 끝에 붙고 눈금자와 종이 너비가 맞지 않았다. 페이지 계산은 기본값을 사용했지만 화면의 flowCss는 명시된 값만 적용한 것이 원인이다. Word 페이지 렌더러가 페이지 계산과 같은 sheetMetrics로 너비·좌우 여백을 정하도록 수정했다. 문서에 지정된 0 여백과 제본 여백도 유지한다. 기존 저장 문서에도 적용되며 문서 내용을 바꾸지 않는다.

검증: 수정 전 누락된 페이지 설정 사례의 너비 검사 실패를 재현했다. 수정 후 페이지 설정·확대/축소·서식 복사 브라우저 23개 통과. 눈금자 정렬 검사를 보강한 전용 4개를 다시 실행해 모두 통과했다(23개 중 같은 4개). 생략/일부 설정·가로 방향·0 여백·제본 여백·저장/재열기·인쇄 사본을 검사했다. Word 단위 652개와 Vite 빌드 통과. 실제 열린 서식 복사 문서에서도 종이·본문 여백·눈금자 정렬을 확인했다. 다음 기능은 스타일 관리이며 표 확장 보류는 유지한다.


## 2026-09-09 — W6c-2: 문단 스타일 관리

홈 리본의 스타일 상세 설정 또는 서식 → 스타일 관리에서 문서의 문단 스타일을 관리한다. 새 스타일은 현재 문단 서식을 기준으로 만들고 선택 문단에 적용한다. 기존 스타일은 이름·글꼴·크기·색·굵게/기울임·정렬·줄 간격·문단 앞뒤 간격을 수정한다. “현재 문단 서식 가져오기”로 초안을 채운 뒤 “변경 저장”을 누르면 같은 스타일을 사용하는 문단에 함께 반영된다.

리본 목록은 문서의 사용자 스타일과 저장된 이름을 읽는다. 스타일 적용은 문단 직접 서식을 교체하고 글자별 강조·링크·제목 레벨은 유지한다. 초안을 수정한 상태에서는 저장된 스타일 적용 버튼을 비활성화한다. 생성·적용·수정은 각각 실행 취소할 수 있고 로컬 저장·재열기 후에도 유지된다. 중복 이름·잘못된 수치·이전 문서 대상·읽기 전용을 명령 단계에서 거부한다.

공통 역할: office-ui Dialog/Property/TextField/ChoiceSelect로 도구를 구성했다. ChoiceSelect에 항목별 비활성화 옵션을 추가했다. Word 모델은 createParagraphStyle/updateParagraphStyle/applyParagraphStyle 명령과 styleDef 자원을 관리한다. 생성 시 새 스타일 ID를 발급한다. 수정은 ID·상속 연결·다음 스타일·제목 속성을 유지한다. 선택한 문단의 스냅샷은 모달을 여는 시점에 보관한다.

검증: Word 단위 655개, Chromium 스타일·서식 복사·기본 입력·메뉴·페이지 여백 26개와 Vite 빌드 통과. 스타일 전용 브라우저 5개가 이 26개에 포함된다. 생성·두 문단 동시 반영·이름 변경·리본 적용·Undo/Redo·취소·중복 이름·현재 문단에서 업데이트·저장/재열기·변경 추적 중 비활성화를 검사했다. 전체 TypeScript 검사는 기존 공통 소스 오류로 실패하며 이번 수정 파일의 진단은 없었다.

실제 앱: `http://localhost:5180/?sample=styles#word=f45dbb55-9239-4b43-9eba-65482bcfbf53`에서 보고서 본문 스타일을 13pt에서 16pt로 바꾸고 두 문단이 함께 변경되는 것을 확인했다. 기본 본문 스타일의 세 번째 문단은 그대로다. 적용 결과 탭을 열어 두었다.

범위 제한: 문단 스타일 생성·수정·적용은 변경 추적을 끈 상태에서 지원한다. 글자별 강조는 스타일 캡처 대상이 아니다. 스타일 삭제, 상속 관계 편집, 사용자 지정 다음 스타일, 글자 전용 스타일과 고급 DOCX 스타일 보존은 후속 범위다. 표 확장은 보류한다. 다음은 책갈피·상호 참조이며 Word 전체/출시 완료를 선언하지 않는다.


## 2026-09-10 — W6c-3: 책갈피와 상호 참조

참조 리본과 삽입 메뉴에 책갈피·상호 참조를 연결했다. 선택한 텍스트 범위에 이름을 붙이거나 커서 위치에 보이지 않는 위치 책갈피를 삽입한다. 목록에서 이름 변경·삭제·위치 이동을 제공한다. 상호 참조는 커서의 실제 위치에 삽입하며 앞뒤 텍스트를 보존한다. 클릭 또는 Enter/Space로 원본 위치로 이동한다.

공통 office-text의 documentBookmarks가 범위 표시와 위치 앵커를 함께 읽는다. 같은 이름의 범위가 여러 텍스트 노드로 나뉘면 문서 순서로 합친다. fieldRef도 이 인덱스를 사용해 원본 텍스트 변경을 반영한다. 위치 책갈피의 텍스트 참조는 위치 이름을 표시한다. 이름 변경은 연결된 필드의 대상도 한 트랜잭션에서 바꾼다. 삭제는 본문을 유지하고 참조에 대상 없음 표시를 남긴다. Undo로 복원한다. 계산된 참조 필드는 직접 입력을 받지 않는다.

Word 명령: addWordBookmark, renameWordBookmark, deleteWordBookmark, insertWordReference. rootId와 선택 스냅샷을 검증하며 중복 이름·읽기 전용·변경 추적 중 쓰기를 거부한다. 관리 UI는 office-ui Dialog/ChoiceSelect/TextField/Button을 사용한다. 기존 범용 insertBookmark 명령은 변경하지 않았고 Word 제품 UI는 정확한 커서 위치를 처리하는 새 명령을 사용한다.

검증: Word 단위 658개, 공통 field-resolver 12개 및 Vite 빌드 통과. Chromium 61개 중 최초 59개 통과. 두 실패는 이전 페이지 CSS 문자열(pt)과 표 선택 후 홈 탭 유지 가정이었다. 실제 계산된 크기(px)와 명시적 홈 탭 전환으로 검사를 수정한 뒤 해당 2개 모두 통과했다. 이 기록은 61개 전체를 한 번에 통과한 것으로 표시하지 않는다. 책갈피 전용 3개는 이름 변경·삭제·Undo·재열기·커서 삽입·마우스/키보드 이동·원본 입력에 따른 갱신·범위/위치 책갈피 생성을 검사한다. 이름 입력/버튼 배치를 정리한 최종 UI에서 책갈피 전용 3개와 빌드를 재검증해 통과했다. 기존 TypeScript 오류는 남아 있고 이번 수정 파일의 진단은 없었다.

실제 앱 `http://localhost:5180/?sample=references#word=c8c6620d-9564-4815-ae58-81816cd92664`에서 참조 탭의 입력 창을 열고 목표 참조를 삽입한 뒤 원본 위치로 이동했다. 예제 탭을 열어 두었다.

제한: 범위 책갈피 생성은 한 문단/제목의 직접 텍스트 노드 범위, 위치 책갈피와 참조 삽입은 같은 종류 문단의 텍스트 커서다. 쓰기 동작은 변경 추적을 끈 상태에서 지원한다. 참조 표시는 텍스트/위치 이름 또는 above/below다. 페이지 번호·문단 번호 참조, 다중 문단 범위, 고급 DOCX 필드 교환은 미지원이다. 다음은 DOCX 지원 범위를 명시한 교환 검증과 작성·검토 마감이다. 표 보류와 Word → Slides → Site 순서를 유지한다.


## 2026-09-10 - W6c-4a: DOCX style exchange

DOCX now carries paragraph/character style definitions, references, names, basedOn/next/link relationships and document defaults. Inherited paragraph formatting stays in the style rather than being copied into runs. Import preserves basic indents, spacing and outline levels. Explicit false character properties, cyclic style links and invalid style files are handled. A successful import closes both file dialogs.

Verification: Word unit suite 663 passed; related Chromium scenarios 8 passed; Vite build passed. Tests cover real file download/reopen, shared style edits affecting both rendered runs, undo/redo, persistence and the previous document. In-app browser export scope and download were checked on the existing style document. Full TypeScript checking still reports existing shared-source errors, with no diagnostics in the changed DOCX files.

Scope and limitations: docs/specs/word-docx-exchange.md. This is not complete DOCX fidelity. Microsoft Word/LibreOffice desktop acceptance has not been run. Next is W6c-4b bookmark and REF field exchange, then writing/review acceptance. Table expansion remains paused; product order remains Word, Slides, Site.


## 2026-09-10 - W6c-4b: DOCX bookmarks and REF exchange

The converter now writes bookmark markers and REF fields, with cached display text. Import reads both simple and complex REF fields, including instructions split across runs. Text ranges within a paragraph, multi-run/overlapping ranges and point anchors retain their targets. Reference links and above/below switches survive exchange. Unsupported, nested or locked fields stay cached text; no instruction is evaluated. Invalid marker pairs and unsupported bookmark ranges are reported. Incompatible names are normalized with collision handling and reference remapping, without editing the source document.

Verification: Word unit suite 671 passed; DOCX subset 20 tests. Related Chromium suite 8 passed; production build passed. The file round-trip test checks actual download/import, reference navigation, source editing, rename/delete, undo, reload and preservation of the original document. Full TypeScript checking still reports existing shared-source errors, with no diagnostics in the changed files.

The in-app browser demo at http://localhost:5180/?sample=references-docx#word=a011da0b-ab4b-4a35-92f3-7677b6902723 uses real DOCX export/read before loading. Reference navigation, a source edit and undo were checked live. The tab remains available.

Scope: one-paragraph text/point bookmarks and REF text/above-below. Multi-paragraph/table-column/object ranges and page/paragraph-number fields remain outside this milestone. A point target's text REF may become empty when recalculated in external Word; the export dialog warns. See docs/specs/word-docx-exchange.md for details. External Word/LibreOffice acceptance is not claimed.

Next: writing/review acceptance covering input, TOC, comments/tracking and persistence. Table expansion stays paused. Product order remains Word, Slides, Site.


## 2026-09-10 — W6c-5: Writing and review acceptance

Fixed three review defects. The Word host now records the current UTC date for each new comment, reply and revision instead of the fixed sample date. Existing entries retain their original date. Comment editing and replies ignore composition Enter (including keyCode 229). A handled submit Enter prevents its native default: restoring the editor selection during a comment command must not also replace or split the selected body text.

Regression evidence: the new browser checks first reproduced the fixed date and early IME submission. Extending them through comment editing exposed the lost body anchor before any reload. Preventing native Enter preserved both body text and the anchor. The library test now waits for its open dialog to close before editing an identically titled document; a title assertion alone could pass while the previous document was still open.

Final verification: 52/52 Chromium checks across writing-persistence, input-after-composition, input-space-after-composition, toc-editing, word-review, review-persistence, autosave, document-library and product-integration. They cover composition drafts/commit/cancel, deletion/undo, repeated spaces, paste, TOC updates, comments/replies, revision recording/accept/reject, automatic save, reopen, conflicting drafts, failed-write retry and existing long-report print output. Word unit tests: 671/671. Vite production build passed with the existing chunk-size warning. Full TypeScript still reports existing shared-source errors; no diagnostic names the changed comments pane or Word host.

In-app browser: http://localhost:5180/?sample#word=0a251236-f7a6-4b6b-8eaf-8410fc1289d6. Added a comment, edited it to “Review!” with Enter and sent “OK” as a reply. The body, linked comment, dates and saved status were checked on screen. This is a separate sample document.

Limits: Chromium composition is driven through CDP and composition-key events, not the operating system's IME. No mobile, screen-reader, external Word/LibreOffice or service-collaboration acceptance is implied. Reviewer identity remains the local demo host identity. Next: long-document performance and keyboard accessibility against explicit acceptance criteria. Table expansion remains paused. Product order remains Word → Slides → Site.


## 2026-09-10 — W6c-6: Captions and automatic numbering

User deferred accessibility work and requested further product specifications. Added caption insertion to the References ribbon and Insert menu. The office-ui dialog captures a body block before taking focus, lets the user choose Figure/Table/Equation, above/below and a description, and applies one undoable transaction. A picture selection inserts a caption paragraph beside the picture's paragraph. A table-cell caret resolves to the outer body table. A selection spanning different body blocks is rejected. Read-only, tracking, stale roots/deleted targets, locked/content-control targets and unsupported containers cannot accept insertion.

The caption uses the existing shared office-text fieldSeq resolver: each category counts independently in document order. Adding/removing a caption recomputes following numbers. The computed number is noneditable; its description remains normal editable text. No new schema or independent numbering engine was added. Native save/reopen keeps the sequence. Commands: 184 total / 172 Word-owned; insertWordCaption is registered in the conformance production inventory.

Verification: Word unit tests 674/674; shared field resolver 12/12; related Chromium scenarios 12/12; Vite production build passed. The initial full unit run identified the missing conformance inventory entry; adding the actual fieldSeq production fixed it. Browser coverage includes above/below placement, independent numbering, renumbering, undo/redo, description editing, cancel, tracking, selected-picture placement and reload. Existing shared TypeScript diagnostics remain; none name the changed caption/host/ribbon/renderer files.

In-app browser: http://localhost:5180/?sample=captions#word=a8fc1e15-32d5-4496-b3fb-39ef14e5dc31. Selected the second picture and inserted “제품별 비교” through the dialog. The screen shows “그림 1: 분기별 성장” and “그림 2: 제품별 비교”; saved status confirmed. The sample remains open.

Scope: body captions with three labels and decimal numbering. Captions remain independent paragraphs, not object-bound metadata; moving/deleting an object alone does not move/delete its caption. Custom labels, chapter numbering, caption-specific cross-references, table of figures and DOCX SEQ exchange are not part of this milestone. The existing DOCX converter warns and substitutes unsupported sequence fields; native .word.json is the preservation format. Next: caption references and table of figures. Accessibility and table expansion stay deferred; Word → Slides → Site remains the sequence.


## 2026-09-10 — W6c-7: Picture resize handles and tables of figures

Connected body inline-image selection handles to the existing setWordObjectLayout command. Previously the overlay drew handles, but its handler accepted only shapes inside a canvas. The image branch now converts screen deltas through the current zoom into twips and uses shared resizeBox geometry. Side handles change one dimension; corners preserve aspect unless Shift is held. The frame previews the result, release applies one transaction, and Escape cancels. Native save/reopen preserves the new dimensions. Stale targets and a zoom change during the gesture reject the commit. Unsupported body objects no longer show inactive resize handles. The shared watchAnswers subscription now includes editable-state changes, so selection controls update when read-only mode changes.

Added References → 그림 목차 and Insert → 그림 목차. The existing tableOfContents schema, command, dialog, renderer, pagination and navigation are reused. Figure/Table/Equation selection lists matching fieldSeq captions with their current numbers and editable descriptions. Heading TOCs remain separate. Scope, page numbers, links and leaders retain the existing settings. Caption edits, insertions and renumbering update the list; links navigate to their caption. Update, removal, undo and native reload are supported. No command or schema count increase: 184 total / 172 Word-owned.

Verification: Word units 676/676; shared editor watch tests 8/8; related Chromium regression suite 29/29. The first browser run found the missing editable-state subscription plus three outdated canvas test coordinates after contextual-ribbon layout changes. Subscription and coordinate checks were corrected; the full related suite then passed. Final caption-dialog wording passed the caption TOC scenario. The extended corner test initially read an overlay position before its next measurement; waiting for the actual handle to align with the rendered image fixed the check. Its final run verifies Shift free resize and read-only/re-enable transitions. The other final picture checks passed at 75%, 100% and 150%, including unchanged selection, one-step undo/redo and reload. Production build passed. Full TypeScript still reports existing shared-source errors; no diagnostic names this milestone's changed source files.

Live in-app verification used the existing captions document:
http://localhost:5180/?sample=captions#word=a8fc1e15-32d5-4496-b3fb-39ef14e5dc31
Dragged the first picture corner: ribbon dimensions changed from 7.41 × 2.38 cm to 9.79 × 3.15 cm. Inserted a table of figures listing 그림 1: 분기별 성장 and 그림 2: 제품별 비교. Saved status and the final page were checked. The browser remains on this document.

Scope: body-picture sizing, not free drag cropping or positioning of every object. The caption TOC dialog manages the first caption TOC in a section and one selected label; multiple independent category lists in the same section remain future UI work. Captions are independent paragraphs. Caption-specific inline cross-references, custom labels/chapter numbers and DOCX SEQ/TOC exchange remain open. Next: caption-specific references, then their explicit DOCX exchange scope. Accessibility and table expansion remain deferred. Word → Slides → Site stays the product order; Word and service release are not marked complete.


## 2026-09-10 — W6c-8: Caption cross-references

Extended the existing References → 상호 참조 dialog with Figure/Table/Equation targets and label-plus-number, number-only or full-caption display. The shared office-text field resolver indexes captions from their existing fieldSeq values. Inserting a reference assigns a persistent sequence identity when needed and inserts the reference at the captured text cursor in one undoable transaction. Later references reuse that identity. Renumbering and description edits update the display. Click or Enter navigates to the source caption. Native save/reopen preserves the connection.

Deleted targets and ambiguous duplicate identities resolve as missing references. Undo restores a deleted caption and its references. Insertions reject stale roots, missing targets, unsupported formats, noncollapsed selections, read-only mode, tracking and locked input targets. Existing bookmark references retain their previous behavior. Caption references cannot be exported as unrelated bookmark REF fields: DOCX currently emits the explicit unsupported-reference placeholder and warning.

Verification: Word units 680/680; shared field resolver 12/12; related Chromium scenarios 11/11 covering captions, caption TOC, caption references, bookmarks and DOCX references. After the final indexed-lookup optimization, targeted command/conformance/schema tests passed 13/13 and the production build passed. Browser checks cover insertion, original navigation, renumbering, full-description updates, deletion, undo/redo, cancellation and native reload. Full TypeScript still reports existing shared-source errors; no diagnostic names the changed source files. Schema inventory is 108 node types / 1,043 attribute slots. Commands remain 184 total / 172 Word-owned.

Live verification: http://localhost:5180/?sample=captions#word=a8fc1e15-32d5-4496-b3fb-39ef14e5dc31. Added “자세한 결과는 그림 1을 참고하세요.” with a real caption reference, continued typing after insertion, followed the reference to 그림 1 and confirmed saved status. The current working document is open in a new in-app browser tab.

Scope: a caption paragraph/heading with one direct sequence field, three existing labels and the three display formats. Captions remain independent paragraphs. Page-number references, chapter numbering and DOCX SEQ/TOC/caption-reference exchange remain future work. Next is explicit DOCX caption exchange scope. Accessibility and table expansion remain deferred. Product order remains Word → Slides → Site. This milestone does not mark Word or the service release complete.
