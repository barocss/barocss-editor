# Barocss Schema Specification

## Overview

Barocss Schema is an integrated schema system that defines and validates document structure. It is based on ProseMirror's schema concept but designed for Barocss requirements.

## Core Concepts

### Unified Schema
- **One Schema instance** manages all node types and marks
- **Consistent API** for node creation, validation, and transformation
- **Hierarchical structure** clarifies relationships and constraints between nodes

### Node Types
Defines structural elements of documents.
- **Document node**: top-level container (doc)
- **Block nodes**: paragraphs, headings, lists, etc.
- **Inline nodes**: text, images, links, etc.

### Marks
Defines styling information applied to text.
- **Text styles**: bold, italic, underline, etc.
- **Links**: URL, title, etc.
- **Colors**: text color, background color, etc.

## Schema Definition

### Basic Structure

```typescript
interface SchemaDefinition {
  topNode?: string; // default: 'doc'
  nodes: Record<string, NodeTypeDefinition>;
  marks?: Record<string, MarkDefinition>;
}
```

### Node Type Definition

```typescript
interface NodeTypeDefinition {
  name: string;
  group?: 'block' | 'inline' | 'document';
  content?: string; // content model (e.g., 'block+', 'inline*')
  attrs?: Record<string, AttributeDefinition>;
  inline?: boolean;
  selectable?: boolean;
  draggable?: boolean;
  atom?: boolean;
  code?: boolean;
  whitespace?: 'pre' | 'normal';
  defining?: boolean;
  isolating?: boolean;
}
```

### Mark Definition

```typescript
interface MarkDefinition {
  name: string;
  attrs?: Record<string, AttributeDefinition>;
  excludes?: string[]; // other marks that cannot be used together
  group?: string; // mark group
  inclusive?: boolean; // default: true
}
```

### Attribute Definition

```typescript
interface AttributeDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'custom';
  required?: boolean | ((attrs: Record<string, any>) => boolean);
  default?: any;
  validator?: (value: any, attrs: Record<string, any>) => boolean;
  transform?: (value: any) => any;
  customType?: string;
  objectSchema?: Record<string, AttributeDefinition>;
}
```

## Content Model

The content model defines the structure of child nodes a node can contain.

### Basic Patterns

- `block+`: one or more block nodes
- `block*`: zero or more block nodes
- `block?`: zero or one block node
- `inline*`: zero or more inline nodes
- `text*`: zero or more text nodes

### Composite Patterns

- `block+ | inline+`: block or inline nodes
- `(block | inline)*`: mix of block and inline nodes
- `heading | paragraph`: specific node types

### Group-based

- `block+`: nodes belonging to the block group
- `inline*`: nodes belonging to the inline group

## Usage Examples

### 1. Basic Schema Creation

```typescript
import { createSchema } from '@barocss/schema';

const schema = createSchema('article', {
  topNode: 'doc',
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
        level: { type: 'number', default: 1 }
      }
    },
    
    // Heading node
    heading: {
      name: 'heading',
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { 
          type: 'number', 
          required: true,
          validator: (value: number) => value >= 1 && value <= 6
        }
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
      excludes: ['bold'] // cannot be used with bold
    },
    
    // Underline mark
    underline: {
      name: 'underline',
      attrs: {
        style: { type: 'string', default: 'underline' }
      },
      group: 'text-style'
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
    },
    
    // Code mark
    code: {
      name: 'code',
      attrs: {
        language: { type: 'string', required: false }
      },
      group: 'code'
    }
  }
});
```

### 2. Node Creation

```typescript
// Create document
const document = schema.doc([
  schema.node('heading', { level: 1 }, [
    schema.text('Hello World')
  ]),
  schema.node('paragraph', { level: 1 }, [
    schema.text('This is a '),
    schema.text('bold text', {}, [
      { type: 'bold', attrs: { weight: 'bold' } }
    ]),
    schema.text(' and '),
    schema.text('italic text', {}, [
      { type: 'italic', attrs: { style: 'italic' } }
    ]),
    schema.text('.')
  ])
]);

// Create image node
const imageNode = schema.node('image', {
  src: 'https://example.com/image.jpg',
  alt: 'Example image',
  width: 300,
  height: 200
});
```

### 3. Schema Extension

```typescript
// Extend existing schema to add new features
const extendedSchema = createSchema(baseSchema, {
  nodes: {
    // Add new node
    heading: {
      name: 'heading',
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { type: 'number', required: true }
      }
    },
    image: {
      name: 'image',
      group: 'inline',
      atom: true,
      attrs: {
        src: { type: 'string', required: true },
        alt: { type: 'string', required: false }
      }
    }
  },
  marks: {
    // Add new mark
    italic: {
      name: 'italic',
      group: 'text-style',
      attrs: {
        style: { type: 'string', default: 'italic' }
      }
    },
    link: {
      name: 'link',
      group: 'link',
      attrs: {
        href: { type: 'string', required: true }
      }
    }
  }
});

// Modify existing node (add new attribute)
const modifiedSchema = createSchema(baseSchema, {
  nodes: {
    paragraph: {
      name: 'paragraph',
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { type: 'number', default: 1 },
        align: { type: 'string', default: 'left' } // new attribute
      }
    }
  }
});
```

### 4. Validation

```typescript
// Node validation
const nodeValidation = schema.validateNode('heading', {
  type: 'heading',
  attrs: { level: 1 },
  content: []
});

// Document validation
const documentValidation = schema.validateDocument(document);

// Mark validation
const marksValidation = schema.validateMarks([
  { type: 'bold', attrs: { weight: 'bold' } },
  { type: 'link', attrs: { href: 'https://example.com' } }
]);
```

## API Reference

### createSchema Function

```typescript
// Create new schema
createSchema(name: string, definition: SchemaDefinition): Schema

// Extend existing schema
createSchema(baseSchema: Schema, extensions: SchemaExtensions): Schema
```

#### Schema Extension Usage

```typescript
// 1. Create base schema
const baseSchema = createSchema('article', {
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

// 2. Extend schema
const extendedSchema = createSchema(baseSchema, {
  nodes: {
    heading: {
      name: 'heading',
      content: 'inline*',
      group: 'block',
      attrs: { level: { type: 'number', required: true } }
    }
  },
  marks: {
    italic: {
      name: 'italic',
      group: 'text-style'
    }
  }
});

// 3. Modify existing node
const modifiedSchema = createSchema(baseSchema, {
  nodes: {
    paragraph: {
      name: 'paragraph',
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { type: 'number', default: 1 },
        align: { type: 'string', default: 'left' } // add new attribute
      }
    }
  }
});
```

### Schema Class

#### Constructor
```typescript
constructor(name: string, definition: SchemaDefinition)
```

#### Node Type Management
```typescript
getNodeType(type: string): NodeTypeDefinition | undefined
hasNodeType(type: string): boolean
getNodeTypesByGroup(group: string): NodeTypeDefinition[]
```

#### Mark Management
```typescript
getMarkType(type: string): MarkDefinition | undefined
hasMarkType(type: string): boolean
getMarkTypesByGroup(group: string): MarkDefinition[]
```

#### Validation
```typescript
validateAttributes(nodeType: string, attributes: Record<string, any>): ValidationResult
validateContent(nodeType: string, content: any[]): ValidationResult
validateMarks(marks: Mark[]): ValidationResult
validateNode(node: any): ValidationResult
validateDocument(document: any): ValidationResult
```

#### Node Creation
```typescript
doc(content?: any[]): any
node(type: string, attrs?: any, content?: any[]): any
text(content: string, attrs?: any, marks?: Mark[]): any
```

#### Data Transformation
```typescript
transform(nodeType: string, data: any): any
```

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  errorCodes?: string[];
}
```

### Validator Class

The `Validator` class is an integrated validation utility that provides schema-based validation and basic structural validation.

#### Basic Structural Validation

```typescript
import { Validator } from '@barocss/schema';

// Node structure validation (schema-independent)
const nodeValidation = Validator.validateNodeStructure(node);
if (!nodeValidation.valid) {
  console.log('Structural errors:', nodeValidation.errors);
  console.log('Error codes:', nodeValidation.errorCodes);
}

// Document structure validation
const documentValidation = Validator.validateDocumentStructure(document);
```

#### Schema-based Validation

```typescript
// Node validation with schema
const schemaValidation = Validator.validateNode(schema, node);

// Document validation with schema
const documentSchemaValidation = Validator.validateDocument(schema, document);
```

#### Error Code System

`Validator` provides structured error codes to stabilize testing and error handling:

```typescript
import { Validator, VALIDATION_ERRORS } from '@barocss/schema';

const result = Validator.validateNodeStructure(invalidNode);

// Safe error code-based validation
if (!result.valid) {
  if (result.errorCodes?.includes(VALIDATION_ERRORS.TEXT_CONTENT_REQUIRED)) {
    // Handle case where text content is required
  }
  if (result.errorCodes?.includes(VALIDATION_ERRORS.NODE_TYPE_UNKNOWN)) {
    // Handle unknown node type
  }
}
```

#### Available Error Codes

```typescript
const VALIDATION_ERRORS = {
  // Node structure errors
  NODE_REQUIRED: 'NODE_REQUIRED',
  NODE_ID_REQUIRED: 'NODE_ID_REQUIRED',
  NODE_TYPE_REQUIRED: 'NODE_TYPE_REQUIRED',
  TEXT_CONTENT_REQUIRED: 'TEXT_CONTENT_REQUIRED',
  
  // Document structure errors
  DOCUMENT_REQUIRED: 'DOCUMENT_REQUIRED',
  DOCUMENT_ID_REQUIRED: 'DOCUMENT_ID_REQUIRED',
  DOCUMENT_SCHEMA_REQUIRED: 'DOCUMENT_SCHEMA_REQUIRED',
  DOCUMENT_CONTENT_REQUIRED: 'DOCUMENT_CONTENT_REQUIRED',
  
  // Schema validation errors
  NODE_TYPE_UNKNOWN: 'NODE_TYPE_UNKNOWN',
  CONTENT_REQUIRED_BUT_EMPTY: 'CONTENT_REQUIRED_BUT_EMPTY',
  ATTRIBUTE_INVALID: 'ATTRIBUTE_INVALID',
  ATTRIBUTE_REQUIRED: 'ATTRIBUTE_REQUIRED',
  ATTRIBUTE_TYPE_MISMATCH: 'ATTRIBUTE_TYPE_MISMATCH',
  
  // Schema instance errors
  INVALID_SCHEMA_INSTANCE: 'INVALID_SCHEMA_INSTANCE'
};
```

#### Real Usage Examples

```typescript
import { Validator, VALIDATION_ERRORS, createSchema } from '@barocss/schema';

// 1. Basic structural validation
const textNode = {
  id: 'text-1',
  type: 'text',
  // both text and attributes.content are missing
  attributes: {}
};

const result = Validator.validateNodeStructure(textNode);
expect(result.valid).toBe(false);
expect(result.errorCodes).toContain(VALIDATION_ERRORS.TEXT_CONTENT_REQUIRED);

// 2. Schema-based validation
const schema = createSchema('test', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline+' },
    text: { 
      name: 'text', 
      group: 'inline',
      attrs: { content: { type: 'string', required: true } }
    }
  }
});

const validTextNode = {
  id: 'text-1',
  type: 'text',
  text: 'Hello',
  attributes: { content: 'Hello' }
};

const invalidTextNode = {
  id: 'text-2',
  type: 'text',
  text: 'Hello',
  attributes: {} // content attribute missing
};

const validResult = Validator.validateNode(schema, validTextNode);
const invalidResult = Validator.validateNode(schema, invalidTextNode);

expect(validResult.valid).toBe(true);
expect(invalidResult.valid).toBe(false);
expect(invalidResult.errorCodes).toContain(VALIDATION_ERRORS.CONTENT_REQUIRED_BUT_EMPTY);

// 3. Document validation
const document = {
  id: 'doc-1',
  type: 'document',
  content: [validTextNode],
  schema: schema,
  metadata: { title: 'Test Document' },
  version: 1
};

const documentResult = Validator.validateDocumentStructure(document);
expect(documentResult.valid).toBe(true);
```

#### Usage in Tests

```typescript
// Old approach (fragile)
expect(result.errors.some(err => err.includes('Content is required but empty'))).toBe(true);

// New approach (safe)
expect(result.errorCodes).toContain(VALIDATION_ERRORS.CONTENT_REQUIRED_BUT_EMPTY);
```

Benefits of this approach:
- **Stability**: tests remain safe even if error messages change
- **Clarity**: clear what type of error it is
- **Maintainability**: only need to manage error codes
- **Extensibility**: easy to add new error types

### Mark

```typescript
interface Mark {
  type: string;
  attrs?: Record<string, any>;
}
```

### SchemaExtensions

```typescript
type SchemaExtensions = Partial<SchemaDefinition>;
```

A partial definition type for schema extension. Used when extending existing schemas.

## Registry Management

### Global Registry

```typescript
import { 
  registerSchema, 
  getSchema, 
  getAllSchemas,
  getNodeTypesByGroup,
  removeSchema,
  hasSchema,
  clearSchemas
} from '@barocss/schema';

// Register schema
registerSchema(schema);

// Get schema
const schema = getSchema('article');

// Get all schemas
const allSchemas = getAllSchemas();

// Get node types by group
const blockNodes = getNodeTypesByGroup('block');
```

### Editor Manager

```typescript
import { EditorSchemaManager, createNamespacedSchema } from '@barocss/schema';

const manager = new EditorSchemaManager();

// Create editors
const editor1 = manager.createEditor('editor1');
const editor2 = manager.createEditor('editor2');

// Register schemas for each editor
editor1.register(schema1);
editor2.register(schema2);

// Create namespaced schema
const namespacedSchema = createNamespacedSchema('blog', 'post', schemaDefinition);
```

## Advanced Features

### Custom Validators

```typescript
const schema = createSchema('custom', {
  topNode: 'doc',
  nodes: {
    email: {
      name: 'email',
      group: 'inline',
      attrs: {
        address: {
          type: 'string',
          required: true,
          validator: (value: string) => {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
          }
        }
      }
    }
  }
});
```

### Function-based Required Attributes

```typescript
const schema = createSchema('conditional', {
  topNode: 'doc',
  nodes: {
    user: {
      name: 'user',
      group: 'inline',
      attrs: {
        type: { type: 'string', required: true },
        email: {
          type: 'string',
          required: (attrs: Record<string, any>) => attrs.type === 'registered'
        }
      }
    }
  }
});
```

### Object Schema

```typescript
const schema = createSchema('complex', {
  topNode: 'doc',
  nodes: {
    profile: {
      name: 'profile',
      group: 'block',
      attrs: {
        user: {
          type: 'object',
          required: true,
          objectSchema: {
            name: { type: 'string', required: true },
            age: { type: 'number', required: true },
            address: {
              type: 'object',
              required: false,
              objectSchema: {
                street: { type: 'string', required: true },
                city: { type: 'string', required: true }
              }
            }
          }
        }
      }
    }
  }
});
```

## Performance Considerations

### Schema Caching
- Schema instances should be reused after creation
- Node types and mark definitions are cached internally as Maps

### Validation Optimization
- Validate required attributes first
- Custom validators run last
- Stop immediately on error

### Memory Management
- Remove unused schemas from registry
- Clean up related schemas when editor closes

## Migration Guide

### From Single Node Schema to Unified Schema

```typescript
// Old approach
const paragraphSchema = new Schema('paragraph', {
  attributes: { level: { type: 'number', default: 1 } },
  content: 'inline*',
  group: 'block'
});

// New approach
const schema = createSchema('article', {
  topNode: 'doc',
  nodes: {
    paragraph: {
      name: 'paragraph',
      content: 'inline*',
      group: 'block',
      attrs: { level: { type: 'number', default: 1 } }
    }
  }
});
```

## Conclusion

Barocss Schema is a powerful system for defining and validating document structure. The unified schema approach provides a consistent API and has an extensible, maintainable structure.

It is based on ProseMirror's proven concepts but optimized for Barocss's specific requirements.
