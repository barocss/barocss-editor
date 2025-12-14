# @barocss/schema

The schema package defines the structure and validation rules for your documents. It's the foundation of Barocss Editor's type-safe document model.

## Purpose

Define document structure, validation rules, and node capabilities. The schema acts as a contract that all document operations must follow.

## Key Exports

- `createSchema()` - Create a schema definition
- `Schema` - Schema class for validation
- `schema()` - Schema builder function
- `registerSchema()` - Register schema in registry
- `getSchema()` - Get schema by name
- `validateSchema()` - Validate data against schema

## Basic Usage

```typescript
import { createSchema } from '@barocss/schema';

const schema = createSchema('my-doc', {
  topNode: 'document',
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
    }
  }
});
```

## Schema Definition with Attributes

Define schemas with attribute validation:

```typescript
import { schema } from '@barocss/schema';

const paragraphSchema = schema('paragraph', {
  group: 'block',
  content: 'inline*',
  attributes: {
    align: { 
      type: 'string', 
      default: 'left',
      validator: (value: string) => ['left', 'center', 'right', 'justify'].includes(value)
    },
    indent: { 
      type: 'number', 
      default: 0,
      validator: (value: number) => value >= 0
    }
  }
});
```

## Schema Components

### Nodes

Nodes are the building blocks of your document:

- **Document Node**: Root node that contains all content
- **Block Nodes**: Structural elements (paragraphs, headings, lists)
- **Inline Nodes**: Text and inline content

### Marks

Marks are formatting applied to inline content:

- **Text Style Marks**: Bold, italic, underline
- **Link Marks**: Hyperlinks
- **Custom Marks**: Any formatting you define

### Attributes

Attributes define node properties with validation:

```typescript
attributes: {
  align: {
    type: 'string',
    default: 'left',
    required: false,
    validator: (value: string) => ['left', 'center', 'right'].includes(value)
  },
  level: {
    type: 'number',
    required: true,
    validator: (value: number) => value >= 1 && value <= 6
  }
}
```

**Attribute types:**
- `string` - String values
- `number` - Numeric values
- `boolean` - Boolean values
- `array` - Array values
- `object` - Object values with nested validation
- `custom` - Custom type with custom validation

### Content Rules

Content rules define what can be nested:

- `block+` - One or more block nodes
- `inline*` - Zero or more inline nodes
- `paragraph?` - Zero or one paragraph
- `paragraph | heading` - Either paragraph or heading
- `(paragraph | heading)+` - One or more paragraphs or headings

## Schema Validation

The schema validates all operations:

```typescript
import { validateSchema } from '@barocss/schema';

const data = {
  type: 'paragraph',
  attributes: {
    align: 'center',
    indent: 2
  },
  content: [...]
};

const result = validateSchema(paragraphSchema, data);
if (result.valid) {
  console.log('Data is valid!');
} else {
  console.log('Validation errors:', result.errors);
}
```

## Object Schema Validation

For complex object attributes, define nested object schemas:

```typescript
const userProfileSchema = schema('userProfile', {
  attributes: {
    user: {
      type: 'object',
      required: true,
      objectSchema: {
        name: { type: 'string', required: true },
        age: { type: 'number', required: true },
        email: { 
          type: 'string', 
          required: true,
          validator: (value: string) => value.includes('@')
        }
      }
    }
  }
});
```

**Object schema features:**
- Nested validation with unlimited depth
- Type safety for each property
- Required/optional properties
- Custom validators per property
- Default values

## Schema Registry

Schemas are registered in a global registry:

```typescript
import { registerSchema, getSchema, getAllSchemas } from '@barocss/schema';

// Register schemas
registerSchema(paragraphSchema);
registerSchema(textSchema);

// Get schemas
const paragraph = getSchema('paragraph');
const allSchemas = getAllSchemas();
```

## Multi-Editor Support

When building applications with multiple editors, manage schemas separately:

```typescript
import { editorManager, schema } from '@barocss/schema';

// Create separate registries for each editor
const textEditor = editorManager.createEditor('text-editor');
const codeEditor = editorManager.createEditor('code-editor');

// Register schemas in their respective registries
textEditor.register(paragraphSchema);
codeEditor.register(codeBlockSchema);
```

## Schema Validation

The schema validates all operations:

```typescript
// This will fail if 'invalid-node' is not in the schema
dataStore.createNode({ 
  sid: 'n1', 
  stype: 'invalid-node'  // ❌ Schema validation error
});
```

## When to Use

- **At Editor Creation**: Schema is required when creating an Editor
- **Defining Document Structure**: Before creating any nodes
- **Type Safety**: Ensures all operations are valid
- **Attribute Validation**: Validate node attributes
- **Content Model**: Define what can be nested

## Integration

The schema is used by:

- **DataStore**: Validates all node operations
- **Editor**: Provides structure for commands
- **Renderer**: Knows what nodes to expect
- **Converter**: Validates converted nodes

## Related

- [Core Concepts: Schema & Model](../concepts/schema-and-model) - Deep dive into schema concepts
- [DataStore Package](./datastore) - How schema validates DataStore operations
