# Decorators Example

Learn how to use decorators to add temporary UI elements.

<div class="editor-demo"></div>

## Adding a Decorator

```typescript
import { EditorViewDOM } from '@barocss/editor-view-dom'

const editorView = new EditorViewDOM(container, { editor })

// Add inline decorator
editorView.addDecorator({
  type: 'highlight',
  category: 'inline',
  range: { start: 0, end: 5 },
  data: { color: 'yellow' }
})

// Add block decorator
editorView.addDecorator({
  type: 'border',
  category: 'block',
  nodeId: 'node-123',
  data: { style: 'dashed' }
})
```

See the [Decorator Guide](../guides/decorator-guide.md) for more details.
