# Practical Examples

This document shows how the different packages work together in real-world scenarios, demonstrating the complete architecture in action.

## Example 1: Complete Editor Setup

This example shows how all core packages work together to create a functional editor.

```typescript
import { createSchema } from '@barocss/schema';
import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { define, element, data, slot } from '@barocss/dsl';
import { createCoreExtensions } from '@barocss/extensions';

// 1. Define Schema (Schema Package)
const schema = createSchema('basic-schema', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  },
  marks: {
    bold: { name: 'bold', group: 'text-style' }
  }
});

// 2. Define Templates (DSL Package)
define('document', element('div', { className: 'document' }, [slot('content')]));
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', { className: 'text' }, [data('text', '')]));

// 3. Create DataStore (DataStore Package)
const dataStore = new DataStore(undefined, schema);

// Initialize document
dataStore.createNode({
  sid: 'doc-1',
  stype: 'document',
  content: []
});

dataStore.createNode({
  sid: 'p1',
  stype: 'paragraph',
  parentId: 'doc-1',
  content: []
});

dataStore.createNode({
  sid: 'text-1',
  stype: 'inline-text',
  parentId: 'p1',
  text: 'Hello, World!'
});

// Update document content
dataStore.updateNode('doc-1', { content: ['p1'] });
dataStore.updateNode('p1', { content: ['text-1'] });

// 4. Create Editor (Editor-Core Package)
const editor = new Editor({
  dataStore,
  schema,
  extensions: createCoreExtensions()  // Provides basic commands
});

// 5. Create View (Editor-View-DOM Package)
const container = document.getElementById('editor');
const view = new EditorViewDOM(editor, container);
// View automatically sets up event handlers and renders
```

**What happens:**
1. **Schema** validates all operations
2. **DataStore** stores document data with transactions
3. **Editor** orchestrates commands and keybindings
4. **View** connects editor to DOM and handles user input
5. **Renderer** (inside View) converts model to DOM using templates

## Example 2: Transaction Flow

This example demonstrates how transactions work across packages.

```typescript
import { transaction, control, insertText, toggleMark } from '@barocss/model';

// User types "Hello" and applies bold formatting
const result = await transaction(editor, [
  ...control('text-1', [
    insertText({ text: 'Hello', offset: 0 }),
    toggleMark('bold', [0, 5])
  ])
]).commit();

if (!result.success) {
  console.error('Transaction failed:', result.error);
  return;
}

// What happens internally:
// 1. Editor-Core: Receives transaction request
// 2. Model Package: Converts DSL to operations
// 3. DataStore: Begins transaction (creates overlay)
// 4. DataStore: Executes operations in overlay
// 5. Schema: Validates each operation
// 6. DataStore: Ends transaction (collects operations)
// 7. DataStore: Commits (applies to base)
// 8. Editor-View-DOM: Detects model change
// 9. Renderer-DOM: Rebuilds VNode from updated model
// 10. Renderer-DOM: Reconciles with previous VNode
// 11. DOM: Updates only changed parts
```

**Transaction benefits:**
- **Atomic**: All operations succeed or fail together
- **Validated**: Schema validates before commit
- **Undoable**: Transaction recorded for history
- **Efficient**: Only modified nodes are copied (COW overlay)

## Example 3: Selection Management

This example shows how selection flows through the architecture.

```typescript
// User selects text in DOM
// → Editor-View-DOM detects selection change
// → Converts DOM selection to model selection
// → Updates Editor-Core selection state

// Editor-Core selection format:
const selection = {
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: 5
};

// Editor-Core stores selection
editor.setSelection(selection);

// When model changes, Editor-View-DOM:
// → Reads selection from Editor-Core
// → Converts to DOM selection
// → Updates DOM selection
// → Selection stays in sync
```

**Selection flow:**
```
DOM Selection
    ↓
Editor-View-DOM (converts to model selection)
    ↓
Editor-Core (stores selection state)
    ↓
Commands use selection
    ↓
Model changes
    ↓
Editor-View-DOM (updates DOM selection)
    ↓
DOM Selection (synchronized)
```

## Example 4: Extension Integration

This example shows how extensions integrate with the architecture.

```typescript
import { defineExtension } from '@barocss/extensions';
import { transaction, insertText } from '@barocss/model';

// Define custom extension
const customExtension = defineExtension({
  name: 'custom-insert',
  commands: {
    insertHello: {
      execute: async (editor, payload) => {
        const { nodeId, offset } = payload;
        const result = await transaction(editor, [
          insertText({ text: 'Hello', nodeId, offset })
        ]).commit();
        return result.success;
      }
    }
  },
  keybindings: {
    'Mod-h': 'insertHello'
  }
});

// Register extension
const editor = new Editor({
  dataStore,
  schema,
  extensions: [
    ...createCoreExtensions(),
    customExtension
  ]
});

// Extension flow:
// 1. User presses Ctrl+H (or Cmd+H on Mac)
// 2. Editor-View-DOM captures keyboard event
// 3. Editor-Core dispatches to keybinding handler
// 4. Extension command executes
// 5. Transaction runs through Model Package
// 6. DataStore updates model
// 7. Editor-View-DOM triggers re-render
```

## Example 5: Rendering Pipeline

This example demonstrates the complete rendering pipeline.

```typescript
// Model changes in DataStore
const model = dataStore.getNode('doc-1');
// { sid: 'doc-1', stype: 'document', content: ['p1'] }

// Editor-View-DOM detects change
// → Calls renderer.build(model, decorators)

// Renderer-DOM pipeline:
// 1. VNodeBuilder looks up template by stype
const template = registry.get('document');
// → element('div', { className: 'document' }, [slot('content')])

// 2. VNodeBuilder applies model data to template
const vnode = vnodeBuilder.build(template, model);
// → { tag: 'div', attrs: { className: 'document' }, children: [...] }

// 3. DOMReconcile compares with previous VNode
const changes = reconcile(prevVNode, vnode, container);

// 4. DOM updates only changed parts
// → If only text changed, only text node is updated
// → If structure changed, only affected nodes are updated
```

**Rendering flow:**
```
Model (DataStore)
    ↓
Editor-View-DOM (detects change)
    ↓
Renderer-DOM.build() (VNodeBuilder)
    ↓
DSL Registry (lookup template)
    ↓
VNode (virtual representation)
    ↓
DOMReconcile (compare with previous)
    ↓
DOM Updates (minimal changes)
    ↓
DOM (visual representation)
```

## Example 6: Schema Validation

This example shows how schema validation works across packages.

```typescript
// Attempt to create invalid node
try {
  dataStore.createNode({
    sid: 'invalid',
    stype: 'invalid-node',  // Not in schema
    content: []
  });
} catch (error) {
  // Schema validation error
  console.error('Invalid node type:', error);
}

// Schema validates at multiple levels:
// 1. DataStore.createNode() - Validates stype exists
// 2. DataStore.updateNode() - Validates attributes
// 3. Transaction commit - Validates all operations
// 4. Editor commands - Validates before execution
```

## Example 7: Decorator System

This example demonstrates decorators (temporary UI overlays).

```typescript
import { defineDecorator, element } from '@barocss/dsl';

// Define decorator template
defineDecorator('highlight', element('span', {
  className: 'highlight',
  style: { backgroundColor: 'yellow' }
}, []));

// Add decorator via Editor-View-DOM
view.addDecorator({
  target: { nodeId: 'p1' },
  type: 'highlight',
  attrs: {}
});

// Decorator flow:
// 1. Decorator added to view
// 2. View passes decorators to renderer
// 3. Renderer applies decorator during VNode build
// 4. Decorator rendered in separate layer
// 5. Decorator doesn't affect model
// 6. Decorator can be removed without model change
```

## Example 8: Complete Editing Session

This example shows a complete editing session from start to finish.

```typescript
// 1. Setup (one time)
const schema = createSchema(/* ... */);
const dataStore = new DataStore(undefined, schema);
const editor = new Editor({ dataStore, schema, extensions: [...] });
const view = new EditorViewDOM(editor, container);

// 2. User types "Hello"
// → View captures input
// → Editor executes 'insertText' command
// → Transaction: insertText({ text: 'Hello', nodeId: 'text-1', offset: 0 })
// → DataStore: Updates model in transaction
// → DataStore: Commits transaction
// → View: Detects model change
// → Renderer: Rebuilds VNode
// → Renderer: Reconciles with previous VNode
// → DOM: Updates text node

// 3. User selects text and presses Ctrl+B
// → View captures keyboard event
// → Editor dispatches keybinding
// → Extension executes 'bold' command
// → Transaction: toggleMark('bold', [0, 5])
// → DataStore: Updates marks in transaction
// → DataStore: Commits transaction
// → View: Detects model change
// → Renderer: Rebuilds VNode (with mark)
// → Renderer: Reconciles
// → DOM: Wraps text in <strong> tag

// 4. User presses Ctrl+Z (undo)
// → View captures keyboard event
// → Editor dispatches keybinding
// → DataStore: Undoes last transaction
// → View: Detects model change
// → Renderer: Rebuilds VNode (without mark)
// → Renderer: Reconciles
// → DOM: Removes <strong> tag
```

## Key Architecture Principles Demonstrated

1. **Model-First**: All changes go through model, never direct DOM manipulation
2. **Transaction-Based**: All operations are atomic and undoable
3. **Schema-Validated**: All operations validated against schema
4. **DSL-Unified**: Templates, marks, decorators all use DSL
5. **Layered Rendering**: Model → VNode → DOM with efficient reconciliation
6. **Separation of Concerns**: Each package has clear responsibility
7. **Extensible**: Extensions integrate seamlessly with core

## Related

- [Architecture Overview](./overview) - High-level architecture explanation
- [Core Concepts](../concepts/schema-and-model) - Deep dive into core concepts
- [Basic Usage](../basic-usage) - Step-by-step setup guide
- [Extension Design](../guides/extension-design) - How to create extensions
