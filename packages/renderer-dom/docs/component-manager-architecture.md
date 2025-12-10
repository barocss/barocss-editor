# ComponentManager Architecture

## Current Structure

### ComponentManager Creation Location

```
DOMRenderer (instance)
  └── componentManager: ComponentManager (instance variable)
  └── builder: VNodeBuilder (ComponentManager passed as componentStateProvider)
  └── reconciler: Reconciler (ComponentManager passed)
```

**Current State:**
- `ComponentManager` exists as instance variable of `DOMRenderer`
- Each `DOMRenderer` has independent `ComponentManager` instance
- `VNodeBuilder` receives `ComponentManager` reference as `componentStateProvider`
- `Reconciler` receives `ComponentManager` directly

### ComponentContext Creation Location

`ComponentContext` is created in `ComponentManager.mountComponent()`:

```typescript
// ComponentManager.mountComponent()
const componentContext = {
  id: componentId,
  state: stateProxy,
  props: instance.props,
  model: instance.model,
  decorators: instance.decorators,
  registry: context.registry,
  // ... setState, getState, etc.
};
```

## context.instance Setting Location

### Option 1: Set in ComponentManager (Recommended)

**Advantages:**
- `ComponentManager` already manages `componentInstances` Map
- `BaseComponentState` instance (`__stateInstance`) is also created/managed in `ComponentManager`
- Can set `instance` when creating `componentContext` in `mountComponent()`

**Implementation:**
```typescript
// ComponentManager.mountComponent()
const stateInst: BaseComponentState | undefined = (instance as any).__stateInstance;

const componentContext = {
  // ...
  instance: stateInst,  // Pass BaseComponentState instance directly
  // ...
};
```

### Option 2: Set in VNodeBuilder

**Disadvantages:**
- `VNodeBuilder` only handles VNode creation, doesn't know component mounting
- Difficult to access `ComponentManager`'s instance
- `componentStateProvider` can only query state, instance access is limited

## Recommended Structure

### ComponentManager Sets context.instance

```typescript
// ComponentManager.mountComponent()
const stateInst: BaseComponentState | undefined = (instance as any).__stateInstance;

const componentContext = {
  id: componentId,
  state: stateProxy,
  props: instance.props,
  model: instance.model,
  decorators: instance.decorators,
  registry: context.registry,
  instance: stateInst,  // BaseComponentState instance
  setState: (newState) => {
    // Call stateInst.set()
    // Trigger full render (to be implemented later)
  },
  // ...
};
```

**Reasons:**
1. `ComponentManager` already creates/manages `BaseComponentState` instance
2. Can set `instance` when creating `componentContext`
3. Ensures consistency with `sid`-based management

## ComponentManager Location

### Current: DOMRenderer Instance Variable

**Advantages:**
- Independent instance management per renderer
- Multiple `DOMRenderer` instances can each manage independently

**Disadvantages:**
- Cannot share state between multiple `DOMRenderer` instances

### Alternative: Global Singleton

**Advantages:**
- Same instance referenced everywhere
- Easy state sharing

**Disadvantages:**
- May cause issues when using multiple editor instances
- Difficult to isolate in tests

## Conclusion

**Recommended:**
- `context.instance` is set in `ComponentManager.mountComponent()`
- `ComponentManager` remains as `DOMRenderer` instance variable as currently
- `sid`-based management ensures consistency within same `DOMRenderer`

**To implement later:**
- Trigger full `render` when `context.instance.setState()` is called (no partial update API)
- This will be implemented together with `Reconciler` work
