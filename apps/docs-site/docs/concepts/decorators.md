# Decorators

Decorators are temporary UI elements that don't affect the document model. They're a **core feature of Editor View DOM** (not an extension) and are used for visual feedback, highlights, comments, and other temporary overlays.

## What are Decorators?

Decorators are visual overlays that can be added to your document **without modifying the underlying model**. They're perfect for:

- **Highlights**: Highlight search results or selected text
- **Comments**: Add comment indicators and annotations
- **Selection Indicators**: Show selection state visually
- **Temporary Annotations**: Visual feedback that doesn't persist
- **Pattern Matching**: Auto-detect and highlight patterns (URLs, emails, etc.)

## Why Decorators are in Editor-View-DOM

Decorators are implemented in `editor-view-dom` (not `editor-core`) because:

### 1. **View Layer Responsibility**

Decorators are **presentation concerns**, not business logic:

```
Model (DataStore)
    ↓
Editor Core (Commands, Selection)
    ↓
Editor View DOM (Rendering + Decorators) ← Decorators live here
    ↓
DOM (Visual Representation)
```

**Separation of concerns:**
- **Model**: Document data (persistent, schema-validated)
- **Editor Core**: Commands, selection, keybindings (business logic)
- **View DOM**: Rendering, decorators (presentation)

### 2. **Not Part of Model**

Decorators don't affect the document model:

```typescript
// ✅ Model: Persistent data
const node = {
  sid: 'text-1',
  stype: 'inline-text',
  text: 'Hello World',
  marks: [{ type: 'bold', range: [0, 5] }]  // Part of model
};

// ✅ Decorator: Temporary UI
view.addDecorator({
  sid: 'highlight-1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 'text-1', startOffset: 0, endOffset: 5 },
  data: { color: 'yellow' }  // Not in model, only visual
});
```

**Key differences:**
- **Model (Marks)**: Stored in DataStore, persisted, schema-validated, undoable
- **Decorators**: Stored in View, temporary, not persisted, not undoable

### 3. **Rendering Integration**

Decorators are tightly integrated with rendering:

```typescript
// Decorators are passed to renderer during rendering
view.render(modelData, decorators);

// Renderer applies decorators during VNode building
const vnode = renderer.build(model, decorators);
```

Since rendering happens in the view layer, decorators belong there too.

### 4. **Independent Lifecycle**

Decorators have their own lifecycle separate from model:

```typescript
// Model changes → triggers re-render
editor.executeCommand('insertText', { text: 'Hello' });
// → Model updated
// → View detects change
// → View re-renders with decorators

// Decorator changes → only re-render (no model change)
view.addDecorator({ /* ... */ });
// → Decorator added
// → View re-renders (model unchanged)
```

## Decorator Categories

Decorators come in three categories based on how they're rendered:

### Inline Decorators

Applied to text ranges, inserted within text flow:

```typescript
view.addDecorator({
  sid: 'highlight-1',
  stype: 'highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 10
  },
  data: { color: 'yellow' }
});
```

**Rendered as:** `<span>` tags within text  
**Use cases:** Highlights, inline comments, text decorations

### Block Decorators

Applied to block nodes, inserted at block level:

```typescript
view.addDecorator({
  sid: 'comment-1',
  stype: 'comment',
  category: 'block',
  target: {
    sid: 'paragraph-1'
  },
  data: { author: 'John', text: 'Great paragraph!' }
});
```

**Rendered as:** `<div>` tags at block level  
**Use cases:** Block comments, annotations, widgets

### Layer Decorators

Overlaid on separate layers, positioned absolutely:

```typescript
// Overlay decorator (no target needed)
view.addDecorator({
  sid: 'cursor-1',
  stype: 'cursor',
  category: 'layer',
  data: {
    position: { top: 10, left: 50, width: 2, height: 18 },
    color: '#0066cc'
  }
});

// Comment associated with node (target can be used)
view.addDecorator({
  sid: 'comment-1',
  stype: 'comment',
  category: 'layer',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 10
  },
  data: {
    text: 'This is a comment',
    position: { x: 100, y: 50 }
  }
});
```

**Rendered as:** Absolute positioned elements in separate layers  
**Use cases:** Cursors, selection indicators, floating comments, tooltips

## Quick Start

### 1. Basic Setup

```typescript
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { defineDecorator, element, data } from '@barocss/dsl';

// Initialize editor and view
const container = document.getElementById('editor');
const editor = new Editor({ dataStore, schema, extensions: [...] });
const view = new EditorViewDOM(editor, container);
// View automatically sets up and renders
```

### 2. Define Decorator Template

```typescript
// Define template using DSL
defineDecorator('highlight', element('span', {
  className: 'highlight',
  style: {
    backgroundColor: (model) => model.data?.color || 'yellow',
    padding: '2px 0'
  }
}, [data('text')]));
```

### 3. Add Decorator

```typescript
// Add decorator
view.addDecorator({
  sid: 'highlight-1',
  stype: 'highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 10
  },
  data: { color: 'yellow' }
});

// Render is automatically triggered
```

## Type System (Optional)

Decorators support an **opt-in type system**. You can use decorators without type definitions, or define types for validation and defaults.

### Without Type Definition (Quick Prototyping)

```typescript
// Can be used immediately without type definition
view.addDecorator({
  sid: 'd1',
  stype: 'highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 10
  },
  data: {
    color: 'yellow',
    opacity: 0.5
  }
});
```

**Features:**
- ✅ Immediate use
- ✅ Basic field validation (sid, category, stype required)
- ❌ No data schema validation
- ❌ No default value application

### With Type Definition (Production)

```typescript
// 1. Define type at app initialization
view.defineDecoratorType('highlight', 'inline', {
  description: 'Highlight decorator',
  dataSchema: {
    color: { type: 'string', default: 'yellow' },
    opacity: { type: 'number', default: 0.3 }
  }
});

// 2. Add instance at runtime
view.addDecorator({
  sid: 'd1',
  stype: 'highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 10
  },
  data: {
    color: 'red'  // opacity automatically applies default value 0.3
  }
});
```

**Features:**
- ✅ Data schema validation
- ✅ Automatic default value application
- ✅ Type safety
- ✅ Errors on invalid data

## Decorator Management

### Add

```typescript
view.addDecorator({
  sid: 'd1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 'text-1', startOffset: 0, endOffset: 5 },
  data: { color: 'yellow' }
});
// render() is automatically called
```

### Update

```typescript
view.updateDecorator('d1', {
  data: { color: 'red' }
});
// render() is automatically called
```

### Remove

```typescript
view.removeDecorator('d1');
// render() is automatically called
```

### Query

```typescript
// Get all decorators
const allDecorators = view.decoratorManager.getAll();

// Get specific decorator
const decorator = view.decoratorManager.get('d1');

// Get decorators for specific node
const nodeDecorators = view.decoratorManager.getByTarget('text-1');
```

## Pattern Decorators

Pattern decorators automatically detect and highlight patterns in text (URLs, emails, hashtags, etc.):

```typescript
// Add pattern decorator configuration
view.addDecorator({
  sid: 'hex-color',
  stype: 'color-picker',
  category: 'inline',
  decoratorType: 'pattern',
  target: { sid: '' }, // Pattern decorator has no target
  data: {
    pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
    extractData: (match) => ({ color: match[0] }),
    createDecorator: (nodeId, start, end, data) => ({
      sid: `pattern-hex-${nodeId}-${start}-${end}`,
      target: { sid: nodeId, startOffset: start, endOffset: end },
      data: { color: data.color }
    }),
    priority: 10
  }
});
```

**How it works:**
1. Pattern is matched against all text nodes
2. Matches are converted to decorators
3. Decorators are rendered automatically
4. Updates when text changes

## Function-Based Decorators

Function-based decorators use generators to create decorators dynamically:

```typescript
const generator: DecoratorGenerator = {
  sid: 'spell-check',
  generate: (model, context) => {
    // Analyze model and generate decorators
    const decorators: Decorator[] = [];
    
    // Find spelling errors
    const textNode = model;
    if (textNode.text) {
      const errors = spellCheck(textNode.text);
      errors.forEach(error => {
        decorators.push({
          sid: `spell-${textNode.sid}-${error.start}`,
          stype: 'spell-error',
          category: 'inline',
          target: {
            sid: textNode.sid,
            startOffset: error.start,
            endOffset: error.end
          },
          data: { suggestion: error.suggestion }
        });
      });
    }
    
    return decorators;
  }
};

view.addDecorator(generator);
```

## Remote Decorators (Collaboration)

For collaborative editing, decorators from other users are managed separately:

```typescript
// Add remote decorator
view.remoteDecoratorManager.setRemoteDecorator(
  {
    sid: 'remote-1',
    stype: 'highlight',
    category: 'inline',
    target: { sid: 't1', startOffset: 0, endOffset: 5 },
    data: { color: 'blue' }
  },
  { userId: 'user-2', sessionId: 'session-2' }
);

// Remove decorators by specific user
view.remoteDecoratorManager.removeByOwner('user-2');

// Get all remote decorators
const remoteDecorators = view.remoteDecoratorManager.getAll();
```

**Channel separation:**
- **Document Model changes**: OT/CRDT channel (heavy data)
- **Decorator changes**: Presence/Session channel (lightweight data, real-time sync)

## Complete Example

Here's a complete example showing decorators in action:

```typescript
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { defineDecorator, element, data } from '@barocss/dsl';

// 1. Define decorator template
defineDecorator('comment', element('div', {
  className: 'comment',
  style: {
    position: 'absolute',
    backgroundColor: '#e3f2fd',
    border: '1px solid #2196f3',
    borderRadius: '4px',
    padding: '8px',
    cursor: 'pointer'
  },
  onClick: (e: MouseEvent) => {
    showCommentPopup(e);
  }
}, [data('text')]));

// 2. Define type (optional)
view.defineDecoratorType('comment', 'layer', {
  description: 'Comment decorator',
  dataSchema: {
    text: { type: 'string', required: true },
    author: { type: 'string', default: 'Anonymous' },
    timestamp: { type: 'number', default: () => Date.now() }
  }
});

// 3. Add decorator
view.addDecorator({
  sid: 'comment-1',
  stype: 'comment',
  category: 'layer',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 5
  },
  data: {
    text: 'This is a comment',
    author: 'John Doe'
  }
});

// 4. Decorator is automatically rendered
// No need to call render() - it's automatic
```

## Decorator vs Mark

Understanding when to use decorators vs marks:

| Feature | Decorator | Mark |
|---------|-----------|------|
| **Location** | View layer (`editor-view-dom`) | Model layer (DataStore) |
| **Persistence** | Temporary (not persisted) | Persistent (stored in model) |
| **Undo/Redo** | Not undoable | Undoable |
| **Schema** | Optional type system | Required in schema |
| **Use Cases** | Comments, highlights, UI feedback | Bold, italic, links (formatting) |
| **Collaboration** | Presence channel (lightweight) | OT/CRDT channel (heavy) |

**When to use Decorator:**
- Temporary visual feedback
- Comments and annotations
- Search highlights
- UI indicators

**When to use Mark:**
- Text formatting (bold, italic, etc.)
- Links and other persistent formatting
- Data that should be persisted

## Best Practices

### 1. Use Decorators for Temporary UI

```typescript
// ✅ Good: Use decorator for temporary highlight
view.addDecorator({
  stype: 'search-highlight',
  category: 'inline',
  target: { sid: 'text-1', startOffset: 0, endOffset: 5 },
  data: { color: 'yellow' }
});

// ❌ Bad: Don't use mark for temporary UI
// Marks are for persistent formatting
```

### 2. Define Types for Production

```typescript
// ✅ Good: Define types for validation
view.defineDecoratorType('comment', 'layer', {
  dataSchema: {
    text: { type: 'string', required: true }
  }
});

// ❌ Bad: Skip type definition in production
// Leads to runtime errors
```

### 3. Clean Up Decorators

```typescript
// Remove decorators when no longer needed
view.removeDecorator('highlight-1');

// Or remove all decorators of a type
const decorators = view.decoratorManager.getByType('highlight');
decorators.forEach(d => view.removeDecorator(d.sid));
```

### 4. Use Appropriate Categories

```typescript
// ✅ Inline: For text decorations
view.addDecorator({ category: 'inline', /* ... */ });

// ✅ Block: For block-level annotations
view.addDecorator({ category: 'block', /* ... */ });

// ✅ Layer: For overlays and floating UI
view.addDecorator({ category: 'layer', /* ... */ });
```

## Related

- [Core Concepts: Editor View DOM](./editor-view-dom) - View layer concepts
- [Architecture: Editor View DOM](../architecture/editor-view-dom) - View layer details
- [Extension Design Guide](../guides/extension-design) - Extensions can use decorators
- [Examples: Decorators](../examples/decorators) - More examples
