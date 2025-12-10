# editor-view-dom and renderer-dom Integration Specification

## Overview

`editor-view-dom` uses `renderer-dom` to render documents to DOM. This document details the integration method and data flow between the two packages.

**Core Principles**:
- All data uses `sid`, `stype` format (no conversion needed)
- Templates registered externally via `define()`
- Automatic re-rendering on Component State changes
- Manual re-rendering required for Decorator changes

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    EditorViewDOM                             │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Editor (editor-core)                              │    │
│  │  - getDocumentProxy() → Proxy<INode> (recommended) │    │
│  │  - exportDocument() → INode                        │    │
│  │  - dataStore.getAllDecorators() → Decorator[]      │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Data Processing Layer                            │    │
│  │  - ModelData format: use directly without conversion│    │
│  │  - convertToDecoratorData()                       │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  renderer-dom Integration                          │    │
│  │  - DOMRenderer                                     │    │
│  │  - RendererRegistry                                │    │
│  │  - ComponentManager (subscribe to changeState event)│    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Layer System (5 layers)                           │    │
│  │  - content (contentEditable)                       │    │
│  │  - decorator, selection, context, custom          │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Rendering Request

```typescript
// EditorViewDOM.render() call
view.render(modelData);  // use if modelData provided
// or
view.render();  // use editor.getDocumentProxy() (lazy evaluation)
```

### 2. Data Format

**Important**: All data already uses `sid`, `stype` format.

```
ModelData format (use directly without conversion)
    │
    ├─ stype (required) - node type
    ├─ sid (required) - node identifier (required for individual component management)
    ├─ content (ModelData[]) - child node array
    ├─ text - text content
    ├─ marks (Array<{ type, range: [number, number] }>) - text marks
    ├─ attributes - node attributes (merged and located at model top level)
    └─ other properties
```

**Data Flow**:

```
editor.getDocumentProxy() or externally passed model
    │
    ├─ DataStoreExporter.toProxy() (lazy evaluation)
    │  └─ Wrap INode as Proxy
    │  └─ If content array is IDs, convert to actual nodes only on access
    │
    ▼
ModelData (use directly without conversion)
    │
    ├─ stype, sid, content, text, marks, attributes, etc.
    │  All fields already in ModelData format
    │
    ▼
Pass directly to renderer-dom
```

**Key Points**:
- **No conversion needed**: All data already uses `sid`, `stype` format, so use directly
- **`sid` is required**: Required for individual component management, must match `stype`
- **`stype` is required**: Required for node type identification
- Using Proxy optimizes initial loading time and memory usage

### 3. Rendering Execution

```typescript
// Call renderer-dom's DOMRenderer.render()
domRenderer.render(
  container: HTMLElement,      // layers.content
  model: ModelData,              // model (use directly without conversion)
  decorators: DecoratorData[]    // decorators
);
```

### 4. DOM Update

```
renderer-dom's Reconciler
    │
    ├─ VNodeBuilder: ModelData → VNode tree
    ├─ Reconciler: VNode tree → DOM diff
    └─ DOMOperations: DOM update
    │
    ▼
layers.content (contentEditable)
    ├─ Identify nodes with data-bc-sid attribute
    ├─ Identify types with data-bc-stype attribute
    └─ sid-based DOM reuse (stability)
```

## Main Components

### 1. EditorViewDOM Class

**Role**: Bridge between editor-core and renderer-dom

**Main Methods**:
- `render(tree?: ModelData)`: Render document (full re-render)
  - Use `editor.getDocumentProxy()` if `tree` not provided
  - Use `tree` directly if provided
- `destroy()`: Clean up resources (event listeners, MutationObserver, Decorators, etc.)

**Internal State**:
- `_rendererRegistry`: RendererRegistry instance (passed from external or newly created)
- `_domRenderer`: DOMRenderer instance (automatic re-render on Component State changes)
- `layers.content`: Rendering target container

**Automatic Re-rendering**:
- When Component State changes, `changeState` event is emitted and automatically triggers full re-render
- `DOMRenderer` subscribes to `changeState` event and performs throttled re-rendering with `queueMicrotask`
- Even when model is same and only state changed, full re-render occurs (renderer-dom's full reconcile)

### 2. Data Processing

#### Data Format

**All data is already in ModelData format**:

```typescript
{
  sid: 'doc-1',           // Node identifier (required) - required for individual component management
  stype: 'document',    // Node type (required)
  content: [...],         // Child node array (recursively ModelData format)
  text: '...',            // Text content (optional)
  marks: [...],           // Text marks (range format)
  attributes: {...},      // Node attributes (merged and located at model top level)
  // All fields in attributes are also accessible at model top level
}
```

#### `EditorViewDOM.render()` Processing Logic

```typescript
if (tree) {
  // Model passed from external - already ModelData format (uses sid, stype)
  // Use directly without conversion
  modelData = tree as ModelData;
} else {
  // Get directly from editor - use getDocumentProxy() (lazy evaluation)
  const exported = this.editor.getDocumentProxy?.();
  if (exported) {
    // INode wrapped as Proxy (already ModelData compatible: uses sid, stype)
    modelData = exported as ModelData;
  }
}
```

**Important**:
- All data already uses `sid`, `stype` format, so **no conversion needed**
- `sid` is **required** - required for individual component management, must match `stype`
- `stype` is **required** - required for node type identification
- All models created in `main.ts` use `sid`, `stype` format

#### `convertToDecoratorData(decorator: any): DecoratorData`

**Conversion Rules**:

```typescript
{
  sid: decorator.sid || decorator.id,
  stype: decorator.stype || decorator.type,
  category: decorator.category || 'inline',
  position: decorator.position, // 'before' | 'after' | 'inside'
  target: {
    sid: decorator.target.sid || decorator.target.nodeId,
    startOffset: decorator.target.startOffset,
    endOffset: decorator.target.endOffset
  },
  data: decorator.data || {}  // Data to pass to template
}
```


## Usage

### Basic Usage

```typescript
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { DataStore } from '@barocss/datastore';

// 1. Create Editor instance
const dataStore = new DataStore();
const editor = new Editor({ dataStore });

// 2. Register templates (before EditorViewDOM creation)
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';

define('document', element('div', { className: 'document' }, [slot('content')]));
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('heading', (props, model) => {
  const level = model.attributes?.level || 1;
  return element(`h${level}`, { className: 'heading' }, [slot('content')]);
});
// ... register all necessary templates

// 3. Create EditorViewDOM instance
const container = document.getElementById('editor');
const view = new EditorViewDOM(editor, {
  container,
  registry: getGlobalRegistry(),  // Use global registry (recommended)
  autoRender: true,  // Default: true - auto render if initialTree provided
  // initialTree: { ... }  // Optional: initial document (auto render if autoRender is true)
});

// 3. Render document
// Method 1: Proxy-based (recommended - lazy evaluation)
view.render();  // use editor.getDocumentProxy()

// Method 2: Pass ModelData directly
view.render({
  sid: 'doc1',
  stype: 'document',
  content: [...]
});
```

### Template Registration

Templates are registered externally via `define()` **before** `EditorViewDOM` creation:

```typescript
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';

// Register templates (before EditorViewDOM creation)
define('document', element('div', { className: 'document' }, [slot('content')]));
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('heading', (props, model) => {
  const level = model.attributes?.level || 1;
  return element(`h${level}`, { className: 'heading' }, [slot('content')]);
});
// ... register all necessary templates

// Use global registry when creating EditorViewDOM
const view = new EditorViewDOM(editor, {
  container,
  registry: getGlobalRegistry()  // Use global registry (recommended)
});
```

**Important**:
- Templates must be registered **before** `EditorViewDOM` creation
- Using `getGlobalRegistry()` automatically shares all templates
- To use custom registry, create with `new RendererRegistry({ global: false })`, register templates, then pass
- `global: false` option: automatically look up templates not in local registry from global registry
- `EditorViewDOM` internally calls `registerDefaultTemplates()` to auto-register default templates (document, paragraph, heading, etc.), but does not overwrite templates already registered externally

### Document Update

```typescript
// Full document update
view.render({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'p1',
      stype: 'paragraph',
      content: [
        { sid: 't1', stype: 'inline-text', text: 'Updated content' }
      ]
    }
  ]
});

// Or get directly from editor (without tree)
view.render();  // use editor.getDocumentProxy()
```

**Important**: 
- `render()` re-renders the entire document
- Performs renderer-dom's full reconcile, optimized with sid-based DOM reuse
- Component State changes automatically trigger re-rendering (no separate call needed)

## Real Usage Examples

### Basic Example

```typescript
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';

// 1. Register templates
define('document', element('div', { className: 'document' }, [slot('content')]));
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', { className: 'text' }, [data('text')]));

// 2. Create Editor and EditorViewDOM
const dataStore = new DataStore();
const editor = new Editor({ dataStore });
const container = document.getElementById('editor');
const view = new EditorViewDOM(editor, {
  container,
  registry: getGlobalRegistry()
});

// 3. Load and render document
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'p1',
      stype: 'paragraph',
      content: [
        { sid: 't1', stype: 'inline-text', text: 'Hello World' }
      ]
    }
  ]
}, 'session1');

view.render();  // Proxy-based rendering
```

### Complex Example Using Component State

```typescript
import { defineState, BaseComponentState } from '@barocss/renderer-dom';
import { define, element, slot, data } from '@barocss/dsl';

// Define Counter component State
class CounterState extends BaseComponentState {
  initState(initial: Record<string, any>): void {
    this.data.count = initial.count || 0;
  }
}

// Define Counter component template
defineState('counter', CounterState);
define('counter', (_props, model, ctx) => {
  // Initialize State (only on first render)
  if (!ctx.getState('count')) {
    const initialCount = model.attributes?.count || 0;
    ctx.initState({ count: Number(initialCount) });
  }
  
  const count = ctx.instance?.get('count') ?? ctx.getState('count') ?? 0;
  
  return element('div', { className: 'counter' }, [
    element('span', { className: 'count' }, [String(count)]),
    element('button', {
      className: 'increment',
      onClick: () => {
        // Change State (triggers automatic re-render)
        ctx.instance?.set({ count: count + 1 });
      }
    }, ['+'])
  ]);
});

// Include Counter component in document
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'counter1',
      stype: 'counter',
      attributes: { count: 5 }
    }
  ]
}, 'session1');

view.render();
// Automatically re-renders when State changes
```

### Example Using Marks and Decorators Together

```typescript
// Register Mark templates
import { defineMark } from '@barocss/dsl';

defineMark('bold', element('strong', {}, [data('text')]));
defineMark('italic', element('em', {}, [data('text')]));
defineMark('link', element('a', { 
  href: (d: any) => d?.attributes?.href || '#',
  target: '_blank'
}, [data('text')]));

// Text with Marks in document
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'p1',
      stype: 'paragraph',
      content: [
        {
          sid: 't1',
          stype: 'inline-text',
          text: 'Hello World',
          marks: [
            { type: 'bold', range: [0, 5] },
            { type: 'link', range: [6, 11], attrs: { href: 'https://example.com' } }
          ]
        }
      ]
    }
  ]
}, 'session1');

// Add Decorator
const dataStore = editor.dataStore;
dataStore.addDecorator({
  sid: 'decorator1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 't1', startOffset: 0, endOffset: 5 },
  data: { color: '#ffff00' }
});

view.render();  // Marks and Decorators rendered together
```

### Dynamic List Update Example

```typescript
import { when, each } from '@barocss/dsl';

// Define list template
define('list', (props, model) => {
  const type = model.attributes?.type || 'bullet';
  return element(type === 'ordered' ? 'ol' : 'ul', {}, [slot('content')]);
});

define('listItem', element('li', {}, [slot('content')]));

// Render dynamic list
let items = [
  { sid: 'item1', stype: 'listItem', content: [{ sid: 't1', stype: 'inline-text', text: 'Item 1' }] },
  { sid: 'item2', stype: 'listItem', content: [{ sid: 't2', stype: 'inline-text', text: 'Item 2' }] }
];

editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'list1',
      stype: 'list',
      attributes: { type: 'bullet' },
      content: items
    }
  ]
}, 'session1');

view.render();

// Add list item
items.push({
  sid: 'item3',
  stype: 'listItem',
  content: [{ sid: 't3', stype: 'inline-text', text: 'Item 3' }]
});

// Update (optimized with sid-based DOM reuse)
view.render({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'list1',
      stype: 'list',
      attributes: { type: 'bullet' },
      content: items
    }
  ]
});
```

### Example Using Portal

```typescript
import { portal } from '@barocss/dsl';

// Define component using Portal
define('tooltip', (props, model, ctx) => {
  const text = model.text || model.attributes?.text || '';
  const targetId = model.attributes?.targetId || 'tooltip-container';
  
  return element('span', { className: 'tooltip-trigger' }, [
    data('text'),
    portal(
      () => document.getElementById(targetId) || document.body,
      element('div', { className: 'tooltip-popup' }, [text])
    )
  ]);
});

// Include Portal component in document
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'p1',
      stype: 'paragraph',
      content: [
        {
          sid: 'tooltip1',
          stype: 'tooltip',
          text: 'Hover me',
          attributes: { targetId: 'tooltip-container' }
        }
      ]
    }
  ]
}, 'session1');

// Create Portal target container
const tooltipContainer = document.createElement('div');
tooltipContainer.id = 'tooltip-container';
document.body.appendChild(tooltipContainer);

view.render();
// Portal content rendered to tooltipContainer
```

### Conditional Rendering (when) Example

```typescript
import { when } from '@barocss/dsl';

// Conditional rendering component
define('conditional', (props, model, ctx) => {
  const show = model.attributes?.show !== false;
  const content = model.content || [];
  
  return when(
    show,
    element('div', { className: 'conditional-content' }, [
      slot('content')
    ]),
    element('div', { className: 'conditional-hidden' }, [])
  );
});

// Include conditional component in document
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'cond1',
      stype: 'conditional',
      attributes: { show: true },
      content: [
        { sid: 'p1', stype: 'paragraph', content: [{ sid: 't1', stype: 'inline-text', text: 'Visible' }] }
      ]
    }
  ]
}, 'session1');

view.render();

// Change condition
view.render({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'cond1',
      stype: 'conditional',
      attributes: { show: false },  // Hidden
      content: [
        { sid: 'p1', stype: 'paragraph', content: [{ sid: 't1', stype: 'inline-text', text: 'Hidden' }] }
      ]
    }
  ]
});
```

### Iterative Rendering (each) Example

```typescript
import { each } from '@barocss/dsl';

// Iterative rendering component
define('itemList', (props, model, ctx) => {
  const items = model.attributes?.items || [];
  
  return element('ul', { className: 'item-list' }, [
    each(items, (item: any) => 
      element('li', { className: 'item' }, [
        element('span', {}, [item.name || ''])
      ])
    )
  ]);
});

// Include iterative component in document
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'list1',
      stype: 'itemList',
      attributes: {
        items: [
          { name: 'Item A' },
          { name: 'Item B' },
          { name: 'Item C' }
        ]
      }
    }
  ]
}, 'session1');

view.render();
```

### Complex Scenario: Component State + Decorator + Marks

```typescript
// Complex editor component
class EditorState extends BaseComponentState {
  initState(initial: Record<string, any>): void {
    this.data.mode = initial.mode || 'view';
    this.data.selectedText = initial.selectedText || '';
  }
}

defineState('rich-editor', EditorState);
define('rich-editor', (_props, model, ctx) => {
  // Initialize State
  if (!ctx.getState('mode')) {
    ctx.initState({
      mode: model.attributes?.mode || 'view',
      selectedText: ''
    });
  }
  
  const mode = ctx.instance?.get('mode') ?? ctx.getState('mode') ?? 'view';
  const isEditMode = mode === 'edit';
  
  return element('div', { className: `rich-editor ${mode}` }, [
    element('div', { className: 'toolbar' }, [
      element('button', {
        onClick: () => {
          ctx.instance?.set({ mode: isEditMode ? 'view' : 'edit' });
        }
      }, [isEditMode ? 'View' : 'Edit'])
    ]),
    element('div', { className: 'content', contentEditable: isEditMode }, [
      slot('content')
    ])
  ]);
});

// Include complex component in document
editor.loadDocument({
  sid: 'doc1',
  stype: 'document',
  content: [
    {
      sid: 'editor1',
      stype: 'rich-editor',
      attributes: { mode: 'view' },
      content: [
        {
          sid: 'p1',
          stype: 'paragraph',
          content: [
            {
              sid: 't1',
              stype: 'inline-text',
              text: 'Rich Text Content',
              marks: [
                { type: 'bold', range: [0, 4] },
                { type: 'italic', range: [5, 9] }
              ]
            }
          ]
        }
      ]
    }
  ]
}, 'session1');

// Add Decorator
dataStore.addDecorator({
  sid: 'decorator1',
  stype: 'comment',
  category: 'inline',
  target: { sid: 't1', startOffset: 0, endOffset: 4 },
  data: { comment: 'This is bold text' }
});

view.render();
// Automatic re-render on Component State changes
// Manual re-render needed for Decorator changes
```

## Component State Automatic Re-rendering

`renderer-dom`'s `DOMRenderer` automatically detects and re-renders on Component State changes:

```
BaseComponentState.set(patch)
    │
    ├─ ComponentManager.emit('changeState', sid, { state, patch })
    │
    ▼
DOMRenderer (subscribe to changeState event)
    │
    ├─ Throttle with queueMicrotask
    ├─ Use lastModel, lastDecorators
    └─ Full re-render (full reconcile)
    │
    ▼
DOM update (minimal changes based on sid)
```

**Important**:
- No separate `render()` call needed on Component State changes
- `changeState` event automatically triggers full re-render
- Even when model is same and only state changed, full re-render occurs (renderer-dom's full reconcile)
- Actual DOM changes minimized with sid-based DOM reuse

## Decorator Processing

### Decorator Data Flow

```
DataStore.getAllDecorators()
    │
    ├─ RendererDecorator format
    │   ├─ id/sid
    │   ├─ type/stype
    │   ├─ category
    │   ├─ target (nodeId/sid based)
    │   └─ data/model
    │
    ▼
convertToDecoratorData()
    │
    ├─ DecoratorData format
    │   ├─ sid
    │   ├─ stype
    │   ├─ category ('inline' | 'block' | 'layer')
    │   ├─ position ('before' | 'after' | 'inside')
    │   ├─ target { sid, startOffset?, endOffset? }
    │   └─ data (data to pass to template)
    │
    ▼
DOMRenderer.render(container, model, decorators)
    │
    ├─ VNodeBuilder processes decorators
    ├─ inline: processed with text
    ├─ block: inserted at before/after position
    └─ layer: rendered to separate layer
```

### Decorator Processing by Category

1. **inline**: Widgets inserted inside text
   - Use `target.startOffset`, `target.endOffset`
   - Convert to VNode with text

2. **block**: Widgets inserted at block level
   - `position: 'before'` or `'after'`
   - Insert before/after target node

3. **layer**: Overlay-style widgets
   - Rendered to separate layer (`layers.decorator`)
   - Positioned with CSS positioning

### Decorator Update

When Decorator changes, must call `render()` or `update()` to re-render:

```typescript
// After adding/updating/deleting Decorator
dataStore.addDecorator({ ... });
// or
dataStore.updateDecorator('decorator-id', { ... });
// or
dataStore.removeDecorator('decorator-id');

// Re-render (reflect decorator changes)
view.render();
```

**Important**: 
- Decorator changes are not automatically detected
- Must explicitly call `render()`
- When `render()` is called, automatically fetches and converts `dataStore.getAllDecorators()`

## Layer System

`EditorViewDOM` uses 5 layers:

```
Container
├─ Layer 1: Content (z-index: 1)
│  └─ contentEditable = true
│  └─ renderer-dom renders here
│
├─ Layer 2: Decorator (z-index: 10)
│  └─ layer category decorators
│
├─ Layer 3: Selection (z-index: 100)
│  └─ Selection area display
│
├─ Layer 4: Context (z-index: 200)
│  └─ Tooltips, context menus
│
└─ Layer 5: Custom (z-index: 1000)
   └─ Custom overlays
```

**Important**: renderer-dom only renders to `layers.content`.

## Notes and Best Practices

### 1. Template Registration Order

- Templates must be registered externally via `define()` **before** `EditorViewDOM` creation
- If template with same `stype` already registered, does not overwrite (safe)

```typescript
// ✅ Correct order
define('custom-type', element('div', {}, []));
const view = new EditorViewDOM(editor, { 
  container,
  registry: getGlobalRegistry() 
});

// ❌ Incorrect order (template not registered)
const view = new EditorViewDOM(editor, { container });
define('custom-type', element('div', {}));
```

### 2. Data Format

**All data is ModelData format (uses sid, stype)**:
- `stype` field required - node type
- `sid` field required - node identifier (required for individual component management, must match stype)
- `attributes` - node attributes (merged and accessible at model top level)
- Use directly without conversion (performance optimization)
- Proxy-based lazy evaluation supported

**Usage Patterns**:
```typescript
// ✅ Recommended: Use Proxy (lazy evaluation)
view.render();  // use editor.getDocumentProxy()

// ✅ Possible: Pass ModelData format directly (no conversion)
view.render({ 
  sid: 'doc1', 
  stype: 'document', 
  content: [...],
  attributes: { ... }  // attributes accessible at model top level
});
```

**Important**: 
- All data uses `sid`, `stype` format
- Pass model as-is without conversion functions

### 3. Marks Format

- `range: [start, end]` format recommended
- `start/end` format also supported but converted to `range`
- Range must not exceed text length

### 4. Decorator Target

- `target.sid` or `target.nodeId` required
- `startOffset`/`endOffset` only needed for inline decorators
- block decorators only need `position`

### 5. Performance Considerations

- **Use Proxy-based Lazy Evaluation (Recommended)**
  - Using `editor.getDocumentProxy()` reduces initial loading time
  - If content array is IDs, converts to actual nodes only on access
  - Optimizes memory usage for large documents
  
- Minimize `render()` calls for large documents
- Both `render()` and `update()` re-render entire document (renderer-dom's full reconcile)
- Minimize unnecessary DOM manipulation with sid-based DOM reuse
- Component State changes automatically trigger re-render, so no separate `render()` call needed

- **Data Processing Optimization**
  - All data already in ModelData format (uses sid, stype)
  - **No conversion overhead** - pass model as-is
  - Using Proxy is memory efficient even for partial updates

### 6. Error Handling

- Error if `stype` field missing (required field)
- Error if `sid` field missing (required field - required for component management)
- Error if template not registered for `stype`
- Decorator conversion failure only outputs warning and continues

### 7. Resource Cleanup

- Must call `destroy()` method to clean up resources
- Release all resources: event listeners, MutationObserver, Decorators, keymaps, etc.
- Component instances and DOM cache also cleaned up

```typescript
// Clean up after use
view.destroy();
```

### 8. Limitations and Known Issues

**Limitations**:
- Both `render()` and `update()` re-render entire document (partial updates not supported)
- Decorator changes not automatically detected (manual `render()` call needed)
- Component State changes automatically re-render, but model changes require manual call
- SSR(Server-Side Rendering) not supported (depends on DOM API)

**Performance Considerations**:
- Large documents (5000+ nodes) may increase rendering time
- Using Proxy-based lazy evaluation reduces initial loading time
- Optimize performance by minimizing `render()` call frequency

**Debugging Tips**:
- Identify nodes with `data-bc-sid` attribute in browser dev tools
- Check node types with `data-bc-stype` attribute
- Check `EditorViewDOM` internal state with `console.log` (dev mode)
- If template not registered, check for `[VNodeBuilder] Renderer not found` error

## Integration Checklist

Verify rendering works correctly:

- [x] Templates registered externally
- [x] Use ModelData format directly (no conversion)
- [x] Proxy-based lazy evaluation works
- [x] Decorator conversion is accurate
- [x] `data-bc-sid` attribute set on DOM
- [x] `data-bc-stype` attribute set on DOM
- [x] sid-based DOM reuse works
- [x] contentEditable works normally
- [x] Selection mapping is accurate
- [x] Text with marks renders correctly
- [x] Decorators render at correct positions
- [x] Portal rendering and cleanup
- [x] Component State management
- [x] Performance tests (1000/2000 nodes)
- [x] Error handling and edge cases

## Test Coverage

Currently **89 integration tests** all pass:

- **Basic integration tests**: 23
- **Component State management**: 7
- **Decorator integration**: 8
- **Portal integration**: 8
- **Performance and scale**: 6
- **Complex scenarios**: 7
- **Error handling and edge cases**: 8
- **Detailed integration**: 15
- **Others**: 7

See `test/integration/integration-test-checklist.md` for details.

## Troubleshooting

### Template Not Found

```
Error: [VNodeBuilder] Renderer not found for nodeType: 'custom-type'
```

**Solution**:
1. Check `define('custom-type', ...)` call
2. Check template registered before `EditorViewDOM` creation
3. Check registered in correct `registry`

### Invalid Data Format

```
Error: [EditorViewDOM] Invalid tree format: missing stype (required)
```

**Solution**:
1. Check `stype` field (required)
2. Check `sid` field (required - required for component management)
3. Check each item in `content` array also has `stype`, `sid` fields
4. Check `marks` format (range format recommended)

### Decorator Not Rendering

**Solution**:
1. Check `dataStore.getAllDecorators()` return value
2. Check `convertToDecoratorData()` conversion result
3. Check Decorator's `target.sid` or `target.nodeId`
4. Check Decorator template registered
5. Check `render()` or `update()` called after Decorator change

### Component State Changes Not Reflected

**Solution**:
1. Check `BaseComponentState.set()` call
2. Check `ComponentManager` emits `changeState` event
3. Check `DOMRenderer` subscribes to `changeState` event
4. Automatic re-rendering is throttled with `queueMicrotask`, so slight delay may occur

## Recent Changes

### Proxy-based Lazy Evaluation (2024)

- Added `editor.getDocumentProxy()` method
- Lazy evaluation support via `DataStoreExporter.toProxy()`
- If content array is IDs, converts to actual nodes only on access
- Optimizes initial loading time and memory usage

### Direct ModelData Usage

- All data already in ModelData format (uses sid, stype)
- Pass model as-is without conversion
- Improved memory efficiency with Proxy-based lazy evaluation

### Integration Tests Completed

- All 89 integration tests pass
- Coverage completed for Component State, Decorator, Portal, performance, complex scenarios, error handling

## References

- [renderer-dom specification](../../renderer-dom/docs/renderer-dom-spec.md)
- [renderer-dom README](../../renderer-dom/README.md)
- [DSL documentation](../../dsl/README.md)
- [Integration plan document](./renderer-dom-integration-plan.md)
- [Integration test checklist](../test/integration/integration-test-checklist.md)
- [toProxy architecture explanation](./toProxy-architecture-explanation.md)
