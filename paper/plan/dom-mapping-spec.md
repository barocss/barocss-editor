# DOM ↔ Model Mapping Marker System Specification

## 1. Overview

Defines a marker system for mapping between DOM elements and Model nodes in the editor. This system aims for editor control, debugging, and performance optimization.

## 2. Core Principles

### 2.1 Minimal Information
- **Include only essential information**: Only information necessary for DOM ↔ Model mapping
- **Simplicity first**: Clear mapping rather than complex attributes
- **Performance optimization**: O(1) search possible with `querySelector`

### 2.2 Developer Experience
- **Easy debugging**: Easy to identify in developer tools
- **Consistency**: Apply same rules to all elements
- **Extensibility**: Can add attributes later if needed

## 3. Marker System Design

### 3.1 Basic Structure

```html
<!-- Basic node -->
<div data-bc-sid="node-sid" data-bc-stype="node-type">
  <!-- Child nodes -->
</div>

<!-- Text node (inherits parent element's attributes) -->
<span data-bc-sid="text-node-sid" data-bc-stype="text">
  Text content
</span>
```

### 3.2 Attribute Definitions

#### `data-bc-sid` (Required)
- **Purpose**: Unique ID of Model node
- **Format**: `string`
- **Examples**: `"doc-1"`, `"para-2"`, `"text-3"`
- **Rules**: 
  - Must be unique across entire document
  - Stable ID that doesn't change
  - Predictable pattern (type-number)

#### `data-bc-stype` (Required)
- **Purpose**: Node type defined in Schema
- **Format**: `string`
- **Examples**: `"document"`, `"paragraph"`, `"text"`, `"heading"`
- **Rules**:
  - Must match node type defined in Schema
  - Lowercase, hyphen-separated
  - Used for renderer selection

## 4. Marker Rules by Node Type

### 4.1 Document Node
```html
<div data-bc-sid="doc-1" data-bc-stype="document">
  <!-- Document root -->
</div>
```

### 4.2 Block Nodes (paragraph, heading, list, etc.)
```html
<p data-bc-sid="para-1" data-bc-stype="paragraph">
  <!-- Block content -->
</p>

<h1 data-bc-sid="heading-1" data-bc-stype="heading">
  <!-- Heading content -->
</h1>
```

### 4.3 Inline Nodes (text, link, strong, etc.)
```html
<span data-bc-sid="text-1" data-bc-stype="text">
  Regular text
</span>

<strong data-bc-sid="strong-1" data-bc-stype="strong">
  <span data-bc-sid="text-2" data-bc-stype="text">
    Bold text
  </span>
</strong>

<a data-bc-sid="link-1" data-bc-stype="link">
  <span data-bc-sid="text-3" data-bc-stype="text">
    Link text
  </span>
</a>
```

### 4.4 Atomic Nodes (image, table, etc.)
```html
<img data-bc-sid="img-1" data-bc-stype="image" />

<table data-bc-sid="table-1" data-bc-stype="table">
  <tr data-bc-sid="row-1" data-bc-stype="table-row">
    <td data-bc-sid="cell-1" data-bc-stype="table-cell">
      <!-- Cell content -->
    </td>
  </tr>
</table>
```

## 5. Mapping Rules

### 5.1 Basic Mapping
- `data-bc-sid` → Model's `id`
- `data-bc-stype` → Schema's `type`

### 5.2 Text Node Processing
- Text nodes inherit parent Element's `data-bc-sid` attribute
- `data-bc-stype` is set to `"text"`

## 6. Usage Examples

### 6.1 Basic Usage
```typescript
// Extract Model information from DOM element
const element = document.querySelector('[data-bc-sid="para-1"]');
const nodeId = element.getAttribute('data-bc-sid'); // "para-1"
const nodeType = element.getAttribute('data-bc-stype'); // "paragraph"

// Find DOM element by Model ID
const domElement = document.querySelector(`[data-bc-sid="${nodeId}"]`);

// Find all elements by type
const paragraphs = document.querySelectorAll('[data-bc-stype="paragraph"]');
```

## 7. Performance Characteristics

- **Lookup Performance**: O(1) - Using `querySelector`
- **Memory Usage**: Minimal (no cache)
- **Consistency**: High (always read directly from DOM attributes)
- **Complexity**: Low (simple structure)

## 8. Implementation Status

### ✅ Completed Features
- Automatic `data-bc-sid` attribute setting (factory.ts)
- Automatic `data-bc-stype` attribute setting (factory.ts)
- DOM ↔ Model mapping (selection-manager.ts)
- Basic test cases

### 🔄 Current Implementation
- Automatically set `data-bc-sid`, `data-bc-stype` in `renderer-dom`
- DOM ↔ Model conversion processing in `editor-core`
- Simple attribute-based approach

## 9. Example: Complete Document Structure

```html
<div data-bc-sid="doc-1" data-bc-stype="document">
  
  <h1 data-bc-sid="heading-1" data-bc-stype="heading">
    <span data-bc-sid="text-1" data-bc-stype="text">
      Title
    </span>
  </h1>
  
  <p data-bc-sid="para-1" data-bc-stype="paragraph">
    <span data-bc-sid="text-2" data-bc-stype="text">
      This is 
    </span>
    <strong data-bc-sid="strong-1" data-bc-stype="strong">
      <span data-bc-sid="text-3" data-bc-stype="text">
        bold text
      </span>
    </strong>
    <span data-bc-sid="text-4" data-bc-stype="text">
      .
    </span>
  </p>
  
  <p data-bc-sid="para-2" data-bc-stype="paragraph">
    <a data-bc-sid="link-1" data-bc-stype="link">
      <span data-bc-sid="text-5" data-bc-stype="text">
        Link
      </span>
    </a>
    <span data-bc-sid="text-6" data-bc-stype="text">
      .
    </span>
  </p>
  
</div>
```

This simple marker system enables efficient management of mapping between the editor's DOM and Model.
