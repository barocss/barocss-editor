# Decorator Usage Guide

## Overview

Decorators are temporary UI states at the EditorModel level, used to add visual effects or metadata to documents. Decorators support an **opt-in type system**, allowing use without type definitions, but you can define types when needed to enable validation and default value application.

## Quick Start

### 1. Basic Setup

```typescript
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { defineDecorator, element, text } from '@barocss/dsl';

// Initialize editor
const container = document.getElementById('editor');
const editor = new Editor({ dataStore: new DataStore() });
const view = new EditorViewDOM(editor, { 
  container,
  autoRender: false
});
```

### 2. Create Your First Decorator

```typescript
// 1. Define template (optional)
defineDecorator('my-comment', element('div', {
  className: 'my-comment',
  style: {
    position: 'absolute',
    backgroundColor: '#e3f2fd',
    border: '1px solid #2196f3',
    borderRadius: '4px',
    padding: '8px',
    cursor: 'pointer'
  },
  onClick: (e: MouseEvent) => {
    console.log('Comment clicked!');
  }
}, [text('💬 Comment')]));

// 2. Add decorator
view.addDecorator({
  sid: 'comment-1',
  stype: 'my-comment',
  category: 'layer',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 5
  },
  data: { content: 'This is a comment' }
});

// 3. Render
view.render();
```

## Basic Usage

### Using Without Type Definition (Quick Prototyping)

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
- Can be used immediately without type definition
- Only basic field validation (sid, category, stype required)
- No data schema validation
- No default value application

### Using With Type Definition (Production)

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
- Data schema validation
- Automatic default value application
- Type safety
- Errors on invalid data

## Decorator Categories

### Inline Decorator

Decorators applied to text ranges. Inserted within text.

```typescript
view.addDecorator({
  sid: 'd1',
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

**Features:**
- Rendered as `span` tag within text
- Flows with text
- Supports event handlers

### Block Decorator

Decorators applied to block nodes. Inserted at block level.

```typescript
view.addDecorator({
  sid: 'd2',
  stype: 'quote',
  category: 'block',
  target: {
    sid: 'paragraph-1'
  },
  data: { author: 'Author Name' }
});
```

**Features:**
- Rendered as `div` tag at block level
- Inserted at `before` or `after` position
- Supports event handlers

### Layer Decorator

Decorators overlaid on layers. Displayed at absolute positions above the document.

**Features:**
- **Overlay form**: works with `position: absolute`
- **target is optional**: overlays like cursor and selection can specify position with only `data.position` without target
- **Container**: rendered in `layers.decorator` layer (overlay covering entire container)

```typescript
// Overlay like cursor or selection (target not needed)
view.addDecorator({
  sid: 'cursor-1',
  stype: 'cursor',
  category: 'layer',
  // target is optional: works as overlay
  data: {
    position: {
      top: 10,
      left: 50,
      width: 2,
      height: 18
    },
    color: '#0066cc'
  }
});

// Comment associated with specific node (target can be used)
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

**Features:**
- Positioned absolutely
- Independent of document structure
- Managed with z-index layers
- Supports event handlers

## Template Definition

### Basic Template

```typescript
import { defineDecorator, element, text, slot } from '@barocss/dsl';

// Comment indicator
defineDecorator('comment', element('div', {
  className: 'barocss-comment-indicator',
  style: {
    position: 'absolute',
    width: '20px',
    height: '20px',
    backgroundColor: 'rgba(33,150,243,0.9)',
    border: '2px solid white',
    borderRadius: '50%',
    cursor: 'pointer',
    zIndex: '1000'
  },
  onClick: (e: MouseEvent) => {
    showCommentPopup(e);
  }
}, [text('💬')]));

// Highlight
defineDecorator('highlight', element('span', {
  className: 'barocss-highlight',
  style: {
    backgroundColor: 'rgba(255, 213, 79, 0.22)',
    border: '1px solid rgba(255, 193, 7, 0.45)',
    borderRadius: '4px'
  }
}, [slot('text')]));  // Target text is inserted here
```

### Event Handling

```typescript
defineDecorator('interactive-widget', element('div', {
  className: 'barocss-interactive-widget',
  style: { /* styles */ },
  
  // Mouse events
  onMouseEnter: (e: MouseEvent) => {
    console.log('Mouse entered');
  },
  onClick: (e: MouseEvent) => {
    console.log('Clicked');
    e.stopPropagation();
  },
  
  // Keyboard events
  onKeyDown: (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      console.log('Enter pressed');
    }
  }
}, [text('Widget')]));
```

## Type Definition

### Basic Structure

```typescript
view.defineDecoratorType(
  type: string,                    // type name (e.g., 'highlight')
  category: 'layer' | 'inline' | 'block',  // category
  schema: {
    description?: string;          // type description (optional)
    dataSchema?: {                 // data schema (optional)
      [fieldName: string]: {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        required?: boolean;         // required field
        default?: any;              // default value
      };
    };
  }
);
```

### Example: Complex Type Definition

```typescript
view.defineDecoratorType('comment', 'layer', {
  description: 'Comment decorator for collaborative editing',
  dataSchema: {
    text: {
      type: 'string',
      required: true  // required field
    },
    author: {
      type: 'string',
      default: 'Anonymous'
    },
    timestamp: {
      type: 'number',
      default: () => Date.now()  // dynamic default via function
    },
    position: {
      type: 'object',
      default: { x: 0, y: 0 }
    },
    resolved: {
      type: 'boolean',
      default: false
    }
  }
});
```

## Decorator Management

### Add

```typescript
view.addDecorator({
  sid: 'd1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 't1', startOffset: 0, endOffset: 5 },
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

## Collaborative Environment

### Remote Decorator Management

Manages decorators from other users or AI agents.

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

### Channel Separation

Decorators are managed in a separate channel, same as Selection:

- **DocumentModel changes**: OT/CRDT channel (heavy data)
- **Decorator changes**: Presence/Session channel (lightweight data, real-time sync)

For details, see [Decorator Integration Guide](./decorator-integration.md).

## Real Usage Scenarios

### Scenario 1: Quick Prototyping

```typescript
// Use immediately without type definition
view.addDecorator({
  sid: 'temp-1',
  stype: 'quick-highlight',
  category: 'inline',
  target: { sid: 't1', startOffset: 0, endOffset: 10 },
  data: { color: 'yellow' }
});
```

### Scenario 2: Production Environment

```typescript
// Define all types at app initialization
view.defineDecoratorType('highlight', 'inline', {
  dataSchema: {
    color: { type: 'string', default: 'yellow' },
    opacity: { type: 'number', default: 0.3 }
  }
});

view.defineDecoratorType('comment', 'layer', {
  dataSchema: {
    text: { type: 'string', required: true },
    author: { type: 'string', default: 'Anonymous' }
  }
});

// Use safely at runtime
view.addDecorator({
  sid: 'prod-1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 't1', startOffset: 0, endOffset: 10 },
  data: { color: 'red' }  // opacity applies default value
});
```

### Scenario 3: Plugin System

```typescript
// Plugin defines its own decorator types
class MyPlugin {
  initialize(view: EditorViewDOM) {
    view.defineDecoratorType('plugin-widget', 'block', {
      description: 'Plugin widget decorator',
      dataSchema: {
        widgetId: { type: 'string', required: true },
        config: { type: 'object', default: {} }
      }
    });
  }
  
  addWidget(view: EditorViewDOM, targetSid: string) {
    view.addDecorator({
      sid: `widget-${Date.now()}`,
      stype: 'plugin-widget',
      category: 'block',
      target: { sid: targetSid },
      data: {
        widgetId: 'widget-123',
        config: { theme: 'dark' }
      }
    });
  }
}
```

## Validation Behavior Comparison

| Situation | Basic Field Validation | Data Schema Validation | Default Value Application |
|-----------|----------------------|----------------------|-------------------------|
| No type definition | ✅ Performed | ❌ None | ❌ None |
| Type definition exists | ✅ Performed | ✅ Performed | ✅ Performed |

## Notes

1. **Define types at app initialization (recommended)**
   - Types can be defined at runtime, but defining at initialization is better for consistency.

2. **Type definition is optional**
   - You don't need to define all decorator types.
   - Define only the types you need.

3. **Defaults can be dynamically generated via functions**
   ```typescript
   dataSchema: {
     timestamp: {
       type: 'number',
       default: () => Date.now()  // new value each time
     }
   }
   ```

4. **Automatic rendering**
   - `render()` is automatically called when `addDecorator()`, `updateDecorator()`, or `removeDecorator()` is called.

## Related Documentation

- [Decorator Architecture](./decorator-architecture.md) - system architecture and design principles
- [Decorator Integration Guide](./decorator-integration.md) - AI integration and collaborative environments
- [Pattern & Custom Decorator Examples](./decorator-pattern-and-custom-examples.md) - detailed examples for Pattern and Custom Decorators
