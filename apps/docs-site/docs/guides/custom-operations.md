# Custom Operations Guide

Operations are the atomic units of document modification. While extensions use operations through transactions, you can also create your own custom operations for domain-specific needs.

## What are Operations?

Operations are the lowest-level actions that modify documents. They're executed within transactions and interact directly with DataStore.

**Operation vs Extension:**
- **Operation**: Atomic document modification (Model package level)
- **Extension**: Commands that use operations (Editor level)

## When to Create Custom Operations

Create custom operations when:
- You need domain-specific document modifications
- You want reusable operations across multiple extensions
- You need operations that are more efficient than composing existing ones
- You're building a library of operations for others to use

## Defining Operations

Operations are defined using `defineOperation` from `@barocss/model/operations`.

### Basic Operation Definition

```typescript
import { defineOperation } from '@barocss/model/operations';
import type { TransactionContext } from '@barocss/model';
import type { INode } from '@barocss/datastore';

// 1. Define Operation Type
export interface SetColorOperation {
  type: 'setColor';
  payload: {
    nodeId: string;
    color: string;
  };
}

// 2. Define Operation Execution Logic
defineOperation('setColor', async (
  operation: SetColorOperation,
  context: TransactionContext
) => {
  const { nodeId, color } = operation.payload;
  
  // Get node
  const node = context.dataStore.getNode(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  // Store old value for undo
  const oldColor = node.attributes?.color;

  // Perform modification
  context.dataStore.updateNode(nodeId, {
    attributes: {
      ...node.attributes,
      color
    }
  });

  // Return result
  return {
    ok: true,
    data: context.dataStore.getNode(nodeId),
    inverse: {
      type: 'setColor',
      payload: { nodeId, color: oldColor }
    }
  };
});
```

### Operation Structure

```typescript
interface OperationResult {
  ok: boolean;
  data?: any;
  inverse?: Operation;  // For undo support
  error?: string;
}
```

**Operation execution:**
1. Receives operation and TransactionContext
2. Accesses DataStore through context
3. Modifies document
4. Returns result with optional inverse operation

### Registering Operations

Operations must be imported to be registered:

```typescript
// packages/model/src/operations/register-operations.ts
import './setColor';
import './toggleHighlight';
// Import other operations...
```

**Important:** Operations must be imported before use:

```typescript
// At app initialization
import '@barocss/model/operations/register-operations';

// Now operations are available
await transaction(editor, [
  { type: 'setColor', payload: { nodeId: 'p1', color: 'red' } }
]).commit();
```

## Defining Operation DSL

Operation DSL provides helper functions for convenient use in transactions.

### DSL Definition

```typescript
import { defineOperationDSL } from '@barocss/model/operations';

export const setColor = defineOperationDSL(
  (nodeId: string, color: string) => ({
    type: 'setColor',
    payload: { nodeId, color }
  }),
  { atom: false, category: 'content' }
);
```

### Using DSL

```typescript
import { transaction, control, setColor } from '@barocss/model';

const ops = [
  ...control('p1', [
    setColor('p1', 'red')
  ])
];

await transaction(editor, ops).commit();
```

**DSL benefits:**
- Type-safe function calls
- Better developer experience
- Easier to compose operations
- Clearer intent

## Complete Example: Highlight Operation

Let's create a complete highlight operation with DSL:

### Step 1: Define Operation

```typescript
// operations/toggleHighlight.ts
import { defineOperation } from '@barocss/model/operations';
import type { TransactionContext } from '@barocss/model';

export interface ToggleHighlightOperation {
  type: 'toggleHighlight';
  payload: {
    nodeId: string;
    range: [number, number];
    color?: string;
  };
}

defineOperation('toggleHighlight', async (
  operation: ToggleHighlightOperation,
  context: TransactionContext
) => {
  const { nodeId, range, color = 'yellow' } = operation.payload;
  const node = context.dataStore.getNode(nodeId);
  
  if (!node || typeof node.text !== 'string') {
    throw new Error(`Invalid node for toggleHighlight: ${nodeId}`);
  }

  const marks = node.marks || [];
  const [start, end] = range;
  
  // Check if highlight mark exists
  const existingMark = marks.find(
    m => m.type === 'highlight' && 
         m.range[0] === start && 
         m.range[1] === end &&
         m.attrs?.color === color
  );
  
  if (existingMark) {
    // Remove mark
    const newMarks = marks.filter(m => m !== existingMark);
    context.dataStore.updateNode(nodeId, { marks: newMarks });
    
    return {
      ok: true,
      data: context.dataStore.getNode(nodeId),
      inverse: {
        type: 'toggleHighlight',
        payload: { nodeId, range, color }
      }
    };
  } else {
    // Add mark
    const newMark = {
      type: 'highlight',
      range: [start, end],
      attrs: { color }
    };
    context.dataStore.updateNode(nodeId, {
      marks: [...marks, newMark]
    });
    
    return {
      ok: true,
      data: context.dataStore.getNode(nodeId),
      inverse: {
        type: 'toggleHighlight',
        payload: { nodeId, range, color }
      }
    };
  }
});
```

### Step 2: Define DSL

```typescript
// operations-dsl/toggleHighlight.ts
import { defineOperationDSL } from '@barocss/model/operations';

export const toggleHighlight = defineOperationDSL(
  (range: [number, number], color?: string) => ({
    type: 'toggleHighlight',
    payload: { range, color }
  }),
  { atom: false, category: 'format' }
);
```

### Step 3: Register Operation

```typescript
// operations/register-operations.ts
import './toggleHighlight';
```

```typescript
// operations-dsl/index.ts
export * from './toggleHighlight';
```

### Step 4: Use in Extension

```typescript
import { transaction, control, toggleHighlight } from '@barocss/model';

// In extension command
const result = await transaction(editor, [
  ...control(selection.startNodeId, [
    toggleHighlight([startOffset, endOffset], 'yellow')
  ])
]).commit();
```

## Operation Best Practices

### 1. Always Validate Inputs

```typescript
defineOperation('myOperation', async (operation, context) => {
  const { nodeId } = operation.payload;
  
  // Validate node exists
  const node = context.dataStore.getNode(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  
  // Validate node type
  if (node.stype !== 'expected-type') {
    throw new Error(`Invalid node type: ${node.stype}`);
  }
  
  // Proceed with operation
  // ...
});
```

### 2. Provide Inverse Operations

```typescript
return {
  ok: true,
  data: updatedNode,
  inverse: {
    type: 'myOperation',
    payload: { /* old values */ }
  }
};
```

**Inverse operations enable:**
- Undo/redo support
- Transaction rollback
- History management

### 3. Use TransactionContext

```typescript
defineOperation('myOperation', async (operation, context) => {
  // Access DataStore
  const node = context.dataStore.getNode(nodeId);
  
  // Access Schema (if needed)
  const schema = context.schema;
  
  // Access Editor (if needed)
  const editor = context.editor;
  
  // Perform operation
  // ...
});
```

### 4. Handle Errors Gracefully

```typescript
defineOperation('myOperation', async (operation, context) => {
  try {
    // Operation logic
    return { ok: true, data: result };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});
```

### 5. Keep Operations Atomic

```typescript
// ✅ Good: Single responsibility
defineOperation('setColor', async (operation, context) => {
  // Only sets color
});

// ❌ Bad: Multiple responsibilities
defineOperation('setColorAndSize', async (operation, context) => {
  // Sets both color and size - should be two operations
});
```

## Operation Categories

Operations can be categorized for better organization:

```typescript
defineOperationDSL(
  (/* params */) => ({ type: 'myOperation', payload: {} }),
  { 
    atom: false,  // Can be split into smaller operations
    category: 'content' | 'format' | 'structure' | 'custom'
  }
);
```

**Categories:**
- **content**: Text and content modifications
- **format**: Formatting (marks, styles)
- **structure**: Node structure changes
- **custom**: Domain-specific operations

## Testing Operations

Test operations in isolation:

```typescript
import { describe, it, expect } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { TransactionManager } from '@barocss/model';
import './operations/register-operations';

describe('setColor operation', () => {
  it('should set node color', async () => {
    const dataStore = new DataStore(undefined, schema);
    const tm = new TransactionManager(dataStore);
    
    // Create node
    dataStore.createNode({
      sid: 'p1',
      stype: 'paragraph',
      content: []
    });
    
    // Execute operation
    const transaction = tm.createBuilder('test')
      .addOperation({
        type: 'setColor',
        payload: { nodeId: 'p1', color: 'red' }
      });
    
    const result = await transaction.commit();
    expect(result.success).toBe(true);
    
    // Verify
    const node = dataStore.getNode('p1');
    expect(node.attributes?.color).toBe('red');
  });
});
```

## Related

- [Extension Design Guide](./extension-design) - How extensions use operations
- [Architecture: Model](../architecture/model) - Model package details
- [Core Concepts: Schema & Model](../concepts/schema-and-model) - Understanding the model
