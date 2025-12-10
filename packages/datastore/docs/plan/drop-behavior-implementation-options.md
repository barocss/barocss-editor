# Drop Behavior Implementation Options Comparison

## Overview

This document compares various methods for defining Drop Behavior and analyzes approaches from other editors.

---

## 1. Implementation Method Comparison

### Method 1: Schema-based Definition (Static)

```typescript
// Define directly in schema
const schema = new Schema('example', {
  nodes: {
    'paragraph': {
      name: 'paragraph',
      dropBehaviorRules: {
        'inline-text': 'merge',
        'inline-image': 'copy',
        '*': 'move'
      }
    }
  }
});
```

**Advantages:**
- Explicit and intuitive
- Managed together with schema, maintaining consistency
- Type safety

**Disadvantages:**
- Difficult to express complex logic
- Limited dynamic decisions
- Low extensibility

### Method 2: Function-based Definition (Dynamic) - Recommended

```typescript
// defineDropBehavior pattern
defineDropBehavior(
  'paragraph',
  (targetNode: INode, sourceNode: INode, context: DropContext) => {
    // Dynamic logic
    if (sourceNode.stype === 'inline-text') {
      return 'merge';
    }
    if (sourceNode.stype === 'inline-image' && context.modifiers?.ctrlKey) {
      return 'copy';
    }
    return 'move';
  }
);
```

**Advantages:**
- Can express complex logic
- Can make dynamic decisions
- Can utilize context
- High extensibility

**Disadvantages:**
- Managed separately from schema
- May have lower type safety

### Method 3: Hybrid (Schema + Function)

```typescript
// Function reference in schema
const schema = new Schema('example', {
  nodes: {
    'paragraph': {
      name: 'paragraph',
      dropBehavior: defineDropBehavior('paragraph', (target, source, context) => {
        // ...
      })
    }
  }
});
```

**Advantages:**
- Combines advantages of schema and function
- Explicit yet flexible

**Disadvantages:**
- Increased implementation complexity

---

## 2. Approaches from Other Editors

### 2.1 ProseMirror

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

### 2.2 Slate.js

**Approach**: Handler function-based

```typescript
// Slate.js defines drop behavior via handler functions
const editor = {
  // ...
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

### 2.3 TinyMCE

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

### 2.4 Draft.js

**Approach**: Handler function-based

```typescript
// Draft.js defines drop behavior via handler functions
const editor = {
  handleDrop: (selection, dataTransfer) => {
    // Determine and execute drop behavior
    // ...
  }
};
```

**Characteristics:**
- Handler function-based
- Event-based processing

---

## 3. Recommended Implementation Approach

### 3.1 defineDropBehavior Pattern (Recommended)

Defines Drop Behavior while maintaining consistency with existing `defineOperation` pattern.

```typescript
// Drop Behavior definition interface
export interface DropBehaviorDefinition {
  targetType: string | string[];  // Target node type
  sourceType?: string | string[]; // Source node type (optional, all sources if not provided)
  behavior: DropBehavior | 
    ((targetNode: INode, sourceNode: INode, context: DropContext) => DropBehavior);
  priority?: number; // Priority
}

// Global Drop Behavior Registry
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
      // Sort by priority
      this.behaviors.get(targetType)!.sort((a, b) => 
        (b.priority || 0) - (a.priority || 0)
      );
    });
  }

  get(targetType: string, sourceType: string): DropBehaviorDefinition | undefined {
    const behaviors = this.behaviors.get(targetType) || [];
    return behaviors.find(b => {
      if (!b.sourceType) return true; // Wildcard
      const sourceTypes = Array.isArray(b.sourceType) ? b.sourceType : [b.sourceType];
      return sourceTypes.includes(sourceType) || sourceTypes.includes('*');
    });
  }
}

export const globalDropBehaviorRegistry = new GlobalDropBehaviorRegistry();

// Drop Behavior definition function
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

### 3.2 Usage Examples

```typescript
// Define basic drop behavior
defineDropBehavior('paragraph', 'move');

// Define drop behavior per source type
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

### 3.3 DataStore Integration

```typescript
// Use in DataStore
getDropBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  context?: DropContext
): DropBehavior {
  const targetNode = this.getNode(targetNodeId);
  const sourceNode = this.getNode(sourceNodeId);
  
  if (!targetNode || !sourceNode) {
    return 'move';
  }
  
  // 1. Check UI context (highest priority)
  if (context?.modifiers?.ctrlKey || context?.modifiers?.metaKey) {
    return 'copy';
  }
  
  // 2. Check registered Drop Behavior
  const definition = globalDropBehaviorRegistry.get(
    targetNode.stype,
    sourceNode.stype
  );
  
  if (definition) {
    if (typeof definition.behavior === 'function') {
      return definition.behavior(targetNode, sourceNode, context || {});
    }
    return definition.behavior;
  }
  
  // 3. Check schema's dropBehaviorRules
  const schema = this.getActiveSchema();
  if (schema) {
    const targetType = schema.getNodeType(targetNode.stype);
    if (targetType?.dropBehaviorRules) {
      const rules = targetType.dropBehaviorRules;
      if (rules[sourceNode.stype]) {
        return rules[sourceNode.stype];
      }
      if (sourceType?.group && rules[sourceType.group]) {
        return rules[sourceType.group];
      }
      if (rules['*']) {
        return rules['*'];
      }
    }
  }
  
  // 4. Type combination basic rules
  if (targetNode.text && sourceNode.text) {
    return 'merge';
  }
  
  // 5. Default
  return 'move';
}
```

---

## 4. Comparison Table

| Method | Explicitness | Flexibility | Extensibility | Consistency | Complexity |
|--------|--------------|-------------|---------------|-------------|------------|
| Schema-based | High | Low | Low | High | Low |
| Function-based | Medium | High | High | Medium | Medium |
| Hybrid | High | High | High | High | High |

---

## 5. Final Recommendations

### 5.1 Hierarchical Approach

1. **Basic rules**: Schema's `dropBehaviorRules` (explicit, simple rules)
2. **Complex rules**: `defineDropBehavior` function (dynamic, complex logic)
3. **UI context**: Applied with highest priority (Ctrl/Cmd keys, etc.)

### 5.2 Implementation Order

1. Add `dropBehaviorRules` to schema (simple rules)
2. Implement `defineDropBehavior` function (complex rules)
3. Add `getDropBehavior` API to DataStore
4. Pass context from UI Layer

### 5.3 Example Structure

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

// 3. Use in DataStore
const behavior = dataStore.getDropBehavior(
  targetNodeId,
  sourceNodeId,
  { modifiers: { ctrlKey: true } }
);
```

---

## 6. References

- `packages/model/src/operations/define-operation.ts`: Operation definition pattern
- ProseMirror: Plugin-based drop handling
- Slate.js: Handler function-based drop handling
- TinyMCE: Configuration-based drop handling
