# DSL API

The DSL (Domain-Specific Language) API provides declarative template functions for building UI components. All templates defined with `define()` are automatically converted to components.

## Core Template Functions

### `element(tag, attributes?, children?)`

Creates an HTML element or component template.

**Parameters:**
- `tag: string | Function` - HTML tag name, component name, or dynamic tag function
- `attributes?: ElementAttributes | Function` - Element attributes or dynamic attribute function (optional)
- `children?: ElementChild[]` - Child elements (optional)

**Returns:**
- `ElementTemplate` - Element template

**Overloads:**
```typescript
element(tag: string): ElementTemplate
element(tag: string, textOrChild: string | number | ElementChild): ElementTemplate
element(tag: string, children: ElementChild[]): ElementTemplate
element(tag: string, attributes: ElementAttributes, children?: ElementChild[]): ElementTemplate
```

**Example:**
```typescript
// Basic element
element('div', { className: 'container' }, [text('Hello')]);

// Dynamic tag
element((model) => `h${model.level}`, { className: 'heading' }, [text('Title')]);

// Dynamic attributes
element('div', {
  className: (d) => d.active ? 'active' : 'inactive',
  style: (d) => ({ color: d.color || 'black' })
}, [text('Dynamic content')]);

// Function child
element('li', { className: 'feature' }, [
  (d) => d.name + (d.enabled ? ' ✓' : '')
]);

// Array-returning function child (replacement for each)
element('ul', { className: 'list' }, [
  (d) => d.items.map(item => 
    element('li', { className: 'item' }, [text(item.name)])
  )
]);
```

### `text(content)`

Creates a text node.

**Parameters:**
- `content: string | number` - Text content

**Returns:**
- `TextTemplate` - Text template

**Example:**
```typescript
text('Hello World');
text(42);
text(data('user.name', 'Unknown'));
```

### `data(path, defaultValue?)`

Creates data binding.

**Parameters:**
- `path: string` - Data path (supports dot notation for nested properties)
- `defaultValue?: any` - Default value (optional)

**Returns:**
- `DataTemplate` - Data template

**Example:**
```typescript
data('user.name', 'Unknown');
data('count');
data('settings.theme', 'light');
data('attributes.title', ''); // Access nested properties
```

**Nested Property Access:**
```typescript
// Access props.attributes.title
data('attributes.title')

// Access props.content[0].text
data('content.0.text')
```

### `slot(name?)`

Creates a slot for child content.

**Parameters:**
- `name?: string` - Slot name (default: 'content')

**Returns:**
- `SlotTemplate` - Slot template

**Example:**
```typescript
// Default slot (renders children)
define('card', element('div', { className: 'card' }, [
  slot('content') // Renders children passed to component
]));

// Named slot
define('layout', element('div', { className: 'layout' }, [
  element('header', {}, [slot('header')]),
  element('main', {}, [slot('content')]),
  element('footer', {}, [slot('footer')])
]));
```

**Usage:**
```typescript
// When using the component, children are rendered in the slot
element('card', {}, [
  element('p', {}, [text('Card content')])
]);
// Renders: <div class="card"><p>Card content</p></div>
```

### `each(collection, renderFn)`

Renders a list of items.

**Parameters:**
- `collection: string | ((data: any) => any[])` - Collection path or function that returns array
- `renderFn: (item: any, index: number) => RenderTemplate` - Render function for each item

**Returns:**
- `EachTemplate` - Each template

**Example:**
```typescript
// Collection path
each('items', (item, index) =>
  element('li', { key: item.id }, [text(item.name)])
);

// Collection function
each((data) => data.content || [], (item, index) =>
  element('li', {}, [text(item.text)])
);

// With nested data access
define('list', element('ul', {}, [
  each('content', (item) =>
    element('li', {}, [
      element('span', {}, [data('text')]) // item.text
    ])
  )
]));
```

**Note**: `each()` is a DSL helper. You can also use function children that return arrays:
```typescript
element('ul', {}, [
  (d) => d.items.map(item => 
    element('li', {}, [text(item.name)])
  )
]);
```

### `attr(key, defaultValue?)`

Creates attribute data binding.

**Parameters:**
- `key: string` - Attribute key
- `defaultValue?: any` - Default value (optional)

**Returns:**
- `DataTemplate` - Data template for attribute

**Example:**
```typescript
element('input', {
  type: 'text',
  value: attr('text', ''),
  placeholder: attr('placeholder', 'Enter text')
});
```

**Note**: `attr()` is similar to `data()` but is specifically for attribute binding. You can also use `data()` directly:
```typescript
element('input', {
  value: data('text', ''),
  placeholder: data('placeholder', 'Enter text')
});
```

### `when(condition, template)`

Creates conditional rendering.

**Parameters:**
- `condition: boolean | ((data: any) => boolean)` - Condition or condition function
- `template: RenderTemplate | RenderTemplate[]` - Template(s) to render when condition is true

**Returns:**
- `ConditionalTemplate` - Conditional template

**Example:**
```typescript
// Boolean condition
when(true, element('div', {}, [text('Visible')]));

// Function condition
when((data) => data.visible, element('div', {}, [text('Visible')]));

// Multiple templates
when((data) => data.showHeader, [
  element('header', {}, [text('Header')]),
  element('nav', {}, [text('Navigation')])
]);

// In component definition
define('conditional-component', (props, ctx) => {
  return element('div', {}, [
    when(props.visible, element('span', {}, [text('Visible')])),
    when(props.showFooter, element('footer', {}, [text('Footer')]))
  ]);
});
```

### `portal(target, template, portalId?)`

Creates a Portal (renders template to external DOM container).

**Parameters:**
- `target: HTMLElement` - DOM container where Portal will be rendered
- `template: RenderTemplate` - Template to render in Portal
- `portalId?: string` - Optional Portal unique identifier (auto-generated)

**Returns:**
- `PortalTemplate` - Portal template

**Example:**
```typescript
// Basic portal
portal(document.body, element('div', {
  className: 'tooltip',
  style: { position: 'fixed', zIndex: 1000 }
}, [text('Tooltip content')]), 'tooltip-portal');

// Conditional portal
when((data) => data.showModal,
  portal(document.body, element('div', {
    className: 'modal',
    style: { position: 'fixed' }
  }, [text('Modal content')]))
);
```

**Features:**
- Independent container for each Portal
- Preserves existing DOM content
- State preservation (focus, scroll, etc.)
- Efficient updates using reconcile algorithm

---

## Component Definition

### `define(name, template)`

Defines a component.

**Parameters:**
- `name: string` - Component name
- `template: RenderTemplate | Function` - Template or template function

**Returns:**
- `RendererDefinition` - Renderer definition

**Important**: All templates passed to `define()` are automatically converted to components:
```typescript
// ElementTemplate (automatic conversion)
define('card', element('div', { className: 'card' }))
// Internally: define('card', (props, ctx) => element('div', { className: 'card' }))
```

**Example:**
```typescript
// Static template
define('button', element('button', { className: 'btn' }, [text('Click me')]));

// Dynamic template (state management)
define('counter', (props, context) => {
  context.initState('count', 0);
  
  return element('div', [
    text(`Count: ${context.getState('count')}`),
    element('button', {
      onClick: () => context.setState('count', context.getState('count') + 1)
    }, [text('Increment')])
  ]);
});

// Function-based component (full data access)
define('table', (props, context) => {
  return element('table', { className: 'table' }, [
    ...(props?.attributes?.caption ? [
      element('caption', { className: 'table-caption' }, [
        data('attributes.caption')
      ])
    ] : []),
    slot('content')
  ]);
});
```

**Template Types:**
- **ElementTemplate**: Stateless pure template (automatically converted to component)
- **ContextualComponent**: State management function with `(props, context)` parameters
- **Function-based Component**: Function that can access full model data
- **ExternalComponent**: Object with `mount`, `update`, `unmount` methods

### `defineMark(type, template)`

Defines a text mark.

**Parameters:**
- `type: string` - Mark type (e.g., 'bold', 'italic', 'underline')
- `template: RenderTemplate` - Template to render when mark is applied

**Returns:**
- `RendererDefinition` - Mark definition

**Important**: `defineMark()` internally uses `define()`, so all mark templates are automatically converted to components.

**Example:**
```typescript
// Basic mark definitions
defineMark('bold', element('strong', [data('text')]));
defineMark('italic', element('em', [data('text')]));
defineMark('underline', element('u', [data('text')]));
defineMark('code', element('code', [data('text')]));

// Mark with attributes
defineMark('link', element('a', {
  href: data('attributes.href', '#'),
  target: data('attributes.target', '_self')
}, [data('text')]));
```

**Usage:**
```typescript
// Marks are applied via marks attribute in model
const model = {
  stype: 'inline-text',
  text: 'Hello World',
  marks: [
    { stype: 'bold', range: [0, 5] },      // "Hello" as <strong>
    { stype: 'italic', range: [6, 11] }    // "World" as <em>
  ]
};

// Rendering result: <strong>Hello</strong> <em>World</em>
```

### `defineDecorator(name, template)`

Defines a decorator.

**Parameters:**
- `name: string` - Decorator name
- `template: RenderTemplate | Function` - Template or template function

**Returns:**
- `RendererDefinition` - Decorator definition

**Important**: 
- `defineDecorator()` internally uses `define()`, so all decorator templates are automatically converted to components
- `data-decorator="true"` attribute is automatically added

**Example:**
```typescript
// Static decorator
defineDecorator('highlight', element('div', {
  className: 'highlight',
  style: { backgroundColor: 'yellow' }
}, [text(' ')]));

// Dynamic decorator
defineDecorator('comment', (ctx) => {
  ctx.initState('showTooltip', false);
  
  return element('div', {
    className: 'comment-indicator',
    onMouseEnter: () => ctx.setState('showTooltip', true),
    onMouseLeave: () => ctx.setState('showTooltip', false)
  }, [
    text('💬'),
    portal(document.body, element('div', {
      className: 'comment-tooltip',
      style: {
        position: 'fixed',
        opacity: ctx.getState('showTooltip') ? 1 : 0
      }
    }, [text('Tooltip content')]))
  ]);
});
```

---

## Component Context API

Components receive a `ComponentContext` for state management.

### `initState(key, value)`

Initializes state.

**Parameters:**
- `key: string` - State key
- `value: any` - Initial value

**Example:**
```typescript
define('my-component', (props, ctx) => {
  ctx.initState('count', 0);
  ctx.initState('showModal', false);
  
  return element('div', [text(`Count: ${ctx.getState('count')}`)]);
});
```

### `getState(key)`

Gets state value.

**Parameters:**
- `key: string` - State key

**Returns:**
- `any` - State value

**Example:**
```typescript
const count = ctx.getState('count');
const showModal = ctx.getState('showModal');
```

### `setState(key, value)`

Sets state value.

**Parameters:**
- `key: string` - State key
- `value: any` - New value

**Example:**
```typescript
ctx.setState('count', 5);
ctx.setState('showModal', true);
```

### `toggleState(key)`

Toggles state value.

**Parameters:**
- `key: string` - State key

**Example:**
```typescript
ctx.toggleState('showModal'); // true -> false, false -> true
```

---

## Utility Functions

### `isDSLTemplate(obj)`

Distinguishes DSL template objects from regular HTML attribute objects.

**Parameters:**
- `obj: any` - Object to check

**Returns:**
- `boolean` - `true` if DSL template object, `false` otherwise

**Example:**
```typescript
// DSL template objects (returns true)
isDSLTemplate(text('Hello'))           // true
isDSLTemplate(data('name'))            // true
isDSLTemplate(element('div'))          // true
isDSLTemplate(when(true, text('ok')))  // true

// Regular objects (returns false)
isDSLTemplate({ type: 'text', placeholder: 'Enter text' })  // false - HTML input attributes
isDSLTemplate({ className: 'btn', disabled: true })        // false - HTML element attributes
```

**Use cases:**
- Used when interpreting parameters inside `element()` function
- DSL template objects are processed as children
- HTML attribute objects are processed as attributes

---

## Complete Examples

### Example 1: Simple Component

```typescript
import { define, element, text, data } from '@barocss/dsl';

define('paragraph', element('p', { className: 'paragraph' }, [
  data('text', '')
]));
```

### Example 2: Component with Slot

```typescript
define('card', element('div', { className: 'card' }, [
  element('header', { className: 'card-header' }, [
    data('attributes.title', 'Untitled')
  ]),
  element('div', { className: 'card-body' }, [
    slot('content')
  ]),
  element('footer', { className: 'card-footer' }, [
    slot('footer')
  ])
]));
```

### Example 3: Component with State

```typescript
define('counter', (props, ctx) => {
  ctx.initState('count', props.initialCount || 0);
  
  return element('div', { className: 'counter' }, [
    element('span', { className: 'count' }, [
      text(`${ctx.getState('count')}`)
    ]),
    element('button', {
      className: 'increment',
      onClick: () => ctx.setState('count', ctx.getState('count') + 1)
    }, [text('+')]),
    element('button', {
      className: 'decrement',
      onClick: () => ctx.setState('count', ctx.getState('count') - 1)
    }, [text('-')])
  ]);
});
```

### Example 4: Component with List

```typescript
define('list', element('ul', { className: 'list' }, [
  each('content', (item, index) =>
    element('li', { 
      key: item.sid,
      className: 'list-item'
    }, [
      data('text', '') // item.text
    ])
  )
]));
```

### Example 5: Component with Conditional Rendering

```typescript
define('conditional', (props, ctx) => {
  return element('div', {}, [
    when(props.showHeader, element('header', {}, [text('Header')])),
    when(props.showContent, element('main', {}, [slot('content')])),
    when(props.showFooter, element('footer', {}, [text('Footer')]))
  ]);
});
```

### Example 6: Component with Portal

```typescript
define('tooltip-component', (props, ctx) => {
  ctx.initState('showTooltip', false);
  
  return element('div', {
    onMouseEnter: () => ctx.setState('showTooltip', true),
    onMouseLeave: () => ctx.setState('showTooltip', false)
  }, [
    text('Hover me'),
    when(ctx.getState('showTooltip'),
      portal(document.body, element('div', {
        className: 'tooltip',
        style: { position: 'fixed', zIndex: 1000 }
      }, [text('Tooltip content')]))
    )
  ]);
});
```

---

## Related

- [Template System API](./reference#template-system-api) - Additional template API details
- [Portal API](./reference#portal-api) - Portal API details
- [State Management API](./reference#state-management-api) - Component context API
- [DSL Templates Guide](../concepts/dsl-templates) - DSL templates concepts
