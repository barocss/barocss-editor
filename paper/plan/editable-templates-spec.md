# Editable Templates Specification

## 📋 Overview

This document defines the specification for Barocss Editor's editable template system. It explains how to write templates that distinguish between editable areas and non-editable UI areas using `renderer-dom`'s DSL.

## 🎯 Core Concepts

### 1. Editable Area Distinction
- **Top-level `contentEditable="true"`**: Entire document editing area
- **Editable elements**: Specify edit type with `data-bc-edit` attribute
- **Non-editable UI elements**: Mark UI elements with `data-bc-ui` attribute (`contentEditable="false"`)

### 2. Edit Type Distinction
- **Content editing**: `data-bc-edit="content"` - Change text content
- **Attribute editing**: `data-bc-edit="attribute:attributeName"` + `data-bc-value="currentValue"` - Change specific attribute
- **UI element**: `data-bc-ui="type"` - Non-editable UI element

### 3. Attribute Management
- **Schema-based**: Different attribute definitions for each node type
- **Dynamic generation**: Flexible attribute handling through `data.attributes`
- **Remove fixed attributes**: Do not use fixed attributes like `data-bc-alignment`

## 🏗️ Template Structure

### 1. Basic Renderer Definition

```typescript
import { renderer, element, slot, data, attr } from '@barocss/renderer-dom';

// Editable document renderer
const documentRenderer = renderer('document',
  element('div',
    {
      contentEditable: 'true',
      className: 'barocss-editor'
    },
    [slot('content')]
  )
);
```

### 2. Editable Content Templates

#### Paragraph
```typescript
const paragraphRenderer = renderer('paragraph',
  element('p',
    {
      'data-bc-edit': 'content',  // Content editing
      className: (data) => `paragraph paragraph-${data.attributes?.textAlign || 'left'}`,
      style: (data) => ({
        textAlign: data.attributes?.textAlign || 'left',
        margin: '10px 0',
        lineHeight: '1.6'
      })
    },
    [data('text', '')]
  )
);
```

#### Heading
```typescript
const headingRenderer = renderer('heading',
  element((data) => `h${data.attributes?.level || 1}`,
    {
      'data-bc-edit': 'attribute:level',  // Edit level attribute
      'data-bc-value': (data) => String(data.attributes?.level || 1),  // Current level value
      className: (data) => `heading heading-level-${data.attributes?.level || 1}`,
      style: (data) => ({
        fontSize: `${2 - (data.attributes?.level || 1) * 0.2}rem`,
        fontWeight: 'bold',
        margin: '20px 0 10px 0'
      })
    },
    [data('text', '')]
  )
);
```

#### List
```typescript
const listRenderer = renderer('list',
  element((data) => data.attributes?.ordered ? 'ol' : 'ul',
    {
      'data-bc-edit': 'attribute:ordered',  // Edit ordered attribute
      'data-bc-value': (data) => String(data.attributes?.ordered || false),  // Current ordered value
      className: (data) => `list ${data.attributes?.ordered ? 'ordered' : 'unordered'}`,
      style: {
        margin: '10px 0',
        paddingLeft: '20px'
      }
    },
    [slot('items')]
  )
);

const listItemRenderer = renderer('listItem',
  element('li',
    {
      'data-bc-edit': 'content',  // Content editing
      className: 'list-item',
      style: {
        margin: '5px 0'
      }
    },
    [data('text', '')]
  )
);
```

### 3. Non-editable UI Templates

#### UI Heading
```typescript
const uiHeadingRenderer = renderer('uiHeading',
  element('div',
    {
      'data-bc-ui': 'heading',  // UI element
      contentEditable: 'false',
      className: (data) => `ui-heading ui-heading-level-${data.attributes?.level || 1}`,
      style: {
        backgroundColor: '#f0f0f0',
        padding: '10px',
        borderRadius: '4px',
        borderLeft: '4px solid #007acc',
        margin: '10px 0'
      }
    },
    [
      element('span',
        {
          className: 'ui-heading-content'
        },
        [data('text', '')]
      )
    ]
  )
);
```

#### UI Button
```typescript
const uiButtonRenderer = renderer('uiButton',
  element('button',
    {
      'data-bc-ui': 'button',  // UI element
      className: 'ui-button',
      contentEditable: 'false',
      type: 'button',
      style: {
        backgroundColor: '#007acc',
        color: 'white',
        border: 'none',
        padding: '8px 16px',
        borderRadius: '4px',
        cursor: 'pointer',
        margin: '5px'
      }
    },
    [data('text', 'Button')]
  )
);
```

#### UI Container
```typescript
const uiContainerRenderer = renderer('uiContainer',
  element('div',
    {
      'data-bc-ui': 'container',  // UI element
      className: (data) => `ui-container ui-${data.attributes?.type || 'container'}`,
      contentEditable: 'false',
      style: {
        backgroundColor: '#f8f9fa',
        border: '1px solid #e9ecef',
        borderRadius: '4px',
        padding: '10px',
        margin: '10px 0'
      }
    },
    [slot('content')]
  )
);
```

## 📊 Data Structure

### 1. Document Data Structure

```typescript
interface DocumentData {
  id: string;
  type: 'document';
  slots: {
    content: NodeData[];
  };
}

interface NodeData {
  id: string;
  type: string;
  text?: string;
  attributes?: Record<string, any>;
  slots?: {
    [key: string]: NodeData[];
  };
}
```

### 2. Usage Examples

#### Basic Editable Document
```typescript
const documentData: DocumentData = {
  id: 'doc-1',
  type: 'document',
  slots: {
    content: [
      {
        id: 'p-1',
        type: 'paragraph',
        text: 'This is an editable paragraph.',
        attributes: { textAlign: 'left' }
      },
      {
        id: 'h1-1',
        type: 'heading',
        text: 'Title Text',
        attributes: { level: 1 }
      },
      {
        id: 'p-2',
        type: 'paragraph',
        text: 'Another editable paragraph.',
        attributes: { textAlign: 'center' }
      }
    ]
  }
};
```

#### Document with UI Elements
```typescript
const documentDataWithUI: DocumentData = {
  id: 'doc-2',
  type: 'document',
  slots: {
    content: [
      {
        id: 'h1-1',
        type: 'heading',
        text: 'Editable Title',
        attributes: { level: 1 }
      },
      {
        id: 'p-1',
        type: 'paragraph',
        text: 'This paragraph can be edited.',
        attributes: { textAlign: 'left' }
      },
      {
        id: 'ui-heading-1',
        type: 'uiHeading',
        text: 'UI Title (Not Editable)',
        attributes: { level: 2 }
      },
      {
        id: 'ui-button-1',
        type: 'uiButton',
        text: 'Save',
        attributes: { action: 'save' }
      },
      {
        id: 'p-2',
        type: 'paragraph',
        text: 'Last editable paragraph.',
        attributes: { textAlign: 'right' }
      }
    ]
  }
};
```

## 🔧 Renderer Registration and Usage

### 1. Renderer Registry Setup

```typescript
import { RendererRegistry, RendererFactory } from '@barocss/renderer-dom';

// Create renderer registry
const registry = new RendererRegistry();

// Register renderers
registry.register(documentRenderer);
registry.register(paragraphRenderer);
registry.register(headingRenderer);
registry.register(listRenderer);
registry.register(listItemRenderer);
registry.register(uiHeadingRenderer);
registry.register(uiButtonRenderer);
registry.register(uiContainerRenderer);

// Create renderer factory
const factory = new RendererFactory(registry);
```

### 2. Rendering Execution

```typescript
// Render document
const element = factory.createRenderer('document', documentData);

// Append to DOM
document.getElementById('editor').appendChild(element);
```

## 🎨 CSS Styling

### 1. Basic Styles

```css
/* Editable area */
.barocss-editor {
  border: 2px solid #e0e0e0;
  border-radius: 4px;
  padding: 15px;
  min-height: 100px;
  outline: none;
}

.barocss-editor:focus {
  border-color: #007acc;
  box-shadow: 0 0 0 3px rgba(0, 122, 204, 0.1);
}

/* Editable elements */
.paragraph {
  margin: 10px 0;
  line-height: 1.6;
}

.paragraph-left { text-align: left; }
.paragraph-center { text-align: center; }
.paragraph-right { text-align: right; }

.heading {
  margin: 20px 0 10px 0;
  font-weight: bold;
}

.heading-level-1 { font-size: 2rem; }
.heading-level-2 { font-size: 1.5rem; }
.heading-level-3 { font-size: 1.25rem; }

/* Non-editable UI elements */
[contentEditable="false"] {
  user-select: none;
  pointer-events: none;
}

.ui-heading {
  background: #f0f0f0;
  padding: 10px;
  border-radius: 4px;
  margin: 10px 0;
  border-left: 4px solid #007acc;
}

.ui-button {
  background: #007acc;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  margin: 5px;
}

.ui-button:hover {
  background: #005a9e;
}

.ui-container {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 10px;
  margin: 10px 0;
}
```

## 📄 Generated HTML Structure

### 1. Basic Document Structure
```html
<div contentEditable="true" class="barocss-editor">
  <!-- Content-editable paragraph -->
  <p data-bc-edit="content" data-bc-sid="p-1" data-bc-stype="paragraph" 
     class="paragraph paragraph-left">
    Editable text
  </p>
  
  <!-- Attribute-editable heading -->
  <h1 data-bc-edit="attribute:level" data-bc-value="1" 
      data-bc-sid="h1-1" data-bc-stype="heading" 
      class="heading heading-level-1">
    Title text
  </h1>
  
  <!-- Non-editable UI button -->
  <button data-bc-ui="button" contentEditable="false" 
          class="ui-button" type="button">
    Save
  </button>
  
  <!-- Non-editable UI container -->
  <div data-bc-ui="container" contentEditable="false" 
       class="ui-container ui-container">
    <span>UI content</span>
  </div>
</div>
```

### 2. Attributes by Edit Type
```html
<!-- Content editing (value not needed) -->
<p data-bc-edit="content">Edit text content</p>

<!-- Attribute editing (includes current value) -->
<h1 data-bc-edit="attribute:level" data-bc-value="1">Edit title level</h1>
<div data-bc-edit="attribute:textAlign" data-bc-value="center">Edit alignment</div>
<ol data-bc-edit="attribute:ordered" data-bc-value="true">Ordered list</ol>

<!-- UI element (not editable) -->
<button data-bc-ui="button" contentEditable="false">Button</button>
<div data-bc-ui="container" contentEditable="false">Container</div>
```

## 🚀 Usage Examples

### 1. Basic Usage

```typescript
// Create Editor instance
const editor = new Editor({
  contentEditableElement: document.getElementById('editor'),
  dataStore: dataStore,
  schema: schema
});

// Render editable document
const element = factory.createRenderer('document', documentData);
document.getElementById('editor').appendChild(element);
```

### 2. Event Handling

```typescript
// Edit event listeners
editor.on('editor:selection.change', (data) => {
  console.log('Selection changed:', data.selection);
});

editor.on('editor:content.change', (data) => {
  console.log('Content changed:', data.content);
});

// UI button click event
document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target.classList.contains('ui-button')) {
    const action = target.getAttribute('data-bc-ui-action');
    console.log('Button clicked:', action);
  }
});
```

### 3. Editor Parsing Logic

```typescript
export class Editor {
  private _parseEditAttribute(editAttr: string, valueAttr: string): { 
    type: string; 
    attribute?: string; 
    value?: string 
  } {
    if (!editAttr) return { type: 'none' };
    
    if (editAttr === 'content') {
      return { type: 'content' };
    }
    
    if (editAttr.startsWith('attribute:')) {
      const attribute = editAttr.split(':')[1];
      return { 
        type: 'attribute', 
        attribute, 
        value: valueAttr 
      };
    }
    
    return { type: 'none' };
  }
  
  private _handleEdit(event: Event): void {
    const target = event.target as HTMLElement;
    
    const editAttr = target.getAttribute('data-bc-edit');
    const valueAttr = target.getAttribute('data-bc-value');
    const { type, attribute, value } = this._parseEditAttribute(editAttr, valueAttr);
    const nodeId = target.getAttribute('data-bc-sid');
    
    if (type === 'attribute') {
      // Handle attribute editing (compare current value with new value)
      this._handleAttributeEdit(nodeId, attribute, value, target);
    } else if (type === 'content') {
      // Handle content editing
      this._handleContentEdit(nodeId, target);
    }
  }
}
```

## 📋 Attribute Naming Conventions

### 1. Edit-related Attributes
- `data-bc-edit="content"` - Content editing (change text content)
- `data-bc-edit="attribute:attributeName"` - Attribute editing (e.g., `"attribute:level"`, `"attribute:textAlign"`)
- `data-bc-value="currentValue"` - Current value for attribute editing (e.g., `"1"`, `"center"`, `"true"`)
- `data-bc-ui="type"` - UI element marker (not editable)
- `contentEditable: 'false'` - Not editable (UI element)

### 2. Model Mapping Attributes
- `data-bc-sid` - Node ID (automatically set)
- `data-bc-stype` - Node type (automatically set)

### 3. Schema-based Attributes
- `data.attributes.textAlign` - Text alignment
- `data.attributes.level` - Heading level
- `data.attributes.action` - UI action
- `data.attributes.type` - UI type

### 4. CSS Classes
- `paragraph paragraph-{textAlign}` - Paragraph style
- `heading heading-level-{level}` - Heading style
- `ui-{type}` - UI element style

## 🔄 Dynamic Attribute Handling

### 1. Schema-based Attributes
Handle different attributes for each node type through `data.attributes`:

```typescript
// For paragraph
attributes: { textAlign: 'left' }

// For heading
attributes: { level: 1 }

// For UI button
attributes: { action: 'save' }
```

### 2. Dynamic Style Generation
Generate data-based dynamic styles through `style` function:

```typescript
style: (data) => ({
  textAlign: data.attributes?.textAlign || 'left',
  fontSize: `${2 - (data.attributes?.level || 1) * 0.2}rem`
})
```

## 🎯 Core Principles

1. **Explicit Edit Type**: Clearly distinguish edit types with `data-bc-edit` attribute
   - `"content"`: Edit text content
   - `"attribute:attributeName"`: Edit specific attribute (current value stored in `data-bc-value`)
2. **UI Element Separation**: Mark non-editable UI elements with `data-bc-ui` attribute
3. **Schema-based**: Use flexible schema instead of fixed attributes
4. **Dynamic Generation**: Dynamically generate attributes and styles based on data
5. **Clear Naming**: Attribute names are clear and intuitive
6. **Flexible Structure**: Only define schema when adding new node types

By following this spec to write editable templates, you can build a flexible and extensible editor system.
