# Word DOCX exchange scope

Updated: 2026-09-10 — W6c-4b. This is a bounded OOXML converter, not full Microsoft Word compatibility. Native `.word.json` remains the document backup format.

## Supported exchange

| Feature | Current behavior |
| --- | --- |
| Text | Unicode, repeated/trailing spaces, tabs and line breaks |
| Named paragraph styles | ID, name, basedOn, next, link, default paragraph style, document defaults and paragraph style references |
| Character styles | Definitions and run references; direct false values use a derived character style when needed |
| Basic character format | Font family, half-point size, RGB color, bold, italic, strike, underline and solid shading |
| Basic paragraph format | Alignment, left/right/first-line/hanging indent, before/after/line spacing, keep-next/keep-lines, page-break-before, widow control and outline level |
| Headings | Level 1–6, including an outline level inherited from a custom style |
| Bookmarks | Contiguous text ranges within one paragraph (including multiple formatted runs), overlapping ranges and point anchors |
| Cross-references | REF text and above/below, optional hyperlink; simple and complex input fields, simple-field export with cached results |
| Pages and tables | Existing basic section dimensions/margins and basic table grid/horizontal spans; this milestone does not expand table support |

Export writes `word/styles.xml`, its content type and document relationship. It writes inherited paragraph styles as references rather than copying their values into every run. Import follows the package's styles relationship, including a different internal filename. It never fetches an external URL. Missing built-in editor styles are filled without replacing imported definitions.

OOXML style toggle values and the editor's absolute boolean values differ. The converter translates bold/italic/strike in the style inheritance chain. Absolute character-style boolean values are also written as direct run properties so non-bold text can remain non-bold inside a bold paragraph. Such direct values can override later changes to those character-style booleans in an external editor. This is a remaining interchange limitation. Direct overrides can use derived styles on import; repeated exchange reuses a matching derived style instead of growing a new chain each time. The relevant OOXML behavior is described in [Microsoft's Bold reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.bold?view=openxml-3.0.1).

## Remaining work

- Multi-paragraph, table-column, object-containing and discontinuous bookmark ranges; page/paragraph-number references and advanced fields. Invalid bookmark markers are excluded with a warning. Unsupported export fields may use a placeholder; unsupported, nested or locked imported fields retain cached display text.
- Theme font/color resolution, per-script font fidelity, advanced character/paragraph properties, character-style management UI and full style metadata fidelity.
- Numbering, pictures, math/OMML, headers/footers, footnotes, comments, change tracking, vertical table merges and advanced table formatting.
- Full external Microsoft Word/LibreOffice acceptance. This milestone checks package XML and our browser editor, not those desktop applications.

## Bookmark and REF behavior

Export pairs bookmark start/end markers by numeric ID and keeps reference targets connected. Names that do not fit the 40-character, single-word naming convention are normalized with an explicit warning. Collisions receive a suffix; all corresponding REF targets use the same mapping. The source document is unchanged. See [Microsoft bookmark naming](https://learn.microsoft.com/en-us/office/vba/api/word.bookmarks.add).

Import accepts REF with optional hyperlink and above/below switches, and MERGEFORMAT. It reads both [simple fields](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.simplefield?view=openxml-3.0.1) and [complex fields](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.fieldchar?view=openxml-3.0.1), including instructions split across runs. Recognized references replace their cached text with the live editor field. Missing targets remain unresolved rather than binding to an unrelated bookmark. Unsupported instructions are never evaluated. Cached result formatting/text is retained where supported.

A point bookmark's text reference uses its name in this editor. External Word may calculate an empty string for that same zero-length REF target; export warns about this difference. Use above/below when exchanging a positional reference. Nested fields are limited to 64 levels. Duplicate IDs/names, unmatched markers, multi-paragraph ranges and object-containing ranges are excluded with warnings.

Native body captions were added in W6c-6. Their SEQ numbers are not supported by this converter: export warns and uses a placeholder, while import keeps cached text. Use .word.json to preserve live caption numbering. W6c-7 adds native caption-based tables of figures; DOCX export still substitutes unsupported TOC/SEQ fields. W6c-8 adds native caption references with a stable sequence identity and label/number/full-caption display. The exporter rejects these as bookmark REF fields and uses an explicit unsupported-reference placeholder with a warning. SEQ/TOC and live caption-reference exchange remain future work. Full external desktop application compatibility remains separate.

## File safety and workflow

Files must be at most 10 MB. The document XML must be at most 10 MB; each loaded styles/relationship part must be at most 2 MB. DTD/entity declarations, malformed XML, missing declared style parts and external style relationships are rejected before opening a document. Circular style links are broken with a warning; inheritance deeper than 256 steps is rejected. Duplicate style IDs keep the first definition with a warning.

Import saves the previous document, opens a separate document and closes both import and document-action dialogs. Failure leaves the previous document available. Download and cancel do not edit the document.

## Verification

- Word unit suite: 671 passed. DOCX coverage is 20 tests across export, import, style and reference exchange.
- Browser: 8 passed across DOCX reference/style exchange, file import/export and bookmark workflows. The reference test downloads a real file, opens it, follows the reference, edits its source, renames/deletes the bookmark, undoes deletion, reloads and verifies the previous document.
- Vite production build passed. Full TypeScript checking still has existing shared-source errors; changed DOCX files have no reported diagnostics.
- In-app browser: `?sample=references-docx` performs export/read through the production DOCX converter before loading the editor. The live tab confirmed reference navigation, source typing, reference refresh and undo. Automated Chromium separately exercised actual file download and selection.
