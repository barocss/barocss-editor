# Component State Management Architecture Analysis

## Current Issues

### 1. Props vs Model Accumulation Problem

**Current Structure:**
```typescript
// VNodeBuilder._buildComponent
const effectiveProps = Object.keys(props).length === 0 ? { ...data } : props;
// If props is empty, use entire data (including stype/sid) as props

// ComponentManager.mountComponent
instance.props = vnode.component.props || {};  // data propagates to props

// componentContext
const componentContext = {
  props: instance.props,  // entire model data including stype/sid
  state: instance.state,
  // model is not separated
};
```

**Problems:**
- `props` and `model` are not separated, causing model metadata (stype/sid/type) to accumulate in `props`
- Component template functions cannot distinguish between `props` and `model`
- Sanitize removes them during internal element build, but root cause is not resolved
- Passing unified `effectiveProps` is even more confusing

### 2. Synchronization Problem on Component State Change

**Current Structure:**
```typescript
// ComponentManager.setState (lines 103-146)
setState: (newState) => {
  instance.state = { ...instance.state, ...newState };
  // Only performs local reconcile
  reconcileFunc(prevVNode, nextVNode, instance.element, reconcileContext);
}
```

**Problems:**
- Only performs local reconcile on component internal state change
- Not synchronized with external model changes
- Example: Component changes `count: 1`, but if `items` array changes externally, it is not reflected

**User Proposed Scenario:**
```
Component internal state change:
  props + model + state → structure as one → render only that area

External model change:
  If parent/child model changes, may conflict with component internal state
  → Full re-render needed
```

## Proposed Solutions

### 1. Props vs Context Separation

**Core Concept:**
- `props`: Pure passed data only (component API interface)
- `context`: Model data + state management (internal use)
- Component definition: `(props, context) => ElementTemplate`

**Structure Change:**
```typescript
// ComponentManager.mountComponent
const componentContext = {
  id: componentId,
  state: instance.state,
  // props is pure passed data only (excluding stype/sid)
  props: sanitizedProps,  // pure props with stype/sid/type removed
  // model data only in context.model
  model: instance.model,  // original model data (including stype/sid)
  registry: context.registry,
  setState: (newState) => { /* ... */ },
  getState: () => instance.state,
  // ...
};

// Component template function
define('counter', (props, context) => {
  // props: pure passed data (e.g., { label: 'Count' })
  // context.model: model data (e.g., { stype: 'counter', sid: 'c1', items: [...] })
  // context.state: component internal state (e.g., { count: 0 })
  return element('div', [text(String(context.state.count))]);
});
```

**Advantages:**
- Clear responsibility separation: props is API, model is data source
- Prevents stype/sid propagation: props is pure data only
- Improved component reusability: props interface is clear

**Disadvantages:**
- Requires existing code migration
- Components need to access `context.model` in templates

### 2. Full Re-rendering Strategy

**Core Concept:**
- Re-render entire app when component internal state changes
- Integrate external model changes and internal state into one for consistency
- Update only actually changed parts in DOM with Reconcile algorithm (performance optimization)

#### 2.1 Full Re-rendering Flow

```
[Component Internal State Change]
  ↓
ComponentManager.setState({ count: 1 })
  ↓
instance.state = { ...instance.state, count: 1 }
  ↓
Call onRerenderCallback()
  ↓
DOMRenderer.rerender()
  ↓
[Full Rebuild]
  Use lastModel + lastDecorators
  ↓
DOMRenderer.build(lastModel, lastDecorators)
  ↓
VNodeBuilder.build() - Regenerate entire VNode tree
  ├─ Reference existing instance state from ComponentManager
  ├─ Integrate props + model + state
  └─ Re-execute component template function (reflect latest state)
  ↓
DOMRenderer.render(container, newVNode)
  ↓
DOMReconcile.reconcile(prevVNode, newVNode, container)
  ├─ Virtual DOM diffing
  ├─ Update only actually changed parts in DOM
  ├─ Reuse component instances (id-based matching)
  └─ Minimize unnecessary updates
  ↓
[DOM Update Complete]
```

#### 2.2 Implementation Structure

**ComponentManager.setState Change:**
```typescript
// Inside ComponentManager.mountComponent
const componentContext = {
  id: componentId,
  state: instance.state,
  props: sanitizedProps,
  model: instance.model,  // Store original model data
  registry: context.registry,
  setState: (newState: Record<string, any>) => {
    // Update state
    instance.state = { ...instance.state, ...newState };
    
    // Trigger full re-render
    if (this.onRerenderCallback) {
      this.onRerenderCallback();  // Call DOMRenderer.rerender()
    }
  },
  // ...
};
```

**DOMRenderer.rerender() Restoration:**
```typescript
// Add to DOMRenderer class
private rerenderCallback: (() => void) | null = null;

constructor(registry?: RendererRegistry, _options?: DOMRendererOptions) {
  // ... existing initialization code ...
  
  // Register rerender callback with ComponentManager
  this.componentManager.setOnRerenderCallback(() => {
    this.rerender();
  });
}

/**
 * Perform full re-render
 * Re-render entire app using stored lastModel and lastDecorators
 */
rerender(): void {
  if (!this.lastModel || !this.rootElement) {
    console.warn('[DOMRenderer] rerender: lastModel or rootElement not available');
    return;
  }
  
  // Rebuild entire VNode tree (reflect component state)
  const newVNode = this.build(this.lastModel, this.lastDecorators || []);
  
  // Efficient DOM update through Reconcile
  this.render(this.rootElement, newVNode);
}
```

**State Integration When Building Component in VNodeBuilder:**
```typescript
// Inside VNodeBuilder._buildComponent
private _buildComponent(template: ComponentTemplate, data: ModelData, ...): VNode {
  // Generate component instance ID
  const componentId = this.generateComponentId(vnode);
  
  // Get existing instance from ComponentManager (if exists)
  const existingInstance = this.componentStateProvider?.getComponentInstance?.(componentId);
  
  // Separate Props and Model
  const sanitizedProps = this.sanitizeProps(props);  // Remove stype/sid/type
  const modelData = { ...data };  // Original model data (including stype/sid)
  
  // Use existing state if instance exists, otherwise create new
  const instance = existingInstance || {
    id: componentId,
    props: sanitizedProps,
    model: modelData,
    state: {},
    element: null,
    mounted: false
  };
  
  // Create Context (separate props, model, state)
  const ctx = {
    id: componentId,
    props: sanitizedProps,      // Pure props (excluding stype/sid)
    model: instance.model,       // Original model (including stype/sid)
    state: instance.state,       // Internal state
    registry: this.registry,
    setState: (newState) => { /* Handled by ComponentManager */ },
    getState: () => instance.state,
    // ...
  };
  
  // Execute component template function (pass only props, context)
  const elementTemplate = component.template(sanitizedProps, ctx);
  
  // Build internal element (use safeData with stype/sid removed)
  const safeData = sanitizedProps;  // Use only props (stype/sid already removed)
  const internalVNode = this._buildElement(elementTemplate, safeData);
  
  // Return component wrapper VNode
  return {
    tag: 'div',
    attrs: {
      'data-bc-stype': 'component',
      'data-bc-component': template.name,
      'data-bc-sid': componentId
    },
    component: {
      name: template.name,
      props: sanitizedProps,  // Store only pure props
      model: modelData        // Store original model separately
    },
    children: [internalVNode]
  };
}
```

#### 2.3 Component Instance Reuse Mechanism

**Instance ID-based Matching:**
```typescript
// ComponentManager.generateComponentId
private generateComponentId(vnode: VNode): string {
  const componentName = vnode.component?.name || 'unknown';
  const sid = (vnode.attrs as any)?.['data-bc-sid'];
  const key = (vnode.component as any)?.key;
  
  // Generate stable ID: key > sid > name + props hash
  if (key) {
    return `${componentName}-${key}`;
  }
  if (sid) {
    return `${componentName}-${sid}`;
  }
  
  // Props-based hash (same props = same instance)
  const propsHash = this.generatePropsHash(vnode.component?.props || {});
  return `${componentName}-${propsHash}`;
}

// Instance storage and lookup
private componentInstances: Map<string, ComponentInstance> = new Map();

getComponentInstance(id: string): ComponentInstance | undefined {
  const ref = this.componentInstances.get(id);
  return ref?.deref?.() || ref;  // WeakRef support
}

setComponentInstance(id: string, instance: ComponentInstance): void {
  this.componentInstances.set(id, instance);
}
```

**Instance Reuse During Reconcile:**
```typescript
// Inside DOMReconcile.reconcile
if (detectVNodeType(nextVNode) === 'component') {
  const componentId = this.generateComponentId(nextVNode);
  const existingInstance = this.componentManager.getComponentInstance(componentId);
  
  if (existingInstance && prevVNode) {
    // Update existing instance (maintain state)
    this.componentManager.updateComponent(prevVNode, nextVNode, container, context, wip);
  } else {
    // Mount new instance
    const host = this.componentManager.mountComponent(nextVNode, container, context);
  }
}
```

#### 2.4 State Integration Strategy

**Data Flow:**
```
[External Model]
model = { stype: 'counter', sid: 'c1', items: [...] }
  ↓
[Props Separation]
sanitizedProps = { items: [...] }  // Remove stype/sid
modelData = { stype: 'counter', sid: 'c1', items: [...] }  // Preserve original
  ↓
[Component Instance]
instance = {
  props: sanitizedProps,
  model: modelData,
  state: { count: 0 }  // Internal state
}
  ↓
[Pass to Template Function]
props = sanitizedProps  // { items: [...] }
context = {
  props: sanitizedProps,   // Pure props
  model: instance.model,    // Original model (including stype/sid)
  state: instance.state     // Internal state
}
  ↓
[Template Function]
define('counter', (props, context) => {
  // props: pure passed data (excluding stype/sid)
  // context.props: pure props (same)
  // context.model: original model (including stype/sid)
  // context.state: internal state
  
  return element('div', [
    text(String(context.state.count)),  // Internal state
    text(context.model.items.length)    // External model
  ]);
});
```

#### 2.5 Performance Optimization Strategy

**1. Leverage Reconcile Algorithm:**
- Update only actually changed parts in DOM with Virtual DOM diffing
- Reuse component instances (maintain state)
- Minimize unnecessary DOM manipulation

**2. Component Instance Caching:**
```typescript
// ComponentManager
private componentInstances: Map<string, WeakRef<ComponentInstance>> = new Map();

// Prevent memory leaks with WeakRef
setComponentInstance(id: string, instance: ComponentInstance): void {
  this.componentInstances.set(id, new WeakRef(instance));
}

getComponentInstance(id: string): ComponentInstance | undefined {
  const ref = this.componentInstances.get(id);
  if (!ref) return undefined;
  
  const instance = ref.deref?.() || ref;
  if (!instance) {
    // Remove if WeakRef is released
    this.componentInstances.delete(id);
    return undefined;
  }
  return instance;
}
```

**3. Batch Updates:**
```typescript
// Re-render only once if multiple components' setState are called consecutively
private rerenderScheduled: boolean = false;

setState: (newState) => {
  instance.state = { ...instance.state, ...newState };
  
  // Schedule batch update
  if (!this.rerenderScheduled) {
    this.rerenderScheduled = true;
    // Execute only once in next frame
    requestAnimationFrame(() => {
      if (this.onRerenderCallback) {
        this.onRerenderCallback();
      }
      this.rerenderScheduled = false;
    });
  }
};
```

**4. Prevent Unnecessary Rebuilds:**
```typescript
// Check if props/model/state actually changed in VNodeBuilder
private shouldRebuildComponent(
  prevProps: any,
  nextProps: any,
  prevModel: any,
  nextModel: any,
  prevState: any,
  nextState: any
): boolean {
  // Check for changes with shallow comparison
  return (
    !shallowEqual(prevProps, nextProps) ||
    !shallowEqual(prevModel, nextModel) ||
    !shallowEqual(prevState, nextState)
  );
}
```

#### 2.6 Behavior Examples by Scenario

**Scenario 1: Component Internal State Change**
```typescript
// Initial render
const model = { stype: 'counter', sid: 'c1' };
const vnode = renderer.build(model, []);
renderer.render(container, vnode);
// DOM: <div data-bc-sid="c1">0</div>

// setState inside component
ctx.setState({ count: 1 });
// → Call ComponentManager.setState
// → Call onRerenderCallback()
// → Call DOMRenderer.rerender()
// → Rebuild entire VNode tree (reflect instance.state.count = 1)
// → Update only actually changed parts in DOM with Reconcile
// DOM: <div data-bc-sid="c1">1</div>
```

**Scenario 2: External Model Change and Internal State Synchronization**
```typescript
// Initial state
const model1 = { stype: 'list', sid: 'l1', items: [1, 2, 3] };
const vnode1 = renderer.build(model1, []);
renderer.render(container, vnode1);
// Component internal state: { selected: 0 }

// setState inside component
ctx.setState({ selected: 1 });
// → Trigger full re-render

// External model also changes simultaneously
const model2 = { stype: 'list', sid: 'l1', items: [4, 5, 6] };
const vnode2 = renderer.build(model2, []);
renderer.render(container, vnode2);
// → Full re-render (reflect both model2 + internal state { selected: 1 })
// → External model change and internal state are fully synchronized
```

**Scenario 3: Multiple Component Instances**
```typescript
// Multiple components change state simultaneously
counter1.setState({ count: 1 });
counter2.setState({ count: 2 });
counter3.setState({ count: 3 });

// Re-render only once with batch update
// → Scheduled with requestAnimationFrame
// → Reflect all changes in single reconcile
```

#### 2.7 Trade-off Analysis

**Advantages:**
1. **Complete Synchronization**: External model changes and internal state always maintain consistency
2. **Simple Architecture**: No need to manage partial rendering boundaries
3. **Predictability**: Entire model is single source (Single Source of Truth)
4. **Easy Debugging**: Can check entire state at once

**Disadvantages:**
1. **Performance Overhead**: Rebuild entire VNode tree (but optimized with reconcile)
2. **State Management Complexity**: Must guarantee component instance reuse
3. **Memory Usage**: Keep entire VNode tree in memory

**Performance Measurement:**
- Update only actually changed parts in DOM with Reconcile algorithm
- Maintain state with component instance reuse (memory efficient)
- Prevent unnecessary re-renders with batch updates
- Expected performance: Sufficiently fast in typical apps (similar to React/Vue level)

#### 2.8 Implementation Checklist

- [ ] Restore `DOMRenderer.rerender()` method
- [ ] Implement `ComponentManager.setOnRerenderCallback()`
- [ ] Call `onRerenderCallback()` in `ComponentManager.setState`
- [ ] Component instance reuse mechanism (id-based matching)
- [ ] Separate Props and Model (store separately in instance)
- [ ] Batch update scheduling (requestAnimationFrame)
- [ ] Prevent unnecessary rebuilds (shallowEqual comparison)
- [ ] Performance testing and optimization

## Comparative Analysis

### Current Structure (Local Reconcile)

**Advantages:**
- Performance: Only performs partial updates
- Fast Response: Immediately reflects only component internal changes

**Disadvantages:**
- Synchronization Problem: Conflicts with external model changes
- Complexity: Difficult to manage props/model/state boundaries
- State Inconsistency: Internal state and external model are separate

### Proposed Structure (Full Re-rendering)

**Advantages:**
- Consistency: props + model + state always synchronized
- Simplicity: No need to manage partial rendering boundaries
- Predictability: Entire model is single source

**Disadvantages:**
- Performance: Re-render entire app (but optimized with reconcile)
- State Management: Component instance reuse required

## Recommended Direction

### Step 1: Props vs Context Separation (Can Apply Immediately)

**Changes:**
- Separate `props` and `model` in `componentContext`
- `props`: Pure passed data only (excluding stype/sid)
- `context.model`: Original model data (including stype/sid)
- Access `context.model` in component templates

**Effects:**
- Resolve stype/sid propagation problem
- Clarify component API interface
- Can maintain existing local reconcile

### Step 2: Full Re-rendering Strategy (Optional)

**Conditions:**
- When performance is sufficiently good (verify reconcile optimization)
- When synchronization between external model changes and internal state is important

**Changes:**
- Call `onRerenderCallback()` in `setState`
- Restore `DOMRenderer.rerender()`
- Guarantee component instance reuse (id-based matching)

**Effects:**
- Guarantee complete synchronization
- Simple architecture
- Predictable behavior

## Conclusion

1. **Props vs Context separation is essential**: Fundamentally resolves stype/sid propagation problem
2. **Full re-rendering is optional**: Decide based on performance and synchronization requirements
3. **Hybrid approach possible**: Maintain local reconcile initially, transition to full re-rendering when needed

## Global State and Service Access Design

### Problem Definition

Currently, components can only access the following 3 things:
- `props`: Pure passed data (component API)
- `context.model`: That component's model data (including stype/sid)
- `context.state`: Component internal state

**But what components need internally:**
- Editor instance access (command execution, event subscription, etc.)
- Entire model tree access (root model lookup)
- Global service access (data store, selection manager, schema, etc.)
- Global state management (shared state across multiple components)

**Core Principles:**
- Manage global state through Editor's global services
- Share state between components through Editor/DataStore
- Avoid direct reference to parent component's private state

### Global Service Access Design (Recommended)

#### Global Service Access Through Registry Extension

**Core Concept:**
- Extend Registry with Editor and global services
- Components access via `context.registry.getService()`
- Ensure global state consistency through centralized management

**Structure:**
```typescript
interface ComponentContext {
  // Existing fields
  id: string;
  props: ComponentProps;
  model: ModelData;
  state: ComponentState;
  
  // Registry extension (global services)
  registry: RendererRegistry & {
    // Editor and global services
    getEditor(): Editor | null;
    getDataStore(): DataStore | null;
    getSelectionManager(): SelectionManager | null;
    getSchema(): Schema | null;
    getRootModel(): ModelData | null;
  };
  
  // Convenience methods
  getEditor(): Editor | null;
}
```

**Implementation:**
```typescript
// When creating DOMRenderer
class DOMRenderer {
  private lastModel: ModelData | null = null;
  private editor?: Editor;
  
  constructor(registry?: RendererRegistry, editor?: Editor) {
    this.editor = editor;
    
    // Extend Registry
    const extendedRegistry = {
      ...registry,
      getEditor: () => this.editor || null,
      getDataStore: () => this.editor?.dataStore || null,
      getSelectionManager: () => this.editor?.selectionManager || null,
      getSchema: () => this.editor?.schema || null,
      getRootModel: () => this.lastModel || null,
    };
    
    this.builder = new VNodeBuilder(extendedRegistry, { /* ... */ });
  }
  
  build(model: ModelData, decorators: DecoratorData[] = []): VNode {
    this.lastModel = model;  // Store root model
    return this.builder.build(model.stype, model, { decorators });
  }
}
```

**Using Registry Extension in ComponentManager:**
```typescript
// ComponentManager.mountComponent
const componentContext: ComponentContext = {
  id: componentId,
  props: sanitizedProps,
  model: instance.model,
  state: instance.state,
  
  // Registry extension (global services)
  registry: {
    ...context.registry,
    // Registry extension methods already included
    // getEditor, getDataStore, etc. available
  },
  
  // Convenience methods
  getEditor: () => context.registry.getEditor?.(),
  
  setState: (newState) => { /* ... */ },
  // ...
};
```

**Core Concept:**
- Access global services through Registry (sufficient in most cases)
- Parent component access is rarely actually needed
- Find explicitly if needed (like React, find closest one)

**Usage Examples:**

```typescript
// Global service access (common usage)
define('editor-toolbar', (props, context) => {
  const editor = context.getEditor();
  const dataStore = context.registry.getDataStore();
  const rootModel = context.registry.getRootModel();
  
  // Execute Editor command
  return element('div', [
    element('button', {
      onClick: () => {
        editor?.executeCommand('bold');
      }
    }, [text('Bold')]),
    element('span', [
      text(`Total nodes: ${rootModel?.children?.length || 0}`)
    ])
  ]);
});

// Global state access (using DataStore)
define('status-bar', (props, context) => {
  const editor = context.getEditor();
  const dataStore = context.registry.getDataStore();
  
  // Read global state from DataStore
  const selection = dataStore?.getSelection();
  const wordCount = dataStore?.getWordCount();
  
  return element('div', [
    text(`Selected: ${selection ? 'yes' : 'no'}`),
    text(`Words: ${wordCount || 0}`)
  ]);
});

// Global state update
define('button-group', (props, context) => {
  const editor = context.getEditor();
  const dataStore = context.registry.getDataStore();
  
  return element('div', [
    element('button', {
      onClick: () => {
        // Update global state through Editor
        editor?.executeCommand('toggleBold');
        // Or update DataStore directly
        dataStore?.setState({ boldActive: true });
      }
    }, [text('Bold')])
  ]);
});
```

**Global State Management Patterns:**

1. **State Management Through Editor (Recommended)**
   ```typescript
   // Use Editor's command system
   editor.executeCommand('bold');
   editor.executeCommand('toggleBold');
   ```

2. **State Management Through DataStore**
   ```typescript
   // Direct DataStore access
   const state = dataStore.getState();
   dataStore.setState({ boldActive: true });
   ```

3. **Using Selection Manager**
   ```typescript
   const selection = selectionManager.getSelection();
   selectionManager.setSelection(range);
   ```

**Advantages:**
- Simple structure: Access all global services with just Registry extension
- Centralized management: Editor, DataStore, etc. managed in one place
- Low performance overhead: Direct access without context chain
- Type safety: Type checking possible with TypeScript
- Consistency guarantee: Global state always synchronized

**Core Principles:**
- Manage global state through Editor's global services
- Share state between components through Editor/DataStore
- Manage component's private state with `context.state`
- Access global state via `context.registry.getService()`

### Recommended Direction

**Global Service Access Through Registry Extension** is recommended:

1. **Global Service Access**: Unified through Registry extension
   - `context.getEditor()` - Editor instance
   - `context.registry.getDataStore()` - Data store
   - `context.registry.getSelectionManager()` - Selection manager
   - `context.registry.getSchema()` - Schema
   - `context.registry.getRootModel()` - Root model
   - **This is sufficient in most cases**

2. **Global State Management Patterns**:
   - Use Editor command system (recommended)
   - Direct DataStore access
   - Use selection manager
   - All components can access in the same way

3. **Component State Management**:
   - Component internal state: `context.state`, `context.setState()`
   - Global state: Access via `context.registry.getService()`
   - Clear responsibility separation: component state vs global state

**Core Insights:**
- Manage global state through Editor's global services
- Share state between components through Editor/DataStore
- Manage component's private state with `context.state`
- Avoid direct reference to parent component's private state

### Implementation Priority

1. ✅ **Props vs Context Separation** (Immediate)
   - Change `componentContext` structure
   - Separate `props` and `model`
   - Update component templates

2. ⚠️ **Global Service Access** (Next Step)
   - Registry extension (global services)
   - Inject Editor in DOMRenderer
   - Use Registry extension in ComponentManager
   - Establish global state management patterns

3. ⚠️ **Full Re-rendering** (Decide After Review)
   - Performance testing
   - Verify reconcile optimization
   - Apply if needed

