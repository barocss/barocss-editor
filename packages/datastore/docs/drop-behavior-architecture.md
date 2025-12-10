# Drop Behavior Architecture Design

## Problem Statement

Where should Drop Behavior rules be defined?

- **Define in schema?** → Schema is for data model definition, is it appropriate to include UI logic?
- **Define in editor-view-dom?** → Need to define for each editor instance, but do we need to define rules separately when reusing schema?
- **Hybrid?** → Schema only has basic rules, editor-view-dom adds/overrides?

---

## Architecture Analysis

### Current Structure

```
Editor (editor-core)
  ├── DataStore (datastore)
  │   └── Schema (schema) - registered with registerSchema()
  └── EditorViewDOM (editor-view-dom)
      └── References Editor
```

**Characteristics:**
- `Schema` is registered in `DataStore` (`registerSchema`)
- `EditorViewDOM` accesses `dataStore` by referencing `Editor`
- Schema can differ per editor instance

### Drop Behavior Usage Flow

```
User drag & drop
  ↓
EditorViewDOM.handleDrop()
  ↓
DataStore.getDropBehavior(targetNodeId, sourceNodeId, context)
  ↓
Rule matching (where?)
  ↓
Return DropBehavior
```

**Core question:** Where should rule matching occur?

---

## Design Option Comparison

### Option 1: Define Only in Schema (Pure Schema-Centric)

```typescript
// When defining schema
const schema = createSchema('example', {
  nodes: {
    'paragraph': {
      dropBehaviorRules: {
        'inline-text': 'merge',
        '*': 'move'
      }
    }
  }
});

// Use in EditorViewDOM
const behavior = dataStore.getDropBehavior(targetId, sourceId, context);
// → Only check schema's dropBehaviorRules
```

**Advantages:**
- Consistent as defined together with schema
- Different rules possible per schema
- Rules also reused when schema is reused

**Disadvantages:**
- Schema includes UI logic
- Difficult to define dynamic rules
- Difficult to customize per editor instance

---

### Option 2: Define Only in editor-view-dom (Pure UI-Centric)

```typescript
// At EditorViewDOM initialization
class EditorViewDOM {
  constructor(editor: Editor, options: EditorViewDOMOptions) {
    // Define drop rules
    defineDropBehavior('paragraph', 'move');
    defineDropBehavior('paragraph', (target, source, ctx) => {
      if (source.stype === 'inline-text') return 'merge';
      return 'move';
    });
  }
}

// Usage
const behavior = dataStore.getDropBehavior(targetId, sourceId, context);
// → Only check defineDropBehavior registry
```

**Advantages:**
- UI logic is in UI layer
- Can customize per editor instance
- Schema purely defines data model only

**Disadvantages:**
- Need to define rules separately when reusing schema
- Need to define basic rules every time
- Difficult to ensure consistency between schema and rules

---

### Option 3: Hybrid (Recommended) ⭐

**Principles:**
1. **Schema provides basic rules only** (optional, recommended)
   - Hints that "this node type has this drop behavior by default" when defining schema
   - Ensures basic behavior when schema is reused
2. **defineDropBehavior can be defined anywhere** (global registry)
   - At editor-view-dom initialization
   - In Extension
   - At application level
3. **Priority: defineDropBehavior > schema > default**

```typescript
// 1. Define basic rules in schema (optional)
const schema = createSchema('example', {
  nodes: {
    'paragraph': {
      dropBehaviorRules: {  // Basic rules (hints)
        'inline-text': 'merge',
        '*': 'move'
      }
    }
  }
});

// 2. Add/override in EditorViewDOM (optional)
class EditorViewDOM {
  constructor(editor: Editor, options: EditorViewDOMOptions) {
    // Rules specific to this editor instance
    defineDropBehavior('paragraph', (target, source, ctx) => {
      if (ctx.modifiers?.shiftKey) {
        return 'copy'; // Shift + drag = copy
      }
      // Fallback to schema rules
      return null; // Return null to check next priority
    }, { priority: 200 });
  }
}

// 3. Priority-based matching in DataStore.getDropBehavior()
getDropBehavior(targetId, sourceId, context) {
  // 1. Check defineDropBehavior (highest priority)
  // 2. Check schema dropBehaviorRules
  // 3. Basic rules (type combinations)
  // 4. Default (move)
}
```

**Advantages:**
- Schema provides basic rules only (optional)
- UI layer can add/override
- Ensures basic behavior when schema is reused
- Can customize per editor instance
- Balance between extensibility and flexibility

**Disadvantages:**
- Slightly complex implementation (priority management)

---

## Recommended Design: Hybrid Approach

### 3.1 Schema's Role

**Schema provides "basic rule hints" only**

```typescript
interface NodeTypeDefinition {
  /**
   * Drop Behavior Rules: Basic drop behavior per source node type
   * 
   * These rules are used as "defaults" and can be overridden by defineDropBehavior
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
   *   'block': 'move',             // Move when dropping all blocks
   *   '*': 'move'                  // Default: move
   * }
   */
  dropBehaviorRules?: Record<string, DropBehavior>;
}
```

**Reasons to define in schema:**
- Schema is where "what basic behavior should this node type have" is defined
- Consistent with attributes like `editable`, `selectable`, `draggable`, `droppable`
- Ensures basic behavior when schema is reused

**However:**
- Schema rules are just "defaults", not required
- Can be overridden with `defineDropBehavior` anytime

### 3.2 defineDropBehavior's Role

**defineDropBehavior defines "dynamic rules"**

```typescript
// Can be defined anywhere
defineDropBehavior(
  'paragraph',
  (target, source, context) => {
    // Complex logic
    if (context.modifiers?.shiftKey) return 'copy';
    if (source.attributes?.locked) return 'copy';
    return null; // Return null to check next priority
  },
  { priority: 200 }
);
```

**Usage scenarios:**
- Editor-specific rules at EditorViewDOM initialization
- Domain-specific rules in Extension
- Business logic rules at application level

### 3.3 Priority

```
1. UI context (Ctrl/Cmd = copy) - highest priority
2. defineDropBehavior rules (dynamic rules)
3. Schema dropBehaviorRules (basic rules)
4. Type combination basic rules (built-in rules)
5. Default (move/insert)
```

---

## Implementation Example

### Schema Definition (Basic Rules)

```typescript
const schema = createSchema('example', {
  nodes: {
    'paragraph': {
      name: 'paragraph',
      group: 'block',
      content: 'inline*',
      // Basic rules (optional)
      dropBehaviorRules: {
        'inline-text': 'merge',  // Merge text
        '*': 'move'              // Default: move
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

### Add Rules in EditorViewDOM

```typescript
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
```

### DataStore.getDropBehavior Implementation

```typescript
getDropBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  context?: DropContext
): DropBehavior {
  const targetNode = this.getNode(targetNodeId);
  const sourceNode = this.getNode(sourceNodeId);
  const schema = this._activeSchema;
  const targetType = schema?.getNodeType?.(targetNode.stype);
  
  // 1. UI context (highest priority)
  if (context?.modifiers?.ctrlKey || context?.modifiers?.metaKey) {
    return 'copy';
  }
  
  // 2. Check defineDropBehavior rules
  const registeredBehavior = globalDropBehaviorRegistry.get(
    targetNode.stype,
    sourceNode.stype,
    targetNode,
    sourceNode,
    context
  );
  
  if (registeredBehavior !== null) {  // Return if not null
    return registeredBehavior;
  }
  
  // 3. Check schema dropBehaviorRules
  if (targetType?.dropBehaviorRules) {
    const rules = targetType.dropBehaviorRules;
    if (rules[sourceNode.stype]) {
      return rules[sourceNode.stype];
    }
    if (rules['*']) {
      return rules['*'];
    }
  }
  
  // 4. Type combination basic rules
  // 5. Default
  return this._getDefaultDropBehavior(targetNode, sourceNode, context);
}
```

---

## Conclusion

### Reasons to Define in Schema

1. **Consistency**: Consistent with attributes like `editable`, `selectable`, `draggable`, `droppable`
2. **Reusability**: Ensures basic behavior when schema is reused
3. **Clarity**: Hints that "this node type has this basic behavior"

### Why Schema Alone is Insufficient

1. **Dynamic rules**: Complex logic needs to be defined as functions
2. **Customization**: Different rules needed per editor instance
3. **Extensibility**: Need to add rules at Extension or application level

### Advantages of Hybrid Approach

- **Schema**: Basic rule hints (optional)
- **defineDropBehavior**: Dynamic rules, customization (when needed)
- **Priority**: defineDropBehavior > schema > default

This way:
- Schema focuses purely on data model definition (basic rules are hints)
- UI layer can add/override rules when needed
- Ensures basic behavior when schema is reused
- Can customize per editor instance

---

## References

- `packages/datastore/docs/drop-behavior-spec.md`: Drop Behavior specification
- `packages/datastore/docs/drop-behavior-implementation-plan.md`: Implementation plan
- `packages/datastore/docs/drop-behavior-implementation-options.md`: Implementation option comparison
