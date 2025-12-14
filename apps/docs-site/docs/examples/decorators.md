# Decorators Example

This example demonstrates how to use decorators to add temporary UI elements like highlights, comments, and selection indicators.

## Demo

import EditorDemo from '@site/src/components/EditorDemo';

<EditorDemo />

## Basic Decorator Usage

Decorators are temporary UI elements that don't affect the document model. Here's how to add them:

```typescript
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { defineDecorator, element } from '@barocss/dsl';

// 1. Define decorator template (optional, can use default)
defineDecorator('highlight', element('span', {
  className: 'highlight',
  style: {
    backgroundColor: '#ffff00',
    padding: '2px 4px'
  }
}, []));

// 2. Add decorator to view
const view = new EditorViewDOM(editor, container);
view.mount();

// Add highlight decorator
view.addDecorator({
  sid: 'highlight-1',
  stype: 'highlight',
  category: 'inline',
  target: {
    nodeId: 'text-1',
    range: [0, 5]  // Highlight first 5 characters
  }
});

// Add comment decorator
view.addDecorator({
  sid: 'comment-1',
  stype: 'comment',
  category: 'layer',
  target: {
    nodeId: 'paragraph-1'
  },
  attrs: {
    position: 'absolute',
    top: '10px',
    right: '10px'
  }
});
```

## What This Example Shows

- **Decorator Definition**: How to define decorator templates
- **Adding Decorators**: Adding inline and layer decorators
- **Target Specification**: Targeting specific nodes or ranges
- **Temporary UI**: Decorators don't affect the document model

## Common Use Cases

- **Highlights**: Highlight selected text or search results
- **Comments**: Add comment indicators
- **Selection Indicators**: Show selection state
- **Temporary Annotations**: Add temporary visual feedback

## Next Steps

- **[Core Concepts: Decorators](../concepts/decorators)** - Complete guide on decorators
- **[Custom Extensions](./custom-extensions)** - Learn about extensions
- **[Architecture: Renderer-DOM](../architecture/renderer-dom)** - Understand rendering
