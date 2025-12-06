# Renderer DOM DSL Specification

## Overview

The DSL (Domain Specific Language) of `@barocss/renderer-dom` allows you to define templates and create VNodes in a declarative and intuitive way.

## Core Concepts

- **DSL functions**: `element`, `text`, `data`, `slot`, `when`, `each`, `component`, `define`, etc.
- **Global registry**: Templates registered via `define()` are automatically stored in the global registry
- **VNode creation**: Use `build()` to transform model data into VNodes
- **Type safety**: TypeScript support to catch errors at compile time
- **Mark helpers**: `defineMark` for text mark rendering
- **Text container identification**: Automatic `data-text-container="true"` attribute for nodes with text content

## Basic DSL Functions

### element(tag, attrs?, children?)

Creates an HTML element with support for dynamic attributes and function children.

```typescript
// Basics
element('div')
element('div', { id: 'app' })
element('div', { id: 'app' }, [text('Hello')])

// Static attributes and children
element('button', {
  className: 'btn',
  onClick: () => console.log('clicked')
}, [
  text('Click me')
])

// Dynamic attributes using functions
element('div', {
  className: (d) => d.active ? 'active' : 'inactive',
  style: (d) => ({ color: d.color || 'black' })
}, [text('Dynamic content')])

// Function children for dynamic content
element('li', { className: 'feature' }, [
  (d) => d.name + (d.enabled ? ' ✓' : '')
])

// Mixed content with function children
element('div', { className: 'header' }, [
  text('Title: '),
  (d) => d.title,
  text(' by '),
  (d) => d.author
])

// Complex function children returning arrays
element('ul', { className: 'list' }, [
  (d) => d.items.map(item => 
    element('li', { className: 'item' }, [text(item.name)])
  )
])
```

**Function Children**: Functions passed as children are executed with the current data context and can return:
- Strings or numbers (rendered as text)
- Arrays of template objects
- Single template objects
- Mixed content arrays

**Function Attributes**: Functions passed as attributes are executed with the current data context and should return the attribute value.

### text(content)

Creates a text node.

```typescript
text('Hello World')
text(`Count: ${count}`)
```

### data(path, defaultValue?)

Accesses model data.

```typescript
// Simple paths
data('title')
data('user.name')

// Defaults
data('count', 0)
data('user.email', 'unknown@example.com')

// Nested object access
data('config.theme.color')
```

**Text Container Identification**: When a model node contains a `text` field, the rendered element automatically receives a `data-text-container="true"` attribute. This enables efficient identification of text containers for selection handling and editing operations.

```typescript
// Model with text field
const model = {
  type: 'paragraph',
  text: 'Hello world'
}

// Rendered as: <p data-bc-sid="..." data-bc-stype="paragraph" data-text-container="true">Hello world</p>
```

### slot(name)

Defines a slot. A slot references a specific field in the model. When that field is an array, each item is rendered as a component.

```typescript
// Define templates with slots
define('card', element('div', { className: 'card' }, [
  element('h3', [data('title')]),
  element('div', { className: 'content' }, [slot('content')])
]))

define('paragraph', element('p', { className: 'paragraph' }, [data('text')]))
define('button', element('button', { className: 'btn' }, [data('text')]))

// Model (slot array source)
const model = {
  type: 'card',
  title: 'Card Title',
  content: [  // array consumed by slot('content')
    { type: 'paragraph', text: 'Card content' },
    { type: 'button', text: 'Click' }
  ]
}

// The slot renders each array item as a component
element('card', model)

// How it works:
// slot('content') → for each array item, render a component determined by item.type
//   - { type: 'paragraph', text: '...' } → renders the 'paragraph' template
//   - { type: 'button', text: '...' } → renders the 'button' template
```

**Slot semantics:**
- `slot('fieldName')` references `model[fieldName]`
- If the value is an array → each item is treated as `{ type: 'component-name', ...props }`
- The `type` property determines which component/template to render
- If not an array → treated as an empty array (renders nothing)

### when(condition, then, else?)

Conditional rendering. **Evaluated at build-time** - the condition is checked when building the VNode, and only the chosen branch is included in the final VNode tree.

```typescript
// Basic conditional rendering
when(
  () => data('isVisible'),
  element('div', [text('Visible content')])
)

// With else
when(
  () => data('isLoggedIn'),
  element('div', [text('Welcome!')]),
  element('div', [text('Login required')])
)

// Functional condition
when(
  () => data('count') > 10,
  element('div', { className: 'warning' }, [text('Too many!')])
)
```

**Important**: `when` is expanded at build-time, not at reconcile time. This means:
- No runtime conditional logic in the reconcile layer
- The chosen branch template is immediately built into VNode children
- Components inside `when` branches are handled by normal component mounting
- No special anchoring or DOM markers for conditional content

### Array Iteration with Function Children

**Note**: The `each()` function has been removed in favor of function children with JavaScript's native `map()` method for better performance and simplicity.

```typescript
// Array iteration using function children (replaces each())
element('ul', { className: 'list' }, [
  (d) => d.items.map((item, index) => 
    element('li', { className: 'item' }, [text(`${index}: ${item.name}`)])
  )
])

// With conditional rendering
element('div', { className: 'features' }, [
  (d) => d.features.map(feature =>
    element('li', { className: 'feature' }, [
      text(feature.name + (feature.enabled ? ' ✓' : ''))
    ])
  )
])

// Complex nested iteration
element('div', { className: 'categories' }, [
  (d) => d.categories.map(category =>
    element('div', { className: 'category' }, [
      element('h3', [text(category.name)]),
      element('ul', { className: 'items' }, [
        ...category.items.map(item =>
          element('li', { className: 'item' }, [text(item.name)])
        )
      ])
    ])
  )
])
```

**Benefits of Function Children over `each()`:**
- Better performance (no DSL overhead)
- More flexible (can use any JavaScript array methods)
- Cleaner syntax
- Better TypeScript support
- Easier debugging

### component(nameOrFn, props?, children?, key?, initialState?)

Uses a component. Supports both registered components and inline components.

```typescript
// 1. Registered component usage
component('button', { text: 'Click me' })

// 2. With children
component('modal', { title: 'Title' }, [
  element('p', [text('Content')])
])

// 3. Inline component with initial state
function Counter(props: any, context: any) {
  return element('div', [
    text(`Count: ${context.state.count || 0}`),
    element('button', {
      onClick: () => context.setState({ count: (context.state.count || 0) + 1 })
    }, [text('+')])
  ]);
}

component(Counter, {}, [], undefined, { count: 10 })

// 4. Dynamic initial state
component(Counter, { multiplier: 5 }, [], undefined, (props: any) => ({ 
  count: props.multiplier * 2 
}))
```

**Parameters:**
- **nameOrFn**: Component name (string) or inline component function
- **props**: Props object or function `(data) => props`
- **children**: Array of child elements
- **key**: Stable key for reconciliation
- **initialState**: Initial state object or function `(props) => state` (inline components only)

For detailed component lifecycle and state management, see [Renderer Component Specification](./renderer-component-spec.md).

## Helper Functions

### isDSLTemplate(obj)

Determines whether an object is a valid DSL template object (as opposed to a regular HTML attribute object).

```typescript
// DSL template objects (returns true)
isDSLTemplate(text('Hello'))           // true - has type: 'text' and getter
isDSLTemplate(data('name'))            // true - has type: 'data' and path
isDSLTemplate(element('div'))          // true - has type: 'element' and tag
isDSLTemplate(component('button'))     // true - has type: 'component' and component
isDSLTemplate(when(true, text('ok')))  // true - has type: 'conditional' and condition

// Regular objects (returns false)
isDSLTemplate({ type: 'text', placeholder: 'Enter text' })  // false - HTML input attributes
isDSLTemplate({ className: 'btn', disabled: true })        // false - HTML element attributes
isDSLTemplate({ href: '#home', target: '_blank' })         // false - HTML link attributes
```

**Purpose**: This function is used internally by the `element()` function to correctly distinguish between:
- DSL template objects (should be treated as children)
- HTML attribute objects (should be treated as attributes)

**Implementation**: Checks for specific properties that DSL templates have:
- `text()` templates: `type: 'text'` + `getter` property
- `data()` templates: `type: 'data'` + `path` property  
- `element()` templates: `type: 'element'` + `tag` property
- `component()` templates: `type: 'component'` + `component` property
- `when()` templates: `type: 'conditional'` + `condition` property
- `each()` templates: `type: 'each'` + `items` property
- `portal()` templates: `type: 'portal'` + `target` property
- `slot()` templates: `type: 'slot'` + `name` property

### define(name, template)

Defines a component. This is the unified API for all component types. **All templates defined via `define()` are automatically converted to components**, ensuring consistent behavior across the DSL.

**Important**: `define()` automatically wraps `ElementTemplate` as a `ComponentTemplate`, making all renderers components. This simplifies the build process and ensures consistent behavior.

```typescript
// 1. ElementTemplate definition (automatically converted to ComponentTemplate)
define('button', element('button', { className: 'btn' }, [text('Button')]))
// Internally becomes: define('button', (props, ctx) => element('button', { className: 'btn' }, [text('Button')]))

// 2. Template with slots (automatically converted to ComponentTemplate)
define('card', element('div', { className: 'card' }, [
  element('h3', [slot('title')]),
  element('p', [slot('content')])
]))
// Internally becomes: define('card', (props, ctx) => element('div', { className: 'card' }, [...]))

// 3. Context-based component (with state) - explicit function component
define('counter', (props, context) => {
  context.initState({ count: 0 });
  return element('div', [
    text(`Count: ${context.state.count}`),
    element('button', {
      onClick: () => context.setState({ count: context.state.count + 1 })
    }, [text('+')])
  ]);
});

// 3b. Function-based component with full data access
define('bTable', (props, context) => {
  // props contains complete model data
  return element('table', { className: 'table' }, [
    // Can access nested properties
    ...(props?.attributes?.caption ? [
      element('caption', { className: 'table-caption' }, [
        data('attributes.caption') // Accesses props.attributes.caption
      ])
    ] : []),
    slot('content')
  ]);
});

// 4. External component (manages its own DOM)
define('chart', {
  mount: (props, container) => {
    // Mount external chart library
    return container;
  },
  update: (instance, prevProps, nextProps) => {
    // Update chart with new props
  },
  unmount: (instance) => {
    // Cleanup chart
  }
});
```

**Template Types:**
- **ElementTemplate** (automatically converted): Pure template without state - automatically wrapped as a function component `(props, ctx) => ElementTemplate`
- **ContextualComponent**: Function with `(props, context)` parameters for state management - explicitly defined as a function
- **Function-based Component**: Function with `(props, context)` that receives complete model data and can access nested properties via `data()` DSL
- **ExternalComponent**: Object with `mount(props, container)`, `update(instance, prevProps, nextProps)`, `unmount(instance)` methods for external library integration

**Component Conversion:**
When an `ElementTemplate` is passed to `define()`, it is automatically wrapped in a component function:

```typescript
// This:
define('card', element('div', { className: 'card' }))

// Becomes equivalent to:
define('card', (props, ctx) => element('div', { className: 'card' }))
```

This ensures all renderers are treated consistently as components, simplifying the build process. The `props` and `ctx` parameters are available in the wrapped function if needed in the future.

**Usage after definition:**
Once defined, components can be used with `element()`:

```typescript
// Define once
define('card', element('div', { className: 'card' }, [slot('content')]))

// Use anywhere
element('card', { id: 'card1' }, [text('Content')])
// Creates: { type: 'component', name: 'card', props: { id: 'card1', content: [...] } }
```

**ExternalComponent DOM Creation Flexibility:**
ExternalComponent supports multiple DOM creation approaches:
- **DOM API**: `document.createElement()`, `appendChild()` for fine-grained control
- **innerHTML**: Template strings for quick HTML generation
- **DSL Integration**: Use `element()`, `text()` with `VNodeBuilder` and `vnodeToDOM()` for declarative DOM creation

For detailed component definitions and state management, see [Renderer Component Specification](./renderer-component-spec.md).

#### Dynamic tag

- `tag` can be a function `(data) => string`. It is evaluated at build-time and the returned string is used as the actual tag name.
- Registered component names must be literal strings to be resolved via the registry; dynamic tags are for native tag selection.

```typescript
// Heading level chooses h1..h6 at build-time
define('heading', (model: any) =>
  element((d) => `h${d?.attributes?.level || 1}`,
    { className: 'heading' },
    [data('text')]
  )
)
```

#### Children normalization

- Nested arrays in `children` are flattened at build-time: `[1, [2, 3], 4] → [1, 2, 3, 4]`.
- Primitive-only children (no element children) are coalesced into a single text node: `['A','B','C'] → text: 'ABC'`.
- When at least one element child exists, primitives are kept in VNode text (not rendered as sibling text nodes). The element children remain as children.

```typescript
// Flattening
element('div', [ 'A', ['B', 'C'], 'D' ]) // → text: 'ABCD'

// Mixed with element child: only element is rendered as child
element('div', [ 'A', element('span','T'), 'B' ])
// → children: [ <span>T</span> ], text kept in VNode for diffing (not rendered as sibling text)
```

### defineMark(type, template)

Registers a custom renderer for a text mark `type`. When a template uses `data('text')`, text is virtually split by mark ranges and each run may use a matched `defineMark` template.

sl **Important**: `defineMark()` internally uses `define()`, so all mark templates are automatically converted to components. The template passed to `defineMark()` is wrapped as a component function.

```typescript
// This:
defineMark('bold', element('strong', [data('text')]))

// Is equivalent to:
define('mark:bold', element('strong', [data('text')]))
// Which internally becomes a component: define('mark:bold', (props, ctx) => element('strong', [data('text')]))
```

Props inside mark templates:
- `text: string` — the current run text
- `attrs?: Record<string, any>` — attributes from the corresponding mark (if present on the model)
- `run: { start: number; end: number; types?: string[]; classes: string[] }`
- `model: any` — original node model

Default behavior when no custom mark matches:
- If run includes `code` → `<code>{text}</code>`
- Else → `<span class="...mark-...">{text}</span>` with composed classes

Examples:
```typescript
// ElementTemplate (automatically converted to ComponentTemplate)
defineMark('bold', element('strong', [data('text')]));

// Complex mark with attributes
defineMark('link', element('a', {
  href: (p: any) => p?.attrs?.href,
  title: (p: any) => p?.attrs?.title,
  className: 'mark-link'
}, [data('text')]));

// Mark with dynamic styles
defineMark('highlight', element('span', {
  className: 'highlight',
  style: { backgroundColor: (p: any) => p?.attrs?.bg, color: (p: any) => p?.attrs?.fg }
}, [data('text')]));

// Function component for marks (explicit component)
defineMark('custom-mark', (props, context) => {
  return element('span', {
    className: 'custom-mark',
    style: { color: props?.attrs?.color || 'black' }
  }, [data('text')]);
});
```

### defineDecorator(name, template)

Registers a decorator renderer. Decorators are components that wrap other content, typically used for styling, tooltips, or other visual enhancements. The decorator automatically adds `data-decorator="true"` attribute to the template.

**Important**: `defineDecorator()` internally uses `define()`, so all decorator templates are automatically converted to components. The template passed to `defineDecorator()` is wrapped as a component function.

```typescript
// This:
defineDecorator('highlight', element('div', { className: 'highlight' }, [slot('content')]))

// Is equivalent to:
define('highlight', {
  ...element('div', { className: 'highlight', 'data-decorator': 'true' }, [slot('content')])
})
// Which internally becomes a component with data-decorator attribute
```

**Decorator Behavior:**
- Automatically adds `data-decorator="true"` attribute to the template
- Automatically adds `data-skip-reconcile="true"` attribute for reconciliation hints
- Decorators wrap content via `slot('content')` to receive children

Examples:
```typescript
// ElementTemplate decorator (automatically converted to ComponentTemplate)
defineDecorator('highlight', element('div', { 
  className: 'highlight',
  style: { backgroundColor: 'yellow' }
}, [slot('content')]));

// Decorator with data binding
defineDecorator('tooltip', element('div', { 
  className: 'decorator-tooltip',
  'data-tooltip': data('tooltipText')
}, [slot('content')]));

// Decorator with conditional rendering
defineDecorator('conditional-tooltip', element('div', { 
  className: 'decorator-container'
}, [
  when(d => d.showTooltip, element('div', { className: 'tooltip' }, [data('tooltipText')])),
  slot('content')
]));

// Function component decorator (explicit component)
defineDecorator('dynamic-decorator', (props, context) => {
  return element('div', {
    className: 'decorator',
    'data-decorator': 'true',
    style: { 
      border: `2px solid ${props?.borderColor || 'black'}` 
    }
  }, [slot('content')]);
});
```

**Usage:**
Decorators are typically applied via the decorator system in the model, not directly in templates. They wrap content defined by the model's decorator configuration.

### portal(target, template, portalId?)

Creates a Portal that renders content in a different DOM container. Portals are useful for tooltips, modals, and overlays that need to be rendered outside the normal component tree. Multiple portals can share the same target without interference.

**Parameters:**
- `target: HTMLElement` - The DOM container where the portal content will be rendered
- `template: RenderTemplate` - The template to render inside the portal
- `portalId?: string` - Optional unique identifier for the portal (auto-generated if not provided)

**Returns:**
- `PortalTemplate` - A portal template object with unique container management

**Examples:**
```typescript
// Basic portal usage
portal(document.body, element('div', {
  className: 'tooltip',
  style: {
    position: 'fixed',
    zIndex: 1000,
    opacity: 0
  }
}, [text('Tooltip content')]), 'tooltip-portal')

// Portal with state management
define('comment', (props, context) => {
  context.initState('showTooltip', false);
  
  return element('div', {
    onMouseEnter: () => context.setState('showTooltip', true),
    onMouseLeave: () => context.setState('showTooltip', false)
  }, [
    text('💬'),
    portal(document.body, element('div', {
      className: 'comment-tooltip',
      style: {
        position: 'fixed',
        zIndex: 1001,
        opacity: context.getState('showTooltip') ? 1 : 0,
        transition: 'opacity 0.2s ease'
      }
    }, [text('Tooltip content')]), 'comment-tooltip')
  ]);
});

// Multiple portals sharing the same target
define('rich-component', (props, context) => {
  context.initState('showTooltip', false);
  context.initState('showModal', false);
  
  return element('div', [
    text('Content'),
    
    // Tooltip portal with unique ID
    portal(document.body, element('div', {
      className: 'tooltip',
      style: {
        position: 'fixed',
        opacity: context.getState('showTooltip') ? 1 : 0
      }
    }, [text('Tooltip')]), 'main-tooltip'),
    
    // Modal portal with unique ID
    portal(document.body, element('div', {
      className: 'modal',
      style: {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        opacity: context.getState('showModal') ? 1 : 0
      }
    }, [text('Modal content')]), 'main-modal')
  ]);
});

// Complex portal interactions with same target
define('dashboard', (props, context) => {
  return element('div', [
    text('Dashboard'),
    
    // Notification portal
    when(props.showNotification, 
      portal(document.body, element('div', {
        className: 'notification',
        style: { position: 'fixed', top: '10px', right: '10px' }
      }, [text(props.notificationMessage)]), 'notification')
    ),
    
    // Modal portal
    when(props.showModal,
      portal(document.body, element('div', {
        className: 'modal-overlay',
        style: { position: 'fixed', top: '0', left: '0', width: '100%', height: '100%' }
      }, [text(props.modalContent)]), 'modal')
    ),
    
    // Sidebar portal
    when(props.showSidebar,
      portal(document.body, element('div', {
        className: 'sidebar',
        style: { position: 'fixed', top: '0', left: '0', width: '200px', height: '100%' }
      }, [text(props.sidebarContent)]), 'sidebar')
    )
  ]);
});
```

**Portal Behavior:**
- Portals render their content in independent containers within the specified target
- Portal content is managed independently from the parent component's DOM tree
- Portal templates support all standard DSL functions (element, text, data, etc.)
- Portal visibility and positioning are controlled via CSS styles in the template
- Portals are reconciled separately from the main component tree
- Multiple portals can share the same target without interference through unique container IDs
- Portal updates preserve existing DOM state (focus, scroll position, etc.)
- Portal containers preserve existing DOM content in the target
- Portal ID-based container reuse enables efficient portal management

## Mixed Content Handling

Mixed content refers to elements that contain both text content and child elements. The DSL ensures proper rendering order and efficient DOM updates.

### Text and Element Ordering

```typescript
// Mixed content with correct ordering
element('li', { className: 'item' }, [
  element('strong', [text('Bold text')]),
  text(' and regular text')
])

// Renders as: <li><strong>Bold text</strong> and regular text</li>
// Order is preserved: element children first, then text content
```

### Function Children in Mixed Content

```typescript
// Dynamic mixed content
element('div', { className: 'header' }, [
  text('Title: '),
  (d) => d.title,
  text(' by '),
  (d) => d.author,
  text(' on '),
  (d) => d.date
])

// Complex mixed content with arrays
element('div', { className: 'features' }, [
  text('Features: '),
  (d) => d.features.map(feature => 
    element('span', { className: 'feature' }, [
      text(feature.name + (feature.enabled ? ' ✓' : ''))
    ])
  )
])
```

### Performance Optimizations

- **Single text VNode optimization**: When an element has only one text child, it's stored directly in `vnode.text` for efficiency
- **Ordered children array**: All children (elements and text) are stored in a single ordered array to maintain correct rendering sequence
- **Text flushing**: Text parts are accumulated and flushed as VNodes when element children are encountered

### DOM Update Behavior

- **Text updates**: When text content changes, the reconcile system finds and updates the appropriate text nodes
- **Element updates**: Element children are reconciled using their keys and types
- **Mixed updates**: Both text and element updates are handled efficiently without full re-rendering

### Keyed vs Unkeyed Lists (Reconcile Semantics)

- Provide `key` on siblings when identity must be preserved across reorders
- Mixed lists are supported: keyed children are moved first; unkeyed are matched by index
- Special IDs like `data-bc-sid` are not used for reconcile matching

## Advanced DSL Patterns

### Nested Templates

```typescript
// Layout template
define('layout', element('div', { className: 'layout' }, [
  element('header', [slot('header')]),
  element('main', [slot('content')]),
  element('footer', [slot('footer')])
]))

// Page template
define('page', element('div', { className: 'page' }, [
  element('h1', [data('title')]),
  element('div', { className: 'content' }, [slot('body')])
]))

// Component definitions
define('heading', element('h1', { className: 'heading' }, [data('text')]))
define('paragraph', element('p', { className: 'paragraph' }, [data('text')]))
define('button', element('button', { className: 'btn' }, [data('text')]))

// Model (slot arrays)
const model = {
  type: 'layout',
  header: [
    { type: 'heading', text: 'My App' }
  ],
  content: [
    { 
      type: 'page', 
      title: 'Page Title',
      body: [
        { type: 'paragraph', text: 'Page content' },
        { type: 'button', text: 'Click' }
      ]
    }
  ],
  footer: [
    { type: 'paragraph', text: '© 2024' }
  ]
}

// Slots render arrays into component children
element('layout', model)
```

### Dynamic Attributes

```typescript
// Conditional class
element('div', {
  className: when(
    () => data('isActive'),
    'active',
    'inactive'
  )
})

// Dynamic styles
element('div', {
  style: {
    color: data('color', '#000'),
    fontSize: data('size', '14px')
  }
})

// Event handler
element('button', {
  onClick: () => {
    const count = data('count');
    // state update logic
  }
})
```

Binding resolution rules:
- Attribute values may be primitives, functions `(props) => any`, `data('path')`, or `attr('path')`.
- For `style`, each key supports the same forms; values are evaluated at build time.

### Complex Conditional Rendering

```typescript
// Multi-branch
when(
  () => data('user.role') === 'admin',
  element('div', { className: 'admin-panel' }, [
    element('h3', [text('Admin Panel')]),
    element('button', { onClick: () => console.log('admin action') }, [text('Manage')])
  ])
)

// Nested conditions (both evaluated at build-time)
when(
  () => data('isLoggedIn'),
  when(
    () => data('user.isVerified'),
    element('div', [text('Verified user')]),
    element('div', [text('Verification required')])
  ),
  element('div', [text('Login required')])
)
```

**Note**: Nested `when` conditions are all evaluated at build-time. The final VNode tree contains only the selected branches, with no runtime conditional logic.

### List Rendering Patterns

```typescript
// Basic list
element('ul', {}, [
  each(
    'items',
    (item) => element('li', [text(item.name)]),
    (item) => item.sid
  )
])

// Filtered list
element('ul', {}, [
  each(
    'items', // filter in render if needed
    (item) => item.active ? element('li', { className: 'active' }, [text(item.name)]) : null,
    (item) => item.sid
  )
])

// Sorted list
element('ul', {}, [
  each(
    'items',
    (item) => element('li', [text(item.name)]),
    (item) => item.sid
  )
])
```

## Component State Management

Context-based components have access to state management through the `context` parameter. For detailed state management and event system, see [Renderer Component Specification](./renderer-component-spec.md).

## Performance Optimization

### Key-based Optimization

```typescript
// Efficient list rendering
each(
  'items',
  (item) => element('div', { key: item.sid }, [text(item.name)]),
  (item) => item.sid // stable key
)

// Explicit component key
component('expensive-component', props, children, 'stable-key')
```

### Conditional Rendering Optimization

```typescript
// Functional condition (evaluated at build-time)
when(
  () => data('count') > 10,
  element('div', [text('Many')])
)

// Value-based condition (evaluated at build-time)
when(
  data('count') > 10,
  element('div', [text('Many')])
)
```

**Note**: Both functional and value-based conditions are evaluated at build-time when creating the VNode. The performance difference is minimal since the condition is only checked once per render cycle during VNode building.

## Error Handling

### Safe Data Access

```typescript
// Defaults for safe access
data('user.name', 'Unknown')
data('config.theme', 'light')

// Guarded conditional rendering
when(
  () => data('user') && data('user.name'),
  element('div', [text(data('user.name'))]),
  element('div', [text('No user info')])
)
```

### Validation

```typescript
// Validate data before rendering
when(
  () => data('items') && Array.isArray(data('items')),
  each(
    data('items'),
    (item) => item.sid,
    (item) => element('li', [text(item.name)])
  ),
  element('div', [text('Loading data...')])
)
```

## Best Practices

### 1. Template Reusability

```typescript
// Reusable components
define('button', element('button', { className: 'btn' }, [data('text')]))
define('icon', element('span', { className: 'icon' }, [data('name')]))

// Model (slot array source)
const model = {
  type: 'button',
  text: 'Click me'
}

// Or with slots
define('button-with-icon', element('button', { className: 'btn' }, [slot('content')]))

const buttonWithIconModel = {
  type: 'button-with-icon',
  content: [
    { type: 'icon', name: 'star' },
    { type: 'text', value: 'Favorite' }
  ]
}
```

### 2. Clear Data Flow

```typescript
// Clear prop passing
component('user-card', {
  name: data('user.name'),
  email: data('user.email'),
  avatar: data('user.avatar')
})
```

### 3. Portal Management

```typescript
// Use unique portal IDs for multiple portals sharing the same target
define('app', (props, context) => {
  return element('div', [
    text('Main App'),
    
    // Each portal has a unique ID
    portal(document.body, element('div', { className: 'notification' }, [
      text('Notification')
    ]), 'notification'),
    
    portal(document.body, element('div', { className: 'modal' }, [
      text('Modal')
    ]), 'modal'),
    
    portal(document.body, element('div', { className: 'tooltip' }, [
      text('Tooltip')
    ]), 'tooltip')
  ]);
});

// Portal with conditional rendering
define('conditional-portal', (props, context) => {
  return element('div', [
    text('Content'),
    
    when(props.showModal,
      portal(document.body, element('div', { className: 'modal' }, [
        text('Modal Content')
      ]), 'conditional-modal')
    )
  ]);
});
```

### 4. Performance Considerations

```typescript
// Build-time conditional evaluation
when(
  data('isVisible'), // evaluated once at build-time
  element('div', [text('Content')])
)

// Stable keys
each(
  data('items'),
  (item) => item.sid, // stable key
  (item) => element('div', [text(item.name)])
)

// Portal ID reuse for efficient container management
portal(target, template, 'stable-portal-sid') // Reuses existing container
```

**Note**: Since `when` conditions are evaluated at build-time, there's no runtime performance difference between functional and value-based conditions. The condition is checked once when building the VNode tree.

### 5. Text Container Design

```typescript
// Good: Model with text field automatically gets data-text-container="true"
const textNode = {
  type: 'inline-text',
  text: 'Editable content'
}

// Good: Non-text nodes don't get the attribute
const imageNode = {
  type: 'image',
  src: 'path/to/image.jpg',
  alt: 'Description'
}

// The renderer automatically handles text container identification
// based on the presence of the 'text' field in the model
```

**Guidelines**:
- Use `text` field in model nodes that should be identified as text containers
- The `data-text-container="true"` attribute is added automatically by the renderer
- This enables schema-independent text container identification for selection handling

## Portal System Improvements

The Portal system has been enhanced with the following key improvements:

### Multiple Portal Support
- **Unique Portal IDs**: Each portal can have a unique identifier to enable multiple portals sharing the same target
- **Independent Containers**: Portals create independent containers within the target, preserving existing DOM content
- **No Interference**: Multiple portals can coexist in the same target without conflicts

### Enhanced Portal Behavior
- **Container Preservation**: Portal containers preserve existing DOM content in the target
- **State Preservation**: Portal updates preserve DOM state (focus, scroll position, etc.)
- **Efficient Updates**: Portal updates use reconcile algorithm instead of full re-rendering
- **ID-based Reuse**: Portal containers are reused based on unique portal IDs

### Usage Examples
```typescript
// Multiple portals sharing document.body
portal(document.body, tooltipTemplate, 'tooltip')
portal(document.body, modalTemplate, 'modal')
portal(document.body, notificationTemplate, 'notification')

// Conditional portals with unique IDs
when(props.showModal, portal(document.body, modalTemplate, 'conditional-modal'))
```

## References

- [Renderer DOM Specification](./renderer-dom-spec.md) - Core rendering system
- [Renderer Component Specification](./renderer-component-spec.md) - Component system details
- [Portal System Specification](../docs/portal-system-spec.md) - Portal system details
