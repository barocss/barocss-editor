# Model API

The Model API provides high-level model operations, transaction DSL, and operation definitions.

## Transaction DSL

### `transaction(editor, operations)`

Creates a transaction builder.

**Parameters:**
- `editor: Editor` - Editor instance
- `operations: (TransactionOperation | TransactionOperation[] | OpFunction)[]` - Operations to execute

**Returns:**
- `TransactionBuilder` - Transaction builder instance

**Example:**
```typescript
import { transaction, control, insertText } from '@barocss/model';

const result = await transaction(editor, [
  ...control('text-1', [
    insertText(5, 'Hello')
  ])
]).commit();
```

### TransactionBuilder

Transaction builder interface.

#### `commit(): Promise<TransactionResult>`

Commits the transaction.

**Returns:**
- `Promise<TransactionResult>` - Transaction result

**Behavior:**
- Triggers `onBeforeTransaction` hooks (extensions can intercept/modify)
- Executes all operations
- Commits to DataStore
- Adds to history
- Emits `editor:content.change` event
- Triggers `onTransaction` hooks

**Example:**
```typescript
const result = await transaction(editor, operations).commit();

if (result.success) {
  console.log('Transaction succeeded:', result.transactionId);
} else {
  console.error('Transaction failed:', result.errors);
}
```

### TransactionResult

```typescript
interface TransactionResult {
  success: boolean;                    // Whether transaction succeeded
  errors: string[];                   // Array of error messages
  data?: any;                         // Transaction data
  transactionId?: string;            // Transaction ID
  operations?: TransactionOperation[]; // Executed operations
  selectionBefore?: ModelSelection | null; // Selection before transaction
  selectionAfter?: ModelSelection | null;  // Selection after transaction
}
```

---

## Control Function

### `control(target, actions)`

Injects `nodeId` into operation payloads.

**Parameters:**
- `target: HandleOrId` - Target node ID
- `actions: Array<{ type: string; payload?: any }>` - Operations to inject nodeId into

**Returns:**
- `TransactionOperation[]` - Operations with injected nodeId

**Example:**
```typescript
control('text-1', [
  insertText(5, 'Hello'),
  toggleMark('bold', [0, 10])
])

// Becomes:
[
  { type: 'insertText', payload: { nodeId: 'text-1', pos: 5, text: 'Hello' } },
  { type: 'toggleMark', payload: { nodeId: 'text-1', markType: 'bold', range: [0, 10] } }
]
```

---

## Node Creation Helpers

### `node(stype, attributes?, content?)`

Creates a container node.

**Parameters:**
- `stype: string` - Node type
- `attributes?: Record<string, any>` - Optional attributes
- `content?: INode[]` - Optional child nodes

**Returns:**
- `INode` - Node object

**Example:**
```typescript
const paragraph = node('paragraph', {}, [
  textNode('inline-text', 'Hello')
]);
```

### `textNode(stype, text, marks?, attributes?)`

Creates a text node.

**Overloads:**
```typescript
textNode(stype: string, text: string): INode
textNode(stype: string, text: string, marks: MarkDescriptor[]): INode
textNode(stype: string, text: string, attributes: Record<string, any>): INode
textNode(stype: string, text: string, marks: MarkDescriptor[], attributes: Record<string, any>): INode
```

**Parameters:**
- `stype: string` - Node type
- `text: string` - Text content
- `marks?: MarkDescriptor[]` - Optional marks
- `attributes?: Record<string, any>` - Optional attributes

**Returns:**
- `INode` - Text node object

**Example:**
```typescript
// Basic text node
const text = textNode('inline-text', 'Hello');

// Text node with marks
const boldText = textNode('inline-text', 'Hello', [
  mark('bold', { range: [0, 5] })
]);

// Text node with attributes
const styledText = textNode('inline-text', 'Hello', {
  color: 'red'
});

// Text node with marks and attributes
const richText = textNode('inline-text', 'Hello', [
  mark('bold', { range: [0, 5] })
], {
  color: 'red'
});
```

### `mark(stype, attrs?)`

Creates a mark descriptor.

**Parameters:**
- `stype: string` - Mark type
- `attrs?: Record<string, any>` - Optional attributes (can include `range`)

**Returns:**
- `MarkDescriptor` - Mark descriptor

**Example:**
```typescript
// Basic mark
const boldMark = mark('bold');

// Mark with attributes
const linkMark = mark('link', {
  href: 'https://example.com',
  target: '_blank'
});

// Mark with range
const boldRange = mark('bold', {
  range: [0, 5]
});
```

---

## Operation Definition

### `defineOperation(name, executor, selectionMapper?)`

Defines a custom operation.

**Parameters:**
- `name: string` - Operation name
- `executor: (operation: T, context: TransactionContext) => Promise<void | INode>` - Operation executor
- `selectionMapper?: (operation: T, context: TransactionContext) => any` - Optional selection mapper

**Example:**
```typescript
import { defineOperation } from '@barocss/model';
import type { TransactionContext } from '@barocss/model';

defineOperation('customOp', async (operation, context) => {
  const { nodeId, data } = operation.payload;
  
  // Access DataStore
  const node = context.dataStore.getNode(nodeId);
  
  // Perform operation
  context.dataStore.updateNode(nodeId, data);
  
  // Map selection if needed
  if (context.selection?.current) {
    // Update selection
  }
  
  // Return result with inverse
  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { type: 'customOp', payload: { nodeId, data: oldData } }
  };
});
```

**See**: [Custom Operations Guide](../guides/custom-operations) for detailed examples.

### `defineOperationDSL(builder, options?)`

Defines a DSL helper for an operation.

**Parameters:**
- `builder: BuilderFn<Args, P>` - Builder function
- `options?: DefineOperationDSLOptions` - Optional options

**Returns:**
- DSL helper function

**Example:**
```typescript
import { defineOperationDSL } from '@barocss/model';

export const customOp = defineOperationDSL(
  (nodeId: string, data: Record<string, any>) => ({
    type: 'customOp',
    payload: { nodeId, data }
  }),
  { atom: false, category: 'custom' }
);

// Usage
const ops = control('node-1', [
  customOp({ key: 'value' })
]);
```

**Options:**
```typescript
interface DefineOperationDSLOptions {
  atom?: boolean;      // Whether operation is atomic
  category?: string;   // Operation category
}
```

**See**: [Model Operation DSL API](./model-operation-dsl) for complete DSL helper reference.

---

## Functional DSL

### `op(operationFn)`

Creates a functional operation.

**Parameters:**
- `operationFn: (context: TransactionContext) => OpResult | void | Promise<OpResult | void>` - Operation function

**Returns:**
- `OpFunction` - Functional operation

**Example:**
```typescript
import { op } from '@barocss/model';

const result = await transaction(editor, [
  op(async (context) => {
    // Custom logic
    const node = context.dataStore.getNode('node-1');
    context.dataStore.updateNode('node-1', { text: 'Updated' });
    
    return {
      success: true,
      data: context.dataStore.getNode('node-1'),
      inverse: { type: 'update', payload: { nodeId: 'node-1', data: node } }
    };
  })
]).commit();
```

### OpResult

```typescript
interface OpResult {
  success: boolean;
  data?: any;
  error?: string;
  inverse?: TransactionOperation; // Inverse operation for undo
}
```

---

## Transaction Context

Operations receive a `TransactionContext`:

```typescript
interface TransactionContext {
  dataStore: DataStore;           // DataStore instance
  selectionManager: SelectionManager; // SelectionManager instance
  selection: SelectionContext;    // Selection context (before/current)
  schema?: Schema;                // Active schema
}
```

### SelectionContext

```typescript
class SelectionContext {
  before: ModelSelection | null;  // Selection before transaction
  current: ModelSelection | null;  // Current selection (mutable)
}
```

**Example:**
```typescript
defineOperation('myOp', async (operation, context) => {
  // Access selection
  const before = context.selection.before;
  const current = context.selection.current;
  
  // Update selection
  if (context.selection.current) {
    context.selection.current.startOffset += 5;
  }
  
  // Access DataStore
  const node = context.dataStore.getNode('node-1');
  
  // Access schema
  const nodeType = context.schema?.getNodeType('paragraph');
});
```

---

## Transaction Manager

### TransactionManager Class

Manages transaction execution.

#### Constructor

```typescript
new TransactionManager(editor: Editor)
```

**Parameters:**
- `editor: Editor` - Editor instance

#### Methods

#### `execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult>`

Executes a transaction.

**Parameters:**
- `operations: (TransactionOperation | OpFunction)[]` - Operations to execute

**Returns:**
- `Promise<TransactionResult>` - Transaction result

**Behavior:**
1. Acquires global lock
2. Begins transaction
3. Starts DataStore overlay
4. Executes all operations
5. Ends overlay and commits
6. Adds to history
7. Emits events
8. Calls after hooks

**Note**: Usually called via `transaction().commit()`, not directly.

#### `setSchema(schema: Schema): void`

Sets the active schema.

**Parameters:**
- `schema: Schema` - Schema instance

---

## Position Calculator

Calculates positions in the document.

### PositionCalculator Class

```typescript
import { PositionCalculator } from '@barocss/model';
```

#### Constructor

```typescript
new PositionCalculator(dataStore: DataStore)
```

**Parameters:**
- `dataStore: DataStore` - DataStore instance

#### Methods

#### `calculateAbsolutePosition(nodeId: string, offset: number): number`

Calculates absolute position from node ID and offset.

**Parameters:**
- `nodeId: string` - Node ID
- `offset: number` - Offset in node

**Returns:**
- `number` - Absolute position

#### `resolveAbsolutePosition(absolutePos: number): { nodeId: string; offset: number } | null`

Resolves absolute position to node ID and offset.

**Parameters:**
- `absolutePos: number` - Absolute position

**Returns:**
- `{ nodeId: string; offset: number } | null` - Node ID and offset or `null`

---

## Operation Registry

### Global Operation Registry

Operations are registered in a global registry.

#### `globalOperationRegistry`

Global operation registry instance.

**Methods:**
- `register(name: string, definition: OperationDefinition): void`
- `get(name: string): OperationDefinition | undefined`
- `getAll(): Map<string, OperationDefinition>`
- `clear(): void`

**Example:**
```typescript
import { globalOperationRegistry } from '@barocss/model';

// Get all operations
const allOps = globalOperationRegistry.getAll();

// Get specific operation
const insertTextOp = globalOperationRegistry.get('insertText');
```

---

## DSL Operation Registry

DSL operations are registered separately.

#### `getDefinedDSLOperations(): ReadonlyMap<string, { options?: DefineOperationDSLOptions }>`

Gets all defined DSL operations.

**Returns:**
- `ReadonlyMap<string, { options?: DefineOperationDSLOptions }>` - Map of DSL operations

**Example:**
```typescript
import { getDefinedDSLOperations } from '@barocss/model';

const dslOps = getDefinedDSLOperations();
for (const [name, config] of dslOps) {
  console.log(`DSL Operation: ${name}`, config);
}
```

---

## Complete Examples

### Example 1: Simple Transaction

```typescript
import { transaction, control, insertText } from '@barocss/model';

const result = await transaction(editor, [
  ...control('text-1', [
    insertText(5, 'Hello')
  ])
]).commit();

if (result.success) {
  console.log('Text inserted successfully');
}
```

### Example 2: Complex Transaction

```typescript
import { transaction, control, insertText, toggleMark, create } from '@barocss/model';

const result = await transaction(editor, [
  // Create new paragraph
  create('paragraph', {}, [
    { stype: 'inline-text', text: 'New paragraph' }
  ]),
  
  // Insert text and apply mark
  ...control('text-1', [
    insertText(5, ' World'),
    toggleMark('bold', [0, 11])
  ])
]).commit();
```

### Example 3: Custom Operation

```typescript
import { defineOperation, defineOperationDSL } from '@barocss/model';

// Define operation
defineOperation('highlight', async (operation, context) => {
  const { nodeId, range, color } = operation.payload;
  
  // Apply highlight
  context.dataStore.mark.setMarks(nodeId, [
    {
      type: 'highlight',
      range,
      attrs: { color }
    }
  ]);
  
  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: { type: 'removeHighlight', payload: { nodeId, range } }
  };
});

// Define DSL helper
export const highlight = defineOperationDSL(
  (range: [number, number], color: string) => ({
    type: 'highlight',
    payload: { range, color }
  })
);

// Use in transaction
const result = await transaction(editor, [
  ...control('text-1', [
    highlight([0, 10], 'yellow')
  ])
]).commit();
```

### Example 4: Functional Operation

```typescript
import { transaction, op } from '@barocss/model';

const result = await transaction(editor, [
  op(async (context) => {
    // Complex multi-step operation
    const node1 = context.dataStore.getNode('node-1');
    const node2 = context.dataStore.getNode('node-2');
    
    // Swap nodes
    context.dataStore.content.moveNode('node-1', node2.parentId, 0);
    context.dataStore.content.moveNode('node-2', node1.parentId, 0);
    
    return {
      success: true,
      data: { swapped: true },
      inverse: {
        type: 'swapNodes',
        payload: { node1: 'node-1', node2: 'node-2' }
      }
    };
  })
]).commit();
```

---

## Related

- [Operations Overview](./operations-overview) - Understanding the operation hierarchy
- [Model Operations API](./model-operations) - Complete Model operation reference
- [Model Operation DSL API](./model-operation-dsl) - Complete DSL helper reference
- [Custom Operations Guide](../guides/custom-operations) - Creating custom operations
- [DataStore Operations API](./datastore-operations) - DataStore layer operations
