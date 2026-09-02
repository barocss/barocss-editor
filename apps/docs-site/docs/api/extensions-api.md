# Extensions API

The Extensions API provides built-in extensions and helper functions for creating extension sets.

## Built-in Extensions

All built-in extensions implement the `Extension` interface and can be used directly or customized with options.

### TextExtension

Provides text input functionality (insert, delete, replace).

**Location**: `packages/extensions/src/text.ts`

**Options:**
```typescript
interface TextExtensionOptions {
  enabled?: boolean;  // Whether extension is enabled (default: true)
}
```

**Commands:**
- `replaceText` - Replaces text in selection range

**Example:**
```typescript
import { TextExtension } from '@barocss/extensions';

const extension = new TextExtension({ enabled: true });
editor.use(extension);
```

### DeleteExtension

Provides delete functionality (Backspace, Delete keys).

**Location**: `packages/extensions/src/delete.ts`

**Options:**
```typescript
interface DeleteExtensionOptions {
  enabled?: boolean;
}
```

**Commands:**
- `deleteSelection` - Deletes selected content
- `deleteBackward` - Deletes backward
- `deleteForward` - Deletes forward

**Example:**
```typescript
import { DeleteExtension } from '@barocss/extensions';

const extension = new DeleteExtension();
editor.use(extension);
```

### BoldExtension

Provides bold formatting functionality.

**Location**: `packages/extensions/src/bold.ts`

**Options:**
```typescript
interface BoldExtensionOptions {
  enabled?: boolean;
  keyboardShortcut?: string;  // Default: 'Mod+b'
}
```

**Commands:**
- `toggleBold` - Toggles bold formatting

**Keybindings:**
- `Mod+b` - Toggle bold (default)

**Example:**
```typescript
import { BoldExtension, createBoldExtension } from '@barocss/extensions';

// Direct instantiation
const extension = new BoldExtension({ keyboardShortcut: 'Mod+b' });

// Or use convenience function
const extension = createBoldExtension({ keyboardShortcut: 'Mod+b' });

editor.use(extension);
```

### ItalicExtension

Provides italic formatting functionality.

**Location**: `packages/extensions/src/italic.ts`

**Options:**
```typescript
interface ItalicExtensionOptions {
  enabled?: boolean;
  keyboardShortcut?: string;  // Default: 'Mod+i'
}
```

**Commands:**
- `toggleItalic` - Toggles italic formatting

**Keybindings:**
- `Mod+i` - Toggle italic (default)

**Example:**
```typescript
import { ItalicExtension, createItalicExtension } from '@barocss/extensions';

const extension = createItalicExtension();
editor.use(extension);
```

### UnderlineExtension

Provides underline formatting functionality. Supports cross-node selections.

**Location**: `packages/extensions/src/underline.ts`

**Commands:**
- `toggleUnderline` - Toggles underline formatting (works across multiple nodes)

**Example:**
```typescript
import { UnderlineExtension } from '@barocss/extensions';

const extension = new UnderlineExtension();
editor.use(extension);
```

### StrikethroughExtension

Provides strikethrough formatting functionality. Supports cross-node selections.

**Location**: `packages/extensions/src/strikethrough.ts`

**Commands:**
- `toggleStrikethrough` - Toggles strikethrough formatting (works across multiple nodes)

**Example:**
```typescript
import { StrikethroughExtension } from '@barocss/extensions';

const extension = new StrikethroughExtension();
editor.use(extension);
```

### HeadingExtension

Provides heading functionality. The `removeHeading` command correctly transforms a heading back to a paragraph using `transformNode` within a transaction (supports undo/redo).

**Location**: `packages/extensions/src/heading.ts`

**Options:**
```typescript
interface HeadingExtensionOptions {
  enabled?: boolean;
  levels?: number[];  // Supported heading levels (default: [1, 2, 3, 4, 5, 6])
}
```

**Commands:**
- `setHeading` - Sets heading level
- `removeHeading` - Converts heading to paragraph (via `transformNode('paragraph')`)
- `toggleHeading` - Toggles heading on/off

**Keybindings:**
- `Mod+Alt+1` - Set heading level 1
- `Mod+Alt+2` - Set heading level 2
- `Mod+Alt+3` - Set heading level 3
- `Mod+Alt+4` - Set heading level 4
- `Mod+Alt+5` - Set heading level 5
- `Mod+Alt+6` - Set heading level 6

**Example:**
```typescript
import { HeadingExtension, createHeadingExtension } from '@barocss/extensions';

const extension = createHeadingExtension({ levels: [1, 2, 3] });
editor.use(extension);
```

### ListExtension

Provides bullet list and ordered list functionality.

**Location**: `packages/extensions/src/list.ts`

**Commands:**
- `toggleBulletList` - Toggles unordered (bullet) list
- `toggleOrderedList` - Toggles ordered (numbered) list
- `splitListItem` - Splits list item at cursor (Enter key behavior in lists)

**Example:**
```typescript
import { ListExtension } from '@barocss/extensions';

const extension = new ListExtension();
editor.use(extension);
```

### BlockquoteExtension

Provides blockquote functionality.

**Location**: `packages/extensions/src/blockquote.ts`

**Commands:**
- `toggleBlockquote` - Toggles blockquote on/off

**Example:**
```typescript
import { BlockquoteExtension } from '@barocss/extensions';

const extension = new BlockquoteExtension();
editor.use(extension);
```

### ParagraphExtension

Provides paragraph functionality.

**Location**: `packages/extensions/src/paragraph.ts`

**Commands:**
- `insertParagraph` - Inserts a new paragraph
- `setParagraph` - Sets paragraph type

**Example:**
```typescript
import { ParagraphExtension } from '@barocss/extensions';

const extension = new ParagraphExtension();
editor.use(extension);
```

### IndentExtension

Provides indentation functionality.

**Location**: `packages/extensions/src/indent.ts`

**Options:**
```typescript
interface IndentExtensionOptions {
  enabled?: boolean;
}
```

**Commands:**
- `indent` - Indents block
- `outdent` - Outdents block

**Keybindings:**
- `Tab` - Indent
- `Shift+Tab` - Outdent

**Example:**
```typescript
import { IndentExtension } from '@barocss/extensions';

const extension = new IndentExtension();
editor.use(extension);
```

### MoveSelectionExtension

Provides selection movement functionality.

**Location**: `packages/extensions/src/move-selection.ts`

**Commands:**
- `moveSelectionUp` - Moves selection up
- `moveSelectionDown` - Moves selection down
- `moveSelectionLeft` - Moves selection left
- `moveSelectionRight` - Moves selection right

**Keybindings:**
- `ArrowUp` - Move selection up
- `ArrowDown` - Move selection down
- `ArrowLeft` - Move selection left
- `ArrowRight` - Move selection right

**Example:**
```typescript
import { MoveSelectionExtension } from '@barocss/extensions';

const extension = new MoveSelectionExtension();
editor.use(extension);
```

### MoveBlockExtension

Provides block movement functionality.

**Location**: `packages/extensions/src/move-block.ts`

**Options:**
```typescript
interface MoveBlockExtensionOptions {
  enabled?: boolean;
}
```

**Commands:**
- `moveBlockUp` - Moves block up
- `moveBlockDown` - Moves block down

**Keybindings:**
- `Mod+ArrowUp` - Move block up
- `Mod+ArrowDown` - Move block down

**Example:**
```typescript
import { MoveBlockExtension, createMoveBlockExtension } from '@barocss/extensions';

const extension = createMoveBlockExtension();
editor.use(extension);
```

### SelectAllExtension

Provides select all functionality.

**Location**: `packages/extensions/src/select-all.ts`

**Commands:**
- `selectAll` - Selects all content

**Keybindings:**
- `Mod+a` - Select all

**Example:**
```typescript
import { SelectAllExtension } from '@barocss/extensions';

const extension = new SelectAllExtension();
editor.use(extension);
```

### CopyPasteExtension

Provides clipboard functionality.

**Location**: `packages/extensions/src/copy-paste.ts`

**Commands:**
- `copy` - Copies selected content
- `cut` - Cuts selected content
- `paste` - Pastes content at selection

**Keybindings:**
- `Mod+c` - Copy
- `Mod+x` - Cut
- `Mod+v` - Paste

**Example:**
```typescript
import { CopyPasteExtension } from '@barocss/extensions';

const extension = new CopyPasteExtension();
editor.use(extension);
```

### EscapeExtension

Provides escape functionality.

**Location**: `packages/extensions/src/escape.ts`

**Commands:**
- `escape` - Handles escape key

**Keybindings:**
- `Escape` - Escape

**Example:**
```typescript
import { EscapeExtension } from '@barocss/extensions';

const extension = new EscapeExtension();
editor.use(extension);
```

---

## Extension Factory Functions

### `createCoreExtensions(): Extension[]`

Creates core extensions (required extensions that are always included by default).

**Returns:**
- `Extension[]` - Array of core extensions

**Includes:**
- `TextExtension` - Basic text editing
- `DeleteExtension` - Delete command
- `ParagraphExtension` - Basic structure
- `MoveSelectionExtension` - Selection movement
- `SelectAllExtension` - Select all
- `IndentExtension` - Structural indentation
- `CopyPasteExtension` - Clipboard operations
- `HardBreakExtension` - Line break (Shift+Enter)

**Note**: Core extensions are automatically registered in Editor constructor, so they are excluded from other extension sets.

**Example:**
```typescript
import { createCoreExtensions } from '@barocss/extensions';

const coreExtensions = createCoreExtensions();
// Use if you want to manually manage core extensions
```

### `createBasicExtensions(): Extension[]`

Creates basic extensions (formatting extensions).

**Returns:**
- `Extension[]` - Array of basic extensions

**Includes:**
- `BoldExtension` - Bold formatting
- `ItalicExtension` - Italic formatting
- `HeadingExtension` - Heading support
- `ListExtension` - Bullet/ordered list support
- `BlockquoteExtension` - Blockquote support

**Note**: Core extensions are automatically registered, so they are excluded.

**Example:**
```typescript
import { createBasicExtensions } from '@barocss/extensions';

const basicExtensions = createBasicExtensions();
editor.use(...basicExtensions);
```

### ExtensionSets

Predefined extension sets for common use cases.

**Location**: `packages/extensions/src/index.ts`

#### `ExtensionSets.basic()`

Basic text editing extensions (Bold, Italic, Underline only).

**Returns:**
- `Extension[]` - Array of extensions

**Includes:**
- `BoldExtension`
- `ItalicExtension`
- `UnderlineExtension`

**Example:**
```typescript
import { ExtensionSets } from '@barocss/extensions';

const extensions = ExtensionSets.basic();
editor.use(...extensions);
```

#### `ExtensionSets.rich()`

Full rich text editing extensions (all formatting, rich content, marks, document structure).

**Returns:**
- `Extension[]` - Array of extensions

**Includes all `createRichExtensions()`** — see the [full list](#createrichextensions-extension) above.

**Example:**
```typescript
import { ExtensionSets } from '@barocss/extensions';

const extensions = ExtensionSets.rich();
editor.use(...extensions);
```

#### `ExtensionSets.minimal()`

Minimal extensions (no additional extensions).

**Returns:**
- `Extension[]` - Empty array

**Example:**
```typescript
import { ExtensionSets } from '@barocss/extensions';

const extensions = ExtensionSets.minimal();
// Returns: []
```

---

## Convenience Functions

### `createBoldExtension(options?: BoldExtensionOptions): BoldExtension`

Creates a BoldExtension instance.

**Parameters:**
- `options?: BoldExtensionOptions` - Optional options

**Returns:**
- `BoldExtension` - BoldExtension instance

**Example:**
```typescript
import { createBoldExtension } from '@barocss/extensions';

const extension = createBoldExtension({ keyboardShortcut: 'Mod+b' });
editor.use(extension);
```

### `createItalicExtension(options?: ItalicExtensionOptions): ItalicExtension`

Creates an ItalicExtension instance.

**Parameters:**
- `options?: ItalicExtensionOptions` - Optional options

**Returns:**
- `ItalicExtension` - ItalicExtension instance

### `createHeadingExtension(options?: HeadingExtensionOptions): HeadingExtension`

Creates a HeadingExtension instance.

**Parameters:**
- `options?: HeadingExtensionOptions` - Optional options

**Returns:**
- `HeadingExtension` - HeadingExtension instance

### `createMoveBlockExtension(options?: MoveBlockExtensionOptions): MoveBlockExtension`

Creates a MoveBlockExtension instance.

**Parameters:**
- `options?: MoveBlockExtensionOptions` - Optional options

**Returns:**
- `MoveBlockExtension` - MoveBlockExtension instance

---

## Complete Examples

### Example 1: Using Core Extensions Only

```typescript
import { Editor } from '@barocss/editor-core';
// Core extensions are automatically registered
const editor = new Editor();
```

### Example 2: Adding Basic Extensions

```typescript
import { Editor } from '@barocss/editor-core';
import { createBasicExtensions } from '@barocss/extensions';

const editor = new Editor({
  extensions: createBasicExtensions()
});
```

### Example 3: Using Extension Sets

```typescript
import { Editor } from '@barocss/editor-core';
import { ExtensionSets } from '@barocss/extensions';

const editor = new Editor({
  extensions: ExtensionSets.rich()
});
```

### Example 4: Custom Extension Combination

```typescript
import { Editor } from '@barocss/editor-core';
import { 
  BoldExtension, 
  ItalicExtension, 
  HeadingExtension,
  UnderlineExtension,
  StrikethroughExtension
} from '@barocss/extensions';

const editor = new Editor({
  extensions: [
    new BoldExtension(),
    new ItalicExtension(),
    new HeadingExtension({ levels: [1, 2, 3] }),
    new UnderlineExtension(),
    new StrikethroughExtension()
  ]
});
```

### Example 5: Customizing Extension Options

```typescript
import { Editor } from '@barocss/editor-core';
import { 
  BoldExtension, 
  ItalicExtension,
  HeadingExtension
} from '@barocss/extensions';

const editor = new Editor({
  extensions: [
    new BoldExtension({ 
      enabled: true,
      keyboardShortcut: 'Mod+Shift+b'  // Custom shortcut
    }),
    new ItalicExtension({
      enabled: true,
      keyboardShortcut: 'Mod+Shift+i'
    }),
    new HeadingExtension({
      enabled: true,
      levels: [1, 2, 3]  // Only support h1, h2, h3
    })
  ]
});
```

---

## Rich Content Extensions

### LinkExtension

Provides link insertion and editing functionality.

**Commands:** `insertLink`, `removeLink`

### ImageExtension

Provides image insertion functionality.

**Commands:** `insertImage`

### CodeBlockExtension

Provides code block functionality.

**Commands:** `insertCodeBlock`, `toggleCodeBlock`

### HorizontalRuleExtension

Provides horizontal rule insertion.

**Commands:** `insertHorizontalRule`

### TableExtension

Provides table creation and editing (bTable, bTableRow, bTableCell, etc.).

**Commands:** `insertTable`

### CalloutExtension

Provides callout/admonition blocks (info, warning, error, success, note, tip).

**Commands:** `insertCallout`

### ChecklistExtension

Provides checklist/task list functionality. Uses transactions for undo/redo support.

**Commands:** `insertChecklist`, `toggleChecklistItem`

### MathBlockExtension

Provides math equation blocks (KaTeX).

**Commands:** `insertMathBlock`

### CommentExtension

Provides comment/annotation functionality (commentThread).

**Commands:** `insertComment`

### HardBreakExtension

Provides line break within a block (Shift+Enter).

**Commands:** `insertHardBreak`

### PageBreakExtension

Provides page break insertion (atom block).

**Commands:** `insertPageBreak`

### MathInlineExtension

Provides inline math equation insertion (KaTeX).

**Commands:** `insertMathInline` — payload: `{ tex?: string }`

### PullQuoteExtension

Provides pull quote blocks (distinct from blockquote).

**Commands:** `insertPullQuote` — payload: `{ text?: string }`

### ColumnsExtension

Provides multi-column layout (columns/column nodes).

**Commands:**
- `insertColumns` — payload: `{ count?: number }` (default: 2)
- `addColumn` — payload: `{ columnsId: string }`
- `removeColumn` — payload: `{ columnsId: string, columnId: string }`

### TocExtension

Provides table of contents insertion (atom block).

**Commands:** `insertToc`

### DetailsExtension

Provides collapsible content blocks (bDetails/bSummary).

**Commands:** `insertDetails` — payload: `{ summary?: string }`

### DescriptionListExtension

Provides description list blocks (descList/descTerm/descDef).

**Commands:**
- `insertDescriptionList`
- `addDescriptionItem` — payload: `{ descListId: string }`

### FigureExtension

Provides figure with caption (bFigure/bFigcaption).

**Commands:**
- `insertFigure` — payload: `{ src?: string, alt?: string, caption?: string }`
- `setFigcaption` — payload: `{ figureId: string, caption?: string }`

### MediaExtension

Provides video, audio, and embed insertion.

**Commands:**
- `insertVideo` — payload: `{ src: string, poster?: string }`
- `insertAudio` — payload: `{ src: string }`
- `insertEmbed` — payload: `{ provider: string, id: string, title?: string }`

## Mark Extensions

### CodeMarkExtension

Provides inline code mark (Ctrl+E).

**Commands:** `toggleCode`

### HighlightExtension

Provides text highlight mark with configurable color.

**Commands:** `toggleHighlight` — payload: `{ color?: string }` (default: `#ffeb3b`)

### FontColorExtension

Provides text color and background color marks.

**Commands:**
- `setFontColor` — payload: `{ color: string }`
- `removeFontColor`
- `setBgColor` — payload: `{ color: string }`
- `removeBgColor`

### SubSuperExtension

Provides subscript and superscript marks.

**Commands:** `toggleSubscript`, `toggleSuperscript`

### FontSizeExtension

Provides font size mark.

**Commands:**
- `setFontSize` — payload: `{ size: string }` (e.g. `'18px'`)
- `removeFontSize`

### FontFamilyExtension

Provides font family mark.

**Commands:**
- `setFontFamily` — payload: `{ family: string }` (e.g. `'Georgia'`)
- `removeFontFamily`

### TextFormattingExtension

Aggregates less-common text-style marks into one extension.

**Toggle commands** (no additional payload needed):
- `toggleSmallCaps` — smallCaps mark
- `toggleKbd` — kbd mark (keyboard key)
- `toggleSpoiler` — spoiler mark

**Apply commands** (require `value` in payload):
- `setLetterSpacing` — letterSpacing mark (`{ value: '0.2em' }`)
- `setWordSpacing` — wordSpacing mark
- `setLineHeight` — lineHeight mark
- `setTextShadow` — textShadow mark

**Multi-attr commands** (require `attrs` in payload):
- `setBorder` — border mark (`{ attrs: { style, width, color } }`)
- `setSpanLang` — spanLang mark (`{ attrs: { lang, dir } }`)

### MentionExtension

Provides @mention mark.

**Commands:** `insertMention` — payload: `{ id: string }`

### FootnoteExtension

Provides footnote definition (footnoteDef) and reference (footnoteRef mark).

**Commands:**
- `insertFootnote` — payload: `{ id: string, text?: string }` (creates both def + ref)
- `insertFootnoteRef` — payload: `{ id: string }` (ref only)

## Inline Atom Extensions

### BookmarkExtension

Provides bookmark anchor insertion.

**Commands:** `insertBookmark` — payload: `{ id: string }`

### FieldExtension

Provides document field insertions (page number, date, title, etc.).

**Commands:**
- `insertFieldPageNumber`
- `insertFieldPageCount`
- `insertFieldDateTime` — payload: `{ format?: string }`
- `insertFieldDocTitle`
- `insertFieldAuthor`

## Document Structure Extension

### DocStructureExtension

Aggregates document-level structural blocks.

**Commands:**
- `insertDocSection` — document section
- `insertDocHeader` — document header
- `insertDocFooter` — document footer
- `insertBibliography` — bibliography block
- `insertEndnote` — payload: `{ attrs: { id: string } }`
- `insertIndexBlock` — index block
- `insertChart` — payload: `{ attrs: { title?: string, values: string } }`

## UX Extensions

### SlashCommandExtension

Provides slash command menu (type `/` to see command palette).

### FloatingToolbarExtension

Provides floating toolbar that appears on text selection.

### ReorderExtension

Provides block-level drag and drop with auto-scroll and ESC cancellation.

**Commands:** `moveBlockToPosition`

### FindReplaceExtension

Provides find and replace functionality.

**Commands:** `find`, `findAndReplace`

**Keybindings:** `Mod+f` (find), `Mod+h` (find and replace)

---

### `createRichExtensions(): Extension[]`

Creates all rich content extensions (includes basic + all schema-complete extensions).

**Returns:** `Extension[]`

**Includes all of `createBasicExtensions()` plus:**

| Category | Extensions |
|----------|-----------|
| **Formatting** | Underline, StrikeThrough, CodeMark, Highlight, FontColor, SubSuper, FontSize, FontFamily, TextFormatting |
| **Rich Content** | Link, Image, CodeBlock, HorizontalRule, Table, Checklist, Callout, MathBlock, MathInline, Comment, PageBreak |
| **Block Structures** | PullQuote, Columns, Toc, Details, DescriptionList, Figure |
| **Media** | Media (Video, Audio, Embed) |
| **Inline Atoms** | Mention, Footnote, Bookmark, Field |
| **Document** | DocStructure |
| **Editing** | MoveBlock, DragDrop |

**Example:**
```typescript
import { createRichExtensions } from '@barocss/extensions';

const richExtensions = createRichExtensions();
editor.use(...richExtensions);
```

## Extension Options Summary

### Core Extensions (always included)

| Extension | Keybindings | Commands |
|----------|------------|----------|
| `TextExtension` | - | `replaceText` |
| `DeleteExtension` | - | `deleteSelection`, `deleteBackward`, `deleteForward` |
| `ParagraphExtension` | - | `insertParagraph`, `setParagraph` |
| `MoveSelectionExtension` | Arrow keys, Shift+Arrow | `moveSelection*`, `extendSelection*` |
| `SelectAllExtension` | `Mod+a` | `selectAll` |
| `IndentExtension` | `Tab`, `Shift+Tab` | `indent`, `outdent` |
| `CopyPasteExtension` | `Mod+c/x/v` | `copy`, `cut`, `paste` |
| `EscapeExtension` | `Escape` | `escape` |
| `HardBreakExtension` | - | `insertHardBreak` |

### Basic Extensions

| Extension | Keybindings | Commands |
|----------|------------|----------|
| `BoldExtension` | `Mod+b` | `toggleBold` |
| `ItalicExtension` | `Mod+i` | `toggleItalic` |
| `HeadingExtension` | `Mod+Alt+1-6` | `setHeading1-6`, `setHeading`, `removeHeading` |
| `ListExtension` | - | `toggleBulletList`, `toggleOrderedList`, `splitListItem` |
| `BlockquoteExtension` | - | `toggleBlockquote` |

### Rich Extensions — Formatting Marks

| Extension | Commands |
|----------|----------|
| `UnderlineExtension` | `toggleUnderline` |
| `StrikeThroughExtension` | `toggleStrikeThrough` |
| `CodeMarkExtension` | `toggleCode` |
| `HighlightExtension` | `toggleHighlight` |
| `FontColorExtension` | `setFontColor`, `removeFontColor`, `setBgColor`, `removeBgColor` |
| `SubSuperExtension` | `toggleSubscript`, `toggleSuperscript` |
| `FontSizeExtension` | `setFontSize`, `removeFontSize` |
| `FontFamilyExtension` | `setFontFamily`, `removeFontFamily` |
| `TextFormattingExtension` | `toggleSmallCaps`, `toggleKbd`, `toggleSpoiler`, `setLetterSpacing`, `setWordSpacing`, `setLineHeight`, `setTextShadow`, `setBorder`, `setSpanLang` |
| `MentionExtension` | `insertMention` |
| `FootnoteExtension` | `insertFootnote`, `insertFootnoteRef` |

### Rich Extensions — Block Content

| Extension | Commands |
|----------|----------|
| `LinkExtension` | `insertLink`, `removeLink` |
| `ImageExtension` | `insertImage` |
| `CodeBlockExtension` | `insertCodeBlock`, `toggleCodeBlock` |
| `HorizontalRuleExtension` | `insertHorizontalRule` |
| `PageBreakExtension` | `insertPageBreak` |
| `TableExtension` | `insertTable` |
| `ChecklistExtension` | `insertChecklist`, `toggleChecklistItem` |
| `CalloutExtension` | `insertCallout` |
| `MathBlockExtension` | `insertMathBlock` |
| `MathInlineExtension` | `insertMathInline` |
| `CommentExtension` | `insertComment` |
| `PullQuoteExtension` | `insertPullQuote` |
| `ColumnsExtension` | `insertColumns`, `addColumn`, `removeColumn` |
| `TocExtension` | `insertToc` |
| `DetailsExtension` | `insertDetails` |
| `DescriptionListExtension` | `insertDescriptionList`, `addDescriptionItem` |
| `FigureExtension` | `insertFigure`, `setFigcaption` |
| `MediaExtension` | `insertVideo`, `insertAudio`, `insertEmbed` |
| `BookmarkExtension` | `insertBookmark` |
| `FieldExtension` | `insertFieldPageNumber`, `insertFieldPageCount`, `insertFieldDateTime`, `insertFieldDocTitle`, `insertFieldAuthor` |
| `DocStructureExtension` | `insertDocSection`, `insertDocHeader`, `insertDocFooter`, `insertBibliography`, `insertEndnote`, `insertIndexBlock`, `insertChart` |

### UX Extensions

| Extension | Keybindings | Commands |
|----------|------------|----------|
| `MoveBlockExtension` | `Mod+ArrowUp/Down` | `moveBlockUp`, `moveBlockDown` |
| `ReorderExtension` | - | `moveBlockToPosition` |
| `FindReplaceExtension` | `Mod+f`, `Mod+h` | `find`, `findAndReplace` |
| `SlashCommandExtension` | `/` | - |
| `FloatingToolbarExtension` | - | - |

---

## Schema Coverage

All 48 node types and 24 marks in the standard schema have corresponding extensions:

```
Nodes:  48/48 covered (100%)
Marks:  24/24 covered (100%)
Total commands: 90+
```

---

## Related

- [Extension Design Guide](../guides/extension-design) - Creating custom extensions
- [Advanced Extension Patterns](../guides/advanced-extensions) - Advanced extension patterns
- [Editor Core API](./editor-core-api) - Extension interface and lifecycle
- [Model Operations API](./model-operations) - Using operations in extensions
