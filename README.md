# Barocss Editor

A powerful document editor with schema-driven model, converter, and DSL-based rendering.

## ✨ Features

- **Schema-Driven**: Define document structure with validation rules and node capabilities
- **Model-First Architecture**: All editing operations are expressed as model operations
- **Transactional**: Atomic operations with rollback support
- **Extensible**: Plugin-based extension system for custom commands
- **Keyboard Shortcuts**: Rich keyboard shortcuts (Undo/Redo, Bold/Italic, Heading/Paragraph, Block movement, etc.)
- **Format Conversion**: Convert between HTML, Markdown, LaTeX, Office HTML, Google Docs HTML, Notion HTML
- **DSL-Based Rendering**: Declarative DOM rendering with template DSL
- **TypeScript**: Full TypeScript support with comprehensive types

## 📦 Packages

Each package has its own README with detailed documentation:

- [`@barocss/schema`](./packages/schema/README.md) - Schema DSL for defining document structure, validation rules, and node capabilities
- [`@barocss/datastore`](./packages/datastore/README.md) - Transactional, schema-aware node store (normalized `INode` / `IMark` with `sid` / `stype`)
- [`@barocss/model`](./packages/model/README.md) - High‑level model operations + DSL (`defineOperation`, `defineOperationDSL`, `transaction`)
- [`@barocss/renderer-dom`](./packages/renderer-dom/README.md) - Renderer DSL for declarative DOM rendering
- [`@barocss/editor-core`](./packages/editor-core/README.md) - Core editor logic (selection manager, keybinding, context, transaction manager)
- [`@barocss/extensions`](./packages/extensions/README.md) - Core editor extensions (text, delete, paragraph, move-selection, select-all, indent, copy/paste/cut, etc.)
- [`@barocss/converter`](./packages/converter/README.md) - Pluggable converters for HTML/Markdown/Office/Google Docs/Notion/LaTeX ↔ model
- [`@barocss/dsl`](./packages/dsl/README.md) - Low-level template and registry layer used by renderers (`define`, `element`, `slot`, `data`, `defineMark`)
- [`@barocss/editor-view-dom`](./packages/editor-view-dom/README.md) - View layer that connects `Editor` and the DOM (selection sync, input handling, keybinding dispatch)
- [`@barocss/devtool`](./packages/devtool/README.md) - Developer tool UI for inspecting editor events, selection, transactions, and datastore state
- [`@barocss/shared`](./packages/shared/README.md) - Shared utilities and constants (platform detection, key normalization, shared helpers)
- [`@barocss/dom-observer`](./packages/dom-observer/README.md) - DOM mutation observer utilities used by `editor-view-dom` and devtools
- [`@barocss/text-analyzer`](./packages/text-analyzer/README.md) - Experimental text analysis utilities (tokenization, statistics, helper types)

## 🚀 Quick Start

```typescript
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';
import { createSchema } from '@barocss/schema';
import { DataStore } from '@barocss/datastore';
import { define, element, slot, data } from '@barocss/dsl';

// 1. Define schema
const schema = createSchema('basic-doc', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  }
});

// 2. Create DataStore and Editor
const dataStore = new DataStore();
dataStore.registerSchema(schema);

const editor = new Editor({
  editable: true,
  schema,
  dataStore,
  extensions: [...createCoreExtensions(), ...createBasicExtensions()]
});

// 3. Load initial document
editor.loadDocument({
  sid: 'doc-1',
  stype: 'document',
  content: [{
    sid: 'p-1',
    stype: 'paragraph',
    content: [{ sid: 'text-1', stype: 'inline-text', text: 'Hello, World!' }]
  }]
}, 'initial');

// 4. Register renderers
define('document', element('div', { className: 'document' }, [slot('content')]));
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', { className: 'text' }, [data('text', '')]));

// 5. Create view and render
const container = document.getElementById('editor');
const view = new EditorViewDOM(editor, {
  contentEditableElement: container!
});
view.render();
```

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

### Model Operations

All editing behavior is expressed as **model operations** composed into transactions:

```typescript
import { transaction, control, insertText, toggleMark } from '@barocss/model';

// Insert text
await transaction(editor, control('text-1', [
  insertText({ text: 'Hello' })
])).commit();

// Toggle mark
await transaction(editor, control('text-1', [
  toggleMark('bold', [0, 5])
])).commit();
```

See [@barocss/model/README.md](./packages/model/README.md) for more details.

### Schema Definition

Define your document structure with validation rules:

```typescript
import { createSchema } from '@barocss/schema';

const schema = createSchema('basic-doc', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline', marks: ['bold', 'italic'] }
  },
  marks: {
    bold: { name: 'bold', group: 'text-style' },
    italic: { name: 'italic', group: 'text-style' }
  }
});
```

See [@barocss/schema/README.md](./packages/schema/README.md) for more details.

### Renderer Definition

Define how nodes are rendered to DOM:

```typescript
import { define, element, slot, data } from '@barocss/dsl';

define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', { className: 'text' }, [data('text', '')]));
```

See [@barocss/dsl/README.md](./packages/dsl/README.md) for more details.

### Creating Custom Extensions

Extensions allow you to add custom commands and functionality. See [@barocss/extensions/README.md](./packages/extensions/README.md) for detailed documentation and examples.

## ⌨️ Default Keyboard Shortcuts

The editor comes with a comprehensive set of keyboard shortcuts:

### Text Formatting
- `Mod+b` - Toggle Bold
- `Mod+i` - Toggle Italic
- `Mod+u` - Toggle Underline
- `Mod+Shift+s` - Toggle StrikeThrough

### Block Operations
- `Mod+Alt+1/2/3` - Set Heading Level 1/2/3
- `Mod+Alt+0` - Set Paragraph
- `Alt+ArrowUp/Down` - Move Block Up/Down
- `Tab` / `Shift+Tab` - Indent/Outdent

### History
- `Mod+z` - Undo
- `Mod+Shift+z` / `Mod+y` - Redo

### Navigation & Selection
- `Mod+a` - Select All
- `ArrowLeft/Right` - Move Cursor
- `Alt+ArrowLeft/Right` (macOS) / `Ctrl+ArrowLeft/Right` (Windows/Linux) - Move by Word
- `Shift+ArrowLeft/Right` - Extend Selection
- `Escape` - Clear Selection or Blur

### Clipboard
- `Mod+c` - Copy
- `Mod+v` - Paste
- `Mod+x` - Cut

See [packages/editor-core/src/keybinding/default-keybindings.ts](./packages/editor-core/src/keybinding/default-keybindings.ts) for the complete list.

## 🏗️ Architecture

The editor is built with a modular architecture:

```mermaid
graph TB
    subgraph "Schema Layer"
        Schema[@barocss/schema<br/>Document Structure & Validation]
    end
    
    subgraph "Data Layer"
        DataStore[@barocss/datastore<br/>Transactional Node Store]
        Model[@barocss/model<br/>Operations & DSL]
    end
    
    subgraph "Rendering Layer"
        DSL[@barocss/dsl<br/>Template DSL]
        Renderer[@barocss/renderer-dom<br/>DOM Rendering]
    end
    
    subgraph "Editor Layer"
        Core[@barocss/editor-core<br/>Selection, Keybinding, Context]
        Extensions[@barocss/extensions<br/>Commands & Extensions]
        View[@barocss/editor-view-dom<br/>DOM Integration]
    end
    
    subgraph "External"
        Converter[@barocss/converter<br/>Format Conversion]
        Devtool[@barocss/devtool<br/>Debugging UI]
    end
    
    Schema --> DataStore
    DataStore --> Model
    Model --> Core
    Core --> Extensions
    DSL --> Renderer
    Model --> Renderer
    Core --> View
    Renderer --> View
    View --> Converter
    View --> Devtool
    
    style Schema fill:#e1f5ff
    style DataStore fill:#fff4e1
    style Model fill:#fff4e1
    style DSL fill:#e8f5e9
    style Renderer fill:#e8f5e9
    style Core fill:#f3e5f5
    style Extensions fill:#f3e5f5
    style View fill:#f3e5f5
    style Converter fill:#fce4ec
    style Devtool fill:#fce4ec
```

### Architecture Layers

1. **Schema Layer (`@barocss/schema`)** - Defines document structure, validation rules, and node capabilities
2. **Data Layer (`@barocss/datastore`, `@barocss/model`)** - Schema-aware, transactional node store and high-level editing operations
3. **Rendering Layer (`@barocss/dsl`, `@barocss/renderer-dom`)** - Declarative DOM rendering from the model using template DSL
4. **Editor Layer (`@barocss/editor-core`, `@barocss/extensions`, `@barocss/editor-view-dom`)** - Selection manager, keybinding, commands, and DOM integration
5. **External Tools (`@barocss/converter`, `@barocss/devtool`)** - Format conversion and debugging utilities

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📖 Documentation

- [Architecture Overview](./docs/architecture-summary.md)
- [Package Documentation](./docs/README.md)
- [API Reference](./docs/api-reference.md)
- [Testing Guide](./paper/testing-guide.md)

### Package-Specific Documentation

- [Schema](./packages/schema/README.md) - Schema definition and validation
- [Datastore](./packages/datastore/README.md) - Node storage and transactions
- [Model](./packages/model/README.md) - Model operations and DSL
- [Extensions](./packages/extensions/README.md) - Creating custom extensions
- [DSL](./packages/dsl/README.md) - Template DSL reference
- [Editor Core](./packages/editor-core/README.md) - Core editor API
- [Editor View DOM](./packages/editor-view-dom/README.md) - DOM integration
- [Converter](./packages/converter/README.md) - Format conversion

## 📞 Support

For questions and support, please open an issue on GitHub.
