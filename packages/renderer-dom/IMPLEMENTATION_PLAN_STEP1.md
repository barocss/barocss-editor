# Step 1 Implementation Plan: Props vs Context Separation (Including Model/Decorator)

## Goals

Clearly separate `props` and `model` in components, and structurally organize `decorator` information to:
- Resolve stype/sid propagation issues
- Clarify component API
- Make model and decorator information accessible in components

## Current Issues

### 1. Model Data Mixed in Props
```typescript
// VNodeBuilder._buildComponent (line 1571)
const effectiveProps = Object.keys(props).length === 0 ? { ...data } : props;
// If props is empty, use entire data (including stype/sid) as props
```

### 2. ComponentInstance Missing model Field
```typescript
// types.ts
interface ComponentInstance {
  id: string;
  element: HTMLElement;
  component: ExternalComponent;
  state: ComponentState;
  props: ComponentProps;  // model information mixed in
  // no model field
}
```

### 3. ComponentContext Missing model Field
```typescript
// types.ts
interface ComponentContext {
  id: string;
  state: ComponentState;
  props: ComponentProps;  // model information mixed in
  registry: {...};
  // no model field
  // no decorator information
}
```

### 4. Decorator Information Not Passed to Components
- Decorators are handled separately but not accessible in component context
- Components cannot check decorators applied to themselves

## Implementation Plan

### Step 1.1: Update Type Definitions

**File: `packages/renderer-dom/src/types.ts`**

```typescript
// Add model field to ComponentInstance
export interface ComponentInstance {
  id: string;
  element: HTMLElement;
  component: ExternalComponent;
  state: ComponentState;
  props: ComponentProps;      // pure props (excluding stype/sid/type)
  model: ModelData;           // original model data (including stype/sid) ✨ added
  decorators?: DecoratorData[]; // list of applied decorators ✨ added
  vnode?: VNode;
  template?: ContextualComponent;
  parentElement?: HTMLElement;
  renderer?: any;
}

// Add model field to ComponentContext
export interface ComponentContext {
  id: string;
  state: ComponentState;
  props: ComponentProps;      // pure props (excluding stype/sid/type)
  model: ModelData;           // original model data (including stype/sid) ✨ added
  decorators?: DecoratorData[]; // list of applied decorators ✨ added
  registry: {
    get: (name: string) => any;
    getComponent: (name: string) => any;
    register: (definition: any) => void;
    setState: (id: string, state: Record<string, any>) => boolean;
    getState: (id: string) => ComponentState;
    toggleState: (id: string, key: string) => boolean;
  };
  // State management methods
  initState: (initial: Record<string, any>) => void;
  getState: (key: string) => DataValue;
  setState: (newState: Record<string, any>) => void;
  toggleState: (key: string) => void;
}
```

**Changes:**
- Add `model: ModelData` field to `ComponentInstance`
- Add `decorators?: DecoratorData[]` field to `ComponentInstance` (optional)
- Add `model: ModelData` field to `ComponentContext`
- Add `decorators?: DecoratorData[]` field to `ComponentContext` (optional)

### Step 1.2: Add Props Sanitization Utility Function

**File: `packages/renderer-dom/src/component-manager.ts`**

```typescript
/**
 * Remove model metadata from props (stype/sid/type)
 * Returns only pure passed data
 */
private sanitizeProps(props: any): ComponentProps {
  if (!props || typeof props !== 'object') return {};
  const { stype, sid, type, ...sanitized } = props;
  return sanitized;
}

/**
 * Extract decorator information from model data
 * Returns list of decorators applied to current node
 */
private getDecoratorsForNode(
  nodeSid: string,
  decorators: DecoratorData[] = []
): DecoratorData[] {
  return decorators.filter(d => 
    d.target?.sid === nodeSid || 
    d.target?.nodeId === nodeSid
  );
}
```

### Step 1.3: Modify VNodeBuilder._buildComponent

**File: `packages/renderer-dom/src/vnode/factory.ts`**

**Before:**
```typescript
// Resolve props
let props: Record<string, any> = {};
if (typeof template.props === 'function') {
  props = template.props(data);
} else if (template.props) {
  props = template.props;
}

// ...

if (component.managesDOM === false && typeof component.template === 'function') {
  const effectiveProps = Object.keys(props).length === 0 ? { ...data } : props;
  const vnode: VNode = {
    tag: 'div',
    attrs: wrapperAttrs,
    component: {
      name: template.name,
      props: effectiveProps  // problem: includes stype/sid
    }
  };
  return vnode;
}
```

**After:**
```typescript
// Resolve props
let resolvedProps: Record<string, any> = {};
if (typeof template.props === 'function') {
  resolvedProps = template.props(data);
} else if (template.props) {
  resolvedProps = template.props;
}

// Separate props and model
// Use empty object if props is empty (do not use entire data as props)
const sanitizedProps = this.sanitizeProps(resolvedProps);
const modelData = { ...data };  // preserve original model data

// Extract decorator information (from buildOptions)
const decorators = buildOptions?.decorators || [];

// ...

if (component.managesDOM === false && typeof component.template === 'function') {
  const vnode: VNode = {
    tag: 'div',
    attrs: wrapperAttrs,
    component: {
      name: template.name,
      props: sanitizedProps,  // store only pure props
      model: modelData,        // store original model separately ✨ added
      decorators: decorators  // store decorator information ✨ added
    }
  };
  return vnode;
}
```

**Changes:**
- Remove `effectiveProps`
- Sanitize props with `sanitizeProps()`
- Store only sanitized props in `vnode.component.props`
- Store original model data in `vnode.component.model` (newly added)
- Store decorator information in `vnode.component.decorators` (newly added)

### Step 1.4: Modify ComponentManager.mountComponent

**File: `packages/renderer-dom/src/component-manager.ts`**

**Before:**
```typescript
const instance: ComponentInstance = {
  id: componentId,
  component: component,
  props: vnode.component.props || {},
  state: {},
  element: null,
  mounted: false
};

const componentContext = {
  id: componentId,
  state: instance.state,
  props: instance.props,  // problem: may include stype/sid
  registry: context.registry,
  // ...
};
```

**After:**
```typescript
// Separate props and model
const sanitizedProps = this.sanitizeProps(vnode.component?.props || {});
const modelData = vnode.component?.model || vnode.component?.props || {};  // fallback
const decorators = vnode.component?.decorators || [];

const instance: ComponentInstance = {
  id: componentId,
  component: component,
  props: sanitizedProps,      // pure props
  model: modelData,            // original model
  decorators: decorators,      // decorator information
  state: {},
  element: null,
  mounted: false
};

const componentContext: ComponentContext = {
  id: componentId,
  state: instance.state,
  props: sanitizedProps,       // pure props
  model: instance.model,        // original model ✨ added
  decorators: instance.decorators, // decorator information ✨ added
  registry: context.registry,
  // ...
};
```

**Changes:**
- Sanitize props with `sanitizeProps()`
- Store original model data in `instance.model`
- Store decorator information in `instance.decorators`
- Add `model` to `componentContext`
- Add `decorators` to `componentContext`

### Step 1.5: Modify ComponentManager.updateComponent

**File: `packages/renderer-dom/src/component-manager.ts`**

**Before:**
```typescript
// Update component props
instance.props = { ...instance.props, ...(nextVNode.component?.props || {}) };

const prevElementTemplate = component.template(prevVNode.component?.props || {}, {
  props: instance.props,  // problem: may include stype/sid
  // ...
});
```

**After:**
```typescript
// Separate props and model
const nextSanitizedProps = this.sanitizeProps(nextVNode.component?.props || {});
const nextModelData = nextVNode.component?.model || nextVNode.component?.props || {};
const nextDecorators = nextVNode.component?.decorators || [];

// Update component instance
instance.props = nextSanitizedProps;
instance.model = nextModelData;
instance.decorators = nextDecorators;

const prevElementTemplate = component.template(prevSanitizedProps, {
  id: componentId,
  state: prevState,
  props: prevSanitizedProps,     // pure props
  model: instance.model,          // original model ✨ added
  decorators: instance.decorators, // decorator information ✨ added
  registry: context.registry,
  // ...
});

const nextElementTemplate = component.template(nextSanitizedProps, {
  id: componentId,
  state: instance.state,
  props: nextSanitizedProps,      // pure props
  model: nextModelData,           // original model ✨ added
  decorators: nextDecorators,     // decorator information ✨ added
  registry: context.registry,
  // ...
});
```

**Changes:**
- Sanitize props with `sanitizeProps()`
- Update `instance.model`, `instance.decorators`
- Pass `model`, `decorators` when calling template function

### Step 1.6: Modify ComponentManager.setState

**File: `packages/renderer-dom/src/component-manager.ts`**

**Before:**
```typescript
const prevTemplate = component.template(instance.props, {
  props: instance.props,  // problem: may include stype/sid
  // ...
});
const safePrevData = (() => { const { stype, sid, type, ...rest } = (instance.props || {}) as any; return rest; })();
```

**After:**
```typescript
const prevTemplate = component.template(instance.props, {
  id: componentId,
  state: prevState,
  props: instance.props,         // already sanitized
  model: instance.model,          // original model ✨ added
  decorators: instance.decorators, // decorator information ✨ added
  registry: this.context?.registry,
  // ...
});

const nextTemplate = component.template(instance.props, {
  id: componentId,
  state: instance.state,
  props: instance.props,         // already sanitized
  model: instance.model,          // original model ✨ added
  decorators: instance.decorators, // decorator information ✨ added
  registry: this.context?.registry,
  // ...
});

// Use only sanitized props when building internal element
const safeData = instance.props;  // already sanitized
const prevVNode = builder.buildFromElementTemplate(prevTemplate, safeData);
const nextVNode = builder.buildFromElementTemplate(nextTemplate, safeData);
```

**Changes:**
- `instance.props` is already sanitized, so no additional sanitization needed
- Pass `model`, `decorators` when calling template function
- Use `instance.props` when building internal element (already sanitized)

### Step 1.7: Extend VNode.component Type

**File: `packages/renderer-dom/src/vnode/types.ts` or related type file**

**Before:**
```typescript
interface VNode {
  // ...
  component?: {
    name: string;
    props: ComponentProps;
  };
}
```

**After:**
```typescript
interface VNode {
  // ...
  component?: {
    name: string;
    props: ComponentProps;      // pure props
    model?: ModelData;           // original model data ✨ added
    decorators?: DecoratorData[]; // decorator information ✨ added
  };
}
```

**Changes:**
- Add `vnode.component.model` field
- Add `vnode.component.decorators` field

### Step 1.8: Update Template Function Signature (Usage Example)

**Component template function usage example:**

```typescript
// Before
define('paragraph', (props, context) => {
  // props may include stype/sid
  const sid = props.sid;  // ❌ problem
  return element('p', [slot('content')]);
});

// After
define('paragraph', (props, context) => {
  // props: pure passed data (excluding stype/sid)
  // context.model: original model data (including stype/sid)
  // context.decorators: list of applied decorators
  
  const sid = context.model.sid;  // ✅ correct
  const stype = context.model.stype;  // ✅ correct
  
  // Check decorators
  const hasHighlight = context.decorators?.some(d => d.stype === 'highlight');
  
  return element('p', {
    'data-bc-sid': sid,
    className: hasHighlight ? 'highlighted' : ''
  }, [slot('content')]);
});
```

## Implementation Order

1. ✅ **Update type definitions** (`types.ts`)
   - Add `model`, `decorators` fields to `ComponentInstance`
   - Add `model`, `decorators` fields to `ComponentContext`
   - Extend `VNode.component` type

2. ✅ **Add utility functions** (`component-manager.ts`)
   - `sanitizeProps()` function
   - `getDecoratorsForNode()` function (if needed)

3. ✅ **Modify VNodeBuilder** (`vnode/factory.ts`)
   - Remove `effectiveProps` from `_buildComponent`
   - Separate props/model/decorators
   - Store `model`, `decorators` in `vnode.component`

4. ✅ **Modify ComponentManager** (`component-manager.ts`)
   - `mountComponent`: separate props/model/decorators
   - `updateComponent`: update props/model/decorators
   - `setState`: pass model/decorators

5. ✅ **Run and verify tests**
   - Verify existing tests pass
   - Verify component state tests

## Expected Effects

1. **Resolve stype/sid propagation issues**
   - props contains only pure passed data
   - model managed as separate field

2. **Clarify component API**
   - `props`: component API (pure data)
   - `context.model`: original model data
   - `context.decorators`: list of applied decorators

3. **Enable decorator access**
   - Components can check decorators applied to themselves
   - Conditional rendering based on decorators possible

4. **Improve type safety**
   - Clear type separation
   - Compile-time error detection possible

## Notes

1. **Backward Compatibility**
   - Existing code may use `props.sid`, `props.stype`
   - Migration guide needed

2. **Decorator Passing**
   - Must get decorator information from `buildOptions.decorators`
   - Need to verify current decorator handling

3. **Test Updates**
   - Need to fix tests that expect stype/sid in props

## Next Steps (Preparing Step 2)

After Step 1 completion:
- Global service access (Registry extension)
- Editor injection
- Use Registry extension from ComponentManager
