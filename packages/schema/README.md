# @barocss/schema

Schema DSL for defining document structure and validation rules.

## Features

- **Schema Definition**: Define document structure with attributes and content models
- **Type Validation**: Built-in validation for string, number, boolean, array, object, and custom types
- **Content Model Validation**: Support for complex content expressions like `inline*`, `block+`, `paragraph | heading`
- **Attribute Validation**: Required fields, custom validators, and conditional requirements
- **Data Transformation**: Transform data using attribute transforms
- **Registry Management**: Global schema registry with group management

## Installation

```bash
pnpm add @barocss/schema
```

## Usage

### Basic Schema Definition

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

### Text Schema with Marks

```typescript
const textSchema = schema('text', {
  group: 'inline',
  attributes: {
    bold: { type: 'boolean', default: false },
    italic: { type: 'boolean', default: false },
    color: { 
      type: 'string', 
      default: 'inherit',
      validator: (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value) || value === 'inherit'
    }
  }
});
```

### Image Schema

```typescript
const imageSchema = schema('image', {
  group: 'inline',
  atom: true,
  attributes: {
    src: { 
      type: 'string', 
      required: true,
      validator: (value: string) => value.startsWith('http') || value.startsWith('/')
    },
    alt: { type: 'string', default: '' },
    width: { 
      type: 'number', 
      validator: (value: number) => value > 0
    },
    height: { 
      type: 'number', 
      validator: (value: number) => value > 0
    }
  }
});
```

### Schema Registry

```typescript
import { registerSchema, getSchema, getAllSchemas } from '@barocss/schema';

// Register schemas
registerSchema(paragraphSchema);
registerSchema(textSchema);
registerSchema(imageSchema);

// Get schemas
const paragraph = getSchema('paragraph');
const allSchemas = getAllSchemas();
```

### Validation

```typescript
import { validateSchema } from '@barocss/schema';

const data = {
  type: 'paragraph',
  attributes: {
    align: 'center',
    indent: 2
  },
  content: [
    {
      type: 'text',
      text: 'This is a centered paragraph.',
      attributes: { bold: true }
    }
  ]
};

const result = validateSchema(paragraphSchema, data);
if (result.valid) {
  console.log('Data is valid!');
} else {
  console.log('Validation errors:', result.errors);
}
```

### Object Schema Validation

For complex object attributes, you can define detailed object schemas with nested validation:

```typescript
import { schema } from '@barocss/schema';

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
    },
    settings: {
      type: 'object',
      required: false,
      objectSchema: {
        theme: { type: 'string', required: false, default: 'light' },
        notifications: { type: 'boolean', required: false, default: true },
        preferences: {
          type: 'object',
          required: false,
          objectSchema: {
            language: { type: 'string', required: false, default: 'en' },
            timezone: { type: 'string', required: false, default: 'UTC' }
          }
        }
      }
    }
  }
});

// Valid data
const validProfile = {
  type: 'userProfile',
  attributes: {
    user: {
      name: 'John Doe',
      age: 30,
      email: 'john@example.com'
    },
    settings: {
      theme: 'dark',
      notifications: false,
      preferences: {
        language: 'ko',
        timezone: 'Asia/Seoul'
      }
    }
  }
};

const validationResult = validateSchema(userProfileSchema, validProfile);
console.log(validationResult.valid); // true
```

#### Object Schema Features

- **Nested Validation**: Define object schemas with unlimited nesting depth
- **Type Safety**: Each property can have its own type validation
- **Required Properties**: Mark properties as required or optional
- **Custom Validators**: Apply custom validation logic to object properties
- **Default Values**: Set default values for optional properties
- **Extra Property Detection**: Detect and report undefined properties

### Multi-Editor Support

When building applications with multiple editors on the same page, you need to manage schemas separately to avoid conflicts. The `@barocss/schema` package provides several solutions:

#### 1. Editor Schema Manager

```typescript
import { editorManager, schema, validateSchema } from '@barocss/schema';

// Create separate registries for each editor
const textEditor = editorManager.createEditor('text-editor');
const codeEditor = editorManager.createEditor('code-editor');
const designEditor = editorManager.createEditor('design-editor');

// Define schemas for each editor
const textSchemas = {
  paragraph: schema('paragraph', {
    attributes: { align: { type: 'string', default: 'left' } },
    content: 'text*'
  }),
  text: schema('text', {
    attributes: { bold: { type: 'boolean', default: false } }
  })
};

const codeSchemas = {
  codeBlock: schema('codeBlock', {
    attributes: { language: { type: 'string', required: true } },
    content: 'text*'
  })
};

// Register schemas in their respective registries
Object.values(textSchemas).forEach(schema => textEditor.register(schema));
Object.values(codeSchemas).forEach(schema => codeEditor.register(schema));

// Each editor works independently
const textData = {
  type: 'paragraph',
  attributes: { align: 'center' },
  content: [{ type: 'text', text: 'Hello World!', attributes: { bold: true } }]
};

const codeData = {
  type: 'codeBlock',
  attributes: { language: 'typescript' },
  content: [{ type: 'text', text: 'const message = "Hello!";' }]
};

// Validate using the appropriate schema
const textResult = validateSchema(textSchemas.paragraph, textData);
const codeResult = validateSchema(codeSchemas.codeBlock, codeData);

console.log(textResult.valid); // true
console.log(codeResult.valid); // true
```

#### 2. Namespaced Schemas

For cases where you want to use a single registry but avoid naming conflicts:

```typescript
import { createNamespacedSchema, getNamespacedSchemas } from '@barocss/schema';

// Create namespaced schemas
const socialMediaPost = createNamespacedSchema('social-media', 'post', {
  attributes: {
    platform: { type: 'string', required: true },
    content: { type: 'string', required: true }
  }
});

const blogPost = createNamespacedSchema('blog', 'post', {
  attributes: {
    title: { type: 'string', required: true },
    content: { type: 'string', required: true },
    published: { type: 'boolean', default: false }
  }
});

// Register in a single registry
const registry = editorManager.createEditor('global');
registry.register(socialMediaPost);
registry.register(blogPost);

// Get schemas by namespace
const socialMediaSchemas = getNamespacedSchemas(registry, 'social-media');
const blogSchemas = getNamespacedSchemas(registry, 'blog');

// Use namespaced schemas
const socialMediaData = {
  type: 'social-media:post',
  attributes: { platform: 'instagram', content: 'Hello!' }
};

const blogData = {
  type: 'blog:post',
  attributes: { title: 'My Post', content: 'Content here', published: true }
};

const socialMediaResult = validateSchema(socialMediaPost, socialMediaData);
const blogResult = validateSchema(blogPost, blogData);
```

#### 3. Dynamic Editor Management

```typescript
import { editorManager } from '@barocss/schema';

// Create editors dynamically
const editor1 = editorManager.createEditor('editor-1');
const editor2 = editorManager.createEditor('editor-2');

// Check if editor exists
if (editorManager.hasEditor('editor-1')) {
  console.log('Editor 1 exists');
}

// Get all editor IDs
const editorIds = editorManager.getAllEditorIds();
console.log(editorIds); // ['editor-1', 'editor-2']

// Remove an editor
editorManager.removeEditor('editor-1');

// Clear all editors
editorManager.clearAllEditors();
```

## Testing

This package includes comprehensive tests using Vitest, organized in the `test/` directory.

### Test Structure

```
packages/schema/
├── src/                    # Source code
│   ├── schema.ts          # Core Schema class
│   ├── registry.ts        # SchemaRegistry class
│   ├── validators.ts      # Validation functions
│   ├── editor-manager.ts  # Multi-editor support
│   ├── types.ts           # Type definitions
│   └── index.ts           # Main exports
├── test/                   # Test files
│   ├── schema.test.ts
│   ├── registry.test.ts
│   ├── validators.test.ts
│   ├── editor-manager.test.ts
│   ├── integration.test.ts
│   ├── social-media-editor.test.ts
│   ├── notion-editor.test.ts
│   ├── markdown-editor.test.ts
│   ├── design-editor.test.ts
│   ├── multi-editor.test.ts
│   └── real-world-usage.test.ts
└── vitest.config.ts
```

### Run Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:run

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage
```

### Test Coverage

Current test coverage:
- **Statements**: 89.62%
- **Branches**: 78.44%
- **Functions**: 79.31%
- **Lines**: 89.62%

## API Reference

### Schema Class

#### Constructor
```typescript
new Schema(name: string, definition: SchemaDefinition)
```

#### Methods
- `getAttribute(name: string): AttributeDefinition | undefined`
- `getContentModel(): string | undefined`
- `validateAttributes(attributes: Record<string, any>): ValidationResult`
- `validateContent(content: any[]): ValidationResult`
- `transform(data: any): any`

### Schema Definition

```typescript
interface SchemaDefinition {
  attributes?: Record<string, AttributeDefinition>;
  content?: string; // Content model string
  group?: string; // Node group
  inline?: boolean; // Is it an inline node?
  atom?: boolean; // Is it an atomic node?
  selectable?: boolean; // Can it be selected?
  draggable?: boolean; // Can it be dragged?
  code?: boolean; // Is it a code block?
  whitespace?: 'pre' | 'normal'; // Whitespace handling
  defining?: boolean; // Does it define a new block scope?
  isolating?: boolean; // Does it isolate its content?
  marks?: string; // Allowed marks
  attrs?: Record<string, AttributeDefinition>; // Alias for attributes
}
```

### Attribute Definition

```typescript
interface AttributeDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'custom';
  default?: any;
  required?: boolean | ((attrs: Record<string, any>) => boolean);
  validator?: (value: any, attrs?: Record<string, any>) => boolean;
  transform?: (value: any) => any;
  customType?: string; // For 'custom' type
}
```

### Validation Result

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

## Content Model Expressions

The content model supports various expressions:

- `inline*` - Zero or more inline nodes
- `block+` - One or more block nodes
- `paragraph?` - Zero or one paragraph
- `paragraph | heading` - Paragraph OR heading
- `(paragraph | heading)+` - One or more paragraphs or headings

## License

MIT
