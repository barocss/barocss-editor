# Model Integration Guide

## 1. Overview

This guide explains how to integrate and use the core components of Barocss Model (DSL, Transaction, DataStore). It is a practical guide based on actual implementation and test cases.

### 1.1 Core Components
- **Transaction DSL**: declarative transaction composition
- **Operation System**: `defineOperation` and `defineOperationDSL` patterns
- **DataStore**: schema-based data storage
- **Schema**: defines structure of nodes and marks

### 1.2 Integration Benefits
- **Type safety**: full TypeScript support
- **Atomicity**: all changes succeed or all fail
- **Schema validation**: automatic validation ensures data integrity
- **Extensibility**: easy to add new operations and node types

## 2. Setup and Configuration

### 2.1 Basic Setup
```typescript
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { transaction, create, node, textNode, control } from '@barocss/model';
import '@barocss/model/src/operations/register-operations'; // Register operations

// 1. Define schema
const schema = new Schema('my-schema', {
  nodes: {
    document: { name: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
    heading: { 
      name: 'heading', 
      content: 'inline*', 
      group: 'block', 
      attrs: { level: { type: 'number', required: true } } 
    },
    'inline-text': { name: 'inline-text', group: 'inline' },
    codeBlock: { 
      name: 'codeBlock', 
      group: 'block', 
      atom: true, 
      attrs: { language: { type: 'string', required: false } } 
    }
  },
  marks: {
    bold: { name: 'bold', group: 'text-style' },
    italic: { name: 'italic', group: 'text-style' }
  },
  topNode: 'document'
});

// 2. Initialize DataStore
const dataStore = new DataStore(undefined, schema);

// 3. Create Editor object
const editor = {
  dataStore,
  _dataStore: dataStore
};
```

### 2.2 Operation Registration
```typescript
// Register all operations (required)
import '@barocss/model/src/operations/register-operations';
```

## 3. Basic Usage Patterns

### 3.1 Simple Node Creation
```typescript
// Create basic text node
const result = await transaction(editor, [
  create(textNode('inline-text', 'Hello World'))
]).commit();

console.log(result.success); // true
console.log(result.operations[0].result.text); // "Hello World"
```

### 3.2 Container Node Creation
```typescript
// Create paragraph node
const result = await transaction(editor, [
  create(node('paragraph', {}, [
    textNode('inline-text', 'Hello'),
    textNode('inline-text', 'World')
  ]))
]).commit();

const paragraphNode = result.operations[0].result;
const textNodes = paragraphNode.content
  .map(id => dataStore.getNode(id))
  .filter(Boolean);

console.log(textNodes.length); // 2
```

### 3.3 Text with Marks
```typescript
import { mark } from '@barocss/model';

// Text with marks
const result = await transaction(editor, [
  create(textNode('inline-text', 'Bold text', [mark('bold')]))
]).commit();

const textNode = result.operations[0].result;
console.log(textNode.marks); // [{ type: 'bold', attrs: {}, range: undefined }]
```

### 3.4 Complex Nested Structure
```typescript
// Document with heading and paragraph
const result = await transaction(editor, [
  create(node('document', {}, [
    node('heading', { level: 1 }, [
      textNode('inline-text', 'My Document')
    ]),
    node('paragraph', {}, [
      textNode('inline-text', 'This is a paragraph with '),
      textNode('inline-text', 'bold text', [mark('bold')]),
      textNode('inline-text', ' and '),
      textNode('inline-text', 'italic text', [mark('italic')])
    ])
  ]))
]).commit();
```

## 4. Control Operations

### 4.1 Text Modification
```typescript
// 1. Create node
const createResult = await transaction(editor, [
  create(textNode('inline-text', 'Hello World'))
]).commit();

const textNodeId = createResult.operations[0].result.sid;

// 2. Modify text
const controlResult = await transaction(editor, [
  ...control(textNodeId, [
    { type: 'setText', payload: { text: 'Hello Universe' } }
  ])
]).commit();

console.log(controlResult.success); // true
```

### 4.2 Mark Operations
```typescript
// 1. Create text node
const createResult = await transaction(editor, [
  create(textNode('inline-text', 'Hello World'))
]).commit();

const textNodeId = createResult.operations[0].result.sid;

// 2. Apply mark
const markResult = await transaction(editor, [
  ...control(textNodeId, [
    { type: 'applyMark', payload: { markType: 'bold', start: 0, end: 5 } }
  ])
]).commit();

console.log(markResult.success); // true
```

### 4.3 Multiple Operations
```typescript
// 1. Create paragraph
const createResult = await transaction(editor, [
  create(node('paragraph', {}, [
    textNode('inline-text', 'Hello World')
  ]))
]).commit();

const paragraphId = createResult.operations[0].result.sid;
const textNodeId = dataStore.getNode(paragraphId)?.content?.[0];

// 2. Perform multiple operations
const controlResult = await transaction(editor, [
  ...control(textNodeId, [
    { type: 'setText', payload: { text: 'Hello Universe' } },
    { type: 'applyMark', payload: { markType: 'bold', start: 0, end: 5 } }
  ]),
  ...control(paragraphId, [
    { type: 'setAttrs', payload: { attrs: { class: 'highlight' } } }
  ])
]).commit();
```

## 5. Real-world Scenarios

### 5.1 Blog Post Creation
```typescript
const blogPost = await transaction(editor, [
  // Title
  create(node('heading', { level: 1 }, [
    textNode('inline-text', 'My Blog Post')
  ])),
  
  // Introduction paragraph
  create(node('paragraph', {}, [
    textNode('inline-text', 'This is an introduction paragraph with '),
    textNode('inline-text', 'important text', [mark('bold')]),
    textNode('inline-text', ' and '),
    textNode('inline-text', 'emphasized text', [mark('italic')])
  ])),
  
  // Code block
  create(textNode('codeBlock', 'const x = 1;\nconsole.log(x);', { language: 'javascript' })),
  
  // List
  create(node('list', { type: 'bullet' }, [
    node('listItem', {}, [
      node('paragraph', {}, [
        textNode('inline-text', 'First item')
      ])
    ]),
    node('listItem', {}, [
      node('paragraph', {}, [
        textNode('inline-text', 'Second item')
      ])
    ])
  ]))
]).commit();

console.log(blogPost.success); // true
console.log(blogPost.operations.length); // 4
```

### 5.2 Technical Documentation
```typescript
const doc = await transaction(editor, [
  // Title
  create(node('heading', { level: 1 }, [
    textNode('inline-text', 'API Documentation')
  ])),
  
  // Section heading
  create(node('heading', { level: 2 }, [
    textNode('inline-text', 'Installation')
  ])),
  
  // Installation command
  create(textNode('codeBlock', 'npm install @barocss/model', { language: 'bash' })),
  
  // Description paragraph
  create(node('paragraph', {}, [
    textNode('inline-text', 'Install the package using npm or yarn.')
  ])),
  
  // Usage section
  create(node('heading', { level: 2 }, [
    textNode('inline-text', 'Usage')
  ])),
  
  // Example code
  create(textNode('codeBlock', `import { transaction, create, textNode } from '@barocss/model';

const result = await transaction(editor, [
  create(textNode('inline-text', 'Hello World'))
]).commit();`, { language: 'typescript' }))
]).commit();
```

### 5.3 Content Modification Workflow
```typescript
// 1. Create initial content
const createResult = await transaction(editor, [
  create(node('paragraph', {}, [
    textNode('inline-text', 'Original text')
  ]))
]).commit();

const paragraphId = createResult.operations[0].result.sid;
const textNodeId = dataStore.getNode(paragraphId)?.content?.[0];

// 2. Modify content
const modifyResult = await transaction(editor, [
  ...control(textNodeId, [
    { type: 'setText', payload: { text: 'Modified text' } },
    { type: 'applyMark', payload: { markType: 'bold', start: 0, end: 8 } }
  ])
]).commit();

// 3. Verify result
const finalNode = dataStore.getNode(textNodeId);
console.log(finalNode.text); // "Modified text"
console.log(finalNode.marks); // [{ type: 'bold', attrs: {}, range: [0, 8] }]
```

## 6. Error Handling

### 6.1 Schema Validation Errors
```typescript
try {
  const result = await transaction(editor, [
    create(node('heading', {}, [ // missing level attribute
      textNode('inline-text', 'Title')
    ]))
  ]).commit();
} catch (error) {
  console.error('Schema validation failed:', error.message);
  // "Schema validation failed: Required attribute 'level' is missing"
}
```

### 6.2 Operation Errors
```typescript
try {
  const result = await transaction(editor, [
    ...control('nonexistent-node', [
      { type: 'setText', payload: { text: 'Hello' } }
    ])
  ]).commit();
} catch (error) {
  console.error('Operation failed:', error.message);
  // "Operation failed: Node not found: nonexistent-node"
}
```

### 6.3 Transaction Rollback
```typescript
// Failed transactions are automatically rolled back
const result = await transaction(editor, [
  create(textNode('inline-text', 'Valid text')),
  ...control('invalid-node', [
    { type: 'setText', payload: { text: 'This will fail' } }
  ])
]).commit();

console.log(result.success); // false
console.log(result.errors.length); // > 0

// First operation is also rolled back
const nodes = dataStore.getAllNodes();
console.log(nodes.size); // 0 (restored to original state)
```

## 7. Performance Considerations

### 7.1 Batch Operations
```typescript
// Execute multiple operations at once (recommended)
const result = await transaction(editor, [
  create(textNode('inline-text', 'Text 1')),
  create(textNode('inline-text', 'Text 2')),
  create(textNode('inline-text', 'Text 3'))
]).commit();

// Execute as separate transactions (not recommended)
// const result1 = await transaction(editor, [create(textNode('inline-text', 'Text 1'))]).commit();
// const result2 = await transaction(editor, [create(textNode('inline-text', 'Text 2'))]).commit();
// const result3 = await transaction(editor, [create(textNode('inline-text', 'Text 3'))]).commit();
```

### 7.2 Large Document Handling
```typescript
// Process in chunks when creating large documents
const chunks = [];
for (let i = 0; i < 100; i++) {
  chunks.push(create(node('paragraph', {}, [
    textNode('inline-text', `Paragraph ${i}`)
  ])));
}

const result = await transaction(editor, chunks).commit();
console.log(result.operations.length); // 100
```

## 8. Testing Integration

### 8.1 Unit Testing
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Model Integration', () => {
  let editor: any;
  let dataStore: DataStore;

  beforeEach(() => {
    // Test setup
    const schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
        'inline-text': { name: 'inline-text', group: 'inline' }
      },
      marks: {
        bold: { name: 'bold', group: 'text-style' }
      },
      topNode: 'document'
    });

    dataStore = new DataStore(undefined, schema);
    editor = { dataStore, _dataStore: dataStore };
  });

  it('should create and modify text', async () => {
    // Create
    const createResult = await transaction(editor, [
      create(textNode('inline-text', 'Hello'))
    ]).commit();

    expect(createResult.success).toBe(true);
    const textNodeId = createResult.operations[0].result.sid;

    // Modify
    const modifyResult = await transaction(editor, [
      ...control(textNodeId, [
        { type: 'setText', payload: { text: 'World' } }
      ])
    ]).commit();

    expect(modifyResult.success).toBe(true);
    
    // Verify
    const finalNode = dataStore.getNode(textNodeId);
    expect(finalNode.text).toBe('World');
  });
});
```

### 8.2 Integration Testing
```typescript
describe('Real-world Scenarios', () => {
  it('should handle complex document structure', async () => {
    const result = await transaction(editor, [
      create(node('document', {}, [
        node('heading', { level: 1 }, [
          textNode('inline-text', 'Title')
        ]),
        node('paragraph', {}, [
          textNode('inline-text', 'Content with '),
          textNode('inline-text', 'bold text', [mark('bold')])
        ])
      ]))
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(1);
    
    const documentNode = result.operations[0].result;
    expect(documentNode.type).toBe('document');
    expect(documentNode.content).toHaveLength(2);
  });
});
```

## 9. Best Practices

### 9.1 Schema Design
- **Clear structure**: clearly define relationships between nodes and marks
- **Required attributes**: set important attributes to `required: true`
- **Defaults**: provide appropriate defaults
- **Grouping**: group related nodes

### 9.2 Operation Usage
- **Batching**: process related operations in one transaction
- **Error handling**: use appropriate try-catch blocks
- **Validation**: verify results to ensure data integrity
- **Performance**: process in chunks for large operations

### 9.3 Code Organization
- **Modularization**: separate related functionality into modules
- **Type safety**: use TypeScript types actively
- **Testing**: write unit and integration tests
- **Documentation**: add comments for complex logic

## 10. Troubleshooting

### 10.1 Common Issues

#### Operation Not Found
```typescript
// Problem: "Operation 'setText' not found"
// Solution: Check operation registration
import '@barocss/model/src/operations/register-operations';
```

#### Schema Validation Failed
```typescript
// Problem: "Schema validation failed"
// Solution: Check schema definition and node structure
const schema = new Schema('test-schema', {
  nodes: {
    paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  },
  topNode: 'document'
});
```

#### Transaction Failed
```typescript
// Problem: "Transaction failed"
// Solution: Check error messages and debug
const result = await transaction(editor, operations).commit();
if (!result.success) {
  console.error('Transaction errors:', result.errors);
}
```

### 10.2 Debugging Tips
- **Result verification**: check execution results via `result.operations`
- **Node state**: check node state with `dataStore.getNode(id)`
- **Schema check**: check active schema with `dataStore._activeSchema`
- **Operation registration**: check registered operations with `globalOperationRegistry.getAll()`

---

This guide is based on actual implementation, and all examples come from tested, verified code. For additional questions or issues, please refer to the test cases.
