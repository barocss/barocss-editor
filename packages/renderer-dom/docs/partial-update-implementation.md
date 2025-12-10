# Partial Update Implementation Plan

## Current Situation

### Current Structure
```typescript
// sid is passed in changeState event
this.componentManager.on('changeState', (_sid: string) => {
  // But ignore _sid and do full re-render
  this.render(this.rootElement, this.lastModel, ...);
});
```

### Issues
- `sid` is passed in `changeState` event but not used
- Always full re-render
- Possible performance issues

---

## Partial Update Implementation Plans

### Plan 1: Rebuild Only from Changed Component Downward ⭐ **Recommended**

**Concept:**
- Use changed component's `sid` to rebuild only from that component downward
- Similar to React approach

**Implementation:**

```typescript
// Add partial update method to DOMRenderer
class DOMRenderer {
  /**
   * Partial update: Rebuild only from changed component downward
   */
  private renderPartial(sid: string): void {
    if (!this.rootElement || !this.currentVNode) return;
    
    // Find VNode of changed component
    const targetVNode = this.findVNodeBySid(this.currentVNode, sid);
    if (!targetVNode) {
      // Fallback to full re-render if not found
      this.render(this.rootElement, this.lastModel, ...);
      return;
    }
    
    // Rebuild only from this component downward
    const newSubTree = this.builder.buildSubTree(
      targetVNode,
      this.lastModel,
      this.lastDecorators || []
    );
    
    // Partial reconcile
    this.reconciler.reconcilePartial(
      targetVNode,
      newSubTree,
      targetVNode.meta?.domElement as HTMLElement
    );
  }
  
  /**
   * Find VNode by sid in VNode tree
   */
  private findVNodeBySid(vnode: VNode, sid: string): VNode | null {
    if (vnode.sid === sid) return vnode;
    
    if (Array.isArray(vnode.children)) {
      for (const child of vnode.children) {
        if (typeof child === 'object' && child !== null) {
          const found = this.findVNodeBySid(child as VNode, sid);
          if (found) return found;
        }
      }
    }
    
    return null;
  }
}

// Modify changeState event handler
this.componentManager.on('changeState', (sid: string) => {
  if (!this.rootElement || !this.lastModel) return;
  if (this.renderScheduled) return;
  this.renderScheduled = true;
  queueMicrotask(() => {
    this.renderScheduled = false;
    try {
      // Attempt partial update
      this.renderPartial(sid);
    } catch (err) {
      // Fallback to full re-render on failure
      this.render(this.rootElement, this.lastModel, ...);
    }
  });
});
```

**Add Partial Build Method to VNodeBuilder:**

```typescript
class VNodeBuilder {
  /**
   * Partial build: Rebuild only from specific component downward
   */
  buildSubTree(
    targetVNode: VNode,
    rootModel: ModelData,
    decorators: Decorator[]
  ): VNode {
    if (!targetVNode.stype) {
      // Return as-is if not a component
      return targetVNode;
    }
    
    // Find component's model data
    const componentModel = this.findModelBySid(rootModel, targetVNode.sid);
    if (!componentModel) {
      return targetVNode;
    }
    
    // Get component template
    const component = this.registry.getComponent(targetVNode.stype);
    if (!component) {
      return targetVNode;
    }
    
    // Rebuild component
    const template: ComponentTemplate = {
      name: targetVNode.stype,
      props: targetVNode.props || {},
      children: []
    };
    
    const newVNode = this._buildComponent(template, componentModel, {
      decorators: decorators.filter(d => d.target?.nodeId === targetVNode.sid)
    });
    
    if (!newVNode) {
      return targetVNode;
    }
    
    // Recursively rebuild children too
    if (Array.isArray(newVNode.children)) {
      newVNode.children = newVNode.children.map(child => {
        if (typeof child === 'object' && child !== null) {
          const childVNode = child as VNode;
          // Rebuild child components too
          if (childVNode.stype) {
            return this.buildSubTree(childVNode, rootModel, decorators);
          }
        }
        return child;
      });
    }
    
    return newVNode;
  }
  
  /**
   * Find data by sid in model
   */
  private findModelBySid(model: ModelData, sid: string): ModelData | null {
    if ((model as any)?.sid === sid) {
      return model;
    }
    
    // Recursively search children
    if (Array.isArray((model as any)?.children)) {
      for (const child of (model as any).children) {
        const found = this.findModelBySid(child, sid);
        if (found) return found;
      }
    }
    
    return null;
  }
}
```

**Advantages:**
- ✅ Reduced build cost (only changed part)
- ✅ Similar pattern to React
- ✅ Can apply gradually (fallback to full re-render)

**Disadvantages:**
- ⚠️ `data('text')`, `slot('content')` dependency issues
- ⚠️ Difficult to detect parent model changes

---

### Plan 2: Choose Partial/Full Update After Dependency Check

**Concept:**
- Check if component depends on parent model
- Partial update if no dependency
- Full update if dependency exists

**Implementation:**

```typescript
class VNodeBuilder {
  /**
   * Check if component depends on parent model
   */
  private hasParentModelDependency(vnode: VNode): boolean {
    // Check if uses data('text'), slot('content'), etc.
    // Analyze template to verify dependencies
    
    // Simple method: Execute template function to track dependencies
    // Or store dependency info in template metadata
    
    // TODO: Actual implementation needed
    return false; // Default: no dependency
  }
}

class DOMRenderer {
  private renderPartial(sid: string): void {
    const targetVNode = this.findVNodeBySid(this.currentVNode, sid);
    if (!targetVNode) {
      this.render(this.rootElement, this.lastModel, ...);
      return;
    }
    
    // Dependency check
    if (this.builder.hasParentModelDependency(targetVNode)) {
      // Full re-render if dependency exists
      this.render(this.rootElement, this.lastModel, ...);
      return;
    }
    
    // Partial update if no dependency
    const newSubTree = this.builder.buildSubTree(...);
    this.reconciler.reconcilePartial(...);
  }
}
```

**Advantages:**
- ✅ Ensures safety (full update when dependency exists)
- ✅ Performance optimization (partial update when no dependency)

**Disadvantages:**
- ⚠️ Complex dependency check logic
- ⚠️ Template analysis needed

---

### Plan 3: Hybrid Approach (Partial + Full)

**Concept:**
- Attempt partial update by default
- Full update if fails or dependency issues

**Implementation:**

```typescript
class DOMRenderer {
  private renderPartial(sid: string): boolean {
    try {
      // Attempt partial update
      const targetVNode = this.findVNodeBySid(this.currentVNode, sid);
      if (!targetVNode) return false;
      
      // Simple check: partial update if no parent model dependency
      if (this.canPartialUpdate(targetVNode)) {
        const newSubTree = this.builder.buildSubTree(...);
        this.reconciler.reconcilePartial(...);
        return true; // Success
      }
      
      return false; // Partial update not possible
    } catch (err) {
      logger.error(LogCategory.RECONCILE, 'Partial update failed', err);
      return false;
    }
  }
  
  private canPartialUpdate(vnode: VNode): boolean {
    // Simple heuristic:
    // 1. OK if component doesn't use data('text'), slot('content')
    // 2. Or explicitly marked by developer
    
    // TODO: Actual implementation
    return true; // Default: possible
  }
  
  // changeState event handler
  this.componentManager.on('changeState', (sid: string) => {
    if (!this.rootElement || !this.lastModel) return;
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    queueMicrotask(() => {
      this.renderScheduled = false;
      try {
        // Attempt partial update
        if (!this.renderPartial(sid)) {
          // Full re-render on failure
          this.render(this.rootElement, this.lastModel, ...);
        }
      } catch (err) {
        // Full re-render on error
        this.render(this.rootElement, this.lastModel, ...);
      }
    });
  });
}
```

**Advantages:**
- ✅ Ensures safety (fallback to full re-render)
- ✅ Performance optimization (partial update only when possible)
- ✅ Can apply gradually

**Disadvantages:**
- ⚠️ Dependency check logic needed

---

## Implementation Checklist

### Stage 1: Basic Partial Update
- [ ] Add `DOMRenderer.renderPartial()` method
- [ ] Add `VNodeBuilder.buildSubTree()` method
- [ ] Add `findVNodeBySid()` utility
- [ ] Modify `changeState` event handler

### Stage 2: Dependency Check
- [ ] Add `hasParentModelDependency()` method
- [ ] Implement template analysis logic
- [ ] Cache dependency information

### Stage 3: Partial Reconcile
- [ ] Add `Reconciler.reconcilePartial()` method
- [ ] Handle Fiber tree for partial update
- [ ] Write tests

### Stage 4: Optimization
- [ ] Performance measurement
- [ ] Profiling
- [ ] Additional optimization

---

## Notes

### 1. `data('text')`, `slot('content')` Dependencies

**Problem:**
- Partial update not possible when depends on parent model
- Full re-render needed

**Solution:**
- Dependency check logic essential
- Default to full re-render for safety

### 2. Consistency Guarantee

**Problem:**
- Possible state inconsistency on partial update

**Solution:**
- Always fallback to full re-render
- Full re-render if suspicious

### 3. Testing

**Needed Tests:**
- Partial update success cases
- Partial update failure cases (fallback)
- Dependency check cases
- Performance measurement

---

## Core Understanding: Actual Behavior of Partial Update

### Important Fact

**Even with partial update:**
- ✅ **Upper components are not rebuilt** (this is the benefit)
- ⚠️ **Must rebuild entire subtree from changed component downward**

### Why Must All Descendants Be Rebuilt?

```
App (Root)
├─ Header
├─ Content
│  └─ Main
│     └─ Counter (setState called) ← changed here
│        ├─ Button
│        ├─ Display
│        └─ Settings
│           └─ Option
```

**When `setState` called in Counter:**
- ✅ **Upper not rebuilt**: App, Header, Content, Main
- ⚠️ **All descendants rebuilt**: Counter → Button → Display → Settings → Option

**Reasons:**
1. **Structure may differ due to state change**
   - Conditional rendering like `if (state.showSettings) { ... }`
   - Child components may differ based on state

2. **Props Passing**
   - Props passed to children change when state changes
   - Child components also need re-render

3. **Consistency Guarantee**
   - Descendant structure must always reflect latest state

### React is the Same

**React's Behavior:**
```javascript
function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <Button />        ← re-rendered
      <Display />      ← re-rendered
      {count > 5 && <Settings />}  ← re-rendered (structure may change)
    </div>
  );
}
```

**When `setCount` called in Counter:**
- Counter and **all its descendant components** re-render
- Upper components do not re-render

### Actual Benefit of Partial Update

**Full Rebuild:**
```
Build cost: O(n)  (n = total component count)
Example: Build all 1000 components
```

**Partial Update:**
```
Build cost: O(k)  (k = changed subtree size)
Example: Build only 100-component subtree out of 1000
```

**Actual Example:**
- Full: Build 1000 components
- Partial: Build only 100-component subtree (10x improvement)

**But:**
- Descendant subtree still fully rebuilt
- Only upper is skipped

### Conclusion

**Core of Partial Update:**
1. ✅ **Skip upper components** (main benefit)
2. ⚠️ **Rebuild all from changed component downward** (required)
3. ✅ **Reduced build cost** (due to skipping upper)

**Partial update is possible but requires caution:**

1. **Attempt partial update by default**
2. **Dependency check essential**
3. **Full re-render on failure (fallback)**
4. **Gradual application recommended**

**Recommendations:**
- Recommend Plan 3 (Hybrid Approach)
- Safety first
- Performance second priority
- Understand that **descendant subtree rebuild is required**
