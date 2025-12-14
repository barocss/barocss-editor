# Quick Start

Get up and running with Barocss Editor in minutes. This guide shows you the minimal setup to create a working editor.

## Installation

Install the core packages:

```bash
pnpm add @barocss/editor-core @barocss/editor-view-dom @barocss/schema @barocss/datastore @barocss/dsl @barocss/renderer-dom
```

## Create Your First Editor

Here's a complete example that creates a basic editor:

```typescript
import { createSchema } from '@barocss/schema';
import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { define, element, data, slot } from '@barocss/dsl';
import { createCoreExtensions } from '@barocss/extensions';

// 1. Define schema - describes your document structure
const schema = createSchema('my-doc', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  }
});

// 2. Define templates - how nodes are rendered
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', { className: 'text' }, [data('text', '')]));

// 3. Create data store - manages document data
const dataStore = new DataStore(undefined, schema);

// 4. Create editor - core editor logic
const editor = new Editor({
  dataStore,
  schema,
  extensions: createCoreExtensions()
});

// 5. Create view - connects editor to DOM
const container = document.getElementById('editor');
const view = new EditorViewDOM(editor, container);
view.mount();
```

That's it! You now have a working editor. Try typing in the editor container.

## What's Next?

- **[Basic Usage](basic-usage)** - Learn the step-by-step process in detail
- **[Core Concepts](../concepts/schema-and-model)** - Understand schema and model
- **[Architecture](../architecture/overview)** - Learn how everything fits together
