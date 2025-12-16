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

Provides underline formatting functionality.

**Location**: `packages/extensions/src/underline.ts`

**Commands:**
- `toggleUnderline` - Toggles underline formatting

**Example:**
```typescript
import { UnderlineExtension } from '@barocss/extensions';

const extension = new UnderlineExtension();
editor.use(extension);
```

### StrikethroughExtension

Provides strikethrough formatting functionality.

**Location**: `packages/extensions/src/strikethrough.ts`

**Commands:**
- `toggleStrikethrough` - Toggles strikethrough formatting

**Example:**
```typescript
import { StrikethroughExtension } from '@barocss/extensions';

const extension = new StrikethroughExtension();
editor.use(extension);
```

### HeadingExtension

Provides heading functionality.

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

Rich text editing extensions (Bold, Italic, Underline, Heading).

**Returns:**
- `Extension[]` - Array of extensions

**Includes:**
- `BoldExtension`
- `ItalicExtension`
- `UnderlineExtension`
- `HeadingExtension`

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

## Extension Options Summary

| Extension | Options | Default Keyboard Shortcut | Commands |
|----------|---------|-------------------------|----------|
| `TextExtension` | `enabled?` | - | `replaceText` |
| `DeleteExtension` | `enabled?` | - | `deleteSelection`, `deleteBackward`, `deleteForward` |
| `BoldExtension` | `enabled?`, `keyboardShortcut?` | `Mod+b` | `toggleBold` |
| `ItalicExtension` | `enabled?`, `keyboardShortcut?` | `Mod+i` | `toggleItalic` |
| `UnderlineExtension` | - | - | `toggleUnderline` |
| `StrikethroughExtension` | - | - | `toggleStrikethrough` |
| `HeadingExtension` | `enabled?`, `levels?` | `Mod+Alt+1-6` | `setHeading`, `toggleHeading` |
| `ParagraphExtension` | - | - | `insertParagraph`, `setParagraph` |
| `IndentExtension` | `enabled?` | `Tab`, `Shift+Tab` | `indent`, `outdent` |
| `MoveSelectionExtension` | - | Arrow keys | `moveSelectionUp/Down/Left/Right` |
| `MoveBlockExtension` | `enabled?` | `Mod+ArrowUp/Down` | `moveBlockUp`, `moveBlockDown` |
| `SelectAllExtension` | - | `Mod+a` | `selectAll` |
| `CopyPasteExtension` | - | `Mod+c/x/v` | `copy`, `cut`, `paste` |
| `EscapeExtension` | - | `Escape` | `escape` |

---

## Related

- [Extension Design Guide](../guides/extension-design) - Creating custom extensions
- [Advanced Extension Patterns](../guides/advanced-extensions) - Advanced extension patterns
- [Editor Core API](./editor-core-api) - Extension interface and lifecycle
- [Model Operations API](./model-operations) - Using operations in extensions
