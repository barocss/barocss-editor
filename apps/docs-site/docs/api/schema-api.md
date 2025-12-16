# Schema API

The Schema API provides schema definition, validation, and management for document structure.

## Schema Class

The main schema class that manages node types, mark types, and validation.

### Constructor

```typescript
new Schema(name: string, definition: SchemaDefinition)
```

**Parameters:**
- `name: string` - Schema name
- `definition: SchemaDefinition` - Schema definition

**Example:**
```typescript
import { Schema } from '@barocss/schema';

const schema = new Schema('my-doc', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  },
  marks: {
    bold: { name: 'bold', group: 'text-style' }
  }
});
```

### Properties

#### `name: string`
Schema name (read-only).

#### `topNode: string`
Top node type name (read-only).

#### `nodes: Map<string, NodeTypeDefinition>`
Node type definitions (read-only).

#### `marks: Map<string, MarkDefinition>`
Mark type definitions (read-only).

### Methods

#### `getNodeType(type: string): NodeTypeDefinition | undefined`

Gets a node type definition.

**Parameters:**
- `type: string` - Node type name

**Returns:**
- `NodeTypeDefinition | undefined` - Node type definition or `undefined`

**Example:**
```typescript
const nodeType = schema.getNodeType('paragraph');
// { name: 'paragraph', group: 'block', content: 'inline*', ... }
```

#### `hasNodeType(type: string): boolean`

Checks if a node type exists.

**Parameters:**
- `type: string` - Node type name

**Returns:**
- `boolean` - `true` if node type exists

#### `getNodeTypesByGroup(group: string): NodeTypeDefinition[]`

Gets all node types in a group.

**Parameters:**
- `group: string` - Group name

**Returns:**
- `NodeTypeDefinition[]` - Array of node type definitions

**Example:**
```typescript
const blockNodes = schema.getNodeTypesByGroup('block');
// [{ name: 'paragraph', ... }, { name: 'heading', ... }]
```

#### `getMarkType(type: string): MarkDefinition | undefined`

Gets a mark type definition.

**Parameters:**
- `type: string` - Mark type name

**Returns:**
- `MarkDefinition | undefined` - Mark type definition or `undefined`

#### `hasMarkType(type: string): boolean`

Checks if a mark type exists.

**Parameters:**
- `type: string` - Mark type name

**Returns:**
- `boolean` - `true` if mark type exists

#### `getMarkTypesByGroup(group: string): MarkDefinition[]`

Gets all mark types in a group.

**Parameters:**
- `group: string` - Group name

**Returns:**
- `MarkDefinition[]` - Array of mark type definitions

#### `getAttribute(nodeType: string, attrName: string): AttributeDefinition | undefined`

Gets an attribute definition for a node type.

**Parameters:**
- `nodeType: string` - Node type name
- `attrName: string` - Attribute name

**Returns:**
- `AttributeDefinition | undefined` - Attribute definition or `undefined`

**Example:**
```typescript
const levelAttr = schema.getAttribute('heading', 'level');
// { type: 'number', default: 1, ... }
```

#### `getContentModel(nodeType: string): string | undefined`

Gets the content model for a node type.

**Parameters:**
- `nodeType: string` - Node type name

**Returns:**
- `string | undefined` - Content model string or `undefined`

**Example:**
```typescript
const contentModel = schema.getContentModel('paragraph');
// 'inline*'
```

#### `validateAttributes(nodeType: string, attributes: Record<string, any>): ValidationResult`

Validates attributes for a node type.

**Parameters:**
- `nodeType: string` - Node type name
- `attributes: Record<string, any>` - Attributes to validate

**Returns:**
- `ValidationResult` - Validation result

**Example:**
```typescript
const result = schema.validateAttributes('heading', { level: 1 });
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

#### `validateContent(nodeType: string, content: any[]): ValidationResult`

Validates content for a node type.

**Parameters:**
- `nodeType: string` - Node type name
- `content: any[]` - Content array to validate

**Returns:**
- `ValidationResult` - Validation result

**Example:**
```typescript
const result = schema.validateContent('paragraph', ['text-1', 'text-2']);
if (!result.valid) {
  console.error('Content validation errors:', result.errors);
}
```

#### `validateMarks(marks: Mark[]): ValidationResult`

Validates marks.

**Parameters:**
- `marks: Mark[]` - Marks to validate

**Returns:**
- `ValidationResult` - Validation result

**Example:**
```typescript
const result = schema.validateMarks([
  { type: 'bold', range: [0, 5] },
  { type: 'italic', range: [2, 7] }
]);
```

#### `transform(nodeType: string, data: any): any`

Transforms data according to node type attribute transforms.

**Parameters:**
- `nodeType: string` - Node type name
- `data: any` - Data to transform

**Returns:**
- `any` - Transformed data

**Example:**
```typescript
const transformed = schema.transform('heading', {
  stype: 'heading',
  attributes: { level: '1' } // String
});
// { stype: 'heading', attributes: { level: 1 } } // Number (transformed)
```

#### `node(type: string, attrs?: any, content?: any[]): any`

Creates a node according to schema.

**Parameters:**
- `type: string` - Node type name
- `attrs?: any` - Optional attributes
- `content?: any[]` - Optional content

**Returns:**
- `any` - Node object

**Example:**
```typescript
const paragraph = schema.node('paragraph', {}, ['text-1']);
```

#### `text(content: string, attrs?: any, marks?: Mark[]): any`

Creates a text node according to schema.

**Parameters:**
- `content: string` - Text content
- `attrs?: any` - Optional attributes
- `marks?: Mark[]` - Optional marks

**Returns:**
- `any` - Text node object

**Example:**
```typescript
const textNode = schema.text('Hello', {}, [
  { type: 'bold', range: [0, 5] }
]);
```

---

## createSchema Function

Creates a schema instance.

### Overload 1: Create from Definition

```typescript
createSchema(name: string, definition: SchemaDefinition): Schema
```

**Parameters:**
- `name: string` - Schema name
- `definition: SchemaDefinition` - Schema definition

**Returns:**
- `Schema` - Schema instance

**Example:**
```typescript
import { createSchema } from '@barocss/schema';

const schema = createSchema('my-doc', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  },
  marks: {
    bold: { name: 'bold', group: 'text-style' }
  }
});
```

### Overload 2: Extend Existing Schema

```typescript
createSchema(baseSchema: Schema, extensions: SchemaExtensions): Schema
```

**Parameters:**
- `baseSchema: Schema` - Base schema to extend
- `extensions: SchemaExtensions` - Extensions to apply

**Returns:**
- `Schema` - Extended schema instance

**Example:**
```typescript
const baseSchema = createSchema('base', { /* ... */ });
const extendedSchema = createSchema(baseSchema, {
  nodes: {
    'custom-node': { name: 'custom-node', group: 'block' }
  },
  marks: {
    'custom-mark': { name: 'custom-mark', group: 'text-style' }
  }
});
```

---

## Schema Registry

Global schema registry for managing multiple schemas.

### Functions

#### `registerSchema(schema: Schema): void`

Registers a schema in the global registry.

**Parameters:**
- `schema: Schema` - Schema to register

**Example:**
```typescript
import { registerSchema, createSchema } from '@barocss/schema';

const schema = createSchema('my-doc', { /* ... */ });
registerSchema(schema);
```

#### `getSchema(name: string): Schema | undefined`

Gets a schema by name.

**Parameters:**
- `name: string` - Schema name

**Returns:**
- `Schema | undefined` - Schema or `undefined`

**Example:**
```typescript
const schema = getSchema('my-doc');
```

#### `getAllSchemas(): Schema[]`

Gets all registered schemas.

**Returns:**
- `Schema[]` - Array of all schemas

**Example:**
```typescript
const allSchemas = getAllSchemas();
```

#### `hasSchema(name: string): boolean`

Checks if a schema is registered.

**Parameters:**
- `name: string` - Schema name

**Returns:**
- `boolean` - `true` if schema is registered

#### `removeSchema(name: string): boolean`

Removes a schema from the registry.

**Parameters:**
- `name: string` - Schema name

**Returns:**
- `boolean` - `true` if schema was removed

#### `clearSchemas(): void`

Clears all schemas from the registry.

#### `getNodeTypesByGroup(group: string): string[]`

Gets all node type names in a group (across all schemas).

**Parameters:**
- `group: string` - Group name

**Returns:**
- `string[]` - Array of node type names

**Example:**
```typescript
const blockTypes = getNodeTypesByGroup('block');
// ['paragraph', 'heading', 'blockquote', ...]
```

#### `getNodeTypesByGroupInSchema(schemaName: string, group: string): string[]`

Gets all node type names in a group for a specific schema.

**Parameters:**
- `schemaName: string` - Schema name
- `group: string` - Group name

**Returns:**
- `string[]` - Array of node type names

**Example:**
```typescript
const blockTypes = getNodeTypesByGroupInSchema('my-doc', 'block');
```

### SchemaRegistry Class

Direct access to the registry instance.

```typescript
import { schemaRegistry } from '@barocss/schema';

// Same methods as functions above
schemaRegistry.register(schema);
const schema = schemaRegistry.get('my-doc');
```

---

## Editor Schema Manager

Manages multiple editor instances, each with its own schema registry.

### EditorSchemaManager Class

```typescript
import { EditorSchemaManager } from '@barocss/schema';

const manager = new EditorSchemaManager();
```

#### `createEditor(editorId: string): SchemaRegistry`

Creates a new editor instance with its own schema registry.

**Parameters:**
- `editorId: string` - Unique editor identifier

**Returns:**
- `SchemaRegistry` - New schema registry for the editor

**Example:**
```typescript
const registry = manager.createEditor('editor-1');
registry.register(schema);
```

#### `getEditor(editorId: string): SchemaRegistry | undefined`

Gets an existing editor's schema registry.

**Parameters:**
- `editorId: string` - Editor identifier

**Returns:**
- `SchemaRegistry | undefined` - Schema registry or `undefined`

#### `removeEditor(editorId: string): boolean`

Removes an editor and its schema registry.

**Parameters:**
- `editorId: string` - Editor identifier

**Returns:**
- `boolean` - `true` if editor was removed

#### `hasEditor(editorId: string): boolean`

Checks if an editor exists.

**Parameters:**
- `editorId: string` - Editor identifier

**Returns:**
- `boolean` - `true` if editor exists

#### `getAllEditorIds(): string[]`

Gets all editor IDs.

**Returns:**
- `string[]` - Array of editor IDs

#### `getEditorCount(): number`

Gets the number of active editors.

**Returns:**
- `number` - Number of editors

#### `clearAllEditors(): void`

Clears all editors and their registries.

### Global Editor Manager

```typescript
import { editorManager } from '@barocss/schema';

// Use global manager
const registry = editorManager.createEditor('editor-1');
```

### Helper Functions

#### `createEditorManager(): EditorSchemaManager`

Creates a new editor manager instance.

**Returns:**
- `EditorSchemaManager` - New editor manager

#### `createNamespacedSchema(namespace: string, name: string, definition: SchemaDefinition): Schema`

Creates a namespaced schema to avoid naming conflicts.

**Parameters:**
- `namespace: string` - Namespace prefix (e.g., 'social-media', 'blog')
- `name: string` - Schema name (e.g., 'post', 'page')
- `definition: SchemaDefinition` - Schema definition

**Returns:**
- `Schema` - Schema instance with namespaced name

**Example:**
```typescript
const schema = createNamespacedSchema('blog', 'post', {
  topNode: 'document',
  nodes: { /* ... */ }
});
// Schema name: 'blog:post'
```

#### `getNamespacedSchemas(registry: SchemaRegistry, namespace: string): Schema[]`

Gets all schemas in a namespace.

**Parameters:**
- `registry: SchemaRegistry` - Schema registry
- `namespace: string` - Namespace prefix

**Returns:**
- `Schema[]` - Array of schemas in namespace

---

## Schema Definition Types

### SchemaDefinition

```typescript
interface SchemaDefinition {
  topNode?: string;                    // Top node type (default: 'doc')
  nodes: Record<string, NodeTypeDefinition>; // Node type definitions
  marks?: Record<string, MarkDefinition>;    // Mark type definitions (optional)
}
```

### NodeTypeDefinition

```typescript
interface NodeTypeDefinition {
  name: string;                         // Node type name
  group: string;                        // Node group (e.g., 'block', 'inline', 'document')
  content?: string;                     // Content model (e.g., 'block+', 'inline*')
  attrs?: Record<string, AttributeDefinition>; // Attribute definitions
  // ... other properties
}
```

### MarkDefinition

```typescript
interface MarkDefinition {
  name: string;                         // Mark type name
  group: string;                        // Mark group (e.g., 'text-style')
  attrs?: Record<string, AttributeDefinition>; // Attribute definitions
  excludes?: string[];                  // Excluded mark types
  // ... other properties
}
```

### AttributeDefinition

```typescript
interface AttributeDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'custom';
  default?: any;                        // Default value
  required?: boolean | ((attrs: Record<string, any>) => boolean);
  validator?: (value: any, attrs: Record<string, any>) => boolean;
  transform?: (value: any) => any;
  // ... other properties
}
```

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;                      // Whether validation passed
  errors: string[];                    // Array of error messages
  errorCodes?: ValidationErrorCode[];  // Optional error codes
}
```

---

## Complete Example

```typescript
import { createSchema, registerSchema, getSchema } from '@barocss/schema';

// Create schema
const schema = createSchema('article', {
  topNode: 'document',
  nodes: {
    document: {
      name: 'document',
      group: 'document',
      content: 'block+'
    },
    paragraph: {
      name: 'paragraph',
      group: 'block',
      content: 'inline*',
      attrs: {
        align: {
          type: 'string',
          default: 'left',
          validator: (value) => ['left', 'center', 'right', 'justify'].includes(value)
        }
      }
    },
    heading: {
      name: 'heading',
      group: 'block',
      content: 'inline*',
      attrs: {
        level: {
          type: 'number',
          default: 1,
          validator: (value) => value >= 1 && value <= 6
        }
      }
    },
    'inline-text': {
      name: 'inline-text',
      group: 'inline'
    }
  },
  marks: {
    bold: {
      name: 'bold',
      group: 'text-style'
    },
    italic: {
      name: 'italic',
      group: 'text-style'
    },
    link: {
      name: 'link',
      group: 'text-style',
      attrs: {
        href: {
          type: 'string',
          required: true,
          validator: (value) => typeof value === 'string' && value.length > 0
        },
        target: {
          type: 'string',
          default: '_self'
        }
      }
    }
  }
});

// Register schema
registerSchema(schema);

// Use schema
const registeredSchema = getSchema('article');
const nodeType = registeredSchema.getNodeType('paragraph');
const blockNodes = registeredSchema.getNodeTypesByGroup('block');

// Validate
const result = registeredSchema.validateAttributes('heading', { level: 1 });
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

---

## Related

- [Core Concepts: Schema & Model](../concepts/schema-and-model) - Schema concepts
- [Architecture: Schema](../architecture/schema) - Schema architecture
- [DataStore API](./datastore-api) - DataStore validation integration
