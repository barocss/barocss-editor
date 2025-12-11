# Decorator System Architecture

## Overview

Decorators are managed only in the `editor-view-dom` package and are completely independent of the schema. A decorator is temporary UI state at the EditorModel level and is managed on a separate channel from the DocumentModel.

## Key Concepts

### 1. Decorator Type vs Decorator Instance

**Decorator Type (Type Schema)**
- Defines structure and data schema of a decorator
- Example: `highlight` type has data fields like `color`, `opacity`
- Type registration: `DecoratorRegistry.registerInlineType()`, `registerLayerType()`, `registerBlockType()`

**Decorator Instance**
- Actual decorator object applied to the document
- Targets specific nodes or text ranges
- Add instance: `EditorViewDOM.addDecorator()`

### 2. Current Structure

```
EditorViewDOM
├── defineDecoratorType(type, category, schema)  // ✅ Public API: type definition (optional)
│   └── decoratorRegistry.register*Type()        // internal impl
│
├── decoratorRegistry: DecoratorRegistry (public readonly)
│   ├── registerInlineType(type, schema)        // internal: type registration
│   ├── registerLayerType(type, schema)         // internal: type registration
│   ├── registerBlockType(type, schema)         // internal: type registration
│   ├── validateDecorator(decorator)            // optional validation (if type exists)
│   └── applyDefaults(decorator)                // apply defaults (if type exists)
│
├── decoratorManager: DecoratorManager (public readonly)
│   ├── add(decorator)                          // add instance
│   ├── update(id, updates)                     // update instance
│   ├── remove(id)                              // remove instance
│   └── getAll()                                // get all instances
│
├── remoteDecoratorManager: RemoteDecoratorManager (public readonly)
│   └── setRemoteDecorator(decorator, owner)    // manage remote decorators
│
└── addDecorator(decorator)                     // ✅ Public API: add instance
    ├── custom decorator → decoratorGeneratorManager
    ├── pattern decorator → patternDecoratorConfigManager
    └── target decorator → decoratorManager.add()
```

## ✅ Implemented: Optional Type System

### Current Implementation Status

1. **✅ Public API**
   - Define type via `view.defineDecoratorType()`
   - Included in `IEditorViewDOM` interface
   - No need to access internal `decoratorRegistry` directly

2. **✅ Optional Type Validation**
   - `addDecorator()` works without type definition
   - If type is defined, validate + apply defaults
   - If no type, only basic field validation is performed

3. **✅ Clear API Separation**
   - `defineDecoratorType()`: type definition (optional)
   - `addDecorator()`: add instance (always available)

## ✅ Implemented Solution

### Implementation: Add Type Definition API to EditorViewDOM

```typescript
interface IEditorViewDOM {
  // ... existing methods ...
  
  // ✅ Decorator type definition (optional)
  defineDecoratorType(
    type: string,
    category: 'layer' | 'inline' | 'block',
    schema: {
      description?: string;
      dataSchema?: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        required?: boolean;
        default?: any;
      }>;
    }
  ): void;
  
  // ✅ Decorator instance management
  addDecorator(decorator: Decorator): void;      // auto-render
  updateDecorator(id: string, updates: Partial<Decorator>): void;
  removeDecorator(id: string): boolean;
}
```

**Implemented Features:**
- ✅ Clear Public API (`defineDecoratorType`)
- ✅ Internal implementation hidden (no direct access to `decoratorRegistry`)
- ✅ Type definition and instance addition clearly separated
- ✅ Optional type system (usable without type definition)

### Option 2: Auto-register Type (Relaxed Validation)

```typescript
// Auto-register with basic schema if type is missing
addDecorator(decorator: Decorator): void {
  // Auto-register when type is missing
  if (!this.decoratorRegistry.hasType(decorator.category, decorator.stype)) {
    this.decoratorRegistry.registerType(
      decorator.stype,
      decorator.category,
      { description: `Auto-registered ${decorator.stype}` }
    );
  }
  // ...
}
```

**Pros:**
- Users don't need to pre-register types
- Simple usage

**Cons:**
- Weaker type validation
- Cannot validate data schema

### Option 3: Unified API (register type and instance together)

```typescript
// Register type and instance together
view.defineDecorator({
  type: 'highlight',
  category: 'inline',
  schema: { /* ... */ },
  instance: {
    sid: 'd1',
    target: { /* ... */ },
    data: { /* ... */ }
  }
});
```

**Pros:**
- Register type and instance at once
- Simple to use

**Cons:**
- Type and instance lifecycles differ (type once, instances many)
- API becomes more complex

## Recommendation

**Recommend Option 1.**

Reasons:
1. Type registration and instance addition are clearly different concepts
2. Types are registered once during app initialization
3. Instances are added/removed many times at runtime
4. Exposing as Public API keeps it safe against internal implementation changes

## ✅ Implementation Examples

### Scenario 1: Use without type definition (rapid prototyping)

```typescript
// Usable immediately without type definition
view.addDecorator({
  sid: 'd1',
  stype: 'quick-highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 5
  },
  data: {
    color: 'yellow',
    customField: 'any value'  // passes without validation
  }
});
```

### Scenario 2: Use with type definition (production)

```typescript
// Define type at app initialization (optional)
view.defineDecoratorType('highlight', 'inline', {
  description: 'Highlight decorator',
  dataSchema: {
    color: { type: 'string', default: 'yellow' },
    opacity: { type: 'number', default: 0.3 }
  }
});

// Add decorator instance at runtime (validation + defaults)
view.addDecorator({
  sid: 'd1',
  stype: 'highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 5
  },
  data: {
    color: 'red'  // opacity auto-applies default 0.3
  }
});
```

### Scenario 3: Mixed usage

```typescript
// Define only some types
view.defineDecoratorType('highlight', 'inline', {
  dataSchema: {
    color: { type: 'string', default: 'yellow' }
  }
});

// Defined type: validation + defaults
view.addDecorator({
  sid: 'd1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 't1', startOffset: 0, endOffset: 5 },
  data: { color: 'red' }  // color default applied
});

// Undefined type: passes without validation
view.addDecorator({
  sid: 'd2',
  stype: 'custom-widget',  // not defined
  category: 'inline',
  target: { sid: 't2', startOffset: 0, endOffset: 5 },
  data: { anyField: 'anyValue' }  // passes without validation
});
```

## Validation Behavior

### When type is defined
- ✅ Validate data schema (required fields, type checks)
- ✅ Apply defaults automatically
- ✅ Throw error on invalid data

### When type is not defined
- ✅ Only basic field validation (sid, category, stype required)
- ✅ No data schema validation
- ✅ No defaults applied
- ✅ All data fields allowed

## Why Type Registration?

Decorator is temporary UI state at the EditorModel level; strict schema-like typing is not mandatory. Optional typing exists because:

1. **Data validation**: validate other users’ decorators in collaboration
2. **Plugin system**: ensure decorator type safety
3. **Data consistency**: consistent UI via auto defaults

### Schema vs Decorator Comparison

| Item | Schema | Decorator |
|------|--------|-----------|
| **Purpose** | Define DocumentModel structure | Temporary UI state in EditorModel |
| **Lifecycle** | Persistent across app | Per-session, temporary |
| **Validation need** | High (document integrity) | Lower (UI state) |
| **Type system** | Required (document structure) | Optional |
| **Dynamic creation** | Not allowed (definition required) | Allowed |

### Optional Type System (Opt-in)

Current implementation uses an **optional type system**:

- **Default**: `addDecorator()` works without type definition
- **Optional**: `defineDecoratorType()` strengthens validation if defined
- **Progressive**: fast prototyping early, stronger type safety in production

## Data Model

### Decorator interface

```typescript
interface Decorator {
  sid: string;                    // unique identifier
  stype: string;                  // type name (e.g., 'highlight', 'comment')
  category: 'layer' | 'inline' | 'block';  // category
  target: DecoratorTarget;        // target node/range
  data?: Record<string, any>;     // type-specific data
  position?: DecoratorPosition;  // position (for block decorator)
  enabled?: boolean;              // enabled flag
  decoratorType?: 'target' | 'pattern' | 'custom';  // creation mode
}
```

### DecoratorTarget

```typescript
interface DecoratorTarget {
  sid: string;                    // target node SID
  startOffset?: number;           // text range start (inline/layer)
  endOffset?: number;              // text range end (inline/layer)
}
```

### DecoratorPosition (Block Decorator)

```typescript
type DecoratorPosition = 
  | 'before'          // insert before target as sibling
  | 'after'           // insert after target as sibling
  | 'inside-start'    // insert as first child of target
  | 'inside-end';     // insert as last child of target
```

## Rendering System

### Rendering Flow

```
EditorViewDOM.render()
  ↓
1. Collect decorators
   - decoratorManager.getAll() → local decorators
   - remoteDecoratorManager.getAll() → remote decorators
   - patternDecoratorGenerator.generateDecoratorsFromText() → pattern decorators
  ↓
2. DOMRenderer.render(model, decorators)
   ↓
3. VNodeBuilder.build()
   - inline decorator: handled in _buildMarkedRunsWithDecorators
   - block/layer decorator: handled in DecoratorProcessor
   ↓
4. VNode → DOM conversion
   - reconcile() → update DOM
```

### Rendering by Category

#### Layer Decorator
- **Position**: overlay on top of document
- **Rendering**: absolute positioning, `contenteditable="false"`
- **Feature**: manage layers via z-index

#### Inline Decorator
- **Position**: inserted inside text
- **Rendering**: flows with text, uses `<span>`
- **Feature**: applied to text ranges

#### Block Decorator
- **Position**: inserted as block-level element
- **Rendering**: `before` or `after` positions
- **Feature**: block-level, uses `<div>`

## Pattern-based Decorator

### Concept

Automatically generate decorator when specific text patterns appear (e.g., `#FFFFFF`, `rgba(20, 20, 15, 0.5)`).

### Limitations

- **Text fields only**: works only on nodes with `model.text`
- **Auto scan**: automatically scanned in `VNodeBuilder._buildMarkedRunsWithDecorators`
- **Existing decorators take priority**: skip if existing decorator covers the same range

### PatternDecoratorConfig

```typescript
interface PatternDecoratorConfig {
  id: string;                    // pattern identifier
  type: string;                  // stype of decorator to create
  category: 'inline' | 'block' | 'layer';
  pattern: RegExp;               // regex pattern
  extractData: (match: RegExpMatchArray) => Record<string, any>;
  createDecorator: (
    nodeId: string,
    startOffset: number,
    endOffset: number,
    extractedData: Record<string, any>
  ) => {
    sid: string;
    target: {
      sid: string;
      startOffset: number;
      endOffset: number;
    };
    data?: Record<string, any>;
  };
  priority?: number;              // priority (lower = earlier)
  enabled?: boolean;              // enabled flag
}
```

## Related Docs

- [Decorator Usage Guide](./decorator-guide.md) - basic usage and examples
- [Decorator Integration Guide](./decorator-integration.md) - AI integration and collaboration
- [Pattern & Custom Decorator Examples](./decorator-pattern-and-custom-examples.md) - detailed examples for Pattern and Custom Decorators

