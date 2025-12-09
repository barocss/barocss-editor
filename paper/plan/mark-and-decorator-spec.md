# Mark & Decorator Specification Document

## Overview

Barocss Editor provides **1 formatting technique** and **3 layering techniques**.

- **Mark**: Actual formatting data stored in the model
- **Decorator**: Additional information display independent of the model (3 types)

## 1. Mark (Model Data)

### 1.1 Definition
Mark is actual formatting data stored in the model and is part of content that users can edit.

### 1.2 Characteristics
- **Schema-based**: Defined in `@barocss/schema` package
- **Model Storage**: Permanently stored in document model
- **Editable**: Content that users can directly edit
- **Rendering**: Processed and rendered in `renderer-dom`
- **Diff Included**: Included in DOM diff algorithm for change tracking
- **Extensible**: Can add new Mark types through Schema extension

### 1.3 Mark Types (Schema-based)

Marks are defined in the `@barocss/schema` package and are dynamically determined based on Schema configuration.

#### Mark Interface
```typescript
interface Mark {
  type: string;                    // Mark type defined in Schema
  attrs: Record<string, any>;      // Mark-specific attributes
}
```

#### Mark Definition Example in Schema
```typescript
import { createSchema } from '@barocss/schema';

const schema = createSchema('rich-text-editor', {
  topNode: 'doc',
  nodes: {
    // ... node definitions
  },
  marks: {
    // Basic text styles
    bold: {
      name: 'bold',
      group: 'text-style',
      attrs: {
        weight: { type: 'string', default: 'bold' }
      }
    },
    
    italic: {
      name: 'italic',
      group: 'text-style',
      attrs: {
        style: { type: 'string', default: 'italic' }
      }
    },
    
    underline: {
      name: 'underline',
      group: 'text-style',
      attrs: {}
    },
    
    // Color related
    color: {
      name: 'color',
      group: 'color',
      attrs: {
        color: { type: 'string', required: true },
        backgroundColor: { type: 'string', required: false }
      }
    },
    
    // Link
    link: {
      name: 'link',
      group: 'link',
      attrs: {
        href: { type: 'string', required: true },
        title: { type: 'string', required: false },
        target: { type: 'string', default: '_self' }
      }
    },
    
    // Custom Mark (user-defined)
    highlight: {
      name: 'highlight',
      group: 'annotation',
      attrs: {
        color: { type: 'string', default: 'yellow' },
        intensity: { type: 'number', default: 0.3 }
      }
    }
  }
});
```

#### Schema-based Mark Usage Example
```typescript
// Use Mark defined in Schema
const boldMark: Mark = { 
  type: 'bold', 
  attrs: { weight: 'bold' } 
};

const colorMark: Mark = { 
  type: 'color', 
  attrs: { color: 'red', backgroundColor: 'yellow' } 
};

const linkMark: Mark = { 
  type: 'link', 
  attrs: { href: 'https://example.com', target: '_blank' } 
};

// Use custom Mark
const highlightMark: Mark = { 
  type: 'highlight', 
  attrs: { color: 'yellow', intensity: 0.5 } 
};
```

#### Adding New Marks through Schema Extension
```typescript
// Extend existing Schema
const extendedSchema = createSchema(schema, {
  marks: {
    // Add new Mark
    strikethrough: {
      name: 'strikethrough',
      group: 'text-style',
      attrs: {}
    },
    
    code: {
      name: 'code',
      group: 'code',
      attrs: {
        language: { type: 'string', required: false }
      }
    },
    
    fontSize: {
      name: 'fontSize',
      group: 'typography',
      attrs: {
        size: { type: 'string', required: true },
        unit: { type: 'string', default: 'px' }
      }
    }
  }
});
```

### 1.4 Relationship between Mark and Schema

#### Schema Package Role
- **Mark Definition**: Define available Mark types and attributes
- **Validation**: Validate Mark data
- **Type Safety**: Generate and validate TypeScript types
- **Extensibility**: Extend existing Schema to add new Marks

#### Mark Processing in renderer-dom (DSL-based)
```typescript
// Mark rendering through DSL in renderer-dom
import { RendererRegistry, renderer, element, data, when, attr } from '@barocss/renderer-dom';

const registry = new RendererRegistry();

// Conditional rendering based on Mark in Text renderer
registry.register(renderer('text', element('span', {
  className: 'text-node',
  style: (d: any) => {
    const styles: any = {};
    
    // Apply styles by iterating through Mark array
    if (d.marks) {
      d.marks.forEach((mark: Mark) => {
        switch (mark.type) {
          case 'bold':
            styles.fontWeight = mark.attrs?.weight || 'bold';
            break;
          case 'italic':
            styles.fontStyle = mark.attrs?.style || 'italic';
            break;
          case 'underline':
            styles.textDecoration = 'underline';
            break;
          case 'color':
            styles.color = mark.attrs?.color;
            if (mark.attrs?.backgroundColor) {
              styles.backgroundColor = mark.attrs.backgroundColor;
            }
            break;
        }
      });
    }
    
    return styles;
  }
}, [
  // Wrap with strong element when Bold Mark exists
  when(
    (d: any) => d.marks?.some((mark: Mark) => mark.type === 'bold'),
    element('strong', {}, [data('text', '')])
  ),
  
  // Wrap with em element when Italic Mark exists  
  when(
    (d: any) => d.marks?.some((mark: Mark) => mark.type === 'italic'),
    element('em', {}, [data('text', '')])
  ),
  
  // Wrap with a element when Link Mark exists
  when(
    (d: any) => d.marks?.some((mark: Mark) => mark.type === 'link'),
    element('a', {
      href: (d: any) => {
        const linkMark = d.marks?.find((mark: Mark) => mark.type === 'link');
        return linkMark?.attrs?.href || '#';
      },
      target: (d: any) => {
        const linkMark = d.marks?.find((mark: Mark) => mark.type === 'link');
        return linkMark?.attrs?.target || '_self';
      }
    }, [data('text', '')])
  ),
  
  // Default text when no Mark exists
  when(
    (d: any) => !d.marks || d.marks.length === 0,
    data('text', '')
  )
])));

// Or create nested elements in a simpler way
registry.register(renderer('text', 
  // Check Link Mark
  when(
    (d: any) => d.marks?.some((mark: Mark) => mark.type === 'link'),
    element('a', {
      href: (d: any) => d.marks?.find((m: Mark) => m.type === 'link')?.attrs?.href || '#'
    }, [
      // Check Bold Mark (inside Link)
      when(
        (d: any) => d.marks?.some((mark: Mark) => mark.type === 'bold'),
        element('strong', {}, [
          // Check Italic Mark (inside Bold)
          when(
            (d: any) => d.marks?.some((mark: Mark) => mark.type === 'italic'),
            element('em', {}, [data('text', '')]),
            data('text', '') // Regular text if no Italic
          )
        ]),
        // Check only Italic if no Bold
        when(
          (d: any) => d.marks?.some((mark: Mark) => mark.type === 'italic'),
          element('em', {}, [data('text', '')]),
          data('text', '') // Regular text if neither exists
        )
      )
    ]),
    // Check Bold if no Link
    when(
      (d: any) => d.marks?.some((mark: Mark) => mark.type === 'bold'),
      element('strong', {}, [
        when(
          (d: any) => d.marks?.some((mark: Mark) => mark.type === 'italic'),
          element('em', {}, [data('text', '')]),
          data('text', '')
        )
      ]),
      // Check only Italic if no Bold
      when(
        (d: any) => d.marks?.some((mark: Mark) => mark.type === 'italic'),
        element('em', {}, [data('text', '')]),
        data('text', '') // Regular text if no Mark exists
      )
    )
  )
));
```

#### Mark Data Flow
```
Schema Definition → Model Storage → renderer-dom Rendering → DOM Output
     ↓                    ↓                    ↓                ↓
  Mark Type          Mark Instance         HTML Element      User Screen
   Definition         Creation/Storage      Creation/Style     Display/Edit
```

### 1.5 Mark Application Example

```html
<!-- Before Mark application -->
<div data-bc-sid="text-1">Hello World</div>

<!-- After Mark application -->
<div data-bc-sid="text-1">
  <strong style="color: red;">Hello</strong> <em>World</em>
</div>
```

## 2. Decorator (Additional Information Display)

### 2.1 Definition
Decorator is a system for displaying additional information managed separately from the document model, classified into 3 categories based on rendering method.

### 2.2 Characteristics
- **Data Storage**: Stored in `DataStore`'s `Document.decorators` array
- **User Editing**: Cannot be directly edited (read-only)
- **Rendering**: Processed in `renderer-dom`'s `ContentDecoratorRenderer` and `DisplayDecoratorRenderer`
- **Event Handling**: Can define event handlers in `defineDecorator` template
- **Position Management**: Placed at absolute or relative positions

### 2.3 Decorator Classification System

Decorators are classified into **3 categories** based on **rendering method**, and **free type definition** is possible within each category.

#### 2.3.1 Layer Decorator (Overlay Decorator)

**Definition**: A decorator displayed as an overlay on top of the document, processed by `DisplayDecoratorRenderer`.

**Characteristics**:
- Positioned absolutely
- Independent of document structure
- Editing prevented with `contenteditable="false"`
- Event handler support (onMouseEnter, onClick, etc.)

**Basic Structure**:
```typescript
interface IDecorator {
  id: string;                    // Unique identifier
  type: string;                  // Template name registered with defineDecorator
  category: 'layer';             // Category (fixed value)
  target: {
    nodeId: string;
    startOffset: number;
    endOffset: number;
  } | {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  data: Record<string, any>;     // Data passed to template
  createdAt: number;             // Creation timestamp
  updatedAt: number;             // Update timestamp
  version: number;               // Version (for conflict resolution)
}
```

**Usage**:
- Define template with `defineDecorator`
- Add decorator with `addDecorator`
- Render overlay in `DisplayDecoratorRenderer`

For detailed implementation examples, see [Decorator Implementation Guide](../docs/decorator-implementation-guide.md).

#### 2.3.2 Inline Decorator

**Definition**: A decorator inserted inside text, processed by `ContentDecoratorRenderer`.

**Characteristics**:
- Inserted inside text with `position: 'inside-start'` or `'inside-end'`
- Editing prevented with `contenteditable="false"`
- Rendered as inline element (using `span` tag)
- Event handler support

**Basic Structure**:
```typescript
interface IDecorator {
  id: string;                    // Unique identifier
  type: string;                  // Template name registered with defineDecorator
  category: 'inline';            // Category (fixed value)
  target: {
    nodeId: string;
    startOffset: number;
    endOffset: number;
  };
  data: Record<string, any>;     // Data passed to template
  createdAt: number;             // Creation timestamp
  updatedAt: number;             // Update timestamp
  version: number;               // Version (for conflict resolution)
}
```

**Usage**:
- Define template with `defineDecorator`
- Add decorator with `addDecorator`
- Render inline in `ContentDecoratorRenderer`

For detailed implementation examples, see [Decorator Implementation Guide](../docs/decorator-implementation-guide.md).

#### 2.3.3 Block Decorator

**Definition**: A decorator inserted at block level, processed by `ContentDecoratorRenderer`.

**Characteristics**:
- Inserted at block level with `position: 'before'` or `'after'`
- Editing prevented with `contenteditable="false"`
- Rendered as block element (using `div` tag)
- Event handler support

**Basic Structure**:
```typescript
interface IDecorator {
  id: string;                    // Unique identifier
  type: string;                  // Template name registered with defineDecorator
  category: 'block';             // Category (fixed value)
  target: {
    nodeId: string;
    startOffset: number;
    endOffset: number;
  };
  data: Record<string, any>;     // Data passed to template
  createdAt: number;             // Creation timestamp
  updatedAt: number;             // Update timestamp
  version: number;               // Version (for conflict resolution)
}
```

**Usage**:
- Define template with `defineDecorator`
- Add decorator with `addDecorator`
- Render block in `ContentDecoratorRenderer`

For detailed implementation examples, see [Decorator Implementation Guide](../docs/decorator-implementation-guide.md).

// Using custom type defined externally
const customPanelDecorator: BlockDecorator = {
  id: 'custom-panel-1',
  category: 'block',
  type: 'ai-assistant-panel',  // Free type name
  target: { nodeId: 'text-1', position: 'wrap' },
  data: {
    // Custom data structure
    assistantType: 'writing-helper',
    suggestions: [
      'Improve grammar',
      'Make it more concise',
      'Add examples'
    ],
    confidence: 0.85,
    language: 'en',
    customSettings: {
      autoSuggest: true,
      showConfidence: true,
      theme: 'professional'
    }
  },
  renderer: 'ai-assistant-panel-renderer'  // Custom renderer specification
};

// Type defined in plugin
const pluginPanelDecorator: BlockDecorator = {
  id: 'plugin-panel-1',
  category: 'block',
  type: 'collaboration-sidebar',  // Type defined in plugin
  target: { nodeId: 'text-1', position: 'after' },
  data: {
    collaborators: [
      { id: 'user1', name: 'John', status: 'online', cursor: { nodeId: 'text-2', offset: 5 } },
      { id: 'user2', name: 'Jane', status: 'typing', cursor: { nodeId: 'text-1', offset: 10 } }
    ],
    showCursors: true,
    showComments: true,
    realTimeSync: true
  }
};
```

### 2.4 Decorator Extensibility and Custom Renderers

#### 2.4.1 Registering Custom Decorator Types
```typescript
// Register custom Decorator types in editor-view-dom
import { DecoratorRegistry } from '@barocss/editor-view-dom';

const decoratorRegistry = new DecoratorRegistry();

// Register custom Layer Decorator type
decoratorRegistry.registerLayerType('my-custom-annotation', {
  defaultRenderer: 'custom-annotation-renderer',
  dataSchema: {
    severity: { type: 'string', required: true },
    category: { type: 'string', required: true },
    reviewers: { type: 'array', required: false }
  }
});

// Register custom Inline Decorator type
decoratorRegistry.registerInlineType('interactive-chart', {
  defaultRenderer: 'interactive-chart-renderer',
  dataSchema: {
    chartType: { type: 'string', required: true },
    dataSource: { type: 'string', required: true },
    width: { type: 'number', default: 200 },
    height: { type: 'number', default: 100 }
  }
});

// Register custom Block Decorator type
decoratorRegistry.registerBlockType('ai-assistant-panel', {
  defaultRenderer: 'ai-assistant-panel-renderer',
  dataSchema: {
    assistantType: { type: 'string', required: true },
    suggestions: { type: 'array', required: false },
    confidence: { type: 'number', min: 0, max: 1 }
  }
});
```

#### 2.4.2 Defining Custom Renderers
```typescript
// Define custom renderer using DSL
import { renderer, element, data, when, attr } from '@barocss/editor-view-dom';

// Custom Layer Decorator renderer
decoratorRegistry.registerRenderer('custom-annotation-renderer', 
  renderer('custom-annotation', (decorator: LayerDecorator) => {
    // Apply CSS styles only (Layer Decorator)
    return {
      styles: {
        backgroundColor: decorator.data.severity === 'high' ? '#ffebee' : '#f3e5f5',
        borderLeft: `3px solid ${decorator.data.severity === 'high' ? '#f44336' : '#9c27b0'}`,
        padding: '2px 4px',
        borderRadius: '2px'
      }
    };
  })
);

// Custom Inline Decorator renderer
decoratorRegistry.registerRenderer('interactive-chart-renderer',
  renderer('interactive-chart', element('div', {
    className: 'interactive-chart-widget',
    style: (d: any) => ({
      width: `${d.data.width}px`,
      height: `${d.data.height}px`,
      border: '1px solid #ddd',
      borderRadius: '4px',
      display: 'inline-block'
    }),
    'data-bc-decorator': 'inline'  // Excluded from diff
  }, [
    element('canvas', {
      width: attr('data.width', 200),
      height: attr('data.height', 100)
    }, []),
    element('div', {
      className: 'chart-controls'
    }, [
      data('data.chartType', 'Unknown Chart')
    ])
  ]))
);

// Custom Block Decorator renderer
decoratorRegistry.registerRenderer('ai-assistant-panel-renderer',
  renderer('ai-assistant-panel', element('div', {
    className: 'ai-assistant-panel',
    style: {
      position: 'absolute',
      right: '10px',
      top: '10px',
      width: '300px',
      backgroundColor: '#fff',
      border: '1px solid #ddd',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      padding: '16px'
    },
    'data-bc-decorator': 'block'  // Excluded from diff
  }, [
    element('h3', {}, [data('data.assistantType', 'AI Assistant')]),
    element('div', { className: 'suggestions' }, [
      // Render suggestions array
      when(
        (d: any) => d.data.suggestions && d.data.suggestions.length > 0,
        element('ul', {}, 
          // Dynamic list rendering (may be more complex in actual implementation)
          data('data.suggestions', []).map((suggestion: string) =>
            element('li', {}, [suggestion])
          )
        )
      )
    ]),
    element('div', { 
      className: 'confidence',
      style: { fontSize: '12px', color: '#666', marginTop: '8px' }
    }, [
      data('data.confidence', 0, (value: number) => `Confidence: ${(value * 100).toFixed(1)}%`)
    ])
  ]))
);
```

## 3. Practical Usage Examples

### 3.1 Mark Application Example

```html
<!-- Before Mark application -->
<div data-bc-sid="text-1">Hello World</div>

<!-- After Mark application -->
<div data-bc-sid="text-1">
  <strong style="color: red;">Hello</strong> <em>World</em>
</div>
```

### 3.2 Practical Usage Examples

For detailed HTML rendering examples and implementation methods, see [Decorator Implementation Guide](../docs/decorator-implementation-guide.md).

## 4. Summary by Processing Location

| Technique | Definition Location | Processing Location | Storage Location | User Editing | Event Handling |
|-----------|---------------------|---------------------|------------------|--------------|----------------|
| **Mark** | `@barocss/schema` | `renderer-dom` | Model data | Yes | ❌ |
| **Layer Decorator** | `defineDecorator` | `DisplayDecoratorRenderer` | `DataStore.decorators` | No | ✅ |
| **Inline Decorator** | `defineDecorator` | `ContentDecoratorRenderer` | `DataStore.decorators` | No | ✅ |
| **Block Decorator** | `defineDecorator` | `ContentDecoratorRenderer` | `DataStore.decorators` | No | ✅ |

## 5. Implementation Guide

### 5.1 Mark Implementation (Schema-based)
- **Definition**: Define Mark types and attributes in `@barocss/schema` package
- **Processing**: Schema-based rendering in `renderer-dom`
- **Storage**: Permanently stored in model data
- **Synchronization**: Automatic DOM updates on model changes
- **Validation**: Schema-based Mark attribute validation

### 5.2 Layer Decorator Implementation
- **Definition**: Register template with `defineDecorator`
- **Processing**: Overlay rendering in `DisplayDecoratorRenderer`
- **Storage**: Stored in `DataStore.decorators` array
- **Events**: Event handler support (`onMouseEnter`, `onClick`, etc.)
- **Position**: Positioned absolutely

### 5.3 Inline Decorator Implementation
- **Definition**: Register template with `defineDecorator`
- **Processing**: Inline rendering in `ContentDecoratorRenderer`
- **Storage**: Stored in `DataStore.decorators` array
- **Events**: Event handler support (click, hover, etc.)
- **Position**: Inserted inside text with `position: 'inside-start'` or `'inside-end'`

### 5.4 Block Decorator Implementation
- **Definition**: Register template with `defineDecorator`
- **Processing**: Block rendering in `ContentDecoratorRenderer`
- **Storage**: Stored in `DataStore.decorators` array
- **Events**: Event handler support (click, hover, etc.)
- **Position**: Inserted at block level with `position: 'before'` or `'after'`

## 6. Performance Considerations

### 6.1 Mark
- Minimal performance impact as it is model data
- Included in diff, so re-rendering on changes

### 6.2 Layer Decorator
- Minimal performance impact as it is expressed only with CSS
- Included in diff, so re-rendering on changes

### 6.3 Inline Decorator
- Performance impact exists as it is an actual DOM widget
- Excluded from diff, so re-application needed on changes

### 6.4 Block Decorator
- Performance impact exists as it is an actual DOM widget
- Excluded from diff, so re-application needed on changes

## 7. Extensibility

### 7.1 Mark Extension
- Can add new Mark types
- Add processing logic in `renderer-dom`

### 7.2 Decorator Extension
- Can add new Decorator types
- Add processing logic in `editor-view-dom`

### 7.3 Custom Widgets
- Custom widget support in Inline/Block Decorator
- Widget lifecycle management

## 8. Testing Strategy

### 8.1 Mark Testing
- Model data synchronization tests
- Rendering result tests
- Diff behavior tests

### 8.2 Decorator Testing
- Additional information display tests
- Widget insertion/removal tests
- Diff exclusion behavior tests

### 8.3 Integration Testing
- Mark and Decorator combination tests
- Performance tests
- User interaction tests

## 📖 Related Documents

- [Decorator Implementation Guide](../docs/decorator-implementation-guide.md) - Practical implementation guide
- [Renderer Decorator System Specification](renderer-decorator-spec.md) - Rendering system technical specification
- [BaroCSS Editor API Reference](../api-reference.md) - Complete API reference
