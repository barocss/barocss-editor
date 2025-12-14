# Schema & Model

Barocss Editor uses a schema-first approach where you define the structure of your document, and all operations work on a model that conforms to that schema.

## Schema

A schema defines the structure of your document - what nodes and marks are allowed, and how they can be nested. Think of it as a blueprint for your document structure.

### Creating a Schema

```typescript
import { createSchema } from '@barocss/schema';

const schema = createSchema('my-doc', {
  topNode: 'document',  // Root node type
  nodes: {
    document: {
      name: 'document',
      group: 'document',
      content: 'block+'  // Must contain one or more block nodes
    },
    paragraph: {
      name: 'paragraph',
      group: 'block',
      content: 'inline*'  // Can contain zero or more inline nodes
    },
    'inline-text': {
      name: 'inline-text',
      group: 'inline'  // Leaf node, no content
    }
  },
  marks: {
    bold: {
      name: 'bold',
      group: 'text-style'  // Can be applied to inline content
    },
    italic: {
      name: 'italic',
      group: 'text-style'
    }
  }
});
```

**What this means**: Your document must have a `document` node at the root, which contains one or more `paragraph` nodes. Each paragraph can contain inline text nodes, and text can have bold or italic marks applied.

### Schema Components

- **Nodes**: The building blocks of your document (paragraphs, headings, lists, etc.)
- **Marks**: Formatting applied to inline content (bold, italic, links, etc.)
- **Groups**: Logical groupings that define content rules (block, inline, document)

### Content Rules

Content rules define what can be nested inside a node:

- `block+` - One or more block nodes
- `inline*` - Zero or more inline nodes
- `paragraph | heading` - Either a paragraph or heading

## Model

The model is the actual data structure representing your document. It conforms to the schema and contains nodes with their properties.

### Model Structure

The model is a tree structure where each node conforms to your schema:

```typescript
// A simple paragraph node
const paragraphNode = {
  stype: 'paragraph',  // Must match a node name in your schema
  sid: 'p1',           // Unique identifier
  content: [           // Child nodes
    {
      stype: 'inline-text',
      sid: 'text-1',
      text: 'Hello, World!',
      marks: [{ type: 'bold' }]  // Formatting marks
    }
  ]
};

// A document node containing paragraphs
const documentNode = {
  stype: 'document',
  sid: 'doc-1',
  content: [
    paragraphNode,
    // ... more paragraphs
  ]
};
```

### Model Properties

Every model node has two required fields that are fundamental to how Barocss works:

- **stype** (Schema Type): The schema type of the node - must match a node name defined in your schema
- **sid** (Schema ID): A unique identifier for the node - used for updates, references, and operations

Additional properties:

- **content**: Array of child nodes (for container nodes like document, paragraph)
- **text**: Text content (for leaf nodes like inline-text)
- **marks**: Array of formatting marks applied to the node
- **attrs**: Additional attributes specific to the node type (optional)

### Understanding stype and sid

#### stype (Schema Type)

`stype` connects your model node to the schema definition:

```typescript
// Schema defines a node type
const schema = createSchema('my-doc', {
  nodes: {
    paragraph: { /* ... */ },  // Node type name
    'inline-text': { /* ... */ }
  }
});

// Model node must use matching stype
const node = {
  stype: 'paragraph',  // ✅ Matches schema
  sid: 'p1',
  // ...
};

const invalidNode = {
  stype: 'invalid-type',  // ❌ Not in schema - will fail validation
  sid: 'p1',
  // ...
};
```

**Key points:**
- `stype` must exactly match a node name in your schema
- Used for template lookup during rendering
- Schema validation checks `stype` against schema definition
- Case-sensitive and must match exactly

#### sid (Schema ID)

`sid` is a unique identifier for each node:

```typescript
const node1 = {
  stype: 'paragraph',
  sid: 'p1',  // Unique identifier
  // ...
};

const node2 = {
  stype: 'paragraph',
  sid: 'p2',  // Different identifier
  // ...
};
```

**Key points:**
- Must be unique within the document
- Used to reference nodes in operations
- Used for updates: `dataStore.updateNode('p1', { ... })`
- Used for selection: `{ nodeId: 'p1', offset: 5 }`
- Used for parent-child relationships

**Example: Using sid for operations**

```typescript
// Create node with sid
dataStore.createNode({
  sid: 'text-1',
  stype: 'inline-text',
  text: 'Hello'
});

// Update node using sid
dataStore.updateNode('text-1', {
  text: 'Hello, World!'
});

// Get node using sid
const node = dataStore.getNode('text-1');

// Reference in selection
editor.setSelection({
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: 5
});
```

### Marks and Text

**Any node with a `text` field can have marks.** Marks are formatting applied to text content (bold, italic, links, etc.).

```typescript
// Text node with marks
const textNode = {
  stype: 'inline-text',
  sid: 'text-1',
  text: 'Hello, World!',
  marks: [
    { type: 'bold' },
    { type: 'italic' }
  ]
};

// Code block with marks (if it has text field)
const codeBlock = {
  stype: 'code-block',
  sid: 'code-1',
  text: 'const x = 1;',
  marks: [{ type: 'highlight', attrs: { color: 'yellow' } }]
};
```

**Key points:**
- Only nodes with a `text` field can have marks
- Marks are applied to the entire text content of the node
- Multiple marks can be applied simultaneously
- Mark attributes can store additional data (e.g., link URLs, highlight colors)

## DataStore

The DataStore manages your document model with transactional updates and schema validation.

### Creating a DataStore

```typescript
import { DataStore } from '@barocss/datastore';

const dataStore = new DataStore(undefined, schema);
```

### DataStore Features

- **Transactional**: All changes are wrapped in transactions
- **Schema-aware**: Validates operations against your schema
- **Normalized**: Efficient storage with normalized data structure
- **Undo/Redo**: Built-in history management

### Working with DataStore

```typescript
// Create a node
dataStore.createNode({
  sid: 'p1',
  stype: 'paragraph',
  content: []
});

// Update a node
dataStore.updateNode('p1', {
  text: 'Updated text'
});

// Get a node
const node = dataStore.getNode('p1');
```

## Transactions

Transactions are the atomic unit of change in Barocss. All model operations are executed within transactions, ensuring consistency and enabling undo/redo.

### What is a Transaction?

A transaction groups multiple operations together so they either all succeed or all fail. This ensures your document model stays consistent.

### Transaction Lifecycle

```
1. Begin Transaction → DataStore.begin()
2. Execute Operations → All operations run in overlay
3. End Transaction → DataStore.end()
4. Commit → DataStore.commit() (applies changes to base)
   OR
   Rollback → DataStore.rollback() (discards changes)
```

### Using Transactions

Transactions are typically used through the Model package's transaction DSL:

```typescript
import { transaction, insertText } from '@barocss/model';

// Single operation transaction
const result = await transaction(editor, [
  insertText({ text: 'Hello', nodeId: 'text-1', offset: 0 })
]).commit();

// Multiple operations in one transaction
const result = await transaction(editor, [
  insertText({ text: 'Hello', nodeId: 'text-1', offset: 0 }),
  insertText({ text: ' World', nodeId: 'text-1', offset: 5 })
]).commit();

if (!result.success) {
  console.error('Transaction failed:', result.error);
}
```

### Transaction Benefits

1. **Atomicity**: All operations succeed or fail together
2. **Consistency**: Schema validation happens before commit
3. **Undo/Redo**: Transactions are recorded for history
4. **Isolation**: Overlay prevents conflicts during execution
5. **Rollback**: Failed transactions can be rolled back

### DataStore Overlay

DataStore uses an overlay system for transactions:

- **Base**: The committed state of your document
- **Overlay**: Temporary changes during a transaction
- **Commit**: Applies overlay changes to base in deterministic order
- **Rollback**: Discards overlay without affecting base

This allows transactions to:
- Test operations without affecting the base state
- Rollback on failure
- Apply changes atomically

## Why Schema-First?

1. **Type Safety**: Schema validation catches errors at runtime
2. **Consistency**: All operations must conform to the schema
3. **Testability**: Easy to test with well-defined structures
4. **Extensibility**: Add new node types by extending the schema

## Next Steps

- Learn about [DSL Templates](./dsl-templates) to render your model
- Learn about [Rendering](./rendering) to see how model becomes DOM
- Learn about [Editor Core](./editor-core) - How editor manages commands and selection
- Learn about [Editor View DOM](./editor-view-dom) - How view connects editor to DOM
- See [Model Package](../architecture/model) for transaction DSL details
- See [DataStore Package](../architecture/datastore) for overlay and transaction lifecycle
- See [Architecture Overview](../architecture/overview) for how schema fits into the bigger picture
