# Barocss Editor Architecture Specification

## 1. Overview

Barocss Editor is a **unified schema-centric** document editing system, designed with our own approach while drawing from ProseMirror’s strengths.

### Core Design Principles
- **Unified schema**: manage all node types and marks with one Schema instance
- **Schema-centric**: all document structures defined by the unified schema
- **Hierarchical structure**: Schema → Document → Nodes → Operations → Transactions
- **Type safety**: TypeScript-based strong typing
- **Validation-first**: apply schema validation to all operations
- **Extensible**: easy to extend existing schemas

## 2. Architecture Overview

```
Unified Schema (defines all node types and marks)
  ↓
Document (schema-based document instance)
  ↓
Nodes (nodes following schema rules)
  ↓
Operations (node manipulation operations)
  ↓
Transactions (atomic operation units)
  ↓
DataStore (persistence layer)
```

## 3. Unified Schema System

### 3.1 Schema Class

```typescript
interface Schema {
  name: string;
  topNode: string; // top-level node type (default: 'doc')
  nodes: Map<string, NodeTypeDefinition>;
  marks: Map<string, MarkDefinition>;
  
  // Concise node creation API
  doc(content?: Node[]): Document;
  node(type: string, attrs?: any, content?: Node[]): Node;
  text(content: string, attrs?: any, marks?: Mark[]): Node;
  
  // Node type management
  getNodeType(type: string): NodeTypeDefinition | undefined;
  hasNodeType(type: string): boolean;
  getNodeTypesByGroup(group: string): NodeTypeDefinition[];
  
  // Mark management
  getMarkType(type: string): MarkDefinition | undefined;
  hasMarkType(type: string): boolean;
  getMarkTypesByGroup(group: string): MarkDefinition[];
  
  // Validation
  validateNode(node: Node): ValidationResult;
  validateDocument(document: Document): ValidationResult;
  validateAttributes(nodeType: string, attributes: Record<string, any>): ValidationResult;
  validateContent(nodeType: string, content: any[]): ValidationResult;
  validateMarks(marks: Mark[]): ValidationResult;
  
  // Transformation
  transform(nodeType: string, data: any): any;
}
```

### 3.2 Unified Schema Definition

Barocss Editor uses a **unified schema approach** to manage all node types in one Schema instance, clarifying relationships and ensuring consistency.

```typescript
// Unified schema definition
const schema = createSchema('article', {
  topNode: 'doc', // top-level node type
  nodes: {
    // Document node
    doc: {
      name: 'doc',
      content: 'block+',
      group: 'document',
      attrs: {
        title: { type: 'string', required: true },
        version: { type: 'string', default: '1.0.0' },
        createdAt: { type: 'string', required: true }
      }
    },
    
    // Paragraph node
    paragraph: {
      name: 'paragraph',
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { type: 'number', default: 1 },
        align: { type: 'string', default: 'left' }
      }
    },
    
    // Heading node
    heading: {
      name: 'heading',
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { type: 'number', required: true, validator: (value: number) => value >= 1 && value <= 6 }
      }
    },
    
    // Text node
    text: {
      name: 'text',
      group: 'inline'
    },
    
    // Image node
    image: {
      name: 'image',
      group: 'inline',
      atom: true,
      attrs: {
        src: { type: 'string', required: true },
        alt: { type: 'string', required: false },
        width: { type: 'number', required: false },
        height: { type: 'number', required: false }
      }
    }
  },
  
  marks: {
    // Bold mark
    bold: {
      name: 'bold',
      attrs: {
        weight: { type: 'string', default: 'bold' }
      },
      group: 'text-style'
    },
    
    // Italic mark
    italic: {
      name: 'italic',
      attrs: {
        style: { type: 'string', default: 'italic' }
      },
      group: 'text-style',
      excludes: ['bold'] // cannot use with bold
    },
    
    // Link mark
    link: {
      name: 'link',
      attrs: {
        href: { type: 'string', required: true },
        title: { type: 'string', required: false }
      },
      group: 'link'
    },
    
    // Color mark
    color: {
      name: 'color',
      attrs: {
        color: { type: 'string', required: true },
        backgroundColor: { type: 'string', required: false }
      },
      group: 'color'
    }
  }
});
```

### 3.3 Schema Extension

You can easily extend existing schemas:

```typescript
// Base schema
const baseSchema = createSchema('blog', {
  topNode: 'doc',
  nodes: {
    doc: { name: 'doc', content: 'block+', group: 'document' },
    paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
    text: { name: 'text', group: 'inline' }
  },
  marks: {
    bold: { name: 'bold', group: 'text-style' }
  }
});

// Add social media features
const socialSchema = createSchema(baseSchema, {
  nodes: {
    tweet: {
      name: 'tweet',
      content: 'inline*',
      group: 'block',
      attrs: {
        characterCount: { type: 'number', required: true }
      }
    },
    hashtag: {
      name: 'hashtag',
      group: 'inline',
      attrs: {
        tag: { type: 'string', required: true }
      }
    }
  },
  marks: {
    mention: {
      name: 'mention',
      group: 'social',
      attrs: {
        username: { type: 'string', required: true }
      }
    }
  }
});
```

## 4. Document System

### 4.1 Document Interface

```typescript
interface Document {
  id: string;
  type: string; // matches schema's topNode
  attrs: Record<string, any>;
  content: Node[];
  schema: Schema; // schema reference
  
  // Schema-based validation
  validate(): ValidationResult;
  
  // Node queries
  getNode(id: string): Node | undefined;
  getNodesByType(type: string): Node[];
  
  // Node creation (schema-based)
  createNode(type: string, attrs?: any, content?: Node[]): Node;
  
  // Mark application
  applyMark(nodeId: string, mark: Mark): ValidationResult;
  removeMark(nodeId: string, markType: string): ValidationResult;
}
```

### 4.2 Node Interface

```typescript
interface Node {
  id: string;
  type: string;
  attrs: Record<string, any>;
  content?: Node[]; // for container nodes
  text?: string; // for text nodes
  marks?: Mark[]; // marks for text nodes
  schema: Schema; // schema reference
  
  // Schema-based validation
  validate(): ValidationResult;
  
  // Attribute management
  getAttribute(name: string): any;
  setAttribute(name: string, value: any): ValidationResult;
  
  // Mark management
  addMark(mark: Mark): ValidationResult;
  removeMark(markType: string): ValidationResult;
  hasMark(markType: string): boolean;
}
```

### 4.3 Mark Interface

```typescript
interface Mark {
  type: string;
  attrs: Record<string, any>;
  
  // Mark validation
  validate(schema: Schema): ValidationResult;
}
```

## 5. Operation System

### 5.1 Operation Basic Structure

```typescript
interface Operation {
  type: string;
  nodeId?: string;
  documentId?: string;
  data?: any;
  schema: Schema; // schema reference
  
  // Execution
  execute(context: OperationContext): Promise<OperationResult>;
  
  // Validation
  validate(schema: Schema): ValidationResult;
  
  // Rollback
  rollback(context: OperationContext): Promise<OperationResult>;
}
```

### 5.2 ModelContext (DSL Context)

Model-level DSL operations use `ModelContext` that provides access to schema, node creation, and ID generation.

```typescript
interface ModelContext {
  getNode(nodeId: string): INode | undefined;
  schema?: Schema;
  // Create INode based on schema (includes attrs/content normalization)
  createNode(
    type: string,
    attrs: Record<string, any> | undefined,
    content: any[] | undefined,
    base: { id: string; parentId?: string; text?: string }
  ): INode;
  // Generate new node ID (default implementation provided, can integrate with DataStore)
  newId(prefix?: string): string;
}
```

Note: actual context instances are created via `makeModelContext(store)`, which injects `schema` from the root document’s `attributes.schema` and provides default implementations for `createNode`/`newId`.

### 5.3 Text Operations

```typescript
// Text insertion
interface TextInsertOperation extends Operation {
  type: 'text.insert';
  nodeId: string;
  data: {
    offset: number;
    text: string;
    marks?: Mark[];
  };
}

// Replace selected text range
interface TextReplaceSelectionOperation extends Operation {
  type: 'text.replaceSelection';
  data: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
    text: string;
    marks?: Mark[];
  };
}

// Split text
interface TextSplitAtSelectionOperation extends Operation {
  type: 'text.splitAtSelection';
  data: {
    nodeId: string;
    offset: number;
  };
}

// Merge text
interface TextMergeForwardOperation extends Operation {
  type: 'text.mergeForward';
  data: {
    nodeId: string;
  };
}
```

### 5.4 Block Operations

```typescript
// Split block
interface BlockSplitAtSelectionOperation extends Operation {
  type: 'block.splitAtSelection';
  data: {
    nodeId: string;
    offset: number;
  };
}

// Merge block
interface BlockMergeWithNextOperation extends Operation {
  type: 'block.mergeWithNext';
  data: {
    nodeId: string;
  };
}

// Wrap block
interface BlockWrapSelectionOperation extends Operation {
  type: 'block.wrapSelection';
  data: {
    wrapperType: string;
    wrapperAttrs?: Record<string, any>;
    startNodeId: string;
    endNodeId: string;
  };
}

// Unwrap block
interface BlockUnwrapSelectionOperation extends Operation {
  type: 'block.unwrapSelection';
  data: {
    nodeId: string;
  };
}
```

### 5.5 Mark Operations

```typescript
// Apply mark
interface TextApplyMarkOperation extends Operation {
  type: 'text.applyMark';
  data: {
    nodeId: string;
    mark: Mark;
  };
}

// Remove mark
interface TextRemoveMarkOperation extends Operation {
  type: 'text.removeMark';
  data: {
    nodeId: string;
    markType: string;
  };
}
```

## 6. Transaction System

### 6.x Selection & Absolute Position (Architecture View)

Rationale
- External simplicity: Editor and tests express intent using absolute positions and high-level selection ops.
- Internal robustness: Mapping and validation happen inside the model; no DOM dependency.

Position Space Definition
- Offsets are defined over TEXT CONTENT ONLY; structural nodes do not occupy positions.
- Origin (0) is the start of the first text node. There is no position at the document node itself.
- Boundary resolution (backward-prefer): If an offset lies exactly between text nodes, resolve to the end of the previous text node; if none, resolve to the start of the first text node.

Key Components
- ModelContext (Facade):
  - selectAbsoluteRange(anchor: number, head: number)
  - replaceSelection(text: string)
  - deleteAbsoluteRange(anchor: number, head: number)
  - resolveAbsolute(abs: number)
- Internals:
  - PositionCalculator: absolute <-> (nodeId, offset)
  - PositionTracker: position lifecycle & invalidation bookkeeping
  - PositionMapper (planned): build per-transaction mapping tables to remap positions across edits

Flow (replaceSelection)
1) Caller: selectAbsoluteRange(anchor, head)
2) Resolve: calculator → (startNodeId, startOffset, endNodeId, endOffset)
3) Translate: DSL operation 'text.replaceSelection' → primitive operations
4) Commit: transaction builds mapping, remaps selection positions
5) Result: updated doc + valid post-commit selection

Constraints
- Unified Schema validates node/mark attributes after translation
- Cross-node range operations must maintain parent content integrity

### 6.1 Transaction Definition

```typescript
interface Transaction {
  id: string;
  operations: Operation[]; // collection of steps translated to basic ops
  schema: Schema;
  timestamp: Date;
  description?: string;
  metadata?: Record<string, any>;
  
  // Execution
  commit(): Promise<TransactionResult>;
  
  // Rollback
  rollback(): Promise<void>;
  
  // Validation
  validate(): ValidationResult;
}
```

### 6.2 TransactionBuilder

```typescript
interface TransactionBuilder {
  constructor(schema: Schema);
  
  // Schema-based node creation
  createNode(type: string, attrs?: any, content?: Node[]): TransactionBuilder;
  
  // Add operation
  addOperation(operation: Operation): TransactionBuilder;
  addOperations(operations: Operation[]): TransactionBuilder;
  
  // Add DSL operation
  addOperation(type: string, payload: any): TransactionBuilder;
  
  // Metadata management
  setMeta(key: string, value: any): TransactionBuilder;
  getMeta(key: string): any;
  
  // Conditional operations
  if(condition: boolean, callback: (builder: TransactionBuilder) => TransactionBuilder): TransactionBuilder;
  unless(condition: boolean, callback: (builder: TransactionBuilder) => TransactionBuilder): TransactionBuilder;
  
  // Iterative operations
  forEach<T>(items: T[], callback: (item: T, builder: TransactionBuilder) => TransactionBuilder): TransactionBuilder;
  
  // Execution
  commit(): Promise<TransactionResult>;
}
```

### 6.3 TransactionResult

```typescript
interface TransactionResult {
  success: boolean;
  errors: string[];
  data?: any;
  transactionId?: string;
  operations?: Operation[];
  document?: Document;
}
```

## 7. DataStore System

### 7.1 DataStore Role

```typescript
interface DataStore {
  // Schema-based storage
  saveDocument(document: Document): Promise<void>;
  saveNode(node: Node): Promise<void>;
  
  // Schema-based queries
  getDocument(id: string): Promise<Document | undefined>;
  getNode(id: string): Promise<Node | undefined>;
  getAllNodes(): Promise<Node[]>;
  getAllDocuments(): Promise<Document[]>;
  
  // Schema validation
  validateDocument(document: Document): ValidationResult;
  validateNode(node: Node): ValidationResult;
  
  // History management
  getHistory(): Transaction[];
  rollbackToTransaction(transactionId: string): Promise<void>;
}
```

## 8. Model and Schema Integration

### 8.1 Schema-based Node Creation

```typescript
// Node creation using Schema in Model
class NodeFactory {
  constructor(private schema: Schema) {}
  
  createNode(type: string, options: NodeCreationOptions): Node {
    // Schema validation
    const validation = this.schema.validateAttributes(type, options.attributes || {});
    if (!validation.valid) {
      throw new Error(`Invalid attributes: ${validation.errors.join(', ')}`);
    }
    
    // Schema-based node creation
    return this.schema.node(type, options.attributes, options.content);
  }
  
  createTextNode(content: string, marks?: Mark[]): Node {
    return this.schema.text(content, {}, marks);
  }
  
  createDocument(content: Node[]): Document {
    return this.schema.doc(content);
  }
}
```

### 8.2 Schema-based Operation Execution (DSL)

```typescript
// Schema validation in operations
class TextInsertOperation implements Operation {
  constructor(
    private nodeId: string,
    private offset: number,
    private text: string,
    private marks: Mark[],
    private schema: Schema
  ) {}
  
  async execute(context: OperationContext): Promise<OperationResult> {
    // Schema validation
    const node = context.getNode(this.nodeId);
    if (!node) {
      return { success: false, errors: ['Node not found'] };
    }
    
    // Mark validation
    if (this.marks.length > 0) {
      const marksValidation = this.schema.validateMarks(this.marks);
      if (!marksValidation.valid) {
        return { success: false, errors: marksValidation.errors };
      }
    }
    
    // Execute text insertion logic
    // ...
  }
  
  validate(schema: Schema): ValidationResult {
    // Schema-based validation
    const nodeType = schema.getNodeType('text');
    if (!nodeType) {
      return { valid: false, errors: ['Text node type not defined in schema'] };
    }
    
    return { valid: true, errors: [] };
  }
}
```

### 8.3 Schema Usage in Transactions

```typescript
class TransactionBuilder {
  constructor(private schema: Schema, private dataStore: DataStore) {}
  
  addOperation(type: string, payload: any): TransactionBuilder {
    // Execute DSL-registered operation using ModelContext and
    // translate to basic create/update/delete operations
    const ctx = makeModelContext(this.dataStore);
    const { ops } = applyOperation(type, payload, ctx);
    this.operations.push(...ops);
    return this;
  }
  
  private createOperation(type: string, payload: any): Operation {
    switch (type) {
      case 'text.insert':
        return new TextInsertOperation(
          payload.nodeId,
          payload.offset,
          payload.text,
          payload.marks || [],
          this.schema
        );
      // other operations...
    }
  }
}
```

## 9. Usage Examples

### 9.1 Basic Document Creation

```typescript
// 1. Define unified schema
const schema = createSchema('article', {
  topNode: 'doc',
  nodes: {
    doc: { name: 'doc', content: 'block+', group: 'document' },
    paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
    text: { name: 'text', group: 'inline' }
  },
  marks: {
    bold: { name: 'bold', group: 'text-style' }
  }
});

// 2. Create document (with marks)
const document = schema.doc([
  schema.node('paragraph', {}, [
    schema.text('Hello '),
    schema.text('World', {}, [
      { type: 'bold', attrs: { weight: 'bold' } }
    ])
  ])
]);

// 3. Edit operations (with marks)
const transaction = new TransactionBuilder(schema)
  .addOperation('text.insert', { 
    nodeId: 'text-1', 
    offset: 5, 
    text: ' Beautiful' 
  })
  .addOperation('text.applyMark', {
    nodeId: 'text-1',
    mark: { type: 'bold', attrs: { weight: 'bold' } }
  })
  .setMeta('description', 'Text editing and styling')
  .commit();
```

### 9.2 Schema Extension Usage

```typescript
// Base blog schema
const blogSchema = createSchema('blog', {
  topNode: 'doc',
  nodes: {
    doc: { name: 'doc', content: 'block+', group: 'document' },
    paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
    text: { name: 'text', group: 'inline' }
  }
});

// Add collaboration features
const collaborativeSchema = createSchema(blogSchema, {
  nodes: {
    comment: {
      name: 'comment',
      group: 'block',
      attrs: {
        author: { type: 'string', required: true },
        timestamp: { type: 'string', required: true }
      }
    }
  },
  marks: {
    highlight: {
      name: 'highlight',
      group: 'collaborative',
      attrs: {
        author: { type: 'string', required: true },
        color: { type: 'string', default: 'yellow' }
      }
    }
  }
});
```

## 10. Package Structure

```
packages/
├── schema/           # Unified schema system
│   ├── src/
│   │   ├── schema.ts      # Schema class
│   │   ├── types.ts       # Type definitions
│   │   ├── validators.ts  # Validation logic
│   │   ├── registry.ts    # Registry management
│   │   └── index.ts
│   └── test/
│
├── model/            # Data model and operations
│   ├── src/
│   │   ├── operation.ts   # Operation base class
│   │   ├── operations/    # Concrete operations
│   │   ├── transaction.ts # Transaction system
│   │   ├── node-factory.ts # Schema-based node creation
│   │   └── index.ts
│   └── test/
│
├── datastore/        # Persistence layer
│   ├── src/
│   │   ├── data-store.ts
│   │   └── index.ts
│   └── test/
│
└── renderer-dom/     # DOM rendering
    ├── src/
    │   ├── renderer.ts
    │   └── index.ts
    └── test/
```

## 11. Conclusion

Barocss Editor’s unified schema architecture provides the following benefits:

1. **Consistency**: manage all node types and marks with one schema
2. **Extensibility**: easy to extend existing schemas
3. **Type safety**: full TypeScript type support
4. **Validation-first**: apply schema validation to all operations
5. **Performance**: efficient schema-based validation and transformation
6. **Maintainability**: clear hierarchy and separation of concerns

This architecture enables safe and efficient implementation of complex document editing features.
