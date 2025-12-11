# Text Rendering Architecture

## Overview

This document explains the text rendering architecture of renderer-dom. Text is processed through two paths, each with different purposes and use cases.

## Core Principles

### 1. `data('text')` Processing: Always Keep in Children

**Principle**: When `data('text')` is directly processed, text is always kept in children so that marks and decorators can be applied.

**Reasons**:
- `data('text')` retrieves text from model, and marks and decorators can be applied
- Text can be split into multiple VNodes (depending on mark ranges)
- If text is collapsed, marks/decorators cannot be applied

**Processing Flow**:
```typescript
// Template: element('span', {}, [data('text')])
// Model: { text: 'Hello', marks: [{ type: 'bold', range: [0, 5] }] }

// VNode Structure
{
  tag: 'span',
  children: [  // ✅ Always kept in children
    {
      tag: 'strong',
      children: [
        {
          tag: 'span',
          children: [
            { text: 'Hello', children: [] }
          ]
        }
      ]
    }
  ]
}
```

### 2. General Text: Can Collapse to `vnode.text`

**Principle**: General text (string arrays, text() function) is collapsed to `vnode.text` when it's a single text child to optimize performance.

**Reasons**:
- Simple text without marks/decorators applied
- Collapse to simplify VNode structure
- Efficient processing by reconciler directly handling `vnode.text`

**Processing Flow**:
```typescript
// Template: element('span', {}, ['Test Component'])
// Or: element('span', {}, [text('Test Component')])

// VNode Structure (collapsed)
{
  tag: 'span',
  text: 'Test Component',  // ✅ Collapsed to vnode.text
  children: []
}

// Processing in Reconciler
if (nextVNode.text !== undefined && (!nextVNode.children || nextVNode.children.length === 0)) {
  parent.appendChild(doc.createTextNode(String(nextVNode.text)));
}
```

## Distinction Between Two Paths

### Path 1: `data('text')` Processing

**Condition**: `hasDataTextProcessed.value === true`

**Characteristics**:
- Always kept in children
- Can process marks/decorators
- Text can be split into multiple VNodes
- Always wrapped in `<span>` (after mark/decorator processing)

**Use Cases**:
- Text rendering of `inline-text` model
- All cases using model's `text` property
- Text that can have marks or decorators applied

### Path 2: General Text

**Condition**: `hasDataTextProcessed.value === false` && single text child

**Characteristics**:
- Can collapse to `vnode.text`
- Cannot process marks/decorators
- Directly processed by reconciler
- Directly rendered as text node in DOM

**Use Cases**:
- `element('span', {}, ['Test Component'])` - Direct string array usage
- `element('span', {}, [text('Test Component')])` - text() function usage
- `element('span', 'Test Component')` - Direct string usage (overload)
- Static text or labels, etc.

## Reasons for Architectural Decisions

### Why Use Two Paths?

1. **Performance Optimization**
   - Collapse simple text to simplify VNode structure
   - Prevent unnecessary DOM element creation

2. **Flexibility**
   - `data('text')` always kept in children for mark/decorator processing
   - General text can collapse for performance

3. **Consistency**
   - `data('text')` always processed the same way (kept in children)
   - General text always processed the same way (can collapse)

### Potential Issues and Solutions

**Issue**: Two paths may seem complex

**Solution**:
- Clear distinction: `data('text')` vs general text
- Consistent processing: Each path always processed the same way
- Documentation: Clearly explain architecture with this document

## Implementation Details

### VNodeBuilder

**File**: `packages/renderer-dom/src/vnode/factory.ts`

#### `_buildElement` (line 746-765)

```typescript
// Check if data('text') is processed
if (orderedChildren.length === 1 && 
    !orderedChildren[0].tag && 
    orderedChildren[0].text !== undefined && 
    !hasDataTextProcessed.value) {
  // General text: collapse
  vnode.text = String(orderedChildren[0].text);
  vnode.children = [];
} else if (orderedChildren.length > 0) {
  // data('text') or complex structure: keep in children
  vnode.children = [...orderedChildren];
}
```

#### `_processChild` (line 1029-1032)

```typescript
// Set flag when data('text') is processed
if (child.path === 'text' && hasDataTextProcessed) {
  hasDataTextProcessed.value = true;
}
```

### Reconciler

**File**: `packages/renderer-dom/src/reconcile/reconciler.ts`

#### `reconcileVNodeChildren` (line 423-442)

```typescript
// Process vnode.text (collapsed text)
if (nextVNode.text !== undefined && 
    (!nextVNode.children || nextVNode.children.length === 0)) {
  // Directly render as text node
  parent.appendChild(doc.createTextNode(String(nextVNode.text)));
  return;
}

// Process children (data('text') or complex structure)
// ...
```

## Test Coverage

### Text Rendering Tests

**File**: `packages/renderer-dom/test/core/vnode-builder-text-rendering.test.ts`

Validates following scenarios:
- ✅ `element('span', {}, ['Test Component'])` - Direct string array usage
- ✅ `element('span', {}, [text('Test Component')])` - text() function usage
- ✅ `element('span', 'Test Component')` - Direct string usage (overload)
- ✅ Mixed content (text + elements)
- ✅ Empty text handling

### Mark/Decorator Tests

**File**: `packages/renderer-dom/test/core/mark-decorator-complex.test.ts`

Validates following scenarios:
- ✅ Mark application when `data('text')` is processed
- ✅ Decorator application when `data('text')` is processed
- ✅ Complex mark/decorator combinations

## Behavior in ContentEditable

### Real-time Text Input Scenario

When user types text in contenteditable state:

1. **User Input** → DOM is directly changed
2. **MutationObserver Detects** → InputHandler processes
3. **Model Update** → mark/decorator ranges automatically adjusted
4. **Renderer Re-renders** → reconciler.reconcile() called
5. **Reconciler Updates** → Compare prevVNode and nextVNode to update DOM

### Efficient Updates in Reconciler

**sid-based Matching**:
```typescript
// findChildHost: Find existing DOM element by sid
let host = this.findChildHost(parent, childVNode);
if (!host && childVNode.sid) {
  // Global search (supports cross-parent move)
  const global = parent.ownerDocument?.querySelector(
    `[data-bc-sid="${childVNode.sid}"]`
  ) as HTMLElement | null;
  if (global) host = global;
}
```

**prevVNode Comparison**:
```typescript
// Get previous state from prevVNodeTree
const prevVNode = sid ? this.prevVNodeTree.get(String(sid)) : undefined;

// Update only changed parts
if (childVNode.attrs) {
  this.dom.updateAttributes(host, prevChildVNode?.attrs, childVNode.attrs);
}
```

### Mark/Decorator Application Guarantee

**`data('text')` Processing Path**:
- Model is updated when text is input
- `data('text')` is always kept in children, so marks/decorators can be applied
- VNodeBuilder creates new mark/decorator structure
- Reconciler finds and updates existing elements based on sid

**Example Scenario**:
```typescript
// 1. Initial State
Model: { text: 'Hello', marks: [{ type: 'bold', range: [0, 5] }] }
DOM: <span><strong><span>Hello</span></strong></span>

// 2. User types ' World'
DOM (User Input): <span><strong><span>Hello</span></strong> World</span>

// 3. MutationObserver Detects → Model Update
Model: { text: 'Hello World', marks: [{ type: 'bold', range: [0, 5] }] }

// 4. Renderer Re-renders
VNode: {
  tag: 'span',
  children: [
    { tag: 'strong', children: [{ tag: 'span', children: [{ text: 'Hello' }] }] },
    { tag: 'span', children: [{ text: ' World' }] }
  ]
}

// 5. Reconciler Updates
// - Existing <strong> element found by sid and kept
// - New <span> element added
// - DOM structure correctly updated
```

### Performance Considerations

**Advantages**:
1. ✅ **sid-based Matching**: Efficiently find and reuse existing DOM elements
2. ✅ **prevVNode Comparison**: Update only changed parts
3. ✅ **Consistent Structure**: marks/decorators always processed the same way

**Notes**:
1. ⚠️ **Full VNode Tree Rebuild**: VNodeBuilder rebuilds entire tree each time
   - But mark/decorator processing is necessary, so unavoidable
2. ⚠️ **Minimize DOM Manipulation**: Reconciler reuses existing elements for minimal DOM manipulation
3. ⚠️ **Cursor Position Preservation**: Handled separately in editor-view-dom (outside reconciler scope)

### Selection Preservation Issues and Solutions

**Core Problem**:
When user types text in contenteditable:
1. User Input → DOM is directly changed (browser selection points to specific text node)
2. MutationObserver Detects → Model update
3. `editor.executeTransaction()` called
4. Event listener calls `render()`
5. **Reconciler Updates DOM → Text Node Deleted/Recreated → Selection Breaks** ⚠️

**Browser Selection Limitations**:
- Browser selection maintains direct reference to DOM node
- Selection breaks when node is deleted
- Selection restoration is unstable and behavior varies by browser
- **Therefore, preserving Text Node with selection is the fundamental solution rather than restoring selection**

**ContentEditable Characteristics**:
1. **Only one text node edited at a time**: Only specific text node changes on key input
2. **Other text nodes don't change**: Text nodes not being edited remain unchanged
3. **Only Mark/Decorator ranges adjusted**: Keep text node structure and only update mark/decorator range/offset

**Solution: Text Node Pool and Selection Protection**

#### 1. Text Node Pool Concept

Reconciler reuses text nodes to prevent selection from breaking:

```typescript
// reconciler.ts
private reconcileVNodeChildren(parent: HTMLElement, prevVNode: VNode | undefined, nextVNode: VNode, context?: any, isRecursive: boolean = false): void {
  // 1. Find text nodes with selection
  const selection = window.getSelection();
  const activeTextNodes = new Set<Text>();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    // Collect text nodes pointed to by selection
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      activeTextNodes.add(range.startContainer as Text);
    }
    if (range.endContainer.nodeType === Node.TEXT_NODE && range.endContainer !== range.startContainer) {
      activeTextNodes.add(range.endContainer as Text);
    }
  }
  
  // 2. Text node reuse logic
  for (let childIndex = 0; childIndex < childVNodes.length; childIndex++) {
    const child = childVNodes[childIndex];
    
    // Text-only VNode processing
    if (typeof child === 'object' && child !== null && 
        !(child as VNode).tag && (child as VNode).text !== undefined) {
      const childVNode = child as VNode;
      const childNodes = Array.from(parent.childNodes);
      
      // Find existing text node (position-based or selection-based)
      let existingTextNode: Text | null = null;
      
      // Priority 1: Text node with selection (absolute protection)
      for (const textNode of activeTextNodes) {
        if (textNode.parentNode === parent) {
          // Reuse if same parent and position matches
          const index = childNodes.indexOf(textNode);
          if (index === childIndex || (index === -1 && childIndex === 0)) {
            existingTextNode = textNode;
            break;
          }
        }
      }
      
      // Priority 2: Existing text node at same position
      if (!existingTextNode && childIndex < childNodes.length) {
        const nodeAtIndex = childNodes[childIndex];
        if (nodeAtIndex && nodeAtIndex.nodeType === 3) {
          existingTextNode = nodeAtIndex as Text;
        }
      }
      
      if (existingTextNode) {
        // Reuse existing text node (only update textContent)
        existingTextNode.textContent = String(childVNode.text);
        nextDomChildren.push(existingTextNode);
      } else {
        // Create new text node (only when no selection)
        const textNode = doc.createTextNode(String(childVNode.text));
        const referenceNode = childIndex < childNodes.length ? childNodes[childIndex] : null;
        parent.insertBefore(textNode, referenceNode);
        nextDomChildren.push(textNode);
      }
      continue;
    }
    
    // Element VNode processing (mark/decorator structure)
    // ... existing logic ...
  }
  
  // 3. Remove stale nodes (but protect text nodes with selection)
  this.removeStale(parent, new Set(nextDomChildren), context, prevMap, activeTextNodes);
}
```

#### 2. Protect Text Nodes with Selection

`removeStale` never deletes text nodes with selection:

```typescript
// reconciler.ts
private removeStale(
  parent: HTMLElement, 
  keep: Set<HTMLElement | Text>, 
  context?: any, 
  prevMap?: Map<string, VNode>,
  protectedTextNodes?: Set<Text>
): void {
  const children = Array.from(parent.childNodes);
  for (const ch of children) {
    if (!keep.has(ch as HTMLElement | Text)) {
      // Never delete text nodes with selection
      if (ch.nodeType === 3 && protectedTextNodes?.has(ch as Text)) {
        console.log('[Reconciler] Protected text node from removal (has selection)');
        continue;
      }
      
      // Text nodes don't need lifecycle processing
      if (ch.nodeType === 1) { // Element node
        const element = ch as HTMLElement;
        // ... unmount logic ...
      }
      parent.removeChild(ch);
    }
  }
}
```

#### 3. Preserve Text Nodes When Mark/Decorator Structure Changes

Reuse actual text nodes even when mark/decorator structure changes:

```typescript
// reconciler.ts
// Even if mark/decorator structure changes:
// - <span><strong><span>Hello</span></strong></span>
// - <span><em><span>Hello</span></em></span>
// The "Hello" text node is reused even if structure changes

private reconcileVNodeChildren(parent: HTMLElement, prevVNode: VNode | undefined, nextVNode: VNode, context?: any, isRecursive: boolean = false): void {
  // ... selection protection logic ...
  
  // When mark/decorator structure changes:
  // 1. Find and reuse existing text node
  // 2. Only change parent elements (mark/decorator)
  // 3. Keep text node as-is to preserve selection
}
```

**Implementation Strategy**:

1. **Text Node Mapping**: Track by mapping VNode to actual DOM text node
2. **Selection Detection**: Collect text nodes with selection at start of `reconcileVNodeChildren`
3. **Reuse Priority**:
   - Text node with selection (highest priority)
   - Existing text node at same position
   - Create new text node (last resort)
4. **Stale Removal Protection**: `removeStale` never deletes text nodes with selection

**Advantages**:
- ✅ Selection doesn't break (text node not deleted)
- ✅ Browser selection restoration unnecessary (original node maintained)
- ✅ Matches ContentEditable characteristics (only text node being edited changes)
- ✅ Can adjust Mark/Decorator ranges (keep text node and only change structure)

**Notes**:
- ⚠️ Memory issues possible if too many text nodes (but generally not a problem)
- ⚠️ Text node position adjustment needed when mark/decorator structure changes
- ⚠️ Must only update textContent of text node with selection and maintain structure

### Conclusion

Current architecture **well supports real-time text input in contenteditable**, but **selection preservation** needs additional improvement:

1. ✅ **Mark/Decorator Application**: `data('text')` always kept in children so marks/decorators are correctly applied
2. ✅ **Efficient Updates**: Minimal DOM manipulation with sid-based matching and prevVNode comparison
3. ✅ **Consistency**: Same VNode structure maintained even during text input
4. ✅ **Stability**: Reuse existing DOM elements to prevent unnecessary recreation
5. ⚠️ **Selection Preservation**: Currently attempts restoration with `applyModelSelectionWithRetry()`, but selection can break during reconciler updates (needs improvement)

## Conclusion

Current architecture **clearly distinguishes two paths**:

1. ✅ **Performance Optimization**: Efficiently process simple text by collapsing
2. ✅ **Flexibility**: `data('text')` always kept in children for mark/decorator processing
3. ✅ **Consistency**: Each path always processed the same way
4. ✅ **Clarity**: Clearly explain architecture with documentation
5. ✅ **ContentEditable Support**: Marks/decorators correctly applied even during real-time text input

This approach matches editor characteristics and is an optimal solution considering both performance and maintainability.

## References

- `text-vnode-bug-fix.md`: Bug fix process and overall concepts
- `reconciler-text-vnode-solution.md`: Solution document

