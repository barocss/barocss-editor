# Barocss Editor Testing Guide

## 1. Overview

This document is a guide for writing and debugging tests in Barocss Editor. It summarizes issues found and solutions during actual test modification.

## 2. Test Structure

### 2.1 Basic Test Setup

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { transaction, control, node, textNode, mark } from '../../src/transaction-dsl';
import { create } from '../../src/operations-dsl/create';
import { Editor } from '@barocss/editor-core';

describe('Test Suite', () => {
  let dataStore: DataStore;
  let mockEditor: any;
  let schema: any;

  beforeEach(() => {
    dataStore = new DataStore();
    schema = createSchema('basic', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'paragraph+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline', marks: 'bold|italic' }
      }
    });

    dataStore = new DataStore(undefined, schema);

    mockEditor = new Editor({
      dataStore,
      schema
    });
  });
});
```

## 3. Common Testing Patterns

### 3.1 Function Children and Attributes Testing

Testing dynamic content generation with function children and attributes.

```typescript
// Function children testing
it('should handle function children correctly', () => {
  const template = element('li', { className: 'feature' }, [
    (d) => d.name + (d.enabled ? ' ✓' : '')
  ]);
  
  const data = { name: 'Feature 1', enabled: true };
  const vnode = builder.build(template, data);
  
  expect(vnode.text).toBe('Feature 1 ✓');
});

// Function attributes testing
it('should handle function attributes correctly', () => {
  const template = element('div', {
    className: (d) => d.active ? 'active' : 'inactive',
    style: (d) => ({ color: d.color || 'black' })
  }, [text('Dynamic content')]);
  
  const data = { active: true, color: 'blue' };
  const vnode = builder.build(template, data);
  
  expect(vnode.attrs.className).toBe('active');
  expect(vnode.attrs.style.color).toBe('blue');
});

// Mixed content testing
it('should handle mixed content with correct ordering', () => {
  const template = element('div', { className: 'header' }, [
    text('Title: '),
    (d) => d.title,
    text(' by '),
    (d) => d.author
  ]);
  
  const data = { title: 'My Document', author: 'John Doe' };
  const vnode = builder.build(template, data);
  
  expect(vnode.children).toHaveLength(4);
  expect(vnode.children[0].text).toBe('Title: ');
  expect(vnode.children[1].text).toBe('My Document');
  expect(vnode.children[2].text).toBe(' by ');
  expect(vnode.children[3].text).toBe('John Doe');
});
```

### 3.2 Array Iteration Testing (Replacing each)

Testing array iteration using function children with JavaScript's `map()` method.

```typescript
// Array iteration testing
it('should handle array iteration with function children', () => {
  const template = element('ul', { className: 'list' }, [
    (d) => d.items.map(item => 
      element('li', { className: 'item' }, [text(item.name)])
    )
  ]);
  
  const data = { 
    items: [
      { name: 'Item 1' },
      { name: 'Item 2' },
      { name: 'Item 3' }
    ]
  };
  
  const vnode = builder.build(template, data);
  
  expect(vnode.children).toHaveLength(3);
  expect(vnode.children[0].tag).toBe('li');
  expect(vnode.children[0].text).toBe('Item 1');
  expect(vnode.children[1].text).toBe('Item 2');
  expect(vnode.children[2].text).toBe('Item 3');
});

// Complex nested iteration testing
it('should handle complex nested iteration', () => {
  const template = element('div', { className: 'categories' }, [
    (d) => d.categories.map(category =>
      element('div', { className: 'category' }, [
        element('h3', [text(category.name)]),
        element('ul', { className: 'items' }, [
          ...category.items.map(item =>
            element('li', { className: 'item' }, [text(item.name)])
          )
        ])
      ])
    )
  ]);
  
  const data = {
    categories: [
      {
        name: 'Category 1',
        items: [{ name: 'Item 1.1' }, { name: 'Item 1.2' }]
      },
      {
        name: 'Category 2', 
        items: [{ name: 'Item 2.1' }]
      }
    ]
  };
  
  const vnode = builder.build(template, data);
  
  expect(vnode.children).toHaveLength(2);
  expect(vnode.children[0].children[1].children).toHaveLength(2);
  expect(vnode.children[1].children[1].children).toHaveLength(1);
});
```

### 3.3 isDSLTemplate Testing

Testing the DSL template identification helper function.

```typescript
// DSL template identification testing
it('should correctly identify DSL templates', () => {
  // DSL templates (should return true)
  expect(isDSLTemplate(text('Hello'))).toBe(true);
  expect(isDSLTemplate(data('name'))).toBe(true);
  expect(isDSLTemplate(element('div'))).toBe(true);
  expect(isDSLTemplate(component('button'))).toBe(true);
  expect(isDSLTemplate(when(true, text('ok')))).toBe(true);
  
  // HTML attribute objects (should return false)
  expect(isDSLTemplate({ type: 'text', placeholder: 'Enter text' })).toBe(false);
  expect(isDSLTemplate({ className: 'btn', disabled: true })).toBe(false);
  expect(isDSLTemplate({ href: '#home', target: '_blank' })).toBe(false);
});
```

### 3.4 HTML Boolean Attributes Testing

Testing HTML boolean attributes handling.

```typescript
// Boolean attributes testing
it('should handle HTML boolean attributes correctly', () => {
  const template = element('input', {
    type: 'checkbox',
    disabled: true,
    required: false,
    checked: (d) => d.checked
  });
  
  const data = { checked: true };
  const vnode = builder.build(template, data);
  
  expect(vnode.attrs.disabled).toBe(true);
  expect(vnode.attrs.required).toBe(false);
  expect(vnode.attrs.checked).toBe(true);
});

// href attribute testing
it('should handle href attribute correctly', () => {
  const template = element('a', {
    href: '#home',
    target: '_blank'
  }, [text('Home')]);
  
  const vnode = builder.build(template, {});
  
  expect(vnode.attrs.href).toBe('#home');
  expect(vnode.attrs.target).toBe('_blank');
});
```

### 3.5 Node Creation and Access

```typescript
// ✅ Correct approach
const createResult = await transaction(mockEditor, [
  create(textNode('inline-text', 'Hello'))
]).commit();

expect(createResult.success).toBe(true);
const nodeId = createResult.operations[0].result.data.sid; // Use created ID

// ❌ Incorrect approach
const nodeId = createResult.operations[0].nodeId; // undefined
```

### 3.2 Control DSL Usage

```typescript
// ✅ Correct approach
const result = await transaction(mockEditor, [
  control(nodeId, [
    { type: 'setText', payload: { text: 'Updated Text' } }
  ])
]).commit();

expect(result.success).toBe(true);
expect(result.operations[0].type).toBe('setText');
expect(result.operations[0].payload.text).toBe('Updated Text');
```

### 3.3 Multiple Operations

```typescript
// ✅ Correct approach
const result = await transaction(mockEditor, [
  create(textNode('inline-text', 'First')),
  create(textNode('inline-text', 'Second'))
]).commit();

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(2);
```

### 3.4 Functional DSL (op function)

The `op()` function is a functional DSL for complex logic and flow control. It is useful for implementing complex scenarios in tests.

#### 3.4.1 Basic Usage

```typescript
// ✅ Basic usage - return OpResult
const result = await transaction(mockEditor, [
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

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(0); // OpResult does not create operations
```

#### 3.4.2 Conditional Execution

```typescript
// ✅ Conditional execution (standard JavaScript syntax)
const result = await transaction(mockEditor, [
  op(async (ctx) => {
    const shouldCreate = true;
    if (shouldCreate) {
      const node = ctx.dataStore.createNodeWithChildren(
        textNode('inline-text', 'Conditional text'),
        ctx.schema
      );
      return {
        success: true,
        data: node
      };
    } else {
      return {
        success: false,
        error: 'Should not create'
      };
    }
  })
]).commit();

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(0);
```

#### 3.4.3 Specify Inverse

```typescript
// ✅ Specify inverse (for undo)
const result = await transaction(mockEditor, [
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
]).commit();

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(0); // inverse is for undo, not executed immediately
```

#### 3.4.4 void Return

```typescript
// ✅ Return nothing (side effects only)
const result = await transaction(mockEditor, [
  op(async (ctx) => {
    // Perform side effects only (logging, state changes, etc.)
    // Return nothing
  })
]).commit();

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(0);
```

#### 3.4.5 Error Handling

```typescript
// ✅ Failure case
const result = await transaction(mockEditor, [
  op(async (ctx) => {
    try {
      // Perform complex logic
      const node = ctx.dataStore.createNodeWithChildren(
        textNode('inline-text', 'Success'),
        ctx.schema
      );
      
      return {
        success: true,
        data: node
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  })
]).commit();

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(0);
```

#### 3.4.6 Mixing with Existing DSL

```typescript
// ✅ Mix with existing operations
const result = await transaction(mockEditor, [
  create(textNode('inline-text', 'Regular operation')),
  op(async (ctx) => {
    // Execute custom logic
    return { success: true };
  }),
  control('node-sid', setText('Updated text'))
]).commit();

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(2); // Only create + control create operations
```

#### 3.4.7 Complex Scenario Testing

```typescript
// ✅ Multi-node creation with conditional logic
it('should handle complex multi-node creation', async () => {
  const result = await transaction(mockEditor, [
    op(async (ctx) => {
      const nodes = [];
      const conditions = [true, false, true, true, false];
      
      for (let i = 0; i < conditions.length; i++) {
        if (conditions[i]) {
          const node = ctx.dataStore.createNodeWithChildren(
            textNode('inline-text', `Item ${i + 1}`),
            ctx.schema
          );
          nodes.push(node);
        }
      }
      
      return {
        success: true,
        data: nodes,
        inverse: {
          type: 'batch',
          payload: { 
            operations: nodes.map(n => ({ 
              type: 'delete', 
              payload: { nodeId: n.sid } 
            })) 
          }
        }
      };
    })
  ]).commit();

  expect(result.success).toBe(true);
  expect(result.operations).toHaveLength(0);
  expect(result.data).toHaveLength(3); // Only 3 nodes created
});
```

#### 3.4.8 Async Operation Testing

```typescript
// ✅ Simulate async operations
it('should handle async operations', async () => {
  const result = await transaction(mockEditor, [
    op(async (ctx) => {
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const node = ctx.dataStore.createNodeWithChildren(
        textNode('inline-text', 'Async created'),
        ctx.schema
      );
      
      return {
        success: true,
        data: node
      };
    })
  ]).commit();

  expect(result.success).toBe(true);
  expect(result.operations).toHaveLength(0);
});
```

#### 3.4.9 OpResult Structure

```typescript
interface OpResult {
  success: boolean;                    // success/failure
  data?: any;                         // result data
  error?: string;                     // error message (when success: false)
  inverse?: TransactionOperation;     // inverse operation (for undo)
}
```

#### 3.4.10 TransactionContext

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

#### 3.4.11 Testing Notes

- `op((ctx) => { return { type, payload } })` form is not supported
- Use only the same `OpResult` structure as `defineOperation`
- `inverse` is not executed immediately, used later for undo
- Even if `OpResult` is returned, it is not added to `result.operations` (inverse is for undo)
- When manipulating `ctx.dataStore` directly, consider schema validation
- Use `async/await` pattern for async operations

## 4. Common Issues and Solutions

### 4.1 Operation Registration Error

**Error:**
```
Error: Unknown operation type: update
```

**Cause:** Operation not registered in `register-operations.ts`

**Solution:**
```typescript
// Add to register-operations.ts
import './update';
```

### 4.2 Node ID Access Error

**Error:**
```
TypeError: Cannot read properties of undefined (reading 'id')
```

**Cause:** Accessing node ID via incorrect path

**Solution:**
```typescript
// ❌ Incorrect approach
const nodeId = result.operations[0].result.sid;

// ✅ Correct approach
const nodeId = result.operations[0].result.data.sid;
```

### 4.3 Payload Structure Error

**Error:**
```
Cannot destructure property 'nodeId' of 'operation.payload' as it is undefined
```

**Cause:** Operation does not extract parameters from `operation.payload`

**Solution:**
```typescript
// In operation implementation
defineOperation('setText', async (operation: any, context: TransactionContext) => {
  const { nodeId, text } = operation.payload; // Extract from payload
  // ...
});
```

### 4.4 Editor Constructor Issues

**Error:**
```
Cannot read properties of undefined (reading 'getActiveSchema')
```

**Cause:** Passing incorrect object to `TransactionManager`

**Solution:**
```typescript
// In Editor constructor
this._transactionManager = new TransactionManager(this); // Pass Editor instance
```

### 4.5 Event System Issues

**Error:**
```
this._transactionManager.on is not a function
```

**Cause:** `TransactionManager` or `SelectionManager` lacks event system

**Solution:**
```typescript
// Comment out event subscription in Editor
// this._transactionManager.on('transaction_commit', (event) => {
//   this.emit('contentChange', { content: this.document, transaction: event.transaction });
// });
```

## 5. Testing Best Practices

### 5.1 Mock vs Real Objects

```typescript
// ✅ Prefer using real objects
const dataStore = new DataStore();
const editor = new Editor({ dataStore, schema });

// ❌ Avoid excessive mocking
const mockDataStore = { getNode: jest.fn() };
```

### 5.2 Error Handling

```typescript
// ✅ Clear error messages
expect(result.success).toBe(true);
if (!result.success) {
  console.log('Transaction failed:', result.errors);
}

// ✅ Test exception cases
it('should handle invalid node type', async () => {
  const result = await transaction(editor, [
    { type: 'create', payload: { node: { type: 'invalid-type' } } }
  ]).commit();
  
  expect(result.success).toBe(false);
  expect(result.errors).toContain('Unknown node type');
});
```

### 5.3 Async Testing

```typescript
// ✅ Use async/await
it('should create node', async () => {
  const result = await transaction(editor, [
    create(textNode('inline-text', 'Hello'))
  ]).commit();
  
  expect(result.success).toBe(true);
});

// ❌ Avoid Promise chaining
it('should create node', () => {
  return transaction(editor, [
    create(textNode('inline-text', 'Hello'))
  ]).commit().then(result => {
    expect(result.success).toBe(true);
  });
});
```

## 6. Debugging Tips

### 6.1 Console Logging

```typescript
// Add logs for debugging
console.log('Created nodeId:', nodeId);
console.log('Node exists:', !!dataStore.getNode(nodeId));
console.log('Update result:', result);
```

### 6.2 Result Inspection

```typescript
// Check result object structure
console.log('Result structure:', JSON.stringify(result, null, 2));
console.log('Operations:', result.operations);
console.log('Errors:', result.errors);
```

### 6.3 DataStore State

```typescript
// Check DataStore state
console.log('All nodes:', dataStore.getAllNodes());
console.log('Root node:', dataStore.getRootNode());
console.log('Is locked:', dataStore.isLocked());
```

## 7. Performance Considerations

### 7.1 Test Isolation

```typescript
// Use new instance for each test
beforeEach(() => {
  dataStore = new DataStore();
  editor = new Editor({ dataStore, schema });
});
```

### 7.2 Memory Management

```typescript
// Clean up after tests
afterEach(() => {
  editor?.destroy();
  dataStore = null;
});
```

## 8. Integration Testing

### 8.1 Transaction Lock Testing

```typescript
it('should handle concurrent transactions', async () => {
  const promises = Array.from({ length: 5 }, (_, i) => 
    transactionManager.execute([
      { type: 'create', payload: { node: { type: 'paragraph', text: `Node ${i}` } } }
    ])
  );
  
  const results = await Promise.all(promises);
  results.forEach(result => {
    expect(result.success).toBe(true);
  });
});
```

### 8.2 Error Recovery Testing

```typescript
it('should handle partial transaction failure', async () => {
  const result = await transactionManager.execute([
    { type: 'create', payload: { node: { type: 'paragraph', text: 'Valid' } } },
    { type: 'create', payload: { node: { type: 'invalid-type', text: 'Invalid' } } }
  ]);
  
  expect(result.success).toBe(false);
  expect(dataStore.isLocked()).toBe(false); // Verify lock is released
});
```

## 6. History System Testing

### 6.1 Basic History Testing

```typescript
describe('History System', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      history: {
        maxSize: 10,
        enableCheckpoints: true,
        maxCheckpoints: 5
      }
    });
  });

  it('should track operations in history', async () => {
    // Execute transaction
    await editor.transaction([
      create(textNode('paragraph', 'Hello World'))
    ]).commit();

    // Check history state
    expect(editor.canUndo()).toBe(true);
    expect(editor.canRedo()).toBe(false);
    
    const stats = editor.getHistoryStats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.currentIndex).toBe(0);
  });

  it('should undo operations correctly', async () => {
    // Initial state
    const initialStats = editor.getHistoryStats();
    
    // Execute transaction
    await editor.transaction([
      create(textNode('paragraph', 'Hello'))
    ]).commit();

    expect(editor.canUndo()).toBe(true);
    
    // Undo
    const undone = await editor.undo();
    expect(undone).toBe(true);
    expect(editor.canUndo()).toBe(false);
    expect(editor.canRedo()).toBe(true);
  });

  it('should redo operations correctly', async () => {
    // Execute transaction
    await editor.transaction([
      create(textNode('paragraph', 'Hello'))
    ]).commit();

    // Undo
    await editor.undo();
    expect(editor.canRedo()).toBe(true);
    
    // Redo
    const redone = await editor.redo();
    expect(redone).toBe(true);
    expect(editor.canUndo()).toBe(true);
    expect(editor.canRedo()).toBe(false);
  });
});
```


### 6.2 History Configuration Testing

```typescript
describe('History Configuration', () => {
  it('should respect maxSize limit', () => {
    const editor = new Editor({
      history: { maxSize: 3 }
    });

    // Execute 5 transactions
    for (let i = 0; i < 5; i++) {
      editor.transaction([
        create(textNode('paragraph', `Item ${i}`))
      ]).commit();
    }

    const stats = editor.getHistoryStats();
    expect(stats.totalEntries).toBe(3); // maxSize limit
  });

});
```

### 6.3 History Exclusion Testing

```typescript
describe('History Exclusion Rules', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor();
  });

  it('should exclude selection operations from history', async () => {
    const initialStats = editor.getHistoryStats();
    
    // Change selection (should not be added to history)
    await editor.transaction([
      { type: 'selectRange', payload: { nodeId: 'node-1', start: 0, end: 5 } }
    ]).commit();

    const finalStats = editor.getHistoryStats();
    expect(finalStats.totalEntries).toBe(initialStats.totalEntries);
  });

  it('should exclude log operations from history', async () => {
    const initialStats = editor.getHistoryStats();
    
    // Log operation (should not be added to history)
    await editor.transaction([
      { type: 'log', payload: { message: 'Debug info' } }
    ]).commit();

    const finalStats = editor.getHistoryStats();
    expect(finalStats.totalEntries).toBe(initialStats.totalEntries);
  });
});
```

### 6.4 Error Handling in History

```typescript
describe('History Error Handling', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor();
  });

  it('should handle undo when no history exists', async () => {
    const undone = await editor.undo();
    expect(undone).toBe(false);
  });

  it('should handle redo when no future history exists', async () => {
    const redone = await editor.redo();
    expect(redone).toBe(false);
  });

});
```

---

This guide is based on issues found and solutions during actual test modification. It should be continuously updated.
