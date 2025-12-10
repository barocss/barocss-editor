# BaseComponentState Management Structure

## Overview

`BaseComponentState` instances are managed based on `sid`, and `ComponentManager` is responsible for this.

## Management Structure

### 1. ComponentManager Manages BaseComponentState

```
ComponentManager
  └── componentInstances: Map<string, ComponentInstance>
        └── key: sid (componentId)
        └── value: ComponentInstance
              └── __stateInstance: BaseComponentState
```

**Important:**
- `ComponentManager` manages component instances based on `sid`
- Each `ComponentInstance` includes `BaseComponentState` as `__stateInstance`
- `componentId = sid` (generateComponentId prioritizes sid)

### 2. BaseComponentState Creation Time

```typescript
// In ComponentManager.mountComponent()
const componentId = this.generateComponentId(vnode);  // Prioritize sid
const existingInstance = this.componentInstances.get(componentId);

if (existingInstance) {
  // Reuse existing instance → preserve __stateInstance
  instance = existingInstance;
} else {
  // Create new instance
  const StateClass = StateRegistry.get(vnode.stype);
  if (StateClass) {
    const stateObj = new StateClass();
    instance.__stateInstance = stateObj as BaseComponentState;
  }
}
```

### 3. sid-Based Management

```typescript
// generateComponentId priority:
// 1. vnode.sid (highest priority)
// 2. vnode.attrs['data-bc-sid'] (fallback)
// 3. stype + props hash (fallback)
// 4. random (fallback)

public generateComponentId(vnode: VNode): string {
  if (vnode.sid) {
    return String(vnode.sid);  // Use sid directly
  }
  // ... fallback ...
}
```

## ComponentManager's Role

### Global Manager

`ComponentManager` exists as instance variable of `DOMRenderer`, but performs the following roles:

1. **sid-Based Instance Management**
   - `componentInstances: Map<sid, ComponentInstance>`
   - Reuse same instance for same `sid`

2. **BaseComponentState Lifecycle Management**
   - Mount: Create `new StateClass()`
   - Update: Preserve existing `__stateInstance`
   - Unmount: Remove with `componentInstances.delete(sid)`

3. **State Query API**
   - `getComponentState(componentId)`: Used in VNodeBuilder
   - `getComponentInstance(sid)`: External access

## Advantages of Current Structure

1. **sid-Based Consistency**
   - `ComponentInstance.id = sid`
   - `BaseComponentState` also managed based on `sid`

2. **State Preservation**
   - Preserve `__stateInstance` when updating same `sid`
   - State maintained, stable

3. **Clear Responsibility Separation**
   - `ComponentManager`: Instance and state management
   - `VNodeBuilder`: VNode creation
   - `Reconciler`: DOM update

## Notes

### ComponentManager Scope

Currently `ComponentManager` exists as instance variable of `DOMRenderer`:

```typescript
class DOMRenderer {
  private componentManager: ComponentManager;  // Instance variable
}
```

**Advantages:**
- Can manage independent instances per renderer

**Disadvantages:**
- Different state management if multiple `DOMRenderer` instances exist

**Recommendations:**
- Generally use single `DOMRenderer` instance
- Since `ComponentManager` already manages based on `sid`, same `sid` always references same instance

## Summary

1. ✅ `BaseComponentState` is managed by `ComponentManager` based on `sid`
2. ✅ `ComponentManager` already performs global manager role
3. ✅ `generateComponentId` modified to prioritize `sid`
4. ✅ `__stateInstance` preserved when reusing existing instance

## Conclusion

Current structure is correctly designed:
- `ComponentManager` manages `BaseComponentState` based on `sid`
- `ComponentManager` is instance variable of `DOMRenderer`, but `sid`-based management ensures consistency
- Additional global singleton pattern not needed (current structure sufficient)
