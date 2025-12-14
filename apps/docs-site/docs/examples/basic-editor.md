# Basic Editor Example

A simple editor with paragraph and text formatting. This is the most basic example showing the minimal setup required.

## Demo

import EditorDemo from '@site/src/components/EditorDemo';

<EditorDemo />

## Complete Code

```typescript
import { createSchema } from '@barocss/schema';
import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { define, element, data, slot } from '@barocss/dsl';
import { createCoreExtensions } from '@barocss/extensions';

// 1. Define schema
const schema = createSchema('basic-schema', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  }
});

// 2. Define templates
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', { className: 'text' }, [data('text', '')]));

// 3. Create data store
const dataStore = new DataStore(undefined, schema);

// 4. Create editor
const editor = new Editor({
  dataStore,
  schema,
  extensions: createCoreExtensions()
});

// 5. Create view
const container = document.getElementById('editor');
const view = new EditorViewDOM(editor, container);
view.mount();
```

## What This Example Shows

- **Minimal Setup**: The absolute minimum code needed for a working editor
- **Schema Definition**: Basic document structure with paragraph and text nodes
- **Template Definition**: Simple templates for rendering nodes
- **Editor Creation**: Complete editor setup with core extensions

## Next Steps

- **[Custom Extensions](./custom-extensions)** - Add custom commands and features
- **[Decorators](./decorators)** - Add temporary UI elements
- **[Extension Design](../guides/extension-design)** - Learn how to create extensions
