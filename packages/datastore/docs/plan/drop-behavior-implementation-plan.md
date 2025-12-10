# Drop Behavior Implementation Plan

## Overview

This document organizes the implementation of basic drop rules, the `defineDropBehavior` function, and how to apply schema rules.

---

## 1. Implementation Goals

1. **Basic drop rule implementation**: Define basic behavior for internal/external drag
2. **defineDropBehavior function**: Define dynamic drop behavior
3. **Schema dropBehaviorRules**: Define static drop behavior
4. **Priority-based rule matching**: Select appropriate rule from multiple rules

---

## 2. Architecture Design

> **Important**: For detailed discussion on architecture design, refer to `drop-behavior-architecture.md`.

### 2.1 Layer Structure

```
UI Layer (EditorViewDOM)
  ↓ Create DropContext (Ctrl/Cmd key, drag position, etc.)
DataStore Layer (getDropBehavior)
  ↓ Rule matching and behavior determination
Rule Engine Layer
  ├── defineDropBehavior Registry (dynamic rules)
  ├── Schema dropBehaviorRules (basic rule hints)
  └── Default Rules (built-in rules)
```

### 2.2 Rule Priority

1. **UI Context** (highest priority)
   - Ctrl/Cmd + drag: `copy`
   - Shift + drag: special behavior

2. **defineDropBehavior rules** (dynamic rules)
   - Rules defined as functions
   - Priority-based matching
   - Can be defined at EditorViewDOM, Extension, application level

3. **Schema dropBehaviorRules** (basic rule hints)
   - Basic rules per source type defined in schema
   - Ensures basic behavior when schema is reused
   - Can be overridden by `defineDropBehavior`

4. **Type combination basic rules** (built-in rules)
   - Text node → text node: `merge`
   - Same type blocks: `move`

5. **Default value** (fallback)
   - Internal drag: `move`
   - External drag: `insert`

### 2.3 Schema vs defineDropBehavior Roles

**Schema (`dropBehaviorRules`):**
- Provides basic rule hints (optional)
- Hints that "this node type has this basic behavior" when defining schema
- Ensures basic behavior when schema is reused
- Consistent with attributes like `editable`, `selectable`, `draggable`, `droppable`

**defineDropBehavior:**
- Define dynamic rules (when needed)
- Editor-specific rules at EditorViewDOM initialization
- Domain-specific rules in Extension
- Business logic rules at application level
- Can override schema rules

---

## 3. Implementation Steps

### 3.1 Step 1: Type Definitions

#### DropBehavior Type

```typescript
// packages/datastore/src/types/drop-behavior.ts
export type DropBehavior = 'move' | 'copy' | 'merge' | 'transform' | 'wrap' | 'replace' | 'insert';

export interface DropContext {
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

#### DropBehaviorDefinition Interface

```typescript
export interface DropBehaviorDefinition {
  targetType: string | string[];  // Target node type (stype or group)
  sourceType?: string | string[]; // Source node type (optional, all sources if not provided)
  behavior: DropBehavior | 
    ((targetNode: INode, sourceNode: INode, context: DropContext) => DropBehavior);
  priority?: number; // Priority (higher is prioritized, default: 0)
}
```

### 3.2 Step 2: defineDropBehavior Registry Implementation

```typescript
// packages/datastore/src/operations/drop-behavior-registry.ts
import type { INode } from '@barocss/model';
import type { DropBehavior, DropContext, DropBehaviorDefinition } from '../types/drop-behavior';

class GlobalDropBehaviorRegistry {
  private behaviors = new Map<string, DropBehaviorDefinition[]>();

  register(definition: DropBehaviorDefinition): void {
    const targetTypes = Array.isArray(definition.targetType) 
      ? definition.targetType 
      : [definition.targetType];
    
    targetTypes.forEach(targetType => {
      if (!this.behaviors.has(targetType)) {
        this.behaviors.set(targetType, []);
      }
      this.behaviors.get(targetType)!.push(definition);
      // Sort by priority (higher priority first)
      this.behaviors.get(targetType)!.sort((a, b) => 
        (b.priority || 0) - (a.priority || 0)
      );
    });
  }

  get(
    targetType: string, 
    sourceType: string,
    targetNode?: INode,
    sourceNode?: INode,
    context?: DropContext
  ): DropBehavior | null {
    const behaviors = this.behaviors.get(targetType) || [];
    
    // Match in priority order
    for (const definition of behaviors) {
      // Check sourceType matching
      if (definition.sourceType) {
        const sourceTypes = Array.isArray(definition.sourceType) 
          ? definition.sourceType 
          : [definition.sourceType];
        
        if (!sourceTypes.includes(sourceType) && !sourceTypes.includes('*')) {
          continue; // Not matched
        }
      }
      
      // Determine behavior
      if (typeof definition.behavior === 'function') {
        if (targetNode && sourceNode) {
          return definition.behavior(targetNode, sourceNode, context || {});
        }
      } else {
        return definition.behavior;
      }
    }
    
    return null; // No matching rule
  }

  clear(): void {
    this.behaviors.clear();
  }
}

export const globalDropBehaviorRegistry = new GlobalDropBehaviorRegistry();

/**
 * Defines Drop Behavior.
 * 
 * @param targetType Target node type (stype or group) or array
 * @param behavior Drop behavior or function
 * @param options Options (sourceType, priority)
 * 
 * @example
 * // Define basic drop behavior
 * defineDropBehavior('paragraph', 'move');
 * 
 * // Define dynamic drop behavior
 * defineDropBehavior(
 *   'paragraph',
 *   (target, source, context) => {
 *     if (source.stype === 'inline-text') {
 *       return 'merge';
 *     }
 *     return 'move';
 *   },
 *   { priority: 100 }
 * );
 * 
 * // Rule for specific source type
 * defineDropBehavior(
 *   'paragraph',
 *   'merge',
 *   { sourceType: 'inline-text', priority: 200 }
 * );
 */
export function defineDropBehavior(
  targetType: string | string[],
  behavior: DropBehavior | 
    ((targetNode: INode, sourceNode: INode, context: DropContext) => DropBehavior),
  options?: {
    sourceType?: string | string[];
    priority?: number;
  }
): void {
  globalDropBehaviorRegistry.register({
    targetType,
    sourceType: options?.sourceType,
    behavior,
    priority: options?.priority || 0
  });
}
```

### 3.3 Step 3: Schema Extension

```typescript
// packages/schema/src/types.ts
export interface NodeTypeDefinition {
  // ... existing attributes
  
  /**
   * Drop Behavior Rules: Basic drop behavior per source node type (hints)
   * 
   * These rules are used as "defaults" and can be overridden by defineDropBehavior
   * 
   * Structure:
   * - Key: Source node type (stype) or wildcard ('*')
   * - Value: Drop behavior
   * 
   * Priority:
   * 1. Exact source type (stype) match
   * 2. Wildcard ('*')
   * 
   * Usage scenarios:
   * - Provide hints that "this node type has this basic behavior" when defining schema
   * - Ensure basic behavior when schema is reused
   * - Override with defineDropBehavior if different rules needed for specific editor instance
   * 
   * Example:
   * dropBehaviorRules: {
   *   'inline-text': 'merge',      // Merge when dropping inline-text
   *   'inline-image': 'copy',      // Copy when dropping inline-image
   *   '*': 'move'                  // Default: move
   * }
   * 
   * Note:
   * - These rules have lower priority than defineDropBehavior
   * - Schema focuses on data model definition, basic rules are just hints
   * - For detailed architecture discussion, refer to drop-behavior-architecture.md
   */
  dropBehaviorRules?: Record<string, DropBehavior>;
}
```

### 3.4 Step 4: Basic Rule Implementation

```typescript
// packages/datastore/src/operations/utility-operations.ts

/**
 * Determines default drop behavior.
 * 
 * @param targetNode Target node
 * @param sourceNode Source node
 * @param context Drop context
 * @param schema Schema
 * @returns Drop behavior
 */
private _getDefaultDropBehavior(
  targetNode: INode,
  sourceNode: INode,
  context: DropContext,
  schema: any
): DropBehavior {
  // 1. External drag: insert
  if (context.sourceOrigin === 'external') {
    return 'insert';
  }
  
  // 2. Type combination basic rules
  // Text node → text node: merge
  if (targetNode.text && sourceNode.text) {
    return 'merge';
  }
  
  // 3. Same type blocks: move
  const targetType = schema?.getNodeType?.(targetNode.stype);
  const sourceType = schema?.getNodeType?.(sourceNode.stype);
  
  if (targetType?.group === 'block' && sourceType?.group === 'block' && 
      targetNode.stype === sourceNode.stype) {
    return 'move';
  }
  
  // 4. Default: move (internal drag)
  return 'move';
}
```

### 3.5 Step 5: getDropBehavior Implementation

```typescript
// packages/datastore/src/operations/utility-operations.ts

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
  const schema = (this.dataStore as any)._activeSchema;
  const targetNode = this.dataStore.getNode(targetNodeId);
  const sourceNode = this.dataStore.getNode(sourceNodeId);
  
  if (!targetNode || !sourceNode) {
    return 'move'; // Default
  }
  
  const targetType = schema?.getNodeType?.(targetNode.stype);
  const sourceType = schema?.getNodeType?.(sourceNode.stype);
  const sourceStype = sourceNode.stype;
  const sourceGroup = sourceType?.group;
  
  // 1. Check UI context (highest priority)
  if (context?.modifiers?.ctrlKey || context?.modifiers?.metaKey) {
    return 'copy'; // Ctrl/Cmd + drag = copy
  }
  
  // 2. Check defineDropBehavior rules
  const registeredBehavior = globalDropBehaviorRegistry.get(
    targetNode.stype,
    sourceStype,
    targetNode,
    sourceNode,
    context
  );
  
  if (registeredBehavior) {
    return registeredBehavior;
  }
  
  // 3. Check schema's dropBehaviorRules
  if (targetType?.dropBehaviorRules) {
    const rules = targetType.dropBehaviorRules;
    
    // Check rules per source type (priority: stype > group > *)
    if (rules[sourceStype]) {
      return rules[sourceStype];
    }
    
    if (sourceGroup && rules[sourceGroup]) {
      return rules[sourceGroup];
    }
    
    if (rules['*']) {
      return rules['*'];
    }
  }
  
  // 4. Type combination basic rules
  return this._getDefaultDropBehavior(targetNode, sourceNode, context || {}, schema);
}
```

### 3.6 Step 6: executeDropBehavior Implementation

```typescript
// packages/datastore/src/operations/utility-operations.ts

/**
 * Executes drop behavior.
 * 
 * @param targetNodeId Drop target node ID
 * @param sourceNodeId Source node ID
 * @param position Drop position
 * @param behavior Drop behavior (optional, auto-determined if not provided)
 * @param context UI context (optional)
 */
async executeDropBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  behavior?: DropBehavior,
  context?: DropContext
): Promise<void> {
  // Determine drop behavior
  const finalBehavior = behavior || this.getDropBehavior(targetNodeId, sourceNodeId, context);
  
  switch (finalBehavior) {
    case 'move':
      this.dataStore.content.moveNode(sourceNodeId, targetNodeId, position);
      break;
      
    case 'copy':
      const newNodeId = this.dataStore.content.copyNode(sourceNodeId, targetNodeId);
      // Adjust position (if needed)
      if (position !== undefined) {
        // Logic to adjust position of copied node
      }
      break;
      
    case 'merge':
      await this._executeMergeBehavior(targetNodeId, sourceNodeId);
      break;
      
    case 'transform':
      await this._executeTransformBehavior(targetNodeId, sourceNodeId, position);
      break;
      
    case 'wrap':
      await this._executeWrapBehavior(targetNodeId, sourceNodeId);
      break;
      
    case 'replace':
      await this._executeReplaceBehavior(targetNodeId, sourceNodeId);
      break;
      
    case 'insert':
      await this._executeInsertBehavior(targetNodeId, sourceNodeId, position, context);
      break;
      
    default:
      // Default: move
      this.dataStore.content.moveNode(sourceNodeId, targetNodeId, position);
  }
}

private async _executeMergeBehavior(
  targetNodeId: string,
  sourceNodeId: string
): Promise<void> {
  const targetNode = this.dataStore.getNode(targetNodeId);
  const sourceNode = this.dataStore.getNode(sourceNodeId);
  
  if (!targetNode || !sourceNode) {
    return;
  }
  
  // Merge text nodes
  if (targetNode.text && sourceNode.text) {
    this.dataStore.splitMerge.mergeTextNodes(targetNodeId, sourceNodeId);
  }
  // Merge block nodes
  else if (targetNode.stype === sourceNode.stype) {
    this.dataStore.splitMerge.mergeBlockNodes(targetNodeId, sourceNodeId);
  }
}

private async _executeTransformBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number
): Promise<void> {
  // Transform source node to match target type
  // Implementation needed
}

private async _executeWrapBehavior(
  targetNodeId: string,
  sourceNodeId: string
): Promise<void> {
  // Wrap source node with target
  // Implementation needed
}

private async _executeReplaceBehavior(
  targetNodeId: string,
  sourceNodeId: string
): Promise<void> {
  // Replace target node with source node
  // Implementation needed
}

private async _executeInsertBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  context?: DropContext
): Promise<void> {
  // Create new node when dragged from external
  // Implementation needed
}
```

### 3.7 Step 7: DataStore API Exposure

```typescript
// packages/datastore/src/data-store.ts

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
  return this.utility.getDropBehavior(targetNodeId, sourceNodeId, context);
}

/**
 * Executes drop behavior.
 * 
 * @param targetNodeId Drop target node ID
 * @param sourceNodeId Source node ID
 * @param position Drop position
 * @param behavior Drop behavior (optional, auto-determined if not provided)
 * @param context UI context (optional)
 */
async executeDropBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  behavior?: DropBehavior,
  context?: DropContext
): Promise<void> {
  return this.utility.executeDropBehavior(
    targetNodeId,
    sourceNodeId,
    position,
    behavior,
    context
  );
}
```

### 3.8 Step 8: Register Default Rules

```typescript
// packages/datastore/src/operations/drop-behavior-defaults.ts

import { defineDropBehavior } from './drop-behavior-registry';

/**
 * Registers default drop behavior rules.
 * This function is called during DataStore initialization.
 */
export function registerDefaultDropBehaviors(): void {
  // Text node → text node: merge
  defineDropBehavior(
    ['inline-text'],
    'merge',
    { sourceType: 'inline-text', priority: 100 }
  );
  
  // Same type blocks: move
  defineDropBehavior(
    ['block'],
    (target, source) => {
      if (target.stype === source.stype) {
        return 'move';
      }
      return 'move';
    },
    { sourceType: 'block', priority: 50 }
  );
  
  // Default: move (all combinations)
  defineDropBehavior(
    '*',
    'move',
    { priority: 0 }
  );
}
```

---

## 4. Usage Examples

### 4.1 Define Basic Rules in Schema (Optional)

```typescript
// Provide basic rule hints when defining schema
const schema = createSchema('example', {
  nodes: {
    'paragraph': {
      name: 'paragraph',
      group: 'block',
      content: 'inline*',
      // Basic rules (optional, hints)
      dropBehaviorRules: {
        'inline-text': 'merge',      // Merge text
        'inline-image': 'move',      // Move image
        '*': 'move'                  // Default: move
      }
    },
    'heading': {
      name: 'heading',
      group: 'block',
      content: 'inline*',
      // No rules → use defaults
    }
  }
});
```

**Reasons to define in schema:**
- Ensure basic behavior when schema is reused
- Consistent with attributes like `editable`, `selectable`, `draggable`, `droppable`
- Hints that "this node type has this basic behavior"

**However:**
- Schema rules are just "defaults", not required
- Can be overridden with `defineDropBehavior` anytime

### 4.2 Define Rules with defineDropBehavior (When Needed)

```typescript
import { defineDropBehavior } from '@barocss/datastore';

// At EditorViewDOM initialization
class EditorViewDOM {
  constructor(editor: Editor, options: EditorViewDOMOptions) {
    // Rules specific to this editor instance
    defineDropBehavior(
      'paragraph',
      (target, source, context) => {
        // Shift + drag = copy
        if (context.modifiers?.shiftKey) {
          return 'copy';
        }
        // Return null to check schema rules
        return null;
      },
      { priority: 200 }
    );
  }
}

// Domain-specific rules in Extension
defineDropBehavior(
  'paragraph',
  (target, source, context) => {
    // Complex logic
    if (source.attributes?.locked && !context.modifiers?.shiftKey) {
      return 'copy'; // Locked nodes can only be copied
    }
    if (source.stype === 'inline-text') {
      return 'merge';
    }
    // Return null to check next priority
    return null;
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

**defineDropBehavior usage scenarios:**
- Editor-specific rules at EditorViewDOM initialization
- Domain-specific rules in Extension
- Business logic rules at application level
- Override schema rules

### 4.3 Usage in UI Layer

```typescript
// Use in EditorViewDOM
class EditorViewDOM {
  handleDrop(event: DragEvent): void {
    event.preventDefault();
    
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
      sourceOrigin: this.getSourceOrigin(event) // 'internal' or 'external'
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

---

## 5. Implementation Order

### Phase 1: Basic Structure
1. Type definitions (`DropBehavior`, `DropContext`, `DropBehaviorDefinition`)
2. `defineDropBehavior` Registry implementation
3. Add `dropBehaviorRules` to schema

### Phase 2: Basic Rules
4. Implement basic drop behavior determination logic
5. Implement `getDropBehavior`
6. Register default rules (`registerDefaultDropBehaviors`)

### Phase 3: Execution Logic
7. Implement `executeDropBehavior`
8. Implement execution functions per behavior (merge, transform, wrap, replace, insert)

### Phase 4: Integration
9. Expose DataStore API
10. Integrate UI Layer
11. Write test code

---

## 6. File Structure

```
packages/datastore/src/
├── types/
│   └── drop-behavior.ts          # Type definitions
├── operations/
│   ├── drop-behavior-registry.ts  # defineDropBehavior Registry
│   ├── drop-behavior-defaults.ts # Default rule registration
│   └── utility-operations.ts      # getDropBehavior, executeDropBehavior
└── data-store.ts                  # DataStore API exposure

packages/schema/src/
└── types.ts                       # Add dropBehaviorRules

packages/datastore/test/
└── drop-behavior.test.ts         # Test code
```

---

## 7. Test Plan

### 7.1 Basic Rule Tests
- Internal drag: `move`
- Ctrl/Cmd + drag: `copy`
- External drag: `insert`
- Text node → text node: `merge`

### 7.2 defineDropBehavior Tests
- Register and match basic rules
- Priority-based rule matching
- Dynamic function rules

### 7.3 Schema dropBehaviorRules Tests
- Match rules per source type
- Match rules per group
- Match wildcard rules

### 7.4 executeDropBehavior Tests
- Execution tests per behavior
- Error handling tests

---

## 8. Notes

### 8.1 Prevent Circular Dependencies
- Design `drop-behavior-registry.ts` to not depend on `DataStore`
- Use Registry in `utility-operations.ts`

### 8.2 Performance Considerations
- Early termination based on priority when matching rules
- Consider caching frequently used rules

### 8.3 Extensibility
- Can add new Drop Behavior types
- Can register custom behavior execution functions

---

## 9. References

- `packages/datastore/docs/drop-behavior-architecture.md`: Architecture design and schema vs defineDropBehavior roles
- `packages/datastore/docs/drop-behavior-spec.md`: Drop Behavior specification
- `packages/datastore/docs/drop-behavior-implementation-options.md`: Implementation option comparison
- `packages/model/src/operations/define-operation.ts`: Operation definition pattern
