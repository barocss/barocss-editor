# Drop Behavior Specification

## Overview

This document defines the **behavior when a source node is dropped on a drop target** during drag and drop.

---

## 1. What is Drop Behavior?

**Drop Behavior** is the behavior performed when a source node is dropped on a drop target.

### Core Concepts

- **Drop target**: Node that receives the drop (droppable node)
- **Source node**: Node being dragged and dropped (draggable node)
- **Behavior**: Action performed during drop (Move, Copy, Merge, Transform, etc.)

### Drop Behavior Types

#### 1. Move (Move)
- **Meaning**: Remove source node from original position and insert into drop target
- **Default behavior**: Default in most cases
- **Example**: Move paragraph to different location

#### 2. Copy (Copy)
- **Meaning**: Copy source node and insert into drop target (keep original)
- **Use cases**: Ctrl/Cmd + drag, drag from external
- **Example**: Copy image to place in multiple locations

#### 3. Merge (Merge)
- **Meaning**: Merge source node with drop target
- **Use cases**: Text node merge, block merge
- **Example**: Drop text node on another text node to merge

#### 4. Transform (Transform)
- **Meaning**: Transform source node to match drop target type and insert
- **Use cases**: Transform block to inline, transform to specific type
- **Example**: Transform heading to paragraph and insert

#### 5. Wrap (Wrap)
- **Meaning**: Wrap source node with drop target
- **Use cases**: Wrap block with another block
- **Example**: Wrap paragraph with blockQuote

#### 6. Replace (Replace)
- **Meaning**: Replace drop target with source node
- **Use cases**: Completely replace drop target
- **Example**: Replace existing image with new image

---

## 2. How to Define Drop Behavior

### 2.1 Schema vs UI-Based Distinction

**Core principle**: 
- **Schema-based**: Basic rules at data model level (consistency, reusability)
- **UI-based**: User interaction context (keyboard modifiers, drag position, etc.)

#### Schema-Based Definition
- **Basic behavior per Target-Source combination**: Basic behavior when dropping a node of a certain type on a node of a certain type
- **Data integrity guarantee**: Defined at schema level to ensure consistent behavior
- **Reusability**: Apply same rules across multiple UI contexts

#### UI-Based Definition
- **Context information**: Ctrl/Cmd key, Shift key, drag position, etc.
- **Reflect user intent**: Change behavior based on keyboard modifiers (e.g., Ctrl+drag = Copy)
- **Visual feedback**: Drop possibility, drop behavior preview

### 2.2 Definition per Target-Source Combination

#### Method 1: Add dropBehaviorRules to Schema

```typescript
interface NodeTypeDefinition {
  // ... existing attributes
  /**
   * Drop Behavior Rules: Define drop behavior per source node type
   * 
   * Structure:
   * - Key: Source node type (stype) or group
   * - Value: Drop behavior ('move' | 'copy' | 'merge' | 'transform' | 'wrap' | 'replace')
   * 
   * Example:
   * dropBehaviorRules: {
   *   'inline-text': 'merge',      // Merge when dropping inline-text
   *   'inline-image': 'copy',      // Copy when dropping inline-image
   *   'paragraph': 'move',        // Move when dropping paragraph
   *   'block': 'move',            // Move when dropping all block nodes
   *   '*': 'move'                 // Default: move
   * }
   */
  dropBehaviorRules?: Record<string, DropBehavior>;
  
  /**
   * Drop Behavior: Default drop behavior (used when dropBehaviorRules is not present)
   * 
   * Types:
   * - 'move': Move source node (default)
   * - 'copy': Copy source node
   * - 'merge': Merge source node
   * - 'transform': Transform source node
   * - 'wrap': Wrap source node
   * - 'replace': Replace drop target with source node
   * - Function: Determine behavior dynamically
   */
  dropBehavior?: DropBehavior | 
    ((targetNode: INode, sourceNode: INode) => DropBehavior);
}
```

#### Method 2: Separate Rule Engine (Recommended)

```typescript
/**
 * Drop Behavior Rule Engine
 * Rule engine that defines behavior per Target-Source combination
 */
interface DropBehaviorRule {
  targetType: string | string[];  // Target node type (stype or group)
  sourceType: string | string[]; // Source node type (stype or group)
  behavior: DropBehavior | ((targetNode: INode, sourceNode: INode) => DropBehavior);
  priority?: number; // Priority (higher is prioritized)
}

// Rule examples
const dropBehaviorRules: DropBehaviorRule[] = [
  // Text node → text node: merge
  {
    targetType: ['inline-text'],
    sourceType: ['inline-text'],
    behavior: 'merge',
    priority: 100
  },
  // Same type blocks: move
  {
    targetType: ['block'],
    sourceType: ['block'],
    behavior: (target, source) => {
      return target.stype === source.stype ? 'move' : 'move';
    },
    priority: 50
  },
  // Default: move
  {
    targetType: '*',
    sourceType: '*',
    behavior: 'move',
    priority: 0
  }
];
```

#### Method 3: Matrix Form Definition

```typescript
/**
 * Drop Behavior Matrix
 * Behavior matrix per Target type per Source type
 */
type DropBehaviorMatrix = Record<string, Record<string, DropBehavior>>;

const dropBehaviorMatrix: DropBehaviorMatrix = {
  'paragraph': {
    'inline-text': 'merge',
    'inline-image': 'move',
    'paragraph': 'move',
    '*': 'move'  // Default
  },
  'heading': {
    'inline-text': 'merge',
    'inline-image': 'move',
    'heading': 'move',
    '*': 'move'
  },
  'document': {
    'block': 'move',
    '*': 'move'
  },
  '*': {  // Default for all targets
    '*': 'move'
  }
};
```

### 2.3 Implementation Structure

#### Layer Structure

```
UI Layer (EditorViewDOM)
  ↓ Add context information (Ctrl/Cmd key, drag position, etc.)
DataStore Layer (getDropBehavior)
  ↓ Check Target-Source combination
Schema Layer (dropBehaviorRules)
  ↓ Apply basic rules
Default Behavior ('move')
```

#### Implementation Example

```typescript
/**
 * Determines behavior when dropping source node on drop target.
 * 
 * @param targetNodeId Drop target node ID
 * @param sourceNodeId Source node ID
 * @param context UI context (optional)
 * @returns Drop behavior
 */
getDropBehavior(
  targetNodeId: string, 
  sourceNodeId: string,
  context?: DropContext
): DropBehavior {
  const schema = this.dataStore.getActiveSchema();
  const targetNode = this.dataStore.getNode(targetNodeId);
  const sourceNode = this.dataStore.getNode(sourceNodeId);
  
  if (!targetNode || !sourceNode || !schema) {
    return 'move'; // Default
  }
  
  const targetType = schema.getNodeType(targetNode.stype);
  const sourceType = schema.getNodeType(sourceNode.stype);
  
  // 1. Check UI context (highest priority)
  if (context?.modifiers?.ctrlKey || context?.modifiers?.metaKey) {
    return 'copy'; // Ctrl/Cmd + drag = copy
  }
  
  // 2. Check schema's dropBehaviorRules
  if (targetType?.dropBehaviorRules) {
    const rules = targetType.dropBehaviorRules;
    
    // Check rules per source type
    if (rules[sourceNode.stype]) {
      return rules[sourceNode.stype];
    }
    
    // Check rules per source group
    if (sourceType?.group && rules[sourceType.group]) {
      return rules[sourceType.group];
    }
    
    // Check wildcard rules
    if (rules['*']) {
      return rules['*'];
    }
  }
  
  // 3. Check schema's dropBehavior function
  if (targetType?.dropBehavior && typeof targetType.dropBehavior === 'function') {
    return targetType.dropBehavior(targetNode, sourceNode);
  }
  
  // 4. Basic rules based on type combination
  // Text node → text node: merge
  if (targetNode.text && sourceNode.text) {
    return 'merge';
  }
  
  // Same type blocks: move
  if (targetType?.group === 'block' && sourceType?.group === 'block' && 
      targetNode.stype === sourceNode.stype) {
    return 'move';
  }
  
  // 5. Default: move
  return 'move';
}
```

#### DropContext Interface

```typescript
interface DropContext {
  modifiers?: {
    ctrlKey?: boolean;  // Ctrl key (Windows/Linux)
    metaKey?: boolean;  // Cmd key (Mac)
    shiftKey?: boolean; // Shift key
    altKey?: boolean;   // Alt key
  };
  position?: number;    // Drop position
  dropZone?: 'before' | 'after' | 'inside'; // Drop area
  sourceOrigin?: 'internal' | 'external';   // Internal/external drag
}
```

---

## 3. Drop Behavior Implementation

### 3.1 Move (Move)

```typescript
function executeMoveBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  dataStore: DataStore
): void {
  // Execute moveNode operation
  dataStore.content.moveNode(sourceNodeId, targetNodeId, position);
}
```

### 3.2 Copy (Copy)

```typescript
function executeCopyBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  dataStore: DataStore
): string {
  // Execute copyNode operation
  const newNodeId = dataStore.content.copyNode(sourceNodeId, targetNodeId);
  // Adjust position (if needed)
  return newNodeId;
}
```

### 3.3 Merge (Merge)

```typescript
function executeMergeBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  dataStore: DataStore
): void {
  const targetNode = dataStore.getNode(targetNodeId);
  const sourceNode = dataStore.getNode(sourceNodeId);
  
  // Merge text nodes
  if (targetNode.text && sourceNode.text) {
    dataStore.splitMerge.mergeTextNodes(targetNodeId, sourceNodeId);
  }
  // Merge block nodes
  else if (targetNode.stype === sourceNode.stype) {
    dataStore.splitMerge.mergeBlockNodes(targetNodeId, sourceNodeId);
  }
}
```

### 3.4 Transform (Transform)

```typescript
function executeTransformBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  dataStore: DataStore
): string {
  const targetNode = dataStore.getNode(targetNodeId);
  const sourceNode = dataStore.getNode(sourceNodeId);
  
  // Transform source node to match target type
  const transformedNode = transformNode(sourceNode, targetNode.stype);
  const newNodeId = dataStore.createNode(transformedNode);
  
  // Insert into target
  dataStore.content.addChild(targetNodeId, newNodeId, position);
  
  // Remove original (if needed)
  if (sourceNode.parentId) {
    dataStore.content.removeChild(sourceNode.parentId, sourceNodeId);
  }
  
  return newNodeId;
}
```

### 3.5 Wrap (Wrap)

```typescript
function executeWrapBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  dataStore: DataStore
): string {
  // Wrap source node with target type
  const wrapperNode = {
    stype: targetNode.stype,
    content: [sourceNodeId]
  };
  
  const wrapperNodeId = dataStore.createNode(wrapperNode);
  
  // Insert at original position
  if (sourceNode.parentId) {
    const position = dataStore.getNode(sourceNode.parentId)?.content?.indexOf(sourceNodeId);
    dataStore.content.addChild(sourceNode.parentId, wrapperNodeId, position);
    dataStore.content.removeChild(sourceNode.parentId, sourceNodeId);
  }
  
  return wrapperNodeId;
}
```

### 3.6 Replace (Replace)

```typescript
function executeReplaceBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  dataStore: DataStore
): void {
  const targetNode = dataStore.getNode(targetNodeId);
  
  // Replace target node with source node
  if (targetNode.parentId) {
    const position = dataStore.getNode(targetNode.parentId)?.content?.indexOf(targetNodeId);
    dataStore.content.moveNode(sourceNodeId, targetNode.parentId, position);
    dataStore.deleteNode(targetNodeId);
  }
}
```

---

## 4. Drop Behavior Determination Priority

### 4.1 Priority Order

1. **Schema's dropBehavior attribute** (highest priority)
   - When explicitly defined in target node type
   - If function: Determined dynamically

2. **Type combination rules**
   - Text node → text node: `merge`
   - Same type blocks: `move`
   - block → inline: `transform` or `move`

3. **Default**
   - Otherwise: `move`

### 4.2 Implementation Example

```typescript
getDropBehavior(targetNodeId: string, sourceNodeId: string): DropBehavior {
  const schema = this.dataStore.getActiveSchema();
  if (!schema) {
    return 'move'; // Default
  }
  
  const targetNode = this.dataStore.getNode(targetNodeId);
  const sourceNode = this.dataStore.getNode(sourceNodeId);
  
  if (!targetNode || !sourceNode) {
    return 'move';
  }
  
  const targetType = schema.getNodeType(targetNode.stype);
  const sourceType = schema.getNodeType(sourceNode.stype);
  
  // 1. When explicitly defined in schema
  if (targetType?.dropBehavior) {
    if (typeof targetType.dropBehavior === 'function') {
      return targetType.dropBehavior(targetNode, sourceNode);
    }
    return targetType.dropBehavior;
  }
  
  // 2. Basic rules based on type combination
  // Text node → text node: merge
  if (targetNode.text && sourceNode.text) {
    return 'merge';
  }
  
  // Same type blocks: move
  if (targetType?.group === 'block' && sourceType?.group === 'block' && 
      targetNode.stype === sourceNode.stype) {
    return 'move';
  }
  
  // 3. Default: move
  return 'move';
}
```

---

## 5. Use Cases

### 5.1 Basic Drop (Move)

```typescript
// Move paragraph to different location
const behavior = dataStore.getDropBehavior('paragraph-2', 'paragraph-1');
// behavior: 'move'

// Execute moveNode operation
await transaction(editor, [
  {
    type: 'moveNode',
    payload: {
      nodeId: 'paragraph-1',
      newParentId: 'document-1',
      position: 2
    }
  }
]).commit();
```

### 5.2 Text Merge (Merge)

```typescript
// Drop text node on another text node to merge
const behavior = dataStore.getDropBehavior('text-2', 'text-1');
// behavior: 'merge'

// Execute mergeTextNodes operation
await transaction(editor, [
  {
    type: 'mergeTextNodes',
    payload: {
      leftNodeId: 'text-2',
      rightNodeId: 'text-1'
    }
  }
]).commit();
```

### 5.3 Image Copy (Copy)

```typescript
// Copy image to place in multiple locations
const behavior = dataStore.getDropBehavior('paragraph-2', 'image-1');
// behavior: 'copy' (if defined in schema)

// Execute copyNode operation
await transaction(editor, [
  {
    type: 'copyNode',
    payload: {
      nodeId: 'image-1',
      newParentId: 'paragraph-2'
    }
  }
]).commit();
```

---

## 6. Recommended Implementation Approach

### 6.1 Schema Extension (Recommended)

```typescript
interface NodeTypeDefinition {
  // ... existing attributes
  
  /**
   * Drop Behavior Rules: Define drop behavior per source node type
   * 
   * Structure:
   * - Key: Source node type (stype) or group or wildcard ('*')
   * - Value: Drop behavior
   * 
   * Priority:
   * 1. Exact source type (stype) match
   * 2. Source group (group) match
   * 3. Wildcard ('*')
   * 
   * Example:
   * dropBehaviorRules: {
   *   'inline-text': 'merge',      // Merge when dropping inline-text
   *   'inline-image': 'copy',      // Copy when dropping inline-image
   *   'block': 'move',             // Move when dropping all blocks
   *   '*': 'move'                  // Default: move
   * }
   */
  dropBehaviorRules?: Record<string, DropBehavior>;
  
  /**
   * Drop Behavior: Default drop behavior (used when dropBehaviorRules is not present)
   * If function: Determine behavior dynamically
   */
  dropBehavior?: DropBehavior | 
    ((targetNode: INode, sourceNode: INode) => DropBehavior);
}
```

### 6.2 Add DataStore API

```typescript
// Add to DataStore
interface DataStore {
  /**
   * Determines behavior when dropping source node on drop target.
   * 
   * @param targetNodeId Drop target node ID
   * @param sourceNodeId Source node ID
   * @param context UI context (optional)
   * @returns Drop behavior
   */
  getDropBehavior(
    targetNodeId: string,
    sourceNodeId: string,
    context?: DropContext
  ): DropBehavior;
  
  /**
   * Executes drop behavior.
   * 
   * @param targetNodeId Drop target node ID
   * @param sourceNodeId Source node ID
   * @param position Drop position
   * @param behavior Drop behavior (optional, auto-determined if not provided)
   * @param context UI context (optional)
   */
  executeDropBehavior(
    targetNodeId: string,
    sourceNodeId: string,
    position: number,
    behavior?: DropBehavior,
    context?: DropContext
  ): Promise<void>;
}
```

### 6.3 UI Layer Integration

```typescript
// Use in EditorViewDOM
class EditorViewDOM {
  handleDrop(event: DragEvent): void {
    const targetNodeId = this.getDropTargetNodeId(event);
    const sourceNodeId = this.getDraggedNodeId(event);
    const position = this.getDropPosition(event);
    
    // Create UI context
    const context: DropContext = {
      modifiers: {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey
      },
      position: position,
      dropZone: this.getDropZone(event),
      sourceOrigin: this.getSourceOrigin(event)
    };
    
    // Determine drop behavior
    const behavior = this.editor.dataStore.getDropBehavior(
      targetNodeId,
      sourceNodeId,
      context
    );
    
    // Execute drop behavior
    await this.editor.dataStore.executeDropBehavior(
      targetNodeId,
      sourceNodeId,
      position,
      behavior,
      context
    );
  }
}
```

### 6.2 Add API

```typescript
// Add to DataStore
getDropBehavior(targetNodeId: string, sourceNodeId: string): DropBehavior;
executeDropBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  behavior?: DropBehavior
): Promise<void>;
```

### 6.3 Extensible Structure

```typescript
// Drop Behavior Handler interface
interface DropBehaviorHandler {
  canHandle(behavior: DropBehavior): boolean;
  execute(
    targetNodeId: string,
    sourceNodeId: string,
    position: number,
    dataStore: DataStore
  ): Promise<void>;
}

// Register handler
registerDropBehaviorHandler(behavior: DropBehavior, handler: DropBehaviorHandler);
```

---

## 7. Summary

### Definition of Drop Behavior

1. **Behavior when source node is dropped on drop target**
2. **Can be defined at schema level or function level**
3. **Basic rules applied based on type combination**

### Drop Behavior Types

- **Move**: Move source node (default)
- **Copy**: Copy source node
- **Merge**: Merge source node
- **Transform**: Transform source node
- **Wrap**: Wrap source node
- **Replace**: Replace drop target with source node

### Determination Priority

1. **Schema's dropBehavior attribute** (highest priority)
2. **Type combination rules** (text merge, same type move, etc.)
3. **Default** (move)

---

## 8. Function-Based Definition (defineDropBehavior)

### 8.1 defineDropBehavior Pattern

Defines Drop Behavior while maintaining consistency with existing `defineOperation` pattern.

```typescript
// Drop Behavior definition function
defineDropBehavior(
  targetType: string | string[],
  behavior: DropBehavior | 
    ((targetNode: INode, sourceNode: INode, context: DropContext) => DropBehavior),
  options?: {
    sourceType?: string | string[];
    priority?: number;
  }
): void;
```

### 8.2 Usage Examples

```typescript
// Define basic drop behavior
defineDropBehavior('paragraph', 'move');

// Define dynamic drop behavior
defineDropBehavior(
  'paragraph',
  (target, source, context) => {
    if (source.stype === 'inline-text') {
      return 'merge';
    }
    if (source.stype === 'inline-image' && context.modifiers?.ctrlKey) {
      return 'copy';
    }
    return 'move';
  },
  { priority: 100 }
);

// Rule for specific source type
defineDropBehavior(
  'paragraph',
  'merge',
  { sourceType: 'inline-text', priority: 200 }
);

// Rules for multiple target types
defineDropBehavior(
  ['paragraph', 'heading'],
  'move',
  { sourceType: 'block', priority: 50 }
);
```

### 8.3 Schema vs Function-Based Comparison

| Distinction | Schema-Based | Function-Based |
|-------------|--------------|----------------|
| **Explicitness** | High (defined directly in schema) | Medium (registered separately) |
| **Flexibility** | Low (static rules) | High (dynamic logic) |
| **Extensibility** | Low | High |
| **Consistency** | High (managed together with schema) | Medium |
| **Complexity** | Low | Medium |

### 8.4 Hybrid Approach (Recommended)

**Basic rules**: Schema's `dropBehaviorRules` (explicit, simple rules)
**Complex rules**: `defineDropBehavior` function (dynamic, complex logic)

```typescript
// 1. Define basic rules in schema
const schema = new Schema('example', {
  nodes: {
    'paragraph': {
      dropBehaviorRules: {
        'inline-text': 'merge',  // Simple rule
        '*': 'move'
      }
    }
  }
});

// 2. Define complex rules as functions
defineDropBehavior(
  'paragraph',
  (target, source, context) => {
    // Complex logic
    if (source.attributes?.locked && !context.modifiers?.shiftKey) {
      return 'copy'; // Locked nodes can only be copied
    }
    // ...
  },
  { priority: 100 }
);
```

---

## 9. Approaches from Other Editors

### 9.1 ProseMirror

**Approach**: Plugin-based + schema rules

```typescript
// ProseMirror defines drop behavior via plugins
const dropBehaviorPlugin = new Plugin({
  props: {
    handleDrop(view, event, slice, moved) {
      // Determine and execute drop behavior
      if (moved) {
        // Move
      } else {
        // Copy
      }
    }
  }
});
```

**Characteristics:**
- Utilizes plugin system
- Applies basic rules based on schema's `content` definition
- Custom drop behavior handled in plugins

### 9.2 Slate.js

**Approach**: Handler function-based

```typescript
// Slate.js defines drop behavior via handler functions
const editor = {
  handlers: {
    onDrop: (event, editor) => {
      // Determine and execute drop behavior
      if (event.dataTransfer.effectAllowed === 'copy') {
        // Copy
      } else {
        // Move
      }
    }
  }
};
```

**Characteristics:**
- Handler function-based
- Event-based processing
- Flexible but may be difficult to maintain consistency

### 9.3 TinyMCE

**Approach**: Configuration-based + plugins

```typescript
// TinyMCE defines drop behavior via configuration and plugins
tinymce.init({
  plugins: 'dragdrop',
  dragdrop_config: {
    behavior: 'move', // or 'copy'
    rules: {
      'paragraph': { 'image': 'copy', '*': 'move' }
    }
  }
});
```

**Characteristics:**
- Configuration-based default behavior
- Extensible via plugins
- Rule-based matching

---

## 10. Implementation Plan

For detailed implementation plan, refer to the following document:
- `packages/datastore/docs/drop-behavior-implementation-plan.md`: Implementation plan and step-by-step guide

### 10.1 Implementation Order

1. **Phase 1: Basic Structure**
   - Type definitions
   - `defineDropBehavior` Registry implementation
   - Add `dropBehaviorRules` to schema

2. **Phase 2: Basic Rules**
   - Basic drop behavior determination logic
   - `getDropBehavior` implementation
   - Default rule registration

3. **Phase 3: Execution Logic**
   - `executeDropBehavior` implementation
   - Implementation of execution functions per behavior

4. **Phase 4: Integration**
   - DataStore API exposure
   - UI Layer integration
   - Test code writing

---

## 11. References

- `packages/datastore/src/operations/content-operations.ts`: moveNode, copyNode implementation
- `packages/datastore/src/operations/split-merge-operations.ts`: mergeTextNodes, mergeBlockNodes implementation
- `packages/model/src/operations/moveNode.ts`: moveNode operation
- `packages/model/src/operations/copyNode.ts`: copyNode operation
- `packages/model/src/operations/define-operation.ts`: Operation definition pattern
- `packages/datastore/docs/droppable-node-spec.md`: Droppable Node specification
- `packages/datastore/docs/drop-behavior-implementation-options.md`: Implementation option comparison
- `packages/datastore/docs/drop-behavior-implementation-plan.md`: Implementation plan and step-by-step guide
