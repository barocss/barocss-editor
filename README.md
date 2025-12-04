# Barocss Editor

Zero Editor - A powerful document editor with DSL-based rendering

## 📦 Packages

- `@barocss/schema` - Schema DSL for defining document structure and validation rules
- `@barocss/model` - Model Data for storing and managing document data with type safety
- `@barocss/renderer-dom` - Renderer DSL for declarative DOM rendering
- `@barocss/renderer-react` - React DSL for React-based rendering with hooks and context
- `@barocss/editor-core` - Core editor logic that orchestrates schema, model, and renderers

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development server for test app
pnpm --filter @barocss/test-app dev
```

### Development

```bash
# Build all packages in watch mode
pnpm dev

# Type check all packages
pnpm type-check

# Lint all packages
pnpm lint

# Clean all build artifacts
pnpm clean
```

## 📚 Usage

### Absolute-based Operation Payloads

- Single position: `pos`
- Range: `start`, `end`
- Move: `from`, `to`

Examples:

```ts
import { applyOperation } from '@barocss/model';
import '@barocss/model/operations/text.insert';

// Insert at absolute position
applyOperation('text.insert', { pos: 42, text: ' Hello' }, ctx);

// Replace range
applyOperation('text.replaceSelection', { start: 10, end: 25, text: 'MID' }, ctx);

// Move node before another
applyOperation('node.moveBefore', { from: 300, to: 280 }, ctx);
```

### Basic Schema Definition

```typescript
import { schema } from '@barocss/schema';

const paragraphSchema = schema('paragraph', {
  attributes: {
    align: {
      type: 'string',
      default: 'left',
      validator: (value) => ['left', 'center', 'right', 'justify'].includes(value)
    }
  },
  content: 'inline*',
  group: 'block'
});
```

### Model Data Creation

```typescript
import { createDocument, NodeFactory } from '@barocss/model';

const document = createDocument([
  NodeFactory.createParagraphNode([
    NodeFactory.createTextNode('Hello, World!', { bold: true })
  ])
], paragraphSchema);
```

### DOM Renderer Definition

```typescript
import { renderer, element, data, slot, on } from '@barocss/renderer-dom';

const textRenderer = renderer('text',
  element('span', 
    { 
      className: 'text-node',
      style: (data) => ({
        fontWeight: data.attributes.bold ? 'bold' : 'normal'
      })
    }, 
    [data('text')],
    [on('click', (element, event, data) => {
      console.log('Text clicked:', data.sid);
    })]
  )
);
```

### React Renderer Definition

```typescript
import { rendererReact } from '@barocss/renderer-react';

const TextRenderer: React.FC<TextNodeProps> = ({ data, isSelected }) => {
  return (
    <span 
      className={`text-node ${isSelected ? 'selected' : ''}`}
      style={{ fontWeight: data.attributes.bold ? 'bold' : 'normal' }}
    >
      {data.text}
    </span>
  );
};

const textRenderer = rendererReact('text', TextRenderer);
```

### Editor Core Usage

```typescript
import { ZeroEditor } from '@barocss/editor-core';

const editor = new ZeroEditor({
  theme: 'light',
  readOnly: false,
  onContentChange: (document) => {
    console.log('Document changed:', document);
  }
});

// Register schemas and renderers
editor.registerSchema(paragraphSchema);
editor.registerDOMRenderer('text', textRenderer);

// Load document
editor.loadDocument(document);

// Get API
const api = editor.getAPI();
api.executeCommand('insertText', 'New text');
```

## 🏗️ Architecture

The editor is built with a modular architecture:

1. **Schema DSL** - Defines document structure and validation rules
2. **Model Data** - Manages document data with type safety
3. **Renderer DSL** - Declarative DOM rendering
4. **React DSL** - React-based rendering with hooks
5. **Editor Core** - Orchestrates all components

## 🔍 Validation System

Barocss uses a robust validation system with structured error codes for reliable testing and error handling.

### Validator Class

The `Validator` class from `@barocss/schema` provides comprehensive validation:

```typescript
import { Validator, VALIDATION_ERRORS } from '@barocss/schema';

// Structural validation
const result = Validator.validateNodeStructure(node);
if (!result.valid) {
  console.log('Errors:', result.errors);
  console.log('Error codes:', result.errorCodes);
}

// Schema-based validation
const schemaResult = Validator.validateNode(schema, node);
```

### Error Code System

Instead of fragile string matching, use structured error codes:

```typescript
// ❌ Fragile - breaks when error messages change
expect(result.errors.some(err => err.includes('Content is required'))).toBe(true);

// ✅ Robust - stable error codes
expect(result.errorCodes).toContain(VALIDATION_ERRORS.CONTENT_REQUIRED_BUT_EMPTY);
```

### Available Error Codes

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

### Benefits

- **Stability**: Tests don't break when error messages change
- **Clarity**: Clear error type identification
- **Maintainability**: Easy to manage error types
- **Extensibility**: Simple to add new error types

## 📝 Development

### Project Structure

```
barocss-editor/
├── packages/
│   ├── schema/          # Schema DSL package
│   ├── model/           # Model Data package
│   ├── renderer-dom/    # DOM Renderer package
│   ├── renderer-react/  # React Renderer package
│   └── editor-core/     # Core Editor package
├── app/
│   └── test-app/        # Test application
└── paper/               # Documentation
```

### Building

Each package is built independently using Vite:

```bash
# Build specific package
pnpm --filter @barocss/schema build

# Build all packages
pnpm build
```

### Testing

```bash
# Run tests for all packages
pnpm test

# Run tests for specific package
pnpm --filter @barocss/schema test
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For questions and support, please open an issue on GitHub.
