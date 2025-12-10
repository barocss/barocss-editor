# Model to VNode Data Flow

## Overview

Process of model data being rendered to DOM through VNode:

```
Model (attributes) → VNode (attrs) → DOM (attributes)
```

## Detailed Flow

### 1. Model Data Structure

```typescript
const model = {
  type: 'button',
  attributes: {           // ← Model's attributes field
    id: 'button-1',
    title: 'Click me'
  }
};
```

### 2. VNode Creation Process

#### Step 1: Template Definition
```typescript
define('button', element('button', { 
  id: attr('id'),        // ← attr() function creates DataTemplate object
  title: attr('title'),
}, [text('Click me')]));
```

#### Step 2: VNode Creation (`factory.ts`)
```typescript
private _setAttributes(vnode: VNode, attributes: Record<string, any>, data: ModelData): void {
  Object.entries(attributes).forEach(([key, value]) => {
    if (value && (value as any).type === 'data') {
      // DataTemplate object processing
      const dt = value as any;
      const v = dt.getter ? dt.getter(data) : this._getDataValue(data, dt.path);
      resolvedValue = v === undefined || v === null ? dt.defaultValue : v;
      
      // Store in vnode.attrs ← attrs is created here!
      vnode.attrs![key] = resolvedValue;
    }
  });
}
```

**Important**: Model's `attributes` field → VNode's `attrs` field conversion

### 3. VNode Data Structure

```typescript
const vnode: VNode = {
  tag: 'button',
  attrs: {              // ← VNode's attrs field
    id: 'button-1',
    title: 'Click me'
  },
  children: []
};
```

### 4. DOM Rendering

VNode's `attrs` are converted to DOM's `attributes`:

```typescript
// DOMOperations.updateAttributes
function updateAttributes(element: HTMLElement, attrs: Record<string, any>): void {
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value);  // ← Convert to DOM attributes
  }
}
```

## Mapping Relationship

| Level | Field Name | Example |
|------|--------|------|
| Model | `attributes` | `{ id: 'button-1', title: 'Click me' }` |
| VNode | `attrs` | `{ id: 'button-1', title: 'Click me' }` |
| DOM | `attributes` | `HTMLButtonElement { attributes: { id: '...', title: '...' } }` |

## Change Detection

Change detection during Reconciliation:

```typescript
// DOMProcessor.processElementNode
const prevAttrs = wip.previousVNode?.attrs || {};  // ← Previous VNode's attrs
const nextAttrs = vnode.attrs || {};               // ← Current VNode's attrs

// Extract only changed attributes
const changedAttrs: Record<string, any> = {};
const allKeys = new Set([...Object.keys(prevAttrs), ...Object.keys(nextAttrs)]);

for (const key of allKeys) {
  if (prevAttrs[key] !== nextAttrs[key]) {
    changedAttrs[key] = nextAttrs[key];
  }
}
```

## Core Summary

1. **Model**: `model.attributes` → Source of data
2. **VNode**: `vnode.attrs` → Format stored in VNode
3. **DOM**: `element.attributes` → Actual DOM element's attributes

Model's `attributes` becomes VNode's `attrs`, which becomes DOM's `attributes`!
