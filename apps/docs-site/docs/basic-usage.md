# Basic Usage

This guide walks you through creating a basic editor step by step, explaining each component and why it's needed.

## Overview

Creating an editor involves five main steps:
1. **Define Schema** - Describe your document structure
2. **Define Templates** - Specify how nodes are rendered
3. **Create DataStore** - Set up data management
4. **Create Editor** - Initialize the editor with extensions
5. **Create View** - Connect the editor to the DOM

## Step-by-Step Guide

### 1. Define Schema

The schema defines what types of nodes and marks are allowed in your document.

```typescript
import { createSchema } from '@barocss/schema';

const schema = createSchema('my-doc', {
  topNode: 'document',
  nodes: {
    document: { 
      name: 'document', 
      group: 'document', 
      content: 'block+'  // Document must contain one or more block nodes
    },
    paragraph: { 
      name: 'paragraph', 
      group: 'block', 
      content: 'inline*'  // Paragraph can contain zero or more inline nodes
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
    }
  }
});
```

**Why?** The schema ensures all document operations are valid and type-safe. Learn more in [Schema & Model](../concepts/schema-and-model).

### 2. Define Templates

Templates define how your model data is rendered to the DOM using DSL builders.

```typescript
import { define, element, data, slot } from '@barocss/dsl';

// Paragraph template - renders as <p> with child content
define('paragraph', element('p', {
  className: 'paragraph'
}, [
  slot('content')  // Renders child nodes here
]));

// Text template - renders as <span> with text content
define('inline-text', element('span', {
  className: 'text'
}, [
  data('text', '')  // Binds model.text to the span content
]));
```

**Why?** Templates separate data (model) from presentation (DOM). Learn more in [DSL Templates](../concepts/dsl-templates).

### 3. Create DataStore

The DataStore manages your document data with transactional updates.

```typescript
import { DataStore } from '@barocss/datastore';

const dataStore = new DataStore(undefined, schema);
```

**Why?** DataStore provides schema-aware storage, transactions, and undo/redo. Learn more in [Schema & Model](../concepts/schema-and-model).

### 4. Create Editor

The Editor orchestrates commands, keybindings, and extensions.

```typescript
import { Editor } from '@barocss/editor-core';
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({
  dataStore,
  schema,
  extensions: createCoreExtensions()  // Adds basic editing commands
});
```

**Why?** The Editor coordinates all operations and manages the editor state. Learn more in [Architecture: Editor-Core](../architecture/editor-core).

### 5. Create View

The View connects the editor to the DOM and handles user input.

```typescript
import { EditorViewDOM } from '@barocss/editor-view-dom';

const container = document.getElementById('editor');
const view = new EditorViewDOM(editor, container);
view.mount();
```

**Why?** The View synchronizes selection, handles input, and triggers rendering. Learn more in [Architecture: Editor-View-DOM](../architecture/editor-view-dom).

## Complete Example

Here's the complete code:

```typescript
import { createSchema } from '@barocss/schema';
import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { define, element, data, slot } from '@barocss/dsl';
import { createCoreExtensions } from '@barocss/extensions';

// Schema
const schema = createSchema('my-doc', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  }
});

// Templates
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', { className: 'text' }, [data('text', '')]));

// DataStore
const dataStore = new DataStore(undefined, schema);

// Editor
const editor = new Editor({
  dataStore,
  schema,
  extensions: createCoreExtensions()
});

// View
const container = document.getElementById('editor');
const view = new EditorViewDOM(editor, container);
view.mount();
```

## Next Steps

- **[Core Concepts](../concepts/schema-and-model)** - Deep dive into schema and model
- **[Architecture](../architecture/overview)** - Understand the complete architecture
- **[Extending](../guides/extension-design)** - Learn how to add custom features
