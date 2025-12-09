# Renderer DOM Build Function Specification

## Overview

The `DOMRenderer.build()` function is a core function that takes Model data and Decorator data and generates VNode (Virtual Node). This document clearly explains what input (Model, Decorators) produces what output (VNode) when built.

## Build Function Signature

```typescript
build(model: ModelData, decorators: DecoratorData[] = []): VNode
```

### Input

#### 1. Model (ModelData)

Model must have the following required properties:

- **`stype`** (string, required): Type of template to use. Must match the template name registered with the `define()` function.
- **`sid`** (string, optional): Unique identifier for the node. Used for Decorator matching and reconciliation.
- **Other properties**: Data to be used in templates (e.g., `text`, `title`, `content`, `attributes`, `marks`, etc.)

**Example:**
```typescript
const model = {
  stype: 'paragraph',
  sid: 'p1',
  text: 'Hello World',
  attributes: { className: 'intro' }
};
```

#### 2. Decorators (DecoratorData[])

Decorator array is metadata that applies additional styling or functionality to text or nodes.

```typescript
interface DecoratorData {
  sid: string;              // Decorator unique ID
  stype: string;            // Decorator type (highlight, comment, etc.)
  category: 'inline' | 'block' | 'layer';
  target: {
    sid: string;            // Target node's sid
    startOffset?: number;   // Inline decorator start offset
    endOffset?: number;     // Inline decorator end offset
  };
}
```

**Example:**
```typescript
const decorators = [
  {
    sid: 'd1',
    stype: 'highlight',
    category: 'inline',
    target: {
      sid: 'p1',
      startOffset: 0,
      endOffset: 5
    }
  }
];
```

### Output

#### VNode (Virtual Node)

The build function returns a completed VNode object.

```typescript
interface VNode {
  tag?: string;              // HTML tag name (e.g., 'div', 'p', 'span')
  attrs?: Record<string, any>; // HTML attributes
  style?: Record<string, any>;  // Inline styles
  text?: string;              // Text node content
  children?: VNode[];          // Child VNode array
  component?: {                // Component information (if component)
    name: string;
    props: Record<string, any>;
    isExternal?: boolean;
  };
  portal?: {                   // Portal information (if portal)
    target: HTMLElement;
    template: RenderTemplate;
    portalId: string;
  };
}
```

## Build Process

The build function generates VNode through the following steps:

1. **Template Lookup**: Find the registered template in Registry using `model.stype`.
2. **Data Binding**: Template functions like `data()`, `attr()` reference model data.
3. **Mark Processing**: If `model.marks` exists, split text by mark ranges and create mark VNodes.
4. **Decorator Application**: Apply Decorators to text or nodes.
5. **Component Processing**: Process Contextual Components or External Components.
6. **Slot Processing**: Render child content specified by `slot()` function.
7. **Recursive Build**: Recursively build nested templates or child elements.

## Build Results by Specification

### 1. Basic Element Build

**Input:**
```typescript
// Template registration
define('paragraph', element('p', [data('text')]));

const model = {
  stype: 'paragraph',
  sid: 'p1',
  text: 'Hello World'
};

const decorators = [];
```

**Output:**
```typescript
{
  tag: 'p',
  attrs: {
    'data-bc-sid': 'p1',
    'data-bc-stype': 'paragraph'
  },
  text: 'Hello World'
}
```

### 2. Nested Elements Build

**Input:**
```typescript
define('container', element('div', [
  element('h1', [data('title')]),
  element('p', [data('content')])
]));

const model = {
  stype: 'container',
  sid: 'c1',
  title: 'Title',
  content: 'Content'
};
```

**Output:**
```typescript
{
  tag: 'div',
  attrs: { 'data-bc-sid': 'c1', 'data-bc-stype': 'container' },
  children: [
    { tag: 'h1', text: 'Title' },
    { tag: 'p', text: 'Content' }
  ]
}
```

### 3. Decorator Application Build

**Input:**
```typescript
define('paragraph', element('p', [data('text')]));
define('highlight', element('span', { className: 'highlight' }, [slot('content')]));

const model = {
  stype: 'paragraph',
  sid: 'p1',
  text: 'Hello World'
};

const decorators = [
  {
    sid: 'd1',
    stype: 'highlight',
    category: 'inline',
    target: { sid: 'p1', startOffset: 0, endOffset: 5 }
  }
];
```

**Output:**
```typescript
{
  tag: 'p',
  attrs: { 'data-bc-sid': 'p1', 'data-bc-stype': 'paragraph' },
  children: [
    {
      tag: 'span',
      attrs: {
        className: 'highlight',
        'data-decorator-sid': 'd1',
        'data-decorator-category': 'inline'
      },
      children: [{ text: 'Hello' }]
    },
    { text: ' World' }
  ]
}
```

### 4. Mark Processing Build

**Input:**
```typescript
define('text-with-mark', element('p', [data('text')]));
defineMark('bold', element('strong', [data('text')]));

const model = {
  stype: 'text-with-mark',
  sid: 'm1',
  text: 'Hello World',
  marks: [
    { type: 'bold', range: [0, 5] }  // "Hello"
  ]
};
```

**Output:**
```typescript
{
  tag: 'p',
  attrs: { 'data-bc-sid': 'm1', 'data-bc-stype': 'text-with-mark' },
  children: [
    { tag: 'strong', text: 'Hello' },
    { text: ' World' }
  ]
}
```

### 5. Mark + Decorator Combination Build

**Input:**
```typescript
define('text-mark-decorator', element('p', [data('text')]));
defineMark('bold', element('strong', [data('text')]));
define('highlight', element('span', { className: 'highlight' }, [slot('content')]));

const model = {
  stype: 'text-mark-decorator',
  sid: 'm1',
  text: 'Hello World',
  marks: [
    { type: 'bold', range: [0, 5] }
  ]
};

const decorators = [
  {
    sid: 'd1',
    stype: 'highlight',
    category: 'inline',
    target: { sid: 'm1', startOffset: 0, endOffset: 5 }
  }
];
```

**Output:**
```typescript
{
  tag: 'p',
  attrs: { 'data-bc-sid': 'm1', 'data-bc-stype': 'text-mark-decorator' },
  children: [
    {
      tag: 'span',
      attrs: {
        className: 'highlight',
        'data-decorator-sid': 'd1',
        'data-decorator-category': 'inline'
      },
      children: [
        { tag: 'strong', text: 'Hello' }  // Mark nested inside Decorator
      ]
    },
    { text: ' World' }
  ]
}
```

**Nesting Order:** Decorator → Mark → Text

### 6. Component Build (Contextual)

**Input:**
```typescript
registerContextComponent('button', (props, context) => {
  return element('button', { className: 'btn' }, [data('text')]);
});

const model = {
  stype: 'button',
  sid: 'btn1',
  text: 'Click me'
};
```

**Output:**
```typescript
{
  tag: 'button',
  attrs: {
    className: 'btn',
    'data-bc-sid': 'btn1',
    'data-bc-stype': 'button'
  },
  text: 'Click me',
  component: {
    name: 'button',
    props: { text: 'Click me' },
    isExternal: false
  }
}
```

### 7. External Component Build

**Input:**
```typescript
define('chart', {
  mount: (props, container) => {
    const div = document.createElement('div');
    div.className = 'chart-container';
    container.appendChild(div);
    return div;
  },
  unmount: (instance) => {
    instance.element?.remove();
  }
});

const model = {
  stype: 'chart',
  sid: 'chart1',
  data: [1, 2, 3]
};
```

**Output:**
```typescript
{
  tag: 'div',
  attrs: {
    'data-bc-sid': 'chart1',
    'data-bc-stype': 'component',
    'data-bc-component': 'chart'
  },
  component: {
    name: 'chart',
    props: { stype: 'chart', sid: 'chart1', data: [1, 2, 3] },
    isExternal: true
  }
}
```

### 8. Slot Processing Build

**Input:**
```typescript
define('container', element('div', { className: 'container' }, [slot('content')]));
define('item', element('span', { className: 'item' }, [data('text')]));

const model = {
  stype: 'container',
  sid: 'c1',
  content: [
    { stype: 'item', sid: 'i1', text: 'Item 1' },
    { stype: 'item', sid: 'i2', text: 'Item 2' }
  ]
};
```

**Output:**
```typescript
{
  tag: 'div',
  attrs: {
    className: 'container',
    'data-bc-sid': 'c1',
    'data-bc-stype': 'container'
  },
  children: [
    {
      tag: 'span',
      attrs: { className: 'item', 'data-bc-sid': 'i1', 'data-bc-stype': 'item' },
      text: 'Item 1'
    },
    {
      tag: 'span',
      attrs: { className: 'item', 'data-bc-sid': 'i2', 'data-bc-stype': 'item' },
      text: 'Item 2'
    }
  ]
}
```

### 9. Conditional Rendering (`when()`) Build

**Input:**
```typescript
define('conditional-component', element('div', [
  when((d: any) => d.show, element('span', { className: 'shown' }, [data('text')])),
  when((d: any) => !d.show, element('span', { className: 'hidden' }, [text('Hidden')]))
]));

const model = {
  stype: 'conditional-component',
  sid: 'c1',
  show: true,
  text: 'Visible content'
};
```

**Output:**
```typescript
{
  tag: 'div',
  attrs: { 'data-bc-sid': 'c1', 'data-bc-stype': 'conditional-component' },
  children: [
    { tag: 'span', attrs: { className: 'shown' }, text: 'Visible content' }
    // hidden span is not included because condition is false
  ]
}
```

### 10. Array Iteration (`each()`) Build

**Input:**
```typescript
const eachTemplate: EachTemplate = {
  type: 'each',
  name: 'items',
  render: (item: any) => element('li', { className: 'item' }, [data('name')])
};

define('list', element('ul', [eachTemplate]));

const model = {
  stype: 'list',
  sid: 'l1',
  items: [
    { stype: 'item', sid: 'i1', name: 'Item 1' },
    { stype: 'item', sid: 'i2', name: 'Item 2' }
  ]
};
```

**Output:**
```typescript
{
  tag: 'ul',
  attrs: { 'data-bc-sid': 'l1', 'data-bc-stype': 'list' },
  children: [
    { tag: 'li', attrs: { className: 'item' }, text: 'Item 1' },
    { tag: 'li', attrs: { className: 'item' }, text: 'Item 2' }
  ]
}
```

### 11. Mixed Content (Text + Elements) Build

**Input:**
```typescript
define('mixed-content', element('div', [
  text('Hello '),
  element('strong', [text('World')]),
  text('!')
]));

const model = {
  stype: 'mixed-content',
  sid: 'm1'
};
```

**Output:**
```typescript
{
  tag: 'div',
  attrs: { 'data-bc-sid': 'm1', 'data-bc-stype': 'mixed-content' },
  children: [
    { text: 'Hello ' },
    { tag: 'strong', text: 'World' },
    { text: '!' }
  ]
}
```

### 12. Dynamic Attributes Build

**Input:**
```typescript
define('dynamic-attr', element('div', {
  className: attr('attributes.className'),
  id: attr('attributes.id'),
  'data-value': attr('attributes.value')
}, [data('text')]));

const model = {
  stype: 'dynamic-attr',
  sid: 'd1',
  attributes: {
    className: 'custom-class',
    id: 'my-id',
    value: '123'
  },
  text: 'Content'
};
```

**Output:**
```typescript
{
  tag: 'div',
  attrs: {
    className: 'custom-class',
    id: 'my-id',
    'data-value': '123',
    'data-bc-sid': 'd1',
    'data-bc-stype': 'dynamic-attr'
  },
  text: 'Content'
}
```

### 13. Component Props Passing Build

**Input:**
```typescript
registerContextComponent('profile', (props, context) => {
  return element('div', [
    element('h1', [data('user.name')]),
    element('p', [data('user.email')])
  ]);
});

const model = {
  stype: 'profile',
  sid: 'p1',
  user: {
    name: 'John Doe',
    email: 'john@example.com'
  }
};
```

**Output:**
```typescript
{
  tag: 'div',
  attrs: { 'data-bc-sid': 'p1', 'data-bc-stype': 'profile' },
  children: [
    { tag: 'h1', text: 'John Doe' },
    { tag: 'p', text: 'john@example.com' }
  ],
  component: {
    name: 'profile',
    props: { user: { name: 'John Doe', email: 'john@example.com' } },
    isExternal: false
  }
}
```

## Nesting and Combination Rules

### 1. Mark and Decorator Nesting Order

When Mark and Decorator are applied simultaneously, the nesting order is as follows:

```
Decorator (outer) → Mark → Text (inner)
```

Reason:
- Decorator is a styling or functional wrapper.
- Mark is semantic emphasis of text.
- Therefore, Decorator is positioned outside, Mark inside.

### 2. Multiple Mark Nesting

When multiple Marks overlap, they are nested in reverse order of the `run.types` array:

```typescript
// marks: [bold, italic] → types: ['bold', 'italic']
// Result: <em><strong>text</strong></em>
```

### 3. Multiple Decorator Processing

When multiple Decorators are applied to the same text, each is created as a separate VNode or split according to ranges.

## Special Attributes and Metadata

### data-bc-sid

All VNodes have the `data-bc-sid` attribute added to identify nodes. This is used for reconciliation and decorator matching.

### data-bc-stype

The `data-bc-stype` attribute preserves the original model's `stype`. For components, it may be set to `'component'`.

### data-bc-component

For External Components or Contextual Components, the component name is set in the `data-bc-component` attribute.

### data-decorator-sid / data-decorator-category

VNodes with Decorators applied have `data-decorator-sid` and `data-decorator-category` attributes added.

## Error Handling

### 1. Missing stype

```typescript
build({ sid: 'p1', text: 'Hello' }, []);
// Error: model must have stype property
```

### 2. Using Unregistered Template

```typescript
build({ stype: 'unknown-template', sid: 'p1' }, []);
// Error: Renderer for node type 'unknown-template' not found
```

### 3. null/undefined Data

```typescript
build(null, []);
// Error: Data cannot be null or undefined
```

## Performance Considerations

1. **ID Reuse**: Using the same `sid` multiple times within the same build cycle generates a unique ID (duplicate prevention).
2. **Recursive Build**: Deeply nested structures are processed recursively, so deeper nesting can impact performance.
3. **Decorator Processing**: When there are many Decorators, the text splitting and matching process can take time.

## Example: Complex Build Scenario

```typescript
// Template definition
define('article', element('article', [slot('content')]));
define('paragraph', element('p', [data('text')]));
defineMark('bold', element('strong', [data('text')]));
defineMark('italic', element('em', [data('text')]));
define('highlight', element('span', { className: 'highlight' }, [slot('content')]));

// Model & Decorators
const model = {
  stype: 'article',
  sid: 'article1',
  content: [
    {
      stype: 'paragraph',
      sid: 'p1',
      text: 'Hello Beautiful World',
      marks: [
        { type: 'bold', range: [0, 5] },
        { type: 'italic', range: [6, 15] }
      ]
    }
  ]
};

const decorators = [
  {
    sid: 'd1',
    stype: 'highlight',
    category: 'inline',
    target: { sid: 'p1', startOffset: 0, endOffset: 15 }
  }
];

// Build
const vnode = renderer.build(model, decorators);

// Resulting VNode structure:
// article
//   └─ p (data-bc-sid: 'p1')
//       └─ span.highlight (data-decorator-sid: 'd1')
//           ├─ strong ('Hello')
//           └─ em ('Beautiful')
//       └─ ' World'
```

## Notes

- The build function does not directly create DOM. It only creates VNode.
- Actual DOM rendering requires calling `renderer.render(container, vnode)`.
- Component internal state is managed through `ComponentManager` and reflected at build time.
- `lastModel` and `lastDecorators` are stored to support automatic rebuild.

