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

## 11. References

- **Schema package**: `packages/schema/README.md`, `packages/schema/src/types.ts`, `packages/schema/src/schema.ts`
- **Editor-wide spec**: `docs/specs/editor.md` (document model, selection, operations)
- **Model operations**: `packages/model/SPEC.md` (operation semantics; many assume standard node types)
