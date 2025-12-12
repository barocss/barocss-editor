# Barocss Architecture - Practical Examples

## Real-world usage examples

### 1. Basic template definition

```typescript
import { element, data, when, component } from '@barocss/dsl';
import { renderer, define } from '@barocss/dsl';

// 1. Define template with DSL (pure function)
const paragraphTemplate = element('p', 
  { className: data('className') }, 
  [data('text')]
);

// 2. Conditional rendering
const conditionalTemplate = when(
  (data) => data('show') === true,
  element('div', {}, [data('content')]),
  element('div', {}, [data('elseContent')])
);

// 3. Component definition
const buttonComponent = element('button',
  { 
    className: data('className'),
    onClick: data('onClick')
  },
  [data('label')]
);

// 4. Register in Registry
define('paragraph', paragraphTemplate);
define('button', buttonComponent);
```

### 2. Actual rendering process

```typescript
import { DOMRenderer } from '@barocss/renderer-dom';
import { define, element, data } from '@barocss/dsl';

// Define template
define('paragraph', element('p', {}, [data('text')]));

// Create Renderer
const renderer = new DOMRenderer();

// Model data
const model = { stype: 'paragraph', text: 'Hello World' };

// First render
const container = document.getElementById('app');
renderer.render(container, model);
// Result: <p>Hello World</p>

// Update
model.text = 'Updated Text';
renderer.render(container, model);
// Result: <p>Updated Text</p> (updates previous text)
```

### 3. Complex template example

```typescript
import { element, data, component, when, slot } from '@barocss/dsl';
import { define } from '@barocss/dsl';

// List item
define('listItem', element('li', 
  { className: data('className') },
  [data('content')]
));

// List
define('list', element('ul',
  { className: data('className') },
  [
    element('each', {}, [
      data('items'),
      element('listItem', 
        { className: data('item.className') },
        [data('item.content')]
      )
    ])
  ]
));

// Conditional card
define('card', when(
  (data) => data('expanded') === true,
  element('div', 
    { className: 'card expanded' },
    [
      element('h2', {}, [data('title')]),
      element('p', {}, [data('description')]),
      element('div', {}, [slot('extra')])
    ]
  ),
  element('div',
    { className: 'card collapsed' },
    [element('h2', {}, [data('title')])]
  )
));

// Component
define('modal', component('dialog', 
  {
    open: data('isOpen'),
    onClose: data('handleClose')
  },
  [
    element('div', { className: 'modal-overlay' }, [
      element('div', { className: 'modal-content' }, [
        slot('header'),
        slot('body'),
        slot('footer')
      ])
    ])
  ]
));
```

### 4. Data flow example

```typescript
// Model
const blogPost = {
  stype: 'article',
  title: 'Understanding Reconcile',
  author: 'John Doe',
  content: '...',
  published: true
};

// Template (registered in Registry)
define('article', element('article',
  {
    className: 'blog-post',
    'data-author': data('author')
  },
  [
    // Conditional publish indicator
    when(
      (d) => d('published') === true,
      element('span', { className: 'published' }, ['Published'])
    ),
    element('h1', {}, [data('title')]),
    element('p', {}, [data('content')])
  ]
));

// Rendering
const renderer = new DOMRenderer();
renderer.render(container, blogPost);

// Result DOM:
// <article class="blog-post" data-author="John Doe">
//   <span class="published">Published</span>
//   <h1>Understanding Reconcile</h1>
//   <p>...</p>
// </article>
```

### 5. Update scenario

```typescript
// First render
const initialModel = { stype: 'paragraph', text: 'First' };
renderer.render(container, initialModel);
// DOM: <p>First</p>

// Data change
const updatedModel = { stype: 'paragraph', text: 'Second' };
renderer.render(container, updatedModel);

// Reconcile process:
// 1. prevVNode: { tag: 'p', text: 'First' }
// 2. nextVNode: { tag: 'p', text: 'Second' }
// 3. detectChanges(): ['text']
// 4. processElementNode(): domNode.textContent = 'Second'
// 5. finalizeDOMUpdate(): isAlreadyInDOM = true, skip append
// DOM: <p>Second</p>
```

### 6. Children addition scenario

```typescript
// First render
const initialModel = {
  stype: 'div',
  items: ['Item 1']
};

renderer.render(container, initialModel);
// DOM: <div><p>Item 1</p></div>

// Add item
updatedModel.items.push('Item 2');

renderer.render(container, {
  stype: 'div',
  items: ['Item 1', 'Item 2']
});

// Reconcile process:
// prevChildren: [{tag:'p', text:'Item 1'}]
// nextChildren: [{tag:'p', text:'Item 1'}, {tag:'p', text:'Item 2'}]
//
// 1. First child: Same → skip
// 2. Second child: insertBefore(newNode, referenceNode)
// 3. childWip.domNode = newNode
// 4. finalizeDOMUpdate(): isAlreadyInDOM = true, skip

// DOM: <div><p>Item 1</p><p>Item 2</p></div>
```

### 7. Component example

```typescript
// Counter component definition
const counterComponent = element('div', 
  { className: 'counter' },
  [
    element('button', 
      { onClick: data('decrement') }, 
      ['-']
    ),
    element('span', {}, [data('count')]),
    element('button',
      { onClick: data('increment') },
      ['+']
    )
  ]
);

define('counter', counterComponent);

// Usage
const model = {
  stype: 'counter',
  count: 0,
  increment: () => { /* ... */ },
  decrement: () => { /* ... */ }
};

renderer.render(container, model);
```

### 8. Portal example

```typescript
import { portal, element, data } from '@barocss/dsl';

// Portal definition
define('modal', element('div',
  {},
  [
    portal('modal-root',
      element('div', { className: 'modal' }, [
        element('h2', {}, [data('title')]),
        element('button', 
          { onClick: data('onClose') },
          ['Close']
        )
      ])
    )
  ]
));

// Usage
const model = {
  stype: 'modal',
  title: 'My Modal',
  onClose: () => { /* ... */ }
};

renderer.render(container, model);
// Portal content is rendered to 'modal-root'
```

## Complete pipeline practical example

```typescript
// 1. Define template with DSL
import { define, element, data, when, component } from '@barocss/dsl';
import { DOMRenderer } from '@barocss/renderer-dom';

define('blogPost', element('article',
  { className: data('className') },
  [
    when(
      (d) => d('published'),
      element('span', { className: 'badge' }, ['Published'])
    ),
    element('h1', {}, [data('title')]),
    element('p', {}, [data('content')]),
    component('author', { name: data('author') })
  ]
));

// 2. Create Renderer
const renderer = new DOMRenderer();

// 3. Prepare Model
const blogModel = {
  stype: 'blogPost',
  className: 'post-featured',
  published: true,
  title: 'Getting Started with Barocss',
  content: '...',
  author: 'Jane Smith'
};

// 4. Render
const container = document.getElementById('app');
renderer.render(container, blogModel);

// 5. Update
blogModel.title = 'Advanced Barocss Patterns';
blogModel.content = 'Updated content...';
renderer.render(container, blogModel);
// → Reconcile updates only changed parts
```

## Functional pipeline visualization

```typescript
// DSL function
const template = element('p', {}, [data('text')]);

// VNodeBuilder function
const vnode = f_template(template, { text: 'Hello' });
// → { tag: 'p', text: 'Hello', ... }

// DOMReconcile function
const dom = f_reconcile(prevVNode, vnode, container);
// → DOM manipulation: <p>Hello</p>

// Complete function composition
render = f_reconcile ∘ f_template ∘ f_dsl
```

## Key points

1. **DSL is pure functions**: All builder functions have no side effects
2. **Composable**: Can nest `data()`, `when()`, etc. inside `element()`
3. **Registry**: Templates are registered in Registry for reuse
4. **Automatic Reconcile**: Updates only manipulate changed DOM parts
5. **Type safety**: Type safety guaranteed with TypeScript
