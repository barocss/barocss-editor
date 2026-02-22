# Introduction

Barocss Editor is a document editor built with a **DSL-first, model-first architecture**. Unlike traditional contenteditable-based editors, Barocss separates data from presentation and uses declarative DSL for everything.

## The Problem with Contenteditable

Traditional contenteditable-based editors have several issues:

- **Direct DOM Manipulation**: Changes happen directly in the DOM, making it hard to track state
- **Inconsistent State**: DOM and data can get out of sync
- **Hard to Test**: Testing requires DOM manipulation
- **Limited Extensibility**: Hard to add new features without modifying core code
- **No Type Safety**: No schema validation at runtime

## Barocss Approach: Model-First + DSL

Barocss solves these problems with a fundamentally different approach:

### 1. Model-First Architecture

All operations work on a **model**, not the DOM:

```
User Action → Command → Transaction → Model Update → Render → DOM
```

**Benefits:**
- **Single Source of Truth**: Model is the only source of truth
- **Consistency**: DOM always reflects the model
- **Testability**: Test model operations without DOM
- **Undo/Redo**: Built-in history management
- **Collaboration**: Easy to sync model across clients

### 2. DSL-First Definition

Everything is defined using **DSL (Domain-Specific Language)**: templates, marks, decorators, and operations all use the same declarative DSL.

```typescript
// Templates, marks, decorators, operations - all use DSL
define('paragraph', element('p', {}, [slot('content')]));
defineMark('bold', element('strong', {}, [data('text')]));
defineDecorator('highlight', element('span', {}, []));
```

**Benefits:**
- **Consistent API**: Same patterns everywhere
- **Type-Safe**: Full TypeScript support
- **Composable**: Combine builders to create complex structures
- **Testable**: Pure functions are easy to test

### 3. Schema-Based Validation

All operations are validated against a **schema**:

```typescript
const schema = createSchema('my-doc', {
  nodes: { /* ... */ },
  marks: { /* ... */ }
});

// This will fail if 'invalid-node' is not in schema
dataStore.createNode({ stype: 'invalid-node' }); // ❌ Error
```

**Benefits:**
- **Type Safety**: Catch errors at runtime
- **Consistency**: All operations must conform to schema
- **Documentation**: Schema serves as documentation

## Key Differentiators

### vs Contenteditable Editors

| Feature | Contenteditable | Barocss |
|---------|----------------|---------|
| **Data Source** | DOM | Model |
| **State Management** | DOM state | Model state |
| **Testing** | Requires DOM | Test model operations |
| **Undo/Redo** | Manual implementation | Built-in |
| **Type Safety** | None | Schema validation |
| **Extensibility** | Modify core | DSL-based extensions |

### vs Other Model-Based Editors

| Feature | Others | Barocss |
|---------|--------|---------|
| **Template Definition** | JSX/HTML strings | DSL functions |
| **Mark Definition** | Separate system | DSL |
| **Decorator Definition** | Separate system | DSL |
| **Operation Definition** | Separate system | DSL |
| **Consistency** | Multiple systems | Single DSL system |

## Architecture Benefits

### 1. Separation of Concerns

- **Schema**: Defines structure (48 node types, 24 marks in standard schema)
- **Model**: Stores data with transactional operations
- **DSL**: Defines presentation declaratively
- **Renderer**: Converts to DOM or React
- **Editor**: Orchestrates operations via commands
- **Extensions**: 55+ built-in features with 100% schema coverage

### 2. Dual Rendering Targets

Barocss supports both DOM and React rendering from the same model:

```typescript
// DOM rendering
import { EditorViewDOM } from '@barocss/editor-view-dom';
const view = new EditorViewDOM(editor, { container });

// React rendering
import { EditorViewReact } from '@barocss/editor-view-react';
// Use as a React component
```

Both share the same model, schema, extensions, and transaction system.

### 3. Collaboration Ready

Built-in collaboration support via adapters:

- **Yjs adapter** (`@barocss/collaboration-yjs`) — CRDT-based real-time sync
- **Liveblocks adapter** (`@barocss/collaboration-liveblocks`) — Cloud-hosted collaboration
- Extensible `BaseAdapter` interface for custom backends

### 4. Format Conversion

The converter package (`@barocss/converter`) supports bidirectional conversion:

- **HTML** ↔ INode (including Office, Google Docs, Notion HTML cleaning)
- **Markdown** ↔ INode (GFM support)
- **LaTeX** → INode

### 5. Testability

```typescript
// Test model operations without DOM
const result = dataStore.createNode({ sid: 'p1', stype: 'paragraph' });
expect(result).toBeDefined();

// Test DSL templates without rendering
const template = registry.get('paragraph');
expect(template).toBeDefined();
```

### 6. Extensibility

Add new features using the same DSL patterns:

```typescript
define('custom-widget', element('div', {}, [data('content')]));
defineMark('highlight', element('mark', {}, [data('text')]));
defineDecorator('comment', element('div', {}, [data('text')]));
```

Learn DSL once, use it everywhere.

## Next Steps

- **[Quick Start](quick-start)** - Get started in minutes (DOM view)
- **[React Editor Guide](guides/react-editor)** - Build a React editor from scratch
- **[Core Concepts: DSL Templates](concepts/dsl-templates)** - Learn about DSL
- **[Architecture Overview](architecture/overview)** - Understand the complete architecture
- **[Extensions API](api/extensions-api)** - Browse all 55+ built-in extensions
