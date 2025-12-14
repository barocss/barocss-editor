# @barocss/dsl

The DSL package provides a template definition layer with functional DSL builders. It's how you define how your model data is rendered to the DOM.

## Purpose

Template definition layer with functional DSL builders. Instead of writing HTML or JSX, you use pure functions to describe your templates.

## Key Exports

- `define()` - Register templates in the registry
- `element()` - Create HTML element templates
- `data()` - Bind model data to templates
- `when()` - Conditional rendering
- `component()` - Component templates with state
- `slot()` - Slot for child content
- `portal()` - Portal templates for overlays

## Basic Usage

```typescript
import { define, element, data, slot } from '@barocss/dsl';

// Register a paragraph template
define('paragraph', element('p', { 
  className: 'paragraph' 
}, [slot('content')]));

// Register a text template
define('inline-text', element('span', { 
  className: 'text' 
}, [data('text', '')]));
```

## Template Builders

### element()

Creates an HTML element template:

```typescript
element('div', { className: 'container' }, [
  // children
]);
```

### data()

Binds model data to the template:

```typescript
data('text', '')  // Binds model.text
data('title', 'default')  // Binds model.title with default
```

### slot()

Creates a slot for child nodes:

```typescript
slot('content')  // Renders child nodes here
```

### when()

Conditional rendering:

```typescript
when(
  (d) => d('published') === true,
  element('span', {}, ['Published'])
)
```

### Function Components

All templates defined with `define()` are components. You can define them as functions:

```typescript
// Function component (direct definition)
define('button', (props, model, context) => {
  return element('button', {
    onClick: props.onClick,
    className: 'btn'
  }, [
    data('label', props.label || model.label || 'Click me')
  ]);
});
```

**Function signature:**
- `props`: External data passed to component
- `model`: The model node being rendered
- `context`: Editor context and utilities

**Note**: Template builders (like `element()`) are automatically converted to function components internally.

## Mark Definitions

Marks are defined using `defineMark()`:

```typescript
import { defineMark, element, data } from '@barocss/dsl';

// Define bold mark
defineMark('bold', element('strong', {}, [data('text')]));

// Define highlight mark with attributes
defineMark('highlight', element('mark', {
  style: { backgroundColor: data('color', '#ffff00') }
}, [data('text')]));
```

## Decorator Definitions

Decorators are defined using `defineDecorator()`:

```typescript
import { defineDecorator, element, data } from '@barocss/dsl';

// Define comment decorator
defineDecorator('comment', element('div', {
  className: 'comment',
  style: { position: 'absolute' }
}, [data('text')]));
```

## Template Registry

All templates are stored in a global registry:

```typescript
import { getGlobalRegistry } from '@barocss/dsl';

const registry = getGlobalRegistry();
const template = registry.get('paragraph');  // Get template by node type
```

**Registry features:**
- Global template storage
- Template lookup by node type (`stype`)
- Mark and decorator registration
- Template validation

## When to Use

- **Template Definition**: Define how nodes are rendered
- **Before Rendering**: Templates must be registered before rendering
- **Component Creation**: Create reusable component templates

## Integration

DSL templates are used by:

- **Renderer-DOM**: Looks up templates from registry
- **VNodeBuilder**: Converts templates to VNodes
- **Components**: Component templates use DSL builders

## Related

- [Core Concepts: DSL Templates](../concepts/dsl-templates) - Deep dive into DSL
- [Renderer-DOM](./renderer-dom) - How templates are used for rendering
- [Core Concepts: Rendering](../concepts/rendering) - Understanding the rendering pipeline
