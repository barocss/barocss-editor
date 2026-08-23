# Barocss Standard Schema

This document defines the **standard document schema** for the Barocss editor: the canonical set of node types, marks, content rules, and attributes that the editor supports. It is the single source of truth for "what document structure does Barocss use?"

---

## 1. Purpose

- **Single source of truth**: All apps (editor-react, editor-test, docs-site demo) and packages (model, datastore, extensions) that depend on document structure refer to this schema or to presets derived from it.
- **Two tiers**: **Minimal** (smallest set required for a working editor) and **Full** (all node types and marks for rich editing). Apps choose a tier or extend from it.
- **Consistency**: Same node names (`stype`), content expressions, and attribute shapes across DataStore, Model, renderer (DSL templates), and extensions. Schema validation and operations (insertParagraph, wrapInList, etc.) assume these types exist when used.

---

## 2. Top Node

- **topNode**: `"document"`
- **Document node** (`stype: "document"`): Root of the tree. **group**: `"document"`. **content**: `"block+"` (one or more block nodes). Not selectable; not droppable by user (structural root).

---

## 3. Tiers

### 3.1 Minimal schema

Required for any Barocss editor that supports typing and basic blocks. Used by quick-start demos and minimal apps.

| Node type    | group    | content   | Description |
|-------------|----------|-----------|-------------|
| document    | document | block+    | Root. |
| paragraph   | block    | inline*   | Text block. |
| inline-text | inline   | —         | Text leaf; has `text` and optional `marks`. |

| Mark type | group       | Description |
|-----------|-------------|-------------|
| bold      | text-style  | Strong. |
| italic    | text-style  | Emphasis. |

- **Content rules**: Document contains one or more blocks; paragraph contains zero or more inlines; inline-text is leaf (no content in schema; model stores `text` and `marks`).
- **Optional in minimal**: `heading` (block, inline*, attrs: level) — useful for titles; can be added without going full.

### 3.2 Full schema

All node types and marks used by editor-test and editor-react: blocks (paragraph, heading, blockQuote, list, listItem, codeBlock, tables, figures, media, etc.), inlines (inline-text, inline-image, hardBreak, mathInline, fields, etc.), and all marks (bold, italic, link, fontColor, code, mention, etc.). See §4 and §5 for the full list.

- **Use case**: Full-featured editor (lists, tables, media, comments, footnotes, etc.).
- **Preset**: `getStandardSchemaDefinition()` from `@barocss/schema` returns the full standard as `SchemaDefinition`. Apps use `createSchema('app', getStandardSchemaDefinition())` or extend from it.

---

## 4. Node Types (Full Schema)

### 4.1 Document and structure

| name      | group    | content | attrs | Notes |
|-----------|----------|---------|-------|--------|
| document  | document | block+  | —     | Top node. |
| docSection| block    | block+  | —     | Section container. |
| columns   | block    | column+ | —     | Multi-column. |
| column    | block    | block+  | width?| Column; optional width. |

### 4.2 Block text and headings

| name     | group | content  | attrs    | Notes |
|----------|-------|----------|----------|--------|
| paragraph| block | inline*  | placeholder? | Default text block; optional placeholder when empty. |
| heading  | block | inline*  | level (required) | h1–h6. |
| blockQuote | block | block+ | —      | Quote container. |
| pullQuote| block | inline*  | —        | Pull quote. |
| codeBlock| block | text*    | language?| Pre/code; editable text. |
| horizontalRule | block | — | —     | atom. |
| pageBreak| block | —        | —        | atom. |

### 4.3 Lists and tasks

| name    | group | content   | attrs        | Notes |
|---------|-------|-----------|--------------|--------|
| list    | block | listItem+ | type? (bullet)| bullet \| ordered. |
| listItem| block | block+    | —            | Item container. |
| taskItem| block | inline*   | checked?     | Checkbox. |

### 4.4 Callouts, details, description list

| name    | group | content      | attrs           | Notes |
|---------|-------|--------------|-----------------|--------|
| callout | block | block+       | type?, title?   | info \| warning etc. |
| bDetails| block | bSummary block+ | —             | Collapsible. |
| bSummary| block | inline*      | —               | Summary line. |
| descList| block | (descTerm descDef)+ | —         | DL. |
| descTerm| block | inline+     | —               | DT. |
| descDef | block | block+      | —               | DD. |

### 4.5 Figures, tables, media

| name         | group | content                    | attrs     | Notes |
|--------------|-------|----------------------------|-----------|--------|
| bFigure      | block | (inline-image \| bTable \| codeBlock \| media*)+ bFigcaption? | — | Figure. |
| bFigcaption  | block | inline*                    | —         | Caption. |
| bTable       | block | (bTableHeader)? bTableBody+ (bTableFooter)? | caption? | Table. |
| bTableHeader | block | bTableHeaderCell+          | —         | thead. |
| bTableBody   | block | bTableRow+                 | —         | tbody. |
| bTableFooter | block | bTableRow+                 | —         | tfoot. |
| bTableRow    | block | bTableCell+                | —         | tr. |
| bTableHeaderCell | block | inline* | colspan?, rowspan? | th. |
| bTableCell  | block | inline*                    | colspan?, rowspan? | td. |
| mediaVideo   | block | —                          | src, poster?, controls? | atom. |
| mediaAudio   | block | —                          | src, controls? | atom. |
| mediaEmbed   | block | —                          | provider, id, title? | atom. |

### 4.6 Inline nodes

| name          | group  | content | attrs   | Notes |
|---------------|--------|---------|---------|--------|
| inline-text   | inline | —       | —       | Text + marks. |
| inline-image  | inline | —       | src, alt?| atom. |
| emoji         | inline | —       | shortcode?, unicode? | atom; explicit emoji (TipTap-style). |
| hardBreak     | inline | —       | —       | atom. br. |
| mathInline    | inline | —       | tex, engine?| atom. |
| mathBlock     | block  | —       | tex, engine?| atom. |
| fieldPageNumber | inline | —     | —       | atom. |
| fieldPageCount | inline | —     | —       | atom. |
| fieldDateTime | inline | —     | format? | atom. |
| fieldDocTitle | inline | —     | —       | atom. |
| fieldAuthor   | inline | —     | —       | atom. |
| bookmarkAnchor| inline | —       | id      | atom. |

### 4.7 Doc-level and special

| name         | group | content | attrs | Notes |
|--------------|-------|---------|-------|--------|
| docHeader    | block | inline* | —     | Header. |
| docFooter    | block | inline* | —     | Footer. |
| toc          | block | —       | —     | atom. TOC. |
| footnoteDef  | block | inline* | id    | Footnote. |
| endnoteDef   | block | inline* | id    | Endnote. |
| bibliography | block | block*  | —     | Refs. |
| commentThread| block | inline* | id    | Comment. |
| indexBlock   | block | block*  | —     | Index. |
| chart        | block | —       | title?, values | atom; external. |

---

## 5. Marks (Full Schema)

All marks have **group**: `"text-style"` unless noted. Common attrs are omitted below; see preset for full attrs.

| name         | Typical attrs | Notes |
|--------------|----------------|--------|
| bold         | weight?        | Strong. |
| italic       | style?         | Emphasis. |
| underline    | style?         | Underline. |
| strikethrough| style?         | Strikethrough. |
| fontColor    | color?         | Text color. |
| bgColor      | bgColor?       | Highlight. |
| code         | language?      | Inline code. |
| link         | href (required), title? | Link. |
| highlight    | color?         | Highlight. |
| fontSize     | size?          | Font size. |
| fontFamily   | family?        | Font family. |
| subscript    | position?      | Sub. |
| superscript  | position?      | Super. |
| smallCaps    | variant?       | Small caps. |
| letterSpacing| spacing?       | Letter spacing. |
| wordSpacing  | spacing?       | Word spacing. |
| lineHeight   | height?        | Line height. |
| textShadow   | shadow?        | Text shadow. |
| border       | style?, width?, color? | Text border. |
| spanLang     | lang (required), dir? | Language span. |
| kbd          | —              | Keyboard key. |
| mention      | id (required)  | Mention. |
| spoiler      | revealed?      | Spoiler. |
| footnoteRef  | id (required)  | Footnote ref. |

---

## 6. Content Expressions

- **block+**: One or more block nodes.
- **block***: Zero or more block nodes.
- **inline***: Zero or more inline nodes.
- **inline+**: One or more inline nodes.
- **text***: Zero or more text (inline-text) nodes; used in codeBlock.
- **listItem+**: One or more listItem.
- **column+**: One or more column.
- **(A | B)+**: One or more of A or B.
- **(A)?**: Optional A.
- **A+ B?**: One or more A, optionally followed by B.

Group names **block** and **inline** are used in content expressions; node types declare their group so that validators can resolve expressions. The schema package's content model validation uses these rules; see `@barocss/schema` and `packages/schema/README.md`.

---

## 7. Relationship to Packages and Apps

- **Schema package** (`@barocss/schema`): Exports `createSchema`, `SchemaDefinition`, `NodeTypeDefinition`, `MarkDefinition`. Presets: `getMinimalSchemaDefinition()`, `getStandardSchemaDefinition()` (see §8).
- **DataStore**: Accepts a Schema instance; uses it for validation and structure (e.g. content rules). Node `stype` must match a schema node name.
- **Model / extensions**: Operations (insertParagraph, wrapInList, etc.) assume the corresponding node types exist in the schema. If an app uses minimal schema, list operations are not applicable unless the app extends the schema with list/listItem.
- **DSL / renderer**: Templates are registered with `define(stype, template)` for each node type the app uses. The **standard schema** does not define templates; it defines structure. Apps or a shared "standard templates" module register DSL templates for standard node types.
- **Apps**: editor-react and editor-test use the full standard schema (or a copy); docs-site demo uses minimal. All can call `createSchema('app', getStandardSchemaDefinition())` or `createSchema('app', getMinimalSchemaDefinition())` and optionally extend.

---

## 8. Presets (Machine-Readable)

- **getMinimalSchemaDefinition()**: Returns a `SchemaDefinition` with topNode `"document"`, nodes (document, paragraph, inline-text), marks (bold, italic). Use for demos and minimal editors.
- **getStandardSchemaDefinition()**: Returns the full standard schema (all nodes and marks in §4 and §5) as `SchemaDefinition`. Use for full-featured editors. Single source of truth for the full preset; editor-react and editor-test can import from `@barocss/schema` instead of defining their own copy.

Location: `packages/schema/src/standard-schema.ts` (or `presets/standard-schema.ts`). Export from `packages/schema/src/index.ts`.

---

## 9. Extending the Standard

- **Extend from full**: `createSchema(getStandardSchema(), { nodes: { ... }, marks: { ... } })` to add or override node/mark types.
- **Extend from minimal**: `createSchema(getMinimalSchema(), { nodes: { heading: { ... } }, marks: { link: { ... } } })` to add a few types without pulling the full set.
- **Custom app schema**: Define a full `SchemaDefinition` and pass to `createSchema('app', definition)`. Document the delta from standard in app docs if relevant.

### 9.1 Nested / multi-domain schemas (e.g. document + vector)

Barocss uses **one schema per editor**. There is no runtime concept of "nested schemas" (one Schema instance inside another). Multiple domains (document, vector, diagram, etc.) are expressed as **one flat schema** that includes all node types from all domains; **content expressions** restrict where each type can appear.

**Pattern: document + vector**

1. **Define the vector "sub-schema" as node types** (no separate Schema instance):
   - `vectorCanvas`: block that contains vector content; `group: 'block'`, `content: 'vectorLayer+'` so it can sit in document and contain layers.
   - `vectorLayer`: `content: '(vectorPath | vectorGroup)*'` (or similar).
   - `vectorPath`, `vectorGroup`, etc.: vector-only types; do **not** put them in `group: 'block'` so they cannot appear at document top level. They are allowed only where a content expression references them (e.g. inside vectorCanvas / vectorLayer).

2. **Merge with the document schema** so the editor has a single schema:
   - `createSchema(documentSchema, { nodes: { vectorCanvas, vectorLayer, vectorPath, vectorGroup, ... } })`,  
   or merge two definitions: `createSchema('app', { topNode: 'document', nodes: { ...getStandardSchemaDefinition().nodes, ...vectorDefinition.nodes }, marks: { ... } })`.
   - Ensure `vectorCanvas` has `group: 'block'` so `document` (content: `block+`) can contain it.

3. **Result**: One Schema instance; document root allows blocks (paragraph, heading, vectorCanvas, ...). Inside a vectorCanvas only vector nodes are allowed (by content rules). Validator and DataStore use the same schema for the whole tree.

**Optional: keep "vector schema" as a separate definition**

- Export a `getVectorSchemaDefinition()` that returns `{ nodes: { vectorCanvas, vectorLayer, ... } }` (no `topNode`; used only for merging).
- App merges: `createSchema('app', { ...getStandardSchemaDefinition(), nodes: { ...getStandardSchemaDefinition().nodes, ...getVectorSchemaDefinition().nodes } })` or use a small helper that merges two `SchemaDefinition` objects.
- This keeps document and vector definitions in separate modules/files while still producing one schema at runtime.

**Summary**

| Question | Answer |
|----------|--------|
| Can multiple schemas be nested at runtime? | No. One Schema per editor. |
| How to have document + vector in one editor? | One schema; add vector node types and merge with document schema. Vector block (`vectorCanvas`) has `group: 'block'`; vector-only nodes are referenced only in content expressions under vectorCanvas. |
| Where to define "vector schema"? | As a `SchemaDefinition` (or preset) and merge with document schema via `createSchema(base, { nodes: { ...vectorNodes } })` or by merging definition objects. |

### 9.2 Take the node types you offer, not all of them

The merges above are written as `{ ...getStandardSchemaDefinition().nodes, ...ownNodes }`, which is the natural thing to write and is wrong for a domain that does not want the whole standard vocabulary. **A schema declaring a node type is a promise that a document may contain one.** If nothing in the product draws it, that promise is a reader's text sitting in the file and nothing on the page.

Measured, with two products built on one office schema that spread the standard nodes entire: Word and Slides drew *exactly the same* standard types and wrote off exactly the same twenty-five, forty-six lines of "inherited; this product offers no …" between them. One product's write-off list is an opinion about that product. Two identical lists are the shared schema claiming a domain it does not have.

So a domain schema **names** what it takes:

```ts
const OFFICE_STANDARD_NODES = ['paragraph', 'heading', 'list', /* … */] as const;
for (const name of OFFICE_STANDARD_NODES) {
  const node = standard.nodes[name];
  if (!node) throw new Error(`names a standard node that does not exist: ${name}`);
  nodes[name] = node;
}
```

Three things this asks of you, each of which found something real:

- **Check the set is closed.** A type you drop may be named in a content expression of one you keep. Office's twenty-three turned out to reference only each other (`bFigure` names `bFigcaption`, `descList` names its terms), so the cut was clean — but that was checked, not assumed.
- **Look for the twin.** The types worth the most attention are the ones your domain has *and does differently*: office keeps equations, a contents page and page numbers, and each had an unused standard-schema twin sitting beside its real implementation. A second way to say the same thing is a second thing to keep working.
- **Grep the documents, not just the tests.** Every unit suite passed with `fieldPageNumber` wrongly dropped. The document that used it — a footer holding one among its words — lives in an app.

---

## 10. Comparison with other editors

Barocss standard schema is aligned with concepts from ProseMirror, TipTap, and Lexical where applicable.

- **ProseMirror** (schema-basic, schema-list): `doc` → document; `paragraph`, `blockquote`, `heading`, `horizontal_rule`, `text` → paragraph, blockQuote, heading, horizontalRule, inline-text; list nodes → list, listItem. Content expressions and group-based content (block+, inline*) match. Marks (strong, em, link, code) → bold, italic, link, code.
- **TipTap**: Document, Paragraph, Blockquote, Heading, CodeBlock, HorizontalRule, HardBreak, BulletList/OrderedList, ListItem, TaskList, TaskItem, Details/DetailsSummary/DetailsContent, Table (with header/row/cell), Image, Audio, Mention, Emoji, Youtube/Twitch embeds. Barocss covers these via document, paragraph, blockQuote, heading, codeBlock, horizontalRule, hardBreak, list/listItem, taskItem, bDetails/bSummary, bTable family, inline-image/mediaVideo/mediaAudio, mediaEmbed (provider/id), mention mark, and (in full schema) emoji node.
- **Lexical**: RootNode → document; ElementNode (block/inline) → block vs inline group; TextNode (format: bold, italic, underline, strikethrough, code, highlight, subscript, superscript) → corresponding marks; LineBreakNode → hardBreak; DecoratorNode → custom block/inline is handled by Barocss decorators and atom nodes (e.g. mediaEmbed, chart).

Additions adopted from other editors in the full schema:

- **placeholder** (paragraph, optional attr): Hint text when the block is empty (e.g. "Write something…"). Common in ProseMirror/Lexical as a view or node attribute; storing it in the schema allows round-trip and consistent behavior.
- **emoji** (inline atom): Explicit emoji node with optional shortcode/unicode (TipTap-style). Apps can use Unicode in inline-text instead; the node supports fallback rendering and consistent handling.

Not added (covered by existing types or view layer): block-level "Image" only (bFigure + inline-image or bFigure with single child suffices), separate Youtube/Twitch node types (mediaEmbed with provider covers them), placeholder implemented only in view (we add optional attr for schema round-trip).

---

## 11. Alignment with packages and apps

What to add or change so that datastore, model, renderer, DSL, and apps all use the standard schema as the single source of truth.

### 11.1 Apps

| App | Current | Change |
|-----|---------|--------|
| **editor-react** | Uses local `editorTestSchemaConfig` (schema.ts). | Use `createSchema('editor-react', getStandardSchemaDefinition())` from `@barocss/schema` and remove or re-export the local schema copy. Ensures placeholder and emoji from the standard preset. |
| **editor-test** | Inline schema in main.ts (same shape as standard). | Use `getStandardSchemaDefinition()` from `@barocss/schema` instead of inline definition. Single source of truth. |
| **docs-site** | Quick-start / basic-usage use inline minimal schema. | Optionally use `getMinimalSchemaDefinition()` from `@barocss/schema` in examples so docs match the preset. |

### 11.2 DSL / Renderer (templates)

The standard schema does **not** define DSL templates; it only defines structure. Apps (or a shared “standard templates” package) register `define(stype, template)` for each node type they use.

| Item | Current | Change |
|------|---------|--------|
| **editor-react register-renderers** | Templates for all standard node types except `emoji`. Paragraph has no placeholder handling. | Add `define('emoji', ...)` for the standard `emoji` node (e.g. `element('span', { className: 'emoji', 'data-shortcode': attr('shortcode'), 'data-unicode': attr('unicode') }, [])` or render character). Optionally use `paragraph` `attrs.placeholder` in the paragraph template (e.g. `data-placeholder` or similar) so empty blocks can show hint text. |
| **editor-test** | Registers same templates as editor-react (inline define calls). | No change required for alignment; if editor-test switches to getStandardSchemaDefinition(), it already has templates for all types it uses. Add emoji template only if editor-test starts using emoji nodes. |

### 11.3 Datastore

- **Change**: None. Datastore is schema-agnostic; it validates against the Schema instance passed at construction. Apps that pass a schema from `getStandardSchemaDefinition()` or `getMinimalSchemaDefinition()` are aligned.

### 11.4 Model

- **Change**: None. Operations use `stype` strings (e.g. paragraph, heading, list, listItem, blockQuote) that match the standard schema. The model does not import the schema preset; it assumes the app has registered a schema that defines those types. Exec tests that need a full schema can optionally use `getStandardSchemaDefinition()` to avoid drift.

### 11.5 Extensions

- **Change**: None. Extensions use `schema.getNodeType(stype)` and the same `stype` names as the standard schema. Optional future work: an “insert emoji” command that inserts an `emoji` node when the schema includes it.

### 11.6 Converter

- **Change**: Optional. Document or add HTML conversion rules for standard node types (e.g. emoji ↔ `<span data-emoji>` or character; paragraph with placeholder). Not required for schema alignment; converter can be extended per app or in a shared preset.

### 11.7 Summary

| Layer | Must change | Optional |
|-------|-------------|----------|
| **schema** | — | — (presets already in place) |
| **editor-react** | Use getStandardSchemaDefinition(); add emoji template. | Paragraph template: show placeholder when empty. |
| **editor-test** | Use getStandardSchemaDefinition() instead of inline schema. | — |
| **docs-site** | — | Use getMinimalSchemaDefinition() in examples. |
| **datastore** | — | — |
| **model** | — | Tests use preset in exec tests. |
| **extensions** | — | insertEmoji command later. |
| **converter** | — | Rules for emoji, placeholder. |

---

## 12. References

- **Schema package**: `packages/schema/README.md`, `packages/schema/src/types.ts`, `packages/schema/src/schema.ts`
- **Editor-wide spec**: `docs/specs/editor.md` (document model, selection, operations)
- **Model operations**: `packages/model/SPEC.md` (operation semantics; many assume standard node types)
