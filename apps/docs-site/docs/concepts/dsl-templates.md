# DSL Templates

DSL (Domain-Specific Language) templates define how your model data is rendered to the DOM. They are pure functions that make rendering predictable and testable.

## What is DSL?

DSL templates are functional builders that describe the structure of your rendered output. Instead of writing HTML or JSX, you use functions like `element()`, `data()`, and direct function definitions.

## Basic Template Builders

### element()

Creates an HTML element template:

```typescript
import { element } from '@barocss/dsl';

define('paragraph', element('p', {
  className: 'paragraph'
}, [
  // children
]));
```

### data()

Binds model data to the template:

```typescript
import { element, data } from '@barocss/dsl';

define('inline-text', element('span', {
  className: 'text'
}, [
  data('text', '') // Binds model.text to the span content
]));
```

### slot()

Creates a slot for child content:

```typescript
import { element, slot } from '@barocss/dsl';

define('paragraph', element('p', {
  className: 'paragraph'
}, [
  slot('content') // Renders child nodes here
]));
```

## Conditional Rendering

### when()

Conditionally renders content based on model data:

```typescript
import { element, when, data } from '@barocss/dsl';

define('article', element('article', {}, [
  when(
    (d) => d('published') === true,
    element('span', {}, ['Published'])
  ),
  element('h1', {}, [data('title')])
]));
```

## Components

**All templates defined with `define()` are components.** Whether you pass a template builder (like `element()`) or a function, they are all treated as function components internally:

```typescript
import { define, element, data } from '@barocss/dsl';

// Option 1: Template builder (automatically converted to function component)
define('paragraph', element('p', {
  className: 'paragraph'
}, [
  slot('content')
]));

// Option 2: Direct function (explicit function component)
define('button', (props, model, context) => {
  return element('button', {
    onClick: props.onClick,
    className: 'btn'
  }, [
    data('label', props.label || model.label || 'Click me')
  ]);
});
```

**Both approaches work the same way** - template builders are automatically converted to function components internally.

**Function signature** (for direct function definitions):
- `props`: External data passed to the component
- `model`: The model node being rendered
- `context`: Access to editor context and utilities

### Component Features

Components can have:
- **Props**: External data passed to the component
- **Model**: Access to the model node being rendered
- **Context**: Access to editor context and utilities

## Template Registration

Templates must be registered before use using the `define()` function:

```typescript
import { define, element, data, slot } from '@barocss/dsl';

// Register a template for 'paragraph' nodes
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));

// When a model node has stype: 'paragraph', this template will be used for rendering
```

### How define() Works

The `define()` function registers a template in the global registry, associating it with a node type. You can pass either a template builder (like `element()`) or a function - both are automatically converted to function components:

```typescript
// Option 1: Template builder (automatically converted to function component)
define('paragraph', element('p', {}, [slot('content')]));

// Option 2: Direct function (explicit function component)
define('button', (props, model, context) => {
  return element('button', {}, [data('label')]);
});

// Both are treated as function components internally
// When rendering:
// model = { stype: 'paragraph', ... }
// → Template lookup finds 'paragraph' template
// → Template is called as a function: template(props, model, context)
// → Renders using the defined template
```

**Important**: 
- All templates defined with `define()` are components
- Template builders (like `element()`) are automatically converted to function components
- Templates must be registered before rendering
- Typically, you register all templates during application initialization

## Template Registry

All templates are stored in a global registry:

```typescript
import { getGlobalRegistry } from '@barocss/dsl';

const registry = getGlobalRegistry();
const template = registry.get('paragraph');
```

## Pure Functions

All DSL builders are pure functions:

- **No side effects**: Same input always produces same output
- **Testable**: Easy to test in isolation
- **Predictable**: No hidden state or mutations

## Example: Complete Template

```typescript
import { define, element, data, slot, when } from '@barocss/dsl';

// Paragraph template (using element builder)
define('paragraph', element('p', {
  className: 'paragraph'
}, [
  slot('content')
]));

// Text template (using element builder)
define('inline-text', element('span', {
  className: 'text'
}, [
  data('text', '')
]));

// Heading template with conditional class (using element builder)
define('heading', element('h1', {
  className: data('level') === 1 ? 'h1' : 'h2'
}, [
  data('text', '')
]));

// Button component (using function)
define('button', (props, model, context) => {
  return element('button', {
    className: 'btn',
    onClick: props.onClick
  }, [
    data('label', props.label || model.label || 'Click me')
  ]);
});
```

## DSL Everywhere

In Barocss, DSL is used for **everything**, not just templates:

### Templates (Components)
```typescript
define('paragraph', element('p', {}, [slot('content')]));
```

### Marks
```typescript
import { defineMark } from '@barocss/dsl';

defineMark('bold', element('strong', {}, [data('text')]));
defineMark('highlight', element('mark', {
  style: { backgroundColor: data('color', '#ffff00') }
}, [data('text')]));
```

### Decorators
```typescript
import { defineDecorator } from '@barocss/dsl';

defineDecorator('comment', element('div', {
  className: 'comment',
  style: { position: 'absolute' }
}, [data('text')]));
```

### Operations (via DSL helpers)
```typescript
import { defineOperationDSL } from '@barocss/model';

defineOperationDSL('insertText', (payload) => 
  insertText({ text: payload.text })
);
```

**Why this matters:**
- **Consistent API**: Same DSL patterns everywhere
- **Easy to Learn**: Learn DSL once, use for everything
- **Composable**: Mix and match DSL builders
- **Type-Safe**: Full TypeScript support across all definitions

## Why DSL?

1. **Declarative**: Describe what you want, not how to build it
2. **Type-safe**: TypeScript support with full type checking
3. **Testable**: Pure functions are easy to test
4. **Flexible**: Combine builders to create complex templates
5. **Unified**: Same DSL for templates, marks, decorators, and operations

## Next Steps

- Learn about [Rendering](./rendering) to see how templates become DOM
- Learn about [Editor Core](./editor-core) - How editor orchestrates operations
- Learn about [Editor View DOM](./editor-view-dom) - How view triggers rendering
- See [Extension Design](../guides/extension-design) for advanced template patterns
- Read [Introduction](../introduction) to understand the DSL-first philosophy
