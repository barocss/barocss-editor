# BaroCSS Editor API Reference

## Portal API

### portal(target, template, portalId?)

A DSL function that creates a Portal. Renders a template to a specified DOM container and creates independent containers so multiple Portals can share the same target.

**Parameters:**
- `target: HTMLElement` - DOM container where Portal will be rendered
- `template: RenderTemplate` - Template to render in Portal
- `portalId?: string` - Optional Portal unique identifier (auto-generated)

**Returns:**
- `PortalTemplate` - Portal template object

**Features:**
- **Independent Container**: Each Portal has its own container and doesn't interfere with others
- **Preserve Existing DOM**: Doesn't touch existing content of Portal target
- **State Preservation**: Preserves DOM state (focus, scroll, etc.) on Portal update
- **Performance Optimization**: Efficient updates using reconcile algorithm

**Examples:**
```typescript
// Basic usage
const tooltip = portal(document.body, element('div', {
  className: 'tooltip',
  style: {
    position: 'fixed',
    zIndex: 1000,
    opacity: 0
  }
}, [text('Tooltip content')]), 'tooltip-portal');

// Integration with state
defineDecorator('comment', (ctx) => {
  ctx.initState('showTooltip', false);
  
  return element('div', {
    onMouseEnter: () => ctx.setState('showTooltip', true),
    onMouseLeave: () => ctx.setState('showTooltip', false)
  }, [
    text('💬'),
    portal(document.body, element('div', {
      className: 'comment-tooltip',
      style: {
        position: 'fixed',
        zIndex: 1001,
        opacity: ctx.getState('showTooltip') ? 1 : 0,
        transition: 'opacity 0.2s ease'
      }
    }, [text('Tooltip content')]), 'comment-tooltip')
  ]);
});

// Multiple Portals sharing same target
define('multi-portal-component', (props, ctx) => {
  return element('div', [
    text('Main App'),
    
    // Assign unique ID to each Portal
    portal(document.body, element('div', { 
      className: 'notification',
      style: { position: 'fixed', top: '10px', right: '10px' }
    }, [text('Notification')]), 'notification'),
    
    portal(document.body, element('div', { 
      className: 'modal',
      style: { position: 'fixed', top: '50%', left: '50%' }
    }, [text('Modal')]), 'modal'),
    
    portal(document.body, element('div', { 
      className: 'tooltip',
      style: { position: 'fixed', bottom: '10px', left: '10px' }
    }, [text('Tooltip')]), 'tooltip')
  ]);
});

// Conditional Portal
define('conditional-portal-component', (props, ctx) => {
  return element('div', {}, [
    text('Main content'),
    when(
      (data) => !!data.showPortal,
      portal(
        document.body,
        element('div', { 
          'data-testid': 'conditional-portal',
          style: { position: 'fixed', top: '0', right: '0' }
        }, [text('Conditional portal content')])
      )
    )
  ]);
});

// Data binding Portal
define('data-bound-portal-component', (props, ctx) => {
  return element('div', {}, [
    portal(
      document.body,
      element('div', { 
        'data-testid': 'data-bound-portal',
        style: { 
          backgroundColor: data('backgroundColor'),
          color: data('textColor')
        }
      }, [
        data('message')
      ])
    )
  ]);
});

// Nested component Portal
define('portal-child', (props, ctx) => {
  return element('div', { 
    'data-testid': 'portal-child',
    style: { border: '1px solid red' }
  }, [
    text(`Child content: ${props.message}`)
  ]);
});

define('portal-parent', (props, ctx) => {
  return element('div', {}, [
    portal(
      document.body,
      element('div', { 'data-testid': 'portal-parent' }, [
        element('portal-child', { message: props.childMessage })
      ])
    )
  ]);
});
```

## State Management API

### ComponentContext

A state management Context that can be used in components and decorators.

#### initState(key, value)

Initializes state.

**Parameters:**
- `key: string` - State key
- `value: any` - Initial value

**Example:**
```typescript
define('my-component', (ctx) => {
  ctx.initState('count', 0);
  ctx.initState('showModal', false);
  
  return element('div', [text(`Count: ${ctx.getState('count')}`)]);
});
```

#### getState(key)

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

#### setState(key, value)

Sets state value.

**Parameters:**
- `key: string` - State key
- `value: any` - New value

**Example:**
```typescript
ctx.setState('count', 5);
ctx.setState('showModal', true);
```

#### toggleState(key)

Toggles state value.

**Parameters:**
- `key: string` - State key

**Example:**
```typescript
ctx.toggleState('showModal'); // true -> false, false -> true
```

## Template System API

### isDSLTemplate(obj)

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
isDSLTemplate(component('button'))     // true
isDSLTemplate(when(true, text('ok')))  // true

// Regular objects (returns false)
isDSLTemplate({ type: 'text', placeholder: 'Enter text' })  // false - HTML input attributes
isDSLTemplate({ className: 'btn', disabled: true })        // false - HTML element attributes
isDSLTemplate({ href: '#home', target: '_blank' })         // false - HTML link attributes
```

**Use cases:**
- Used when interpreting parameters inside `element()` function
- DSL template objects are processed as children
- HTML attribute objects are processed as attributes

### define(name, template)

Defines a component.

**Parameters:**
- `name: string` - Component name
- `template: RenderTemplate | Function` - Template or template function

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
define('bTable', (props, context) => {
  // props contains full model data
  return element('table', { className: 'table' }, [
    // Can access nested properties
    ...(props?.attributes?.caption ? [
      element('caption', { className: 'table-caption' }, [
        data('attributes.caption') // Access props.attributes.caption
      ])
    ] : []),
    slot('content')
  ]);
});
```

**Template Types:**
- **ElementTemplate** (automatic conversion): Stateless pure template - Automatically converted to `ComponentTemplate` when passed to `define()` (`(props, ctx) => ElementTemplate`)
- **ContextualComponent**: State management function with `(props, context)` parameters - Explicitly defined as function
- **Function-based Component**: Function that can access full model data and use nested properties with `data()` DSL
- **ExternalComponent**: Object with `mount`, `update`, `unmount` methods for external library integration

**Important**: The `define()` function automatically converts all templates to components:
```typescript
// ElementTemplate (automatic conversion)
define('card', element('div', { className: 'card' }))
// Internally: define('card', (props, ctx) => element('div', { className: 'card' }))
```

### defineMark(type, template)

Defines a text mark. Marks are features for applying formatting to text.

**Important**: `defineMark()` internally uses `define()`, so all mark templates are automatically converted to components.

**Parameters:**
- `type: string` - Mark type (e.g., 'bold', 'italic', 'underline')
- `template: RenderTemplate` - Template to render when mark is applied

**Returns:**
- `RendererDefinition` - Mark definition object

**Example:**
```typescript
// Basic mark definitions
defineMark('bold', element('strong', [data('text')]));
defineMark('italic', element('em', [data('text')]));
defineMark('underline', element('u', [data('text')]));
defineMark('code', element('code', [data('text')]));

// Usage
const model = {
  type: 'text',
  text: 'Hello World',
  marks: [
    { type: 'bold', range: [0, 5] },      // "Hello" as <strong>
    { type: 'italic', range: [6, 11] }    // "World" as <em>
  ]
};

// Rendering result: <strong>Hello</strong> <em>World</em>
```

**Mark System Features:**
- Marks are applied to text via `marks` attribute
- Apply range specified as `range: [start, end]` format
- Multiple marks can overlap
- Marks are automatically wrapped in appropriate HTML elements

### defineDecorator(name, template)

Defines a decorator.

**Important**: `defineDecorator()` internally uses `define()`, so all decorator templates are automatically converted to components. Also, `data-decorator="true"` attribute is automatically added.

**Parameters:**
- `name: string` - Decorator name
- `template: RenderTemplate | Function` - Template or template function

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

### element(tag, attributes?, children?)

Creates an HTML element. Supports dynamic attributes and function children.

**Parameters:**
- `tag: string | Function` - HTML tag or dynamic tag function
- `attributes?: ElementAttributes | Function` - Element attributes or dynamic attribute function (optional)
- `children?: ElementChild[]` - Child elements (optional)

**Returns:**
- `ElementTemplate` - Element template

**ElementChild Type:**
```typescript
type ElementChild = 
  | string 
  | number 
  | ElementTemplate 
  | SlotTemplate 
  | DataTemplate 
  | ConditionalTemplate 
  | ComponentTemplate 
  | PortalTemplate 
  | ((data: any) => ElementChild)  // Function child
  | ElementChild[]
```

**Example:**
```typescript
// Basic element
element('div', { className: 'container' }, [text('Hello')]);

// Dynamic tag
element((model) => `h${model.level}`, { className: 'heading' }, [text('Title')]);

// Dynamic attributes (function)
element('div', {
  className: (d) => d.active ? 'active' : 'inactive',
  style: (d) => ({ color: d.color || 'black' })
}, [text('Dynamic content')]);

// Function child
element('li', { className: 'feature' }, [
  (d) => d.name + (d.enabled ? ' ✓' : '')
]);

// Mixed content (text + function child)
element('div', { className: 'header' }, [
  text('Title: '),
  (d) => d.title,
  text(' by '),
  (d) => d.author
]);

// Array-returning function child (replacement for each)
element('ul', { className: 'list' }, [
  (d) => d.items.map(item => 
    element('li', { className: 'item' }, [text(item.name)])
  )
]);

// Event handlers
element('button', {
  onClick: (e) => console.log('clicked'),
  onMouseEnter: (e) => console.log('hovered')
}, [text('Click me')]);

// Styles
element('div', {
  style: {
    position: 'fixed',
    top: '10px',
    left: '10px',
    zIndex: 1000,
    opacity: 0.8
  }
}, [text('Fixed element')]);
```

**Function Child Features:**
- Function receives current data context as parameter
- Can return string, number, template object, or array
- If array is returned, each item is processed as individual VNode

**Function Attribute Features:**
- Function receives current data context as parameter
- Must return attribute value (string, number, object, etc.)

### text(content)

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

### data(path, defaultValue?)

Creates data binding.

**Parameters:**
- `path: string` - Data path
- `defaultValue?: any` - Default value (optional)

**Returns:**
- `DataTemplate` - Data template

**Example:**
```typescript
data('user.name', 'Unknown');
data('count');
data('settings.theme', 'light');
```

## ExternalComponent API

### ExternalComponent Interface

Component interface for integrating with external libraries.

**Interface:**
```typescript
interface ExternalComponent {
  // Template function (used in registerContextComponent)
  template?: ContextualComponent;
  
  // Component mount (add to DOM) - context optionally provided for state management
  mount(container: HTMLElement, props: Record<string, any>, id: string, context?: ComponentContext): HTMLElement;
  
  // Component update (props change) - read-only state access via instance.state
  update?(instance: ComponentInstance, prevProps: Record<string, any>, nextProps: Record<string, any>): void;
  
  // Component unmount (remove from DOM) - context optionally provided for cleanup
  unmount(instance: ComponentInstance, context?: ComponentContext): void;
  
  // Whether component directly manages DOM
  managesDOM?: boolean;
}
```

### DOM Creation Methods

ExternalComponent can create DOM in **3 ways**:

#### 1. DOM API Method
```typescript
const TraditionalComponent: ExternalComponent = {
  mount: (container, props, id) => {
    const div = document.createElement('div');
    const span = document.createElement('span');
    const button = document.createElement('button');
    
    span.textContent = props.count || '0';
    button.textContent = '+';
    
    div.appendChild(span);
    div.appendChild(button);
    container.appendChild(div);
    
    return div;
  }
};
```

#### 2. innerHTML Method
```typescript
const InnerHTMLComponent: ExternalComponent = {
  mount: (container, props, id) => {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="counter">
        <span class="count">${props.count || 0}</span>
        <button class="increment">+</button>
      </div>
    `;
    
    container.appendChild(div);
    return div;
  }
};
```

#### 3. DSL Method
```typescript
const DSLComponent: ExternalComponent = {
  mount: (container, props, id) => {
    // Declarative DOM creation using DSL
    const template = element('div', { className: 'counter' }, [
      element('span', { className: 'count' }, [text(`${props.count || 0}`)]),
      element('button', { className: 'increment' }, [text('+')])
    ]);
    
    // Convert DSL to DOM
    const builder = new VNodeBuilder(registry);
    const vnode = builder.buildFromElementTemplate(template, props);
    const div = vnodeToDOM(vnode, container);
    
    container.appendChild(div);
    return div;
  }
};
```

### Method Comparison

| Method | Advantages | Disadvantages | When to Use |
|------|------|------|-----------|
| **DOM API** | Fine-grained control, performance optimization | Long and complex code | When complex DOM manipulation is needed |
| **innerHTML** | Simple and fast, HTML-friendly | XSS risk, lack of type safety | Rapid prototyping, simple structure |
| **DSL** | Type safe, consistent, declarative | Learning curve, slight overhead | Complex UI, maintainability priority |

### Usage Example

```typescript
// Counter component using DSL
const DSLCounter: ExternalComponent = {
  mount: (container, props, id) => {
    const template = element('div', { className: 'dsl-counter' }, [
      element('span', { className: 'count' }, [text(`${props.initialCount || 0}`)]),
      element('button', { className: 'increment' }, [text('+')]),
      element('button', { className: 'decrement' }, [text('-')])
    ]);
    
    const builder = new VNodeBuilder(registry);
    const vnode = builder.buildFromElementTemplate(template, props);
    const div = vnodeToDOM(vnode, container);
    
    // Add event listeners
    let count = props.initialCount || 0;
    const incrementBtn = div.querySelector('.increment')!;
    const decrementBtn = div.querySelector('.decrement')!;
    const countSpan = div.querySelector('.count')!;
    
    incrementBtn.addEventListener('click', () => {
      count++;
      countSpan.textContent = count.toString();
    });
    
    decrementBtn.addEventListener('click', () => {
      count--;
      countSpan.textContent = count.toString();
    });
    
    container.appendChild(div);
    return div;
  },
  
  update: (instance, prevProps, nextProps) => {
    const countSpan = instance.element.querySelector('.count')!;
    if (nextProps.initialCount !== prevProps.initialCount) {
      countSpan.textContent = nextProps.initialCount?.toString() || '0';
    }
  },
  
  unmount: (instance) => {
    instance.element.remove();
  }
};

// Component registration
registry.register(define('dsl-counter', DSLCounter));
```

## Portal Container Management API

### Portal Container Structure

The Portal system creates independent containers for each Portal:

```html
<!-- Target element with existing content -->
<div id="target">
  <div id="existing-content">Existing content</div>
  
  <!-- Portal containers (added by portal system) -->
  <div data-portal="portal-a" data-portal-container="true" style="position: relative;">
    <div>Portal A content</div>
  </div>
  
  <div data-portal="portal-b" data-portal-container="true" style="position: relative;">
    <div>Portal B content</div>
  </div>
</div>
```

### Portal Container Attributes

- `data-portal`: Portal's unique identifier
- `data-portal-container="true"`: Marker indicating Portal container
- `style="position: relative"`: Position reference point for Portal content

### Portal Container Management Functions

```typescript
// Find Portal container
function findPortalContainer(target: HTMLElement, portalId: string): HTMLElement | null {
  return target.querySelector(`[data-portal="${portalId}"]`);
}

// Create Portal container
function createPortalContainer(portalId: string, target: HTMLElement): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('data-portal', portalId);
  container.setAttribute('data-portal-container', 'true');
  container.style.position = 'relative';
  target.appendChild(container);
  return container;
}

// Remove Portal container
function removePortalContainer(portalId: string, target: HTMLElement): void {
  const container = target.querySelector(`[data-portal="${portalId}"]`);
  if (container) {
    container.remove();
  }
}
```

## Portal Performance Optimization API

### Portal Update Optimization

The Portal system provides the following performance optimizations:

```typescript
// Container reuse based on Portal ID
define('optimized-portal', (props, ctx) => {
  return element('div', [
    // Reuse container with fixed Portal ID
    portal(document.body, element('div', {
      className: 'optimized-portal',
      style: { position: 'fixed' }
    }, [text('Optimized content')]), 'fixed-portal-id')
  ]);
});

// Prevent unnecessary rendering with conditional Portal
define('conditional-optimized-portal', (props, ctx) => {
  return element('div', [
    when(props.showPortal,
      portal(document.body, element('div', {
        className: 'conditional-portal'
      }, [text('Conditional content')]), 'conditional-portal-id')
    )
  ]);
});
```

### Portal State Preservation

Preserves DOM state on Portal update:

```typescript
// Portal with input field - preserves focus state
define('form-portal', (props, ctx) => {
  return element('div', [
    portal(document.body, element('div', {
      className: 'form-portal',
      style: { position: 'fixed' }
    }, [
      element('input', { 
        type: 'text',
        placeholder: 'Enter text...',
        // Focus state is preserved on Portal update
      }),
      element('button', [text('Submit')])
    ]), 'form-portal-id')
  ]);
});
```

### Portal Memory Management

```typescript
// Portal cleanup function
function cleanupPortals(target: HTMLElement): void {
  const portalContainers = target.querySelectorAll('[data-portal-container="true"]');
  portalContainers.forEach(container => {
    container.remove();
  });
}

// Clean up specific Portal only
function cleanupPortal(portalId: string, target: HTMLElement): void {
  const container = target.querySelector(`[data-portal="${portalId}"]`);
  if (container) {
    container.remove();
  }
}
```

## Related Documents

For more detailed specifications, see the package documentation in the repository.
