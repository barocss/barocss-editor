# Model Data Specification

## 📋 Overview

Model Data is the data model that stores and manages actual document data in Zero Editor. It is based on structures defined by Schema DSL and ensures type safety and data integrity.

## 🎯 Design Goals

### 1. **Data Integrity**
- Schema-based data validation
- Type safety
- Consistent data structure

### 2. **Performance Optimization**
- Efficient memory usage
- Fast data access
- Lazy loading support

### 3. **Extensibility**
- Dynamic attribute addition
- Custom data types
- Integration with plugin system

## 🏗️ Core Concepts

### 1. **Node Data Structure**

```typescript
interface INode {
  id: string;
  type: TNodeType;
  attributes: Record<string, any>;
  content?: INode[];
  text?: string;
  marks?: Mark[];
  parent?: INode;
  children?: INode[];
  metadata?: Record<string, any>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### 2. **Mark Data Structure**

```typescript
interface Mark {
  type: string;
  attributes: Record<string, any>;
  range: {
    start: number;
    end: number;
  };
}
```

### 3. **Document Data Structure**

```typescript
interface Document {
  id: string;
  type: 'document';
  content: INode[];
  metadata: {
    title?: string;
    author?: string;
    version: string;
    createdAt: Date;
    updatedAt: Date;
  };
  schema: Schema;
  version: number;
}
```

## 📝 Usage Examples

### 1. **Basic Node Creation**

```typescript
// Create text node
const textNode: INode = {
  id: 'text-123',
  type: 'text',
  attributes: {
    bold: true,
    italic: false,
    color: '#000000'
  },
  text: 'Hello World',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// Create paragraph node
const paragraphNode: INode = {
  id: 'para-456',
  type: 'paragraph',
  attributes: {
    align: 'left',
    indent: 0
  },
  content: [textNode],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// Create image node
const imageNode: INode = {
  id: 'img-789',
  type: 'image',
  attributes: {
    src: 'https://example.com/image.jpg',
    alt: 'Example Image',
    width: 300,
    height: 200
  },
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};
```

### 2. **Composite Node Creation**

```typescript
// List item node
const listItemNode: INode = {
  id: 'li-001',
  type: 'listItem',
  attributes: {
    level: 0,
    type: 'bullet'
  },
  content: [paragraphNode],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// List node
const listNode: INode = {
  id: 'list-002',
  type: 'list',
  attributes: {
    type: 'bullet'
  },
  content: [listItemNode],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// Table cell node
const tableCellNode: INode = {
  id: 'cell-003',
  type: 'tableCell',
  attributes: {
    colspan: 1,
    rowspan: 1
  },
  content: [paragraphNode],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// Table row node
const tableRowNode: INode = {
  id: 'row-004',
  type: 'tableRow',
  content: [tableCellNode],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// Table node
const tableNode: INode = {
  id: 'table-005',
  type: 'table',
  content: [tableRowNode],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};
```

### 3. **Document Creation**

```typescript
// Create complete document
const document: Document = {
  id: 'doc-001',
  type: 'document',
  content: [
    paragraphNode,
    listNode,
    tableNode
  ],
  metadata: {
    title: 'Sample Document',
    author: 'John Doe',
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  schema: documentSchema,
  version: 1
};
```

## 🔧 Advanced Features

### 1. **Node Factory**

```typescript
class NodeFactory {
  static createNode(
    type: TNodeType, 
    attributes: Record<string, any> = {},
    content: INode[] = [],
    text?: string
  ): INode {
    return {
      id: generateId(),
      type,
      attributes,
      content,
      text,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  
  static createTextNode(text: string, attributes: Record<string, any> = {}): INode {
    return this.createNode('text', attributes, [], text);
  }
  
  static createParagraphNode(content: INode[], attributes: Record<string, any> = {}): INode {
    return this.createNode('paragraph', attributes, content);
  }
  
  static createImageNode(src: string, alt: string = '', attributes: Record<string, any> = {}): INode {
    return this.createNode('image', {
      src,
      alt,
      ...attributes
    });
  }
}
```

### 2. **Data Transformation**

```typescript
class DataTransformer {
  // Schema-based data transformation
  static transform(data: any, schema: Schema): INode {
    const transformedData = { ...data };
    
    // Transform attributes
    for (const [key, definition] of Object.entries(schema.definition.attributes || {})) {
      if (definition.transform && transformedData.attributes?.[key]) {
        transformedData.attributes[key] = definition.transform(transformedData.attributes[key]);
      }
    }
    
    return transformedData;
  }
  
  // Data normalization
  static normalize(node: INode, schema: Schema): INode {
    const normalized = { ...node };
    
    // Apply defaults
    for (const [key, definition] of Object.entries(schema.definition.attributes || {})) {
      if (normalized.attributes[key] === undefined && definition.default !== undefined) {
        normalized.attributes[key] = definition.default;
      }
    }
    
    return normalized;
  }
  
  // Data validation
  static validate(node: INode, schema: Schema): ValidationResult {
    const errors: string[] = [];
    
    // Validate attributes
    for (const [key, definition] of Object.entries(schema.definition.attributes || {})) {
      const value = node.attributes[key];
      
      if (definition.required && (value === undefined || value === null)) {
        errors.push(`Required attribute '${key}' is missing`);
        continue;
      }
      
      if (definition.validator && !definition.validator(value)) {
        errors.push(`Attribute '${key}' failed validation`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### 3. **Data Store**

```typescript
class DataStore {
  private _nodes = new Map<string, INode>();
  private _documents = new Map<string, Document>();
  private _schemas = new Map<string, Schema>();
  
  // Save node
  saveNode(node: INode): void {
    this._nodes.set(node.sid, node);
  }
  
  // Get node
  getNode(id: string): INode | undefined {
    return this._nodes.get(id);
  }
  
  // Save document
  saveDocument(document: Document): void {
    this._documents.set(document.sid, document);
    
    // Save all nodes in document
    this._saveDocumentNodes(document);
  }
  
  // Get document
  getDocument(id: string): Document | undefined {
    return this._documents.get(id);
  }
  
  // Register schema
  registerSchema(schema: Schema): void {
    this._schemas.set(schema.name, schema);
  }
  
  // Get schema
  getSchema(name: string): Schema | undefined {
    return this._schemas.get(name);
  }
  
  // Save all nodes in document
  private _saveDocumentNodes(document: Document): void {
    const saveNodeRecursive = (node: INode) => {
      this._nodes.set(node.sid, node);
      if (node.content) {
        node.content.forEach(saveNodeRecursive);
      }
    };
    
    document.content.forEach(saveNodeRecursive);
  }
}
```

## 📊 Data Validation

### 1. **Validator Class Integration**

Model Data uses the `Validator` class from `@barocss/schema` for comprehensive validation.

#### Structural Validation

```typescript
import { Validator, VALIDATION_ERRORS } from '@barocss/schema';

// Node structure validation (schema-independent)
const nodeValidation = Validator.validateNodeStructure(node);
if (!nodeValidation.valid) {
  console.error('Node structure validation failed:', nodeValidation.errors);
  console.error('Error codes:', nodeValidation.errorCodes);
}

// Document structure validation
const documentValidation = Validator.validateDocumentStructure(document);
if (!documentValidation.valid) {
  console.error('Document structure validation failed:', documentValidation.errorCodes);
}
```

#### Schema-based Validation

```typescript
// Node validation with schema
const schemaValidation = Validator.validateNode(schema, node);
if (!schemaValidation.valid) {
  console.error('Schema validation failed:', schemaValidation.errors);
}

// Document validation with schema
const documentSchemaValidation = Validator.validateDocument(schema, document);
if (!documentSchemaValidation.valid) {
  console.error('Document schema validation failed:', documentSchemaValidation.errors);
}
```

#### Error Code Usage

```typescript
// Safe error handling
const result = Validator.validateNodeStructure(node);
if (!result.valid) {
  if (result.errorCodes?.includes(VALIDATION_ERRORS.TEXT_CONTENT_REQUIRED)) {
    // Handle missing text content
  }
  if (result.errorCodes?.includes(VALIDATION_ERRORS.NODE_TYPE_UNKNOWN)) {
    // Handle unknown node type
  }
}
```

### 2. **Schema-based Validation**

```typescript
class DataValidator {
  // Validate node
  static validateNode(node: INode, schema: Schema): ValidationResult {
    const errors: string[] = [];
    
    // Type validation
    if (node.type !== schema.name) {
      errors.push(`Node type '${node.type}' does not match schema '${schema.name}'`);
    }
    
    // Attribute validation
    const attributeValidation = DataTransformer.validate(node, schema);
    if (!attributeValidation.valid) {
      errors.push(...attributeValidation.errors);
    }
    
    // Content validation
    if (schema.definition.content && node.content) {
      const contentValidation = this.validateContent(node.content, schema.definition.content);
      if (!contentValidation.valid) {
        errors.push(...contentValidation.errors);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  // Validate content
  static validateContent(content: INode[], contentModel: string): ValidationResult {
    // Content model parsing and validation logic
    const errors: string[] = [];
    
    // Simple example: required content validation
    if (contentModel.endsWith('+') && content.length === 0) {
      errors.push('Content is required but empty');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### 3. **Data Integrity Validation**

```typescript
class IntegrityValidator {
  // Validate document integrity
  static validateDocument(document: Document): ValidationResult {
    const errors: string[] = [];
    
    // Document ID validation
    if (!document.sid) {
      errors.push('Document ID is required');
    }
    
    // Schema validation
    if (!document.schema) {
      errors.push('Document schema is required');
    }
    
    // Content validation
    if (!document.content || document.content.length === 0) {
      errors.push('Document content is required');
    }
    
    // Validate each node
    document.content.forEach((node, index) => {
      const nodeValidation = DataValidator.validateNode(node, document.schema);
      if (!nodeValidation.valid) {
        errors.push(`Node ${index}: ${nodeValidation.errors.join(', ')}`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

## 🚀 Performance Optimization

### 1. **Lazy Loading**

```typescript
class LazyDataStore extends DataStore {
  private _lazyNodes = new Map<string, () => Promise<INode>>();
  
  // Register lazy-loading node
  registerLazyNode(id: string, loader: () => Promise<INode>): void {
    this._lazyNodes.set(id, loader);
  }
  
  // Get lazy-loading node
  async getNodeAsync(id: string): Promise<INode | undefined> {
    if (this._nodes.has(id)) {
      return this._nodes.get(id);
    }
    
    const loader = this._lazyNodes.get(id);
    if (loader) {
      const node = await loader();
      this._nodes.set(id, node);
      return node;
    }
    
    return undefined;
  }
}
```

### 2. **Data Caching**

```typescript
class CachedDataStore extends DataStore {
  private _cache = new Map<string, { data: any; timestamp: number }>();
  private _cacheTimeout = 5 * 60 * 1000; // 5 minutes
  
  // Get cached node
  getNode(id: string): INode | undefined {
    const cached = this._cache.get(id);
    if (cached && Date.now() - cached.timestamp < this._cacheTimeout) {
      return cached.data;
    }
    
    const node = super.getNode(id);
    if (node) {
      this._cache.set(id, { data: node, timestamp: Date.now() });
    }
    
    return node;
  }
  
  // Invalidate cache
  invalidateCache(id?: string): void {
    if (id) {
      this._cache.delete(id);
    } else {
      this._cache.clear();
    }
  }
}
```

## 📚 API Reference

### INode Interface

```typescript
interface INode {
  id: string;
  type: TNodeType;
  attributes: Record<string, any>;
  content?: INode[];
  text?: string;
  marks?: Mark[];
  parent?: INode;
  children?: INode[];
  metadata?: Record<string, any>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Document Interface

```typescript
interface Document {
  id: string;
  type: 'document';
  content: INode[];
  metadata: {
    title?: string;
    author?: string;
    version: string;
    createdAt: Date;
    updatedAt: Date;
  };
  schema: Schema;
  version: number;
}
```

### Utility Functions

```typescript
// Create node
function createNode(type: TNodeType, attributes?: Record<string, any>, content?: INode[]): INode;

// Create text node
function createTextNode(text: string, attributes?: Record<string, any>): INode;

// Create document
function createDocument(content: INode[], schema: Schema, metadata?: any): Document;

// Validate data
function validateNode(node: INode, schema: Schema): ValidationResult;

// Transform data
function transformNode(node: INode, schema: Schema): INode;
```

## 🔍 Examples

### Complete Document Creation Example

```typescript
// 1. Register schemas
const paragraphSchema = schema('paragraph', {
  attributes: {
    align: { type: 'string', default: 'left' }
  },
  content: 'inline*'
});

const textSchema = schema('text', {
  attributes: {
    bold: { type: 'boolean', default: false },
    italic: { type: 'boolean', default: false }
  }
});

// 2. Create nodes
const textNode1 = createTextNode('Hello ', { bold: true });
const textNode2 = createTextNode('World!', { italic: true });
const paragraphNode = createNode('paragraph', { align: 'center' }, [textNode1, textNode2]);

// 3. Create document
const document = createDocument(
  [paragraphNode],
  documentSchema,
  {
    title: 'Sample Document',
    author: 'John Doe',
    version: '1.0.0'
  }
);

// 4. Validate data
const validation = validateNode(paragraphNode, paragraphSchema);
if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}

// 5. Save data
const dataStore = new DataStore();
dataStore.registerSchema(paragraphSchema);
dataStore.registerSchema(textSchema);
dataStore.saveDocument(document);
```

Model Data enables safe and efficient data management based on schemas.
