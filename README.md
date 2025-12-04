# Barocss Editor

Barocss Editor - A powerful document editor with schema-driven model, converter, and DSL-based rendering

## 📦 Packages

- `@barocss/schema` - Schema DSL for defining document structure, validation rules, and node capabilities (editable / selectable / draggable / indentable)
- `@barocss/datastore` - Transactional, schema-aware node store (normalized `INode` / `IMark` with `sid` / `stype`)
- `@barocss/model` - High‑level model operations + DSL (`defineOperation`, `defineOperationDSL`, `transaction`, clipboard / indent / delete / move, etc.)
- `@barocss/renderer-dom` - Renderer DSL for declarative DOM rendering
- `@barocss/editor-core` - Core editor logic (selection manager, keybinding, context, transaction manager)
- `@barocss/extensions` - Core editor extensions (text, delete, paragraph, move-selection, select-all, indent, copy/paste/cut etc.)
- `@barocss/converter` - Pluggable converters for HTML/Markdown/Office/Google Docs/Notion/LaTeX ↔ model
- `@barocss/dsl` - Low-level template and registry layer used by renderers (`define`, `element`, `slot`, `data`, `defineMark`)
- `@barocss/editor-view-dom` - View layer that connects `Editor` and the DOM (selection sync, input handling, keybinding dispatch)
- `@barocss/devtool` - Developer tool UI for inspecting editor events, selection, transactions, and datastore state
- `@barocss/shared` - Shared utilities and constants (platform detection, key normalization, shared helpers)
- `@barocss/dom-observer` - DOM mutation observer utilities used by `editor-view-dom` and devtools
- `@barocss/text-analyzer` - Experimental text analysis utilities (tokenization, statistics, helper types)

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development server for test app
pnpm --filter @barocss/test-app dev
```

### Development

```bash
# Build all packages in watch mode
pnpm dev

# Type check all packages
pnpm type-check

# Lint all packages
pnpm lint

# Clean all build artifacts
pnpm clean
```

## 📚 Usage

### Transaction-based Operations (Model DSL)

All editing behavior is expressed as **model operations** composed into transactions via the DSL.

- Single position: `insertText`, `splitTextNode`, `splitBlockNode`
- Ranges: `deleteTextRange`, `replaceText`, `deleteRange`
- Structural edits: `indentNode`, `outdentNode`, `mergeBlockNodes`, `addChild`
- Clipboard: `copy`, `paste`, `cut` (built on `DataStore.serializeRange` / `deserializeNodes`)

Example:

```ts
import { transaction, control, insertText, deleteTextRange } from '@barocss/model';

// Insert text at current caret (control(targetNodeId, [dsl...]))
await transaction(editor, control('text-1', [
  insertText({ text: 'Hello' })
])).commit();

// Delete a range inside a single text node
await transaction(editor, control('text-1', [
  deleteTextRange(2, 5)
])).commit();
```

### Basic Schema Definition

```typescript
import { Schema } from '@barocss/schema';

// Minimal schema with a document, a paragraph block, and an inline text node
export const paragraphSchema = new Schema('basic-doc', {
  nodes: {
    document: {
      name: 'document',
      content: 'block+'
    },
    paragraph: {
      name: 'paragraph',
      group: 'block',
      content: 'inline*',
      attrs: {
        align: {
          type: 'string',
          default: 'left',
          validate: (value: string) =>
            ['left', 'center', 'right', 'justify'].includes(value)
        }
      }
    },
    'inline-text': {
      name: 'inline-text',
      group: 'inline',
      // inline text is editable and can carry marks
      editable: true,
      marks: ['bold', 'italic']
    }
  },
  marks: {
    bold: {
      name: 'bold',
      group: 'text-style'
    },
    italic: {
      name: 'italic',
      group: 'text-style'
    }
  },
  topNode: 'document'
});
```

### Model Data Creation (Datastore + Operations)

```typescript
import { DataStore } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';

// Simple document tree in INode form
const nodes: INode[] = [
  {
    stype: 'paragraph',
    content: [
      { stype: 'inline-text', text: 'Hello, World!' }
    ]
  }
];

const dataStore = new DataStore();
// Create the full tree in one call (assigns sid, parentId, and content id arrays)
const root = dataStore.createNodeWithChildren({
  stype: 'document',
  content: nodes
} as INode);
dataStore.setRootNodeId(root.sid!);
```

### DOM Renderer Definition

The DOM renderer uses the same DSL as `apps/editor-test/src/main.ts`:

```typescript
import { define, element, slot, data } from '@barocss/dsl';

// Render inline text nodes as <span class="text">...</span>
define('inline-text', element('span', { className: 'text' }, [
  data('text', '')
]));
```

### Editor Core Usage (Selection + Keybinding + Extensions)

```typescript
import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';
import { createSchema } from '@barocss/schema';
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';

// 1. Define schema (same API as apps/editor-test/src/main.ts)
const schema = createSchema('basic-doc', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  },
  marks: {}
});

// 2. Create DataStore with schema
const dataStore = new DataStore(undefined, schema);

// 3. Bootstrap initial document tree (INode form)
const initialTree = {
  sid: 'doc-1',
  stype: 'document',
  content: [
    {
      sid: 'p-1',
      stype: 'paragraph',
      content: [
        { sid: 'text-1', stype: 'inline-text', text: 'Hello from BaroCSS Editor' }
      ]
    }
  ]
};

// 4. Create editor with core + basic extensions
const coreExtensions = createCoreExtensions();
const basicExtensions = createBasicExtensions();

const editor = new Editor({
  editable: true,
  schema,
  dataStore,
  extensions: [...coreExtensions, ...basicExtensions]
});

editor.loadDocument(initialTree, 'getting-started');

// 5. Register DOM renderers using the DSL registry
define('document', element('div', { className: 'document' }, [slot('content')]));
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', { className: 'text' }, [data('text', '')]));

// In a real app, pass editor + registry into EditorViewDOM
// new EditorViewDOM(editor, { container, registry: getGlobalRegistry() }).render();

// Execute commands via keybindings or API
editor.executeCommand('selectAll');
```

## 🏗️ Architecture

The editor is built with a modular architecture:

1. **Schema DSL (`@barocss/schema`)** - Defines document structure, validation rules, and node capabilities
2. **Datastore (`@barocss/datastore`)** - Schema-aware, transactional node store (`INode`/`IMark`, `sid`/`stype`)
3. **Model Operations + DSL (`@barocss/model`)** - High-level editing operations composed from datastore (`defineOperation`, `defineOperationDSL`, `transaction`)
4. **Renderer DSL + DSL Core (`@barocss/renderer-dom`, `@barocss/dsl`)** - Declarative DOM rendering from the model using `define`, `element`, `slot`, `data`, `defineMark`
5. **Editor Core (`@barocss/editor-core`)** - Selection manager, keybinding, context, transaction manager
6. **View Layer (`@barocss/editor-view-dom`, `@barocss/dom-observer`)** - Bridges `Editor` to the DOM, handles text input, selection sync, and mutation observation
7. **Extensions (`@barocss/extensions`)** - Business-level commands (delete, move-selection, indent, copy/paste/cut, etc.)
8. **Converter (`@barocss/converter`)** - Conversion layer between the model and external formats (HTML, Markdown, Office HTML, Google Docs HTML, Notion HTML, LaTeX, plain text, etc.)
9. **Devtool (`@barocss/devtool`)** - Debugging and inspection UI for the editor (events, selection, transactions, datastore)
10. **Shared Utilities (`@barocss/shared`, `@barocss/text-analyzer`)** - Cross-package utilities (platform detection, key handling, text analysis helpers)

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For questions and support, please open an issue on GitHub.
