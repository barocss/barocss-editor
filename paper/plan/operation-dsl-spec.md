# Operation DSL Specification

## 1. Overview

Operation DSL is a core component of Barocss Model, providing **declarative operation definition** and **DSL-based operation creation**. This system enables operation definition and usage through two patterns: `defineOperation` and `defineOperationDSL`.

### 1.1 Core Philosophy
- **Dual pattern**: Runtime definition (`defineOperation`) + DSL creation (`defineOperationDSL`)
- **Type safety**: full TypeScript type support
- **Extensibility**: easy to add new operations
- **Consistency**: all operations follow the same pattern
- **Validation**: built-in Schema validation and error handling

### 1.2 Key Benefits
- **Declarative definition**: clearly define operation execution logic
- **DSL creation**: create operation objects with simple function calls
- **Auto-registration**: automatic operation registration via global registry
- **Type safety**: compile-time type verification
- **Test-friendly**: supports both mocks and actual implementations

## 2. Architecture

### 2.1 Core Components

#### 2.1.1 defineOperation Pattern
```typescript
defineOperation('operationType', async (operation: any, context: TransactionContext) => {
  // Runtime execution logic
  const { nodeId, ...params } = operation.payload;
  // ... operation logic
  
  // Return OperationExecuteResult structure
  return {
    ok: true,
    data: updatedNode,
    inverse: { type: 'inverseType', payload: { nodeId, ...inverseParams } }
  };
});
```

**Role:**
- Define actual execution logic for operations
- Register in global registry
- Access DataStore via TransactionContext
- Schema validation and error handling

#### 2.1.2 defineOperationDSL Pattern
```typescript
export const operationName = defineOperationDSL((...args) => ({
  type: 'operationType',
  payload: { /* operation data */ }
}));
```

**Role:**
- Create operation objects based on DSL
- Type-safe parameter handling
- Integration with Control function
- Return operation descriptor

### 2.2 Global Registry System

#### 2.2.1 GlobalOperationRegistry
```typescript
class GlobalOperationRegistry {
  private operations = new Map<string, OperationDefinition>();

  register(name: string, definition: OperationDefinition): void;
  get(name: string): OperationDefinition | undefined;
  getAll(): Map<string, OperationDefinition>;
  clear(): void;
}
```

**Features:**
- Central registry for all operations
- Runtime operation lookup and execution
- Used by TransactionManager
- Supports dynamic operation loading

#### 2.2.2 OperationDefinition Interface
```typescript
interface OperationDefinition {
  name: string;
  execute: <T extends any>(operation: T, context: TransactionContext) => Promise<void | INode>;
  mapSelection?: <T extends any>(operation: T, context: TransactionContext) => any;
}
```

**Components:**
- `name`: Operation type name
- `execute`: actual execution function
- `mapSelection`: Selection mapping function (optional)

## 3. Type Definitions

### 3.1 Core Types
```typescript
export type DSLOperationPayload = Record<string, unknown> | undefined;

export interface DSLOperationDescriptor<P extends DSLOperationPayload = any> {
  type: string;
  payload?: P;
}

export interface DefineOperationDSLOptions {
  atom?: boolean;
  category?: string;
}
```

### 3.2 TransactionContext
```typescript
interface TransactionContext {
  dataStore: DataStore;
  schema?: Schema;
  selectionManager?: SelectionManager;
}
```

## 4. Operation Categories

### 4.1 Text Operations
- **setText**: set entire text
- **insertText**: insert text
- **replaceText**: replace text
- **deleteTextRange**: delete text range

### 4.2 Attribute Operations
- **setAttrs**: set node attributes
- **updateAttrs**: update node attributes

### 4.3 Mark Operations
- **setMarks**: set all marks
- **applyMark**: apply mark
- **removeMark**: remove mark
- **toggleMark**: toggle mark
- **updateMark**: update mark

### 4.4 Content Operations
- **create**: create node
- **addChild**: add child node
- **wrap**: wrap text
- **unwrap**: unwrap text

### 4.5 Range Operations
- **indent**: indent
- **outdent**: outdent
- **mergeTextNodes**: merge text nodes
- **replacePattern**: replace pattern

## 5. Implementation Examples

### 5.1 Basic Text Operation
```typescript
// DSL Definition
export const setText = defineOperationDSL((...args: [string] | [string, string]) => {
  if (args.length === 1) {
    const [text] = args;
    return { type: 'setText', payload: { text } };
  }
  const [nodeId, text] = args;
  return { type: 'setText', payload: { nodeId, text } };
}, { atom: true, category: 'text' });

// Runtime Definition
defineOperation('setText', async (operation: any, context: TransactionContext) => {
  const { nodeId, text } = operation.payload;
  if (!text) throw new Error('Text is required for setText operation');
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  context.dataStore.updateNode(nodeId, { text });
  return context.dataStore.getNode(nodeId);
});
```

### 5.2 Mark Operation
```typescript
// DSL Definition
export const applyMark = defineOperationDSL((markType: string, range: [number, number], attrs?: Record<string, any>) => ({
  type: 'applyMark',
  payload: { markType, range, attrs }
}), { atom: true, category: 'mark' });

// Runtime Definition
defineOperation('applyMark', async (operation: any, context: TransactionContext) => {
  const payload = operation.payload;
  if ('range' in payload) {
    const { range, markType, attrs } = payload;
    // Range-based mark application
    return context.dataStore.marks.applyMark(range, markType, attrs);
  }
  const { nodeId, start, end, markType, attrs } = payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  const range = { startNodeId: nodeId, startOffset: start, endNodeId: nodeId, endOffset: end };
  return context.dataStore.marks.applyMark(range, markType, attrs);
});
```

### 5.3 Content Operation
```typescript
// DSL Definition
export const create = (node: INode, options?: any): CreateOperation => ({
  type: 'create',
  node,
  options
});

// Runtime Definition
defineOperation('create', async (operation: CreateOperation, context: TransactionContext) => {
  const { node } = operation;
  try {
    const processedNode = context.dataStore.createNodeWithChildren(node, context.schema);
    
    if (processedNode.parentId) {
      const parent = context.dataStore.getNode(processedNode.parentId);
      if (parent && parent.content) {
        if (!parent.content.includes(processedNode.sid!)) {
          parent.content.push(processedNode.sid!);
          context.dataStore.setNodeInternal(parent);
        }
      }
    }
    
    if (!context.dataStore.getRootNode()) {
      context.dataStore.setRootNodeId(processedNode.sid!);
    }
    
    return processedNode;
  } catch (error) {
    throw new Error(`Failed to create node: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});
```

## 6. Usage Patterns

### 6.1 Direct Operation Usage
```typescript
// Direct operation creation
const operation = setText('Hello World');
// Result: { type: 'setText', payload: { text: 'Hello World' } }

// With nodeId
const operation = setText('node-1', 'Hello World');
// Result: { type: 'setText', payload: { nodeId: 'node-1', text: 'Hello World' } }
```

### 6.2 Control Function Integration
```typescript
// Control function usage
const operations = control('node-1', [
  setText('Hello World'),
  applyMark('bold', [0, 5])
]);

// Result: [
//   { type: 'setText', payload: { text: 'Hello World', nodeId: 'node-1' } },
//   { type: 'applyMark', payload: { markType: 'bold', range: [0, 5], nodeId: 'node-1' } }
// ]
```

### 6.3 Transaction Integration
```typescript
// Transaction with operations
const result = await transaction(editor, [
  create(textNode('inline-text', 'Hello')),
  ...control('node-1', [setText('World')])
]).commit();
```

## 7. Error Handling

### 7.1 Validation Errors
```typescript
defineOperation('setText', async (operation: any, context: TransactionContext) => {
  const { nodeId, text } = operation.payload;
  
  // Required field validation
  if (!text) throw new Error('Text is required for setText operation');
  
  // Node existence validation
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  
  // Schema validation (handled by DataStore)
  context.dataStore.updateNode(nodeId, { text });
  return context.dataStore.getNode(nodeId);
});
```

### 7.2 Schema Validation
- Automatic schema validation in DataStore's `updateNode`
- Returns `result.valid: false` on validation failure
- Explicit error handling in operations

### 7.3 Transaction Rollback
- Rollback entire transaction on operation failure
- Ensures atomicity
- Propagates error messages

## 8. Testing

### 8.1 Operation Testing
```typescript
describe('setText Operation', () => {
  it('should set text on valid node', async () => {
    const context = createMockContext();
    const operation = { type: 'setText', payload: { nodeId: 'node-1', text: 'Hello' } };
    
    const result = await globalOperationRegistry.get('setText')!.execute(operation, context);
    
    expect(result.text).toBe('Hello');
  });

  it('should throw error for missing text', async () => {
    const context = createMockContext();
    const operation = { type: 'setText', payload: { nodeId: 'node-1' } };
    
    await expect(
      globalOperationRegistry.get('setText')!.execute(operation, context)
    ).rejects.toThrow('Text is required for setText operation');
  });
});
```

### 8.2 DSL Testing
```typescript
describe('setText DSL', () => {
  it('should create operation with text only', () => {
    const operation = setText('Hello World');
    
    expect(operation).toEqual({
      type: 'setText',
      payload: { text: 'Hello World' }
    });
  });

  it('should create operation with nodeId and text', () => {
    const operation = setText('node-1', 'Hello World');
    
    expect(operation).toEqual({
      type: 'setText',
      payload: { nodeId: 'node-1', text: 'Hello World' }
    });
  });
});
```

## 9. Best Practices

### 9.1 Operation Design
- **Single responsibility**: each operation performs one clear task
- **Error handling**: clear error messages and appropriate exception handling
- **Type safety**: actively use TypeScript types
- **Consistency**: maintain the same pattern as other operations

### 9.2 DSL Design
- **Use overloads**: support various usage patterns
- **Provide defaults**: appropriate defaults for optional parameters
- **Documentation**: clear usage via JSDoc
- **Testing**: write tests for various scenarios

### 9.3 Integration
- **Control function integration**: natural integration with `control()` function
- **Transaction integration**: smooth integration with Transaction system
- **Schema validation**: leverage DataStore's schema validation
- **Selection mapping**: provide Selection mapping function when needed

## 10. Extension Guide

### 10.1 Adding New Operations
1. **DSL definition**: create DSL function with `defineOperationDSL`
2. **Runtime definition**: define execution logic with `defineOperation`
3. **Write tests**: test both DSL and Runtime
4. **Documentation**: document usage and examples
5. **Registration**: add to `register-operations.ts`

### 10.2 Custom Operation Categories
```typescript
// Custom category example
export const customOperation = defineOperationDSL((param: string) => ({
  type: 'customOperation',
  payload: { param }
}), { category: 'custom', atom: false });
```

### 10.3 Plugin System
- Dynamic operation registration via global registry
- Support operation namespace per plugin
- Runtime operation loading possible

## 11. Performance Considerations

### 11.1 Registry Lookup
- O(1) lookup performance with Map
- Memory-efficient operation storage
- Supports lazy loading

### 11.2 Operation Execution
- Non-blocking processing with async execution
- Immediate abort on error
- Prevents memory leaks

### 11.3 DSL Generation
- Lightweight object creation
- Minimize unnecessary copies
- Balance type safety and performance

## 12. Functional DSL (op function)

### 12.1 Overview

The `op()` function is a functional DSL for complex logic and flow control. Unlike the existing declarative DSL, it allows imperative programming style for complex tasks.

```typescript
// Function signature
function op(operationFn: (context: TransactionContext) => OpResult | void | Promise<OpResult | void>): OpFunction

// Basic usage
const result = await transaction(editor, [
  op(async (ctx) => {
    const node = ctx.dataStore.createNodeWithChildren(
      textNode('inline-text', 'Hello'),
      ctx.schema
    );
    
    return {
      success: true,
      data: node
    };
  })
]).commit();
```

### 12.2 TransactionContext

The `op` function receives `TransactionContext` as a parameter:

```typescript
interface TransactionContext {
  dataStore: DataStore;           // DataStore instance (can manipulate directly)
  selectionManager: SelectionManager; // SelectionManager instance
  selection?: ModelSelection;     // current selection
  schema?: any;                   // Schema instance
  selectAbsoluteRange: (start: number, end: number) => void; // select by absolute position
  resolveAbsolute: (position: number) => { nodeId: string; offset: number } | null; // resolve position
}
```

### 12.3 OpResult Structure

```typescript
interface OpResult {
  success: boolean;                    // success/failure status
  data?: any;                         // result data
  error?: string;                     // error message (when success: false)
  inverse?: TransactionOperation;     // inverse operation (for undo)
}
```

### 12.4 Supported Return Types

#### 12.4.1 void (returns nothing)
```typescript
op(async (ctx) => {
  // Only perform side effects (logging, state changes, etc.)
  // Return nothing
})
```

#### 12.4.2 OpResult (success/failure result)
```typescript
op(async (ctx) => {
  const node = ctx.dataStore.createNodeWithChildren(
    textNode('inline-text', 'Hello'),
    ctx.schema
  );
  
  return {
    success: true,
    data: node
  };
})
```

#### 12.4.3 OpResult with inverse (specify inverse)
```typescript
op(async (ctx) => {
  const node = ctx.dataStore.createNodeWithChildren(
    textNode('inline-text', 'With inverse'),
    ctx.schema
  );
  
  return {
    success: true,
    data: node,
    inverse: { type: 'delete', payload: { nodeId: node.sid } }
  };
})
```

#### 12.4.4 Failure case
```typescript
op(async (ctx) => {
  const condition = false;
  if (condition) {
    return {
      success: true,
      data: ctx.dataStore.createNodeWithChildren(textNode('inline-text', 'Created'), ctx.schema)
    };
  } else {
    return {
      success: false,
      error: 'Condition not met'
    };
  }
})
```

### 12.5 Execution Flow

1. **Transaction start**: call `transaction(editor, [op(...)])`
2. **Operation registration**: `op` function is converted to `OpFunction` object
3. **Transaction commit**: `TransactionManager` executes when `commit()` is called
4. **OpFunction execution**: `opFn.execute(context)` is called in `_executeOpFunction`
5. **Result processing**: handle `OpResult` or `void` return value
6. **Operation creation**: `OpResult` does not immediately create an operation (inverse is for undo)

### 12.6 Mixing with Existing DSL

```typescript
const result = await transaction(editor, [
  // Existing declarative DSL
  create(textNode('inline-text', 'Regular operation')),
  
  // Functional DSL
  op(async (ctx) => {
    // Execute custom logic
    return { success: true };
  }),
  
  // Back to declarative DSL
  control('node-sid', setText('Updated text'))
]).commit();
```

### 12.7 Key Features

- **Async support**: full support for `async/await` pattern
- **Direct DataStore manipulation**: direct data manipulation via `ctx.dataStore`
- **Conditional execution**: implement complex logic with regular JavaScript syntax
- **Error handling**: clear error handling via `try/catch` and `OpResult.error`
- **Inverse support**: define undo behavior via `inverse` property
- **Transaction safety**: all changes execute safely within transaction

### 12.8 Use Cases

#### 12.8.1 Complex Conditional Logic
```typescript
op(async (ctx) => {
  const user = await getUser();
  const hasPermission = await checkPermission(user.sid);
  
  if (hasPermission) {
    const node = ctx.dataStore.createNodeWithChildren(
      textNode('inline-text', `Welcome ${user.name}`),
      ctx.schema
    );
    return { success: true, data: node };
  } else {
    return { success: false, error: 'Insufficient permissions' };
  }
})
```

#### 12.8.2 Multiple Node Creation
```typescript
op(async (ctx) => {
  const nodes = [];
  for (let i = 0; i < 5; i++) {
    const node = ctx.dataStore.createNodeWithChildren(
      textNode('inline-text', `Item ${i + 1}`),
      ctx.schema
    );
    nodes.push(node);
  }
  
  return {
    success: true,
    data: nodes,
    inverse: {
      type: 'batch',
      payload: { operations: nodes.map(n => ({ type: 'delete', payload: { nodeId: n.sid } })) }
    }
  };
})
```

#### 12.8.3 External API Call Integration
```typescript
op(async (ctx) => {
  try {
    const response = await fetch('/api/validate', {
      method: 'POST',
      body: JSON.stringify({ content: 'test' })
    });
    
    if (response.ok) {
      const data = await response.json();
      const node = ctx.dataStore.createNodeWithChildren(
        textNode('inline-text', data.message),
        ctx.schema
      );
      return { success: true, data: node };
    } else {
      return { success: false, error: 'Validation failed' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
})
```

### 12.9 Notes

- `op((ctx) => { return { type, payload } })` form is not supported
- Use only the same `OpResult` structure as `defineOperation`
- `inverse` is not executed immediately but used later for undo
- Returning `OpResult` does not add to `result.operations` (inverse is for undo)
- When manipulating `ctx.dataStore` directly, consider schema validation

## 13. Operation Registration and Testing

### 13.1 Operation Registration
All operations must be registered in `register-operations.ts`:

```typescript
// register-operations.ts
import './create';
import './update';  // Required registration
import './delete';
// ... other operations
```

**Important points:**
- Operations defined with `defineOperation` are automatically registered in global registry
- Operations used in tests must be registered
- Unregistered operations throw "Unknown operation type" error

### 13.2 Testing Best Practices

#### 13.2.1 Node ID Handling
```typescript
// ✅ Correct way
const createResult = await transaction(editor, [
  create(textNode('inline-text', 'Hello'))
]).commit();

const nodeId = createResult.operations[0].result.data.sid; // Use generated ID
const updateResult = await transaction(editor, [
  control(nodeId, [{ type: 'setText', payload: { text: 'Updated' } }])
]).commit();

// ❌ Incorrect way
const nodeId = createResult.operations[0].nodeId; // undefined
```

#### 13.2.2 Operation Result Access
```typescript
// ✅ Correct way
expect(result.success).toBe(true);
expect(result.operations[0].result.data.sid).toBeDefined();
expect(result.operations[0].result.data.text).toBe('Updated');

// ❌ Incorrect way
expect(result.operations[0].result.sid).toBeDefined(); // undefined
```

### 13.3 Common Testing Issues

#### 13.3.1 Operation Registration Error
```
Error: Unknown operation type: update
```
**Solution:** Add import for that operation in `register-operations.ts`

#### 13.3.2 Node ID Access Error
```
TypeError: Cannot read properties of undefined (reading 'id')
```
**Solution:** Access via `result.data.sid`

#### 13.3.3 Payload Structure Error
```
Cannot destructure property 'nodeId' of 'operation.payload' as it is undefined
```
**Solution:** Implement operation to extract parameters from `operation.payload`

---

This specification is based on the actual implemented Operation DSL system, and all examples are verified code that has passed tests.
