# Renderer DOM API

The Renderer DOM API provides the rendering layer that converts models to DOM using VNode reconciliation.

## DOMRenderer Class

The main renderer class that manages DOM rendering with VNode reconciliation.

### Constructor

```typescript
new DOMRenderer(registry?: RendererRegistry, options?: DOMRendererOptions)
```

**Parameters:**
- `registry?: RendererRegistry` - Optional renderer registry
- `options?: DOMRendererOptions` - Optional renderer options

**Options:**
```typescript
interface DOMRendererOptions {
  enableSelectionPreservation?: boolean; // Enable selection-preserving TextNodePool
  name?: string;                        // Renderer name for debugging
  dataStore?: DataStore;                // DataStore instance for getting model data
}
```

**Example:**
```typescript
import { DOMRenderer } from '@barocss/renderer-dom';
import { getGlobalRegistry } from '@barocss/dsl';

const registry = getGlobalRegistry();
const renderer = new DOMRenderer(registry, {
  name: 'content',
  enableSelectionPreservation: true
});
```

### Methods

#### `render(container, model, decorators?, runtime?, selection?, options?): void`

Renders model to container (main entry point).

**Parameters:**
- `container: HTMLElement` - Root container element
- `model: ModelData` - Model data (must have `stype` property)
- `decorators?: Decorator[]` - Array of decorators to apply (default: `[]`)
- `runtime?: Record<string, any>` - Runtime context (e.g., `{ dataStore }`)
- `selection?: SelectionContext` - Selection context for text node preservation
- `options?: { onComplete?: () => void }` - Render options

**Behavior:**
- Builds complete VNode tree from model
- Reconciles VNode tree to container
- Pattern decorators are automatically generated
- Preserves selection if provided

**Example:**
```typescript
renderer.render(
  container,
  {
    sid: 'doc-1',
    stype: 'document',
    content: ['p-1']
  },
  [],
  { dataStore },
  {
    textNode: textNode,
    restoreSelection: (textNode, offset) => {
      // Restore selection
    },
    model: { sid: 'text-1', modelOffset: 5 }
  },
  {
    onComplete: () => {
      console.log('Render complete');
    }
  }
);
```

#### `renderContent(container, model, decorators?, runtime?, selection?): void`

Renders content area with optional selection preservation.

**Parameters:**
- `container: HTMLElement` - Root container
- `model: ModelData` - Content model
- `decorators?: Decorator[]` - Decorators for content
- `runtime?: Record<string, any>` - Runtime context
- `selection?: SelectionContext` - Selection context

**Behavior:**
- Similar to `render()` but optimized for content layer
- Injects selection context and pool when `enableSelectionPreservation=true`

**Example:**
```typescript
renderer.renderContent(
  contentLayer,
  model,
  decorators,
  { dataStore },
  {
    textNode: textNode,
    restoreSelection: (textNode, offset) => {
      // Restore selection
    }
  }
);
```

#### `renderChildren(container, models, runtime?, selection?): void`

Renders children models directly into container (no root element).

**Parameters:**
- `container: HTMLElement` - Parent container element
- `models: ModelData[]` - Array of ModelData to render as children
- `runtime?: Record<string, any>` - Runtime context
- `selection?: SelectionContext` - Selection context

**Behavior:**
- Used for layer rendering (decorator, selection, context, custom)
- Renders multiple models as children without root element

**Example:**
```typescript
renderer.renderChildren(
  decoratorLayer,
  [
    { sid: 'decorator-1', stype: 'highlight', ... },
    { sid: 'decorator-2', stype: 'comment', ... }
  ],
  { dataStore }
);
```

#### `build(model, decorators?): VNode`

Builds VNode from model and decorators.

**Parameters:**
- `model: ModelData` - Model data (must have `stype` property)
- `decorators?: Decorator[]` - Array of decorators (default: `[]`)

**Returns:**
- `VNode` - Built VNode ready for rendering

**Example:**
```typescript
const vnode = renderer.build({
  sid: 'p-1',
  stype: 'paragraph',
  text: 'Hello'
}, []);
```

#### `getInstance(sid: string): ComponentInstance | undefined`

Gets component instance by sid.

**Parameters:**
- `sid: string` - Component sid (Model ID)

**Returns:**
- `ComponentInstance | undefined` - Component instance or `undefined`

**Example:**
```typescript
const instance = renderer.getInstance('text-1');
if (instance) {
  instance.setState({ count: 5 });
}
```

#### `updateDecoratorsBySid(sid: string, decorators: Decorator[]): boolean`

Updates decorators for a specific sid.

**Parameters:**
- `sid: string` - Component sid
- `decorators: Decorator[]` - New decorators

**Returns:**
- `boolean` - `true` if successful

**Example:**
```typescript
const updated = renderer.updateDecoratorsBySid('text-1', [
  { sid: 'highlight-1', stype: 'highlight', ... }
]);
```

#### `unmountBySid(sid: string): boolean`

Unmounts a specific sid host and its component.

**Parameters:**
- `sid: string` - Component sid

**Returns:**
- `boolean` - `true` if successful

**Example:**
```typescript
const unmounted = renderer.unmountBySid('node-1');
```

#### `moveBySid(sid: string, newParentSid: string, targetIndex?: number): boolean`

Moves a component host by sid under a new parent host.

**Parameters:**
- `sid: string` - Component sid to move
- `newParentSid: string` - New parent sid
- `targetIndex?: number` - Target index (default: `-1` for end)

**Returns:**
- `boolean` - `true` if successful

**Behavior:**
- DOM-level move with minimal reconcile
- Avoids cycles

**Example:**
```typescript
const moved = renderer.moveBySid('node-1', 'parent-2', 0);
```

#### `getRegistry(): RendererRegistry`

Gets the renderer registry.

**Returns:**
- `RendererRegistry` - Renderer registry instance

#### `getInstanceId(): string`

Gets DOMRenderer instance ID (for debugging).

**Returns:**
- `string` - Instance ID

#### `getReconcilerInstanceId(): string`

Gets Reconciler instance ID (for debugging).

**Returns:**
- `string` - Reconciler instance ID

#### `getPatternDecoratorGenerator(): PatternDecoratorGenerator`

Gets pattern decorator generator (for external configuration).

**Returns:**
- `PatternDecoratorGenerator` - Pattern decorator generator

#### `getComponentManager(): ComponentManager`

Gets ComponentManager (for DOM Query optimization).

**Returns:**
- `ComponentManager` - Component manager instance

#### `getCurrentVNode(): VNode | null`

Gets current VNode.

**Returns:**
- `VNode | null` - Current VNode or `null`

#### `getVNodeSnapshotBySid(sid: string): VNode | undefined`

Gets VNode snapshot by sid (for testing/diagnostics).

**Parameters:**
- `sid: string` - Component sid

**Returns:**
- `VNode | undefined` - VNode snapshot or `undefined`

#### `clearCache(): void`

Clears caches.

#### `destroy(): void`

Destroys renderer instance.

**Behavior:**
- Clears current VNode
- Clears root element
- Clears cache

---

## Component State Management

### `defineState(stype, StateClass)`

Defines a state class for a component type.

**Parameters:**
- `stype: string` - Component type
- `StateClass: new (...args: any[]) => T` - State class constructor

**Example:**
```typescript
import { defineState, BaseComponentState } from '@barocss/renderer-dom';

class MyComponentState extends BaseComponentState {
  getCount(): number {
    return this.get('count') || 0;
  }
  
  setCount(count: number): void {
    this.set({ count });
  }
}

defineState('my-component', MyComponentState);
```

### BaseComponentState Class

Base class for component state management.

#### Constructor

```typescript
new BaseComponentState(initial?: Record<string, any>, options?: {
  componentManager?: ComponentManager;
  sid?: string;
})
```

#### Methods

#### `init(initial: Record<string, any>): void`

Initializes state.

**Parameters:**
- `initial: Record<string, any>` - Initial state values

#### `set(patch: Record<string, any>): void`

Sets state values (patches).

**Parameters:**
- `patch: Record<string, any>` - State patch

**Behavior:**
- Merges patch into existing state
- Emits `changeState` event if componentManager and sid available
- Prevents setState during reconciliation

**Example:**
```typescript
state.set({ count: 5, visible: true });
```

#### `get<T = any>(key: string): T`

Gets state value.

**Parameters:**
- `key: string` - State key

**Returns:**
- `T` - State value

**Example:**
```typescript
const count = state.get<number>('count');
```

#### `snapshot(): Record<string, any>`

Gets state snapshot.

**Returns:**
- `Record<string, any>` - State snapshot (copy)

**Example:**
```typescript
const snapshot = state.snapshot();
```

---

## VNode Types

### VNode Interface

```typescript
interface VNode {
  tag?: string;                    // HTML tag or component name
  text?: string | number;          // Text content (for text nodes)
  attrs?: Record<string, any>;     // Element attributes
  style?: Record<string, any>;     // Inline styles
  children?: (string | number | VNode)[]; // Child nodes
  key?: string;                    // Key for efficient reconciliation
  sid?: string;                    // Schema ID (for component-generated VNodes)
  stype?: string;                  // Schema Type (for component-generated VNodes)
  props?: Record<string, any>;     // Pure props (for component-generated VNodes)
  isExternal?: boolean;            // External component flag
  portal?: {
    target: HTMLElement;
    template: any;
    portalId?: string;
  };
  meta?: {
    sidAutogenerated?: boolean;
    [key: string]: any;
  };
}
```

### VNode Tag Constants

```typescript
VNodeTag.TEXT = '#text';      // Text node
VNodeTag.PORTAL = 'portal';   // Portal node
```

### DOM Attribute Constants

```typescript
DOMAttribute.BC_SID = 'data-bc-sid';                    // Component Schema ID
DOMAttribute.DECORATOR_SID = 'data-decorator-sid';      // Decorator Schema ID
DOMAttribute.DECORATOR_STYPE = 'data-decorator-stype';  // Decorator Schema Type
DOMAttribute.DECORATOR_CATEGORY = 'data-decorator-category';
DOMAttribute.DECORATOR_POSITION = 'data-decorator-position';
DOMAttribute.SKIP_RECONCILE = 'data-skip-reconcile';
DOMAttribute.DECORATOR = 'data-decorator';
```

---

## Component Instance

### ComponentInstance Interface

```typescript
interface ComponentInstance {
  element: HTMLElement;           // DOM element
  vnode: VNode;                    // Current VNode
  state?: Record<string, any>;      // Component state
  setState?: (newState: Record<string, any>) => void; // setState method
  // ... other properties
}
```

**Access:**
```typescript
const instance = renderer.getInstance('text-1');
if (instance) {
  // Access DOM element
  const element = instance.element;
  
  // Access state
  const state = instance.state;
  
  // Update state
  instance.setState?.({ count: 5 });
}
```

---

## Event System

### `on(event: 'changeState', handler: Function): void`

Subscribes to component state change events.

**Parameters:**
- `event: 'changeState'` - Event name
- `handler: Function` - Event handler

**Example:**
```typescript
renderer.on('changeState', (sid, data) => {
  console.log('State changed:', sid, data.state, data.patch);
});
```

### `off(event: 'changeState', handler?: Function): void`

Unsubscribes from component state change events.

**Parameters:**
- `event: 'changeState'` - Event name
- `handler?: Function` - Optional handler to remove (removes all if not provided)

---

## Scheduler

The renderer uses a scheduler for efficient rendering.

**Note**: Scheduler is internal. Rendering is automatically scheduled when state changes.

---

## Complete Example

```typescript
import { DOMRenderer } from '@barocss/renderer-dom';
import { getGlobalRegistry } from '@barocss/dsl';
import { DataStore } from '@barocss/datastore';

// Create renderer
const registry = getGlobalRegistry();
const dataStore = new DataStore();
const renderer = new DOMRenderer(registry, {
  name: 'content',
  enableSelectionPreservation: true,
  dataStore
});

// Render model
const container = document.getElementById('editor');
renderer.render(
  container,
  {
    sid: 'doc-1',
    stype: 'document',
    content: ['p-1']
  },
  [], // decorators
  { dataStore }, // runtime
  {
    textNode: textNode,
    restoreSelection: (textNode, offset) => {
      const range = document.createRange();
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    model: { sid: 'text-1', modelOffset: 5 }
  },
  {
    onComplete: () => {
      console.log('Render complete');
    }
  }
);

// Listen to state changes
renderer.on('changeState', (sid, data) => {
  console.log('Component state changed:', sid, data);
});

// Get component instance
const instance = renderer.getInstance('text-1');
if (instance) {
  instance.setState?.({ count: 5 });
}
```

---

## Related

- [Architecture: Renderer DOM](../architecture/renderer-dom) - Renderer architecture
- [Core Concepts: Rendering](../concepts/rendering) - Rendering concepts
- [DSL API](./dsl-api) - Template DSL
- [Editor View DOM API](./editor-view-dom-api) - Editor View DOM integration
