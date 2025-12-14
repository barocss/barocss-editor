# @barocss/model

The Model package provides high-level model operations and a transaction DSL for editing operations. It's the abstraction layer over DataStore operations.

## Purpose

High-level model operations and transaction DSL. Provides a declarative way to modify documents through transactions.

## Key Exports

- `transaction()` - Transaction DSL builder
- `control()` - Control flow in transactions
- `insertText()` - Insert text operation
- `defineOperation()` - Define custom operations
- `defineOperationDSL()` - Define operations with DSL helpers

## Basic Usage

```typescript
import { transaction, control, insertText } from '@barocss/model';

// Execute a transaction
await transaction(editor, control('text-1', [
  insertText({ text: 'Hello' })
])).commit();
```

## Transaction DSL

Transactions are declarative operations that group multiple operations together:

```typescript
import { transaction, node, textNode, mark } from '@barocss/model';

// Describe nodes with DSL
const para = node('paragraph', { align: 'left' }, [
  textNode('inline-text', 'Hello ', [mark('bold')]),
  textNode('inline-text', 'World')
]);

// Execute transaction
const result = await transaction(editor, [
  { type: 'create', payload: { node: para } }
]).commit();

if (!result.success) {
  console.error('Transaction failed:', result.error);
}
```

**Transaction lifecycle:**
1. Acquire global lock from DataStore (FIFO queue)
2. Start transaction → DataStore.begin()
3. Execute each operation
4. End transaction → DataStore.end()
5. Commit → DataStore.commit() (or rollback on error)
6. Release lock

**Transaction result:**
```typescript
interface TransactionResult {
  success: boolean;
  error?: string;
  operations?: TransactionOperation[];
  transactionId?: string;
}
```

## Operation Helpers

Pre-built operations for common tasks:

```typescript
import { 
  insertText, deleteText, applyMark, removeMark, toggleMark,
  create, update, delete: deleteNode, moveNode,
  transformNode, wrap, unwrap,
  indentNode, outdentNode, moveBlockUp, moveBlockDown
} from '@barocss/model';

// Text operations
insertText({ text: 'Hello', nodeId: 'text-1', offset: 0 })
deleteText({ nodeId: 'text-1', range: [0, 5] })
replaceText({ nodeId: 'text-1', start: 0, end: 5, newText: 'Hi' })

// Mark operations
applyMark({ nodeId: 'text-1', mark: 'bold', range: [0, 5] })
removeMark({ nodeId: 'text-1', mark: 'bold', range: [0, 5] })
toggleMark({ nodeId: 'text-1', mark: 'bold', range: [0, 5] })

// Node operations
create({ node: paragraphNode })
update({ nodeId: 'p1', changes: { text: 'Updated' } })
deleteNode({ nodeId: 'p1' })
moveNode({ nodeId: 'p1', targetParentId: 'doc-1', targetIndex: 0 })

// Transform operations
transformNode({ nodeId: 'p1', newType: 'heading', attrs: { level: 1 } })
wrap({ nodeId: 'p1', wrapperType: 'blockquote' })
unwrap({ nodeId: 'p1' })

// Block operations
indentNode({ nodeId: 'p1' })
outdentNode({ nodeId: 'p1' })
moveBlockUp({ nodeId: 'p1' })
moveBlockDown({ nodeId: 'p1' })
```

## Control Helper

The `control()` helper groups operations for a specific node:

```typescript
import { control, toggleMark, replaceText } from '@barocss/model';

const ops = [
  ...control('text-1', [
    replaceText({ start: 6, end: 11, newText: 'Universe' }),
    toggleMark('bold', [0, 5])
  ])
];

await transaction(editor, ops).commit();
```

## Custom Operations

Define your own operations:

### Runtime Implementation

```typescript
import { defineOperation } from '@barocss/model/operations';

defineOperation('highlightText', async (operation, context) => {
  const { nodeId, range } = operation.payload;
  await context.dataStore.applyMark(nodeId, 'highlight', range);
  return { ok: true };
});
```

### DSL Helper

```typescript
import { defineOperationDSL } from '@barocss/model/operations';

// Define DSL helper
export const highlightText = defineOperationDSL((nodeId: string, range: [number, number]) => {
  return { 
    type: 'highlightText', 
    payload: { nodeId, range } 
  };
});

// Use in transaction
await transaction(editor, [
  highlightText('text-1', [0, 5])
]).commit();
```

**Operation context:**
```typescript
interface TransactionContext {
  dataStore: DataStore;
  schema: Schema;
  selection: SelectionManager;
  editor: Editor;
}
```

## PositionCalculator

Calculate absolute positions and find nodes by position:

```typescript
import { PositionCalculator } from '@barocss/model';

const calc = new PositionCalculator(editor.dataStore);

// Calculate absolute position from node + offset
const absPos = calc.calculateAbsolutePosition('text-1', 3);

// Find node by absolute position
const pos = calc.findNodeByAbsolutePosition(absPos);
// Returns: { nodeId: 'text-1', offset: 3 }
```

**Use cases:**
- Selection management
- Range operations
- Position-based queries

## Transaction Features

- **Atomic**: All operations succeed or fail together
- **Undoable**: Transactions can be undone
- **Schema-aware**: Validates against schema
- **Type-safe**: Full TypeScript support
- **Lock-based**: Uses DataStore lock for concurrency

## When to Use

- **Command Implementation**: Extensions use transactions in commands
- **Batch Operations**: Group multiple operations together
- **Custom Operations**: Define domain-specific operations

## Integration

Model package works with:

- **DataStore**: All operations go through DataStore
- **Editor**: Commands execute transactions
- **Extensions**: Extensions use transactions

## Related

- [Core Concepts: Schema & Model](../concepts/schema-and-model) - Understanding the model
- [DataStore Package](./datastore) - The storage layer
- [Editor Core Package](./editor-core) - How editor orchestrates transactions
- [Extension Design](../guides/extension-design) - How extensions use transactions
