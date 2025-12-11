# Protecting User Input: Protecting Nodes Being Edited from AI/Collaborative Editing

## Problem Situation

### Scenario

```
1. User is typing in node A (typing...)
   - activeTextNodeId = 'nodeA'
   - User is typing "Hello"

2. AI modifies node A (external change)
   - Model: nodeA.text = "Hello AI"
   - editor:content.change event occurs
   - Rendering system regenerates DOM

3. Problem: User's input disappears or is interrupted
   - DOM is regenerated while user is typing
   - Cursor position changes
   - Input is interrupted
```

**Core Problem:**
- Nodes being edited by user are not protected from external changes
- Rendering can interfere with user input

---

## Current Implementation Status

### Current Protection Mechanisms

**1. activeTextNodeId Tracking**
```typescript
// input-handler.ts
class InputHandlerImpl {
  private activeTextNodeId: string | null = null;
  
  handleTextContentChange(textNodeId: string) {
    // Ignore changes from other nodes
    if (this.activeTextNodeId && textNodeId !== this.activeTextNodeId) {
      return; // Ignore if not active node
    }
  }
}
```

**2. IME Composition State Tracking**
```typescript
class InputHandlerImpl {
  private isComposing = false;
  private pendingTextNodeId: string | null = null;
  
  handleCompositionStart() {
    this.isComposing = true;
  }
  
  handleTextContentChange() {
    if (this.isComposing) {
      // Store changes during composition in pending
      this.pendingTextNodeId = textNodeId;
      return;
    }
  }
}
```

**3. Rendering Flag**
```typescript
class EditorViewDOM {
  private _isRendering = false;
  
  render() {
    this._isRendering = true;
    try {
      // Perform rendering
    } finally {
      this._isRendering = false;
    }
  }
  
  // MutationObserver callback
  onDOMChange() {
    if (this._isRendering) {
      // Ignore changes that occur during rendering
      return;
    }
  }
}
```

### Current Problems

**1. Insufficient Protection of Nodes Being Edited**
- `activeTextNodeId` only blocks changes from other nodes
- **Does not block external changes to the same node**
- If AI modifies the same node, user input is interrupted

**2. Rendering Timing Problem**
- Immediate rendering on external change
- Rendering occurs even during user input
- Input and rendering conflict

**3. Model-DOM Mismatch**
- User typing: DOM is changed, model not yet updated
- AI changes: Model is changed, DOM not yet updated
- Two changes conflict

---

## Solutions

### Solution 1: Protect Nodes Being Edited (Reconcile Level) ⭐ **Recommended**

**Concept:**
- Do not update nodes being edited during Reconcile
- Track nodes being edited based on sid
- Update only after input completion

**Implementation:**

```typescript
class EditorViewDOM {
  // Track nodes being edited
  private editingNodes: Set<string> = new Set();
  
  // User input start
  onUserInputStart(nodeId: string) {
    this.editingNodes.add(nodeId);
  }
  
  // User input end
  onUserInputEnd(nodeId: string) {
    this.editingNodes.delete(nodeId);
    // Immediately synchronize after input completion
    this.syncNodeAfterEdit(nodeId);
  }
  
  // Render on external change
  onExternalChange() {
    // Render excluding nodes being edited
    this.render({ skipNodes: this.editingNodes });
  }
}

class Reconciler {
  reconcile(container: HTMLElement, vnode: VNode, options?: {
    skipNodes?: Set<string>  // List of nodes being edited
  }) {
    // Skip reconcile for nodes being edited
    if (options?.skipNodes?.has(vnode.sid || '')) {
      // Keep previous VNode and DOM
      return;
    }
    
    // Perform normal reconcile
    this.reconcileInternal(container, vnode);
  }
}
```

**Advantages:**
- ✅ Nodes being edited are completely protected
- ✅ Handled at Reconcile level (clear responsibility separation)
- ✅ Accurate node identification based on sid

**Disadvantages:**
- ⚠️ Synchronization needed after input completion
- ⚠️ Logic needed to track nodes being edited

---

### Solution 2: Rendering Delay (Debouncing)

**Concept:**
- Do not render immediately on external change
- Wait until input is complete
- Batch render after input completion

**Implementation:**

```typescript
class EditorViewDOM {
  private pendingRenders: Map<string, any> = new Map();
  private renderDebounceTimer: NodeJS.Timeout | null = null;
  
  onExternalChange(nodeId: string, newModel: any) {
    // Delay rendering if node is being edited
    if (this.editingNodes.has(nodeId)) {
      this.pendingRenders.set(nodeId, newModel);
      
      // Render after input completion (debouncing)
      if (this.renderDebounceTimer) {
        clearTimeout(this.renderDebounceTimer);
      }
      
      this.renderDebounceTimer = setTimeout(() => {
        // Check if input is complete
        if (!this.editingNodes.has(nodeId)) {
          this.render();
          this.pendingRenders.clear();
        }
      }, 500); // Wait 500ms
      return;
    }
    
    // Render immediately if not being edited
    this.render();
  }
  
  onUserInputEnd(nodeId: string) {
    this.editingNodes.delete(nodeId);
    
    // Immediately perform if there is pending rendering
    if (this.pendingRenders.has(nodeId)) {
      this.render();
      this.pendingRenders.delete(nodeId);
    }
  }
}
```

**Advantages:**
- ✅ No rendering during input
- ✅ Automatic synchronization after input completion

**Disadvantages:**
- ⚠️ External changes are delayed (may degrade user experience)
- ⚠️ Difficult to determine input completion timing

---

### Solution 3: Conflict Resolution

**Concept:**
- Resolve conflicts when user input and external changes conflict
- Prioritize user input
- Merge or reject external changes

**Implementation:**

```typescript
class EditorViewDOM {
  onExternalChange(nodeId: string, externalChange: any) {
    // Resolve conflict if node is being edited
    if (this.editingNodes.has(nodeId)) {
      const userInput = this.getCurrentUserInput(nodeId);
      const resolved = this.resolveConflict(userInput, externalChange);
      
      // Update model with resolved result
      this.updateModel(nodeId, resolved);
      
      // Render after input completion
      this.onUserInputEnd(nodeId);
      return;
    }
    
    // Render immediately if no conflict
    this.render();
  }
  
  resolveConflict(userInput: any, externalChange: any): any {
    // Prioritize user input
    // Apply external changes after user input
    return {
      ...externalChange,
      text: userInput.text,  // Prioritize user input
      // Or merge logic
    };
  }
}
```

**Advantages:**
- ✅ Protect user input
- ✅ Reflect external changes (merge)

**Disadvantages:**
- ⚠️ Complex conflict resolution logic needed
- ⚠️ Merge logic can be complex

---

### Solution 4: Hybrid Approach (Reconcile + Delay) ⭐ **Final Recommendation**

**Concept:**
- Protect nodes being edited at Reconcile level
- Delay rendering for external changes
- Immediately synchronize after input completion

**Implementation:**

```typescript
class EditorViewDOM {
  // Track nodes being edited
  private editingNodes: Set<string> = new Set();
  private pendingExternalChanges: Map<string, any> = new Map();
  
  // User input start
  onUserInputStart(nodeId: string) {
    this.editingNodes.add(nodeId);
  }
  
  // User input end
  onUserInputEnd(nodeId: string) {
    this.editingNodes.delete(nodeId);
    
    // Immediately render if there is pending external change
    if (this.pendingExternalChanges.has(nodeId)) {
      const change = this.pendingExternalChanges.get(nodeId);
      this.pendingExternalChanges.delete(nodeId);
      this.render();
    }
  }
  
  // External change (AI/collaborative editing)
  onExternalChange(nodeId: string, change: any) {
    // Store in pending if node is being edited
    if (this.editingNodes.has(nodeId)) {
      this.pendingExternalChanges.set(nodeId, change);
      return; // Don't render
    }
    
    // Render immediately if not being edited
    this.render();
  }
  
  render(options?: { skipNodes?: Set<string> }) {
    // Pass nodes being edited to Reconcile
    this.domRenderer.render(this.container, this.vnode, {
      skipNodes: this.editingNodes  // Skip nodes being edited
    });
  }
}

class Reconciler {
  reconcile(container: HTMLElement, vnode: VNode, options?: {
    skipNodes?: Set<string>  // List of nodes being edited (sid-based)
  }) {
    const sid = vnode.sid || '';
    
    // Skip reconcile for nodes being edited
    if (options?.skipNodes?.has(sid)) {
      // ⚠️ Important: Do not reconcile this node itself
      // - Keep previous VNode and DOM as-is
      // - Do not update DOM
      // - Do not update attributes/styles/children
      
      // But child nodes can be updated
      // (Only protect node being edited, children can reflect external changes)
      this.reconcileChildrenOnly(vnode, options.skipNodes);
      return;
    }
    
    // Perform normal reconcile
    this.reconcileInternal(container, vnode, options);
  }
  
  /**
   * Reconcile only children (skip parent)
   * Allow children of node being edited to be updated
   */
  reconcileChildrenOnly(vnode: VNode, skipNodes: Set<string>) {
    const parentDom = vnode.meta?.domElement as HTMLElement;
    if (!parentDom) return;
    
    // Children are normally reconciled
    // But skip children included in skipNodes
    for (const child of vnode.children || []) {
      if (typeof child === 'object' && child !== null) {
        const childVNode = child as VNode;
        const childSid = childVNode.sid || '';
        
        if (skipNodes.has(childSid)) {
          // Skip children being edited too
          continue;
        }
        
        // Normal reconcile (children are updated)
        this.reconcileInternal(parentDom, childVNode, { skipNodes });
      }
    }
  }
}
```

**Advantages:**
- ✅ Complete protection of nodes being edited (Reconcile level)
- ✅ External changes also preserved (stored in pending)
- ✅ Automatic synchronization after input completion
- ✅ Child nodes can be updated (flexibility)

**Disadvantages:**
- ⚠️ Logic needed to track nodes being edited
- ⚠️ Pending change management needed

---

## Implementation Checklist

### Phase 1: Track Nodes Being Edited
- [ ] Add `editingNodes` Set
- [ ] Add `onUserInputStart()` method
- [ ] Add `onUserInputEnd()` method
- [ ] Automatic tracking in input events

### Phase 2: Reconcile Level Protection
- [ ] Add `skipNodes` option to `Reconciler.reconcile()`
- [ ] Skip reconcile for nodes being edited
- [ ] Process so child nodes can be updated

### Phase 3: External Change Handling
- [ ] Add `onExternalChange()` method
- [ ] Store in pending if node is being edited
- [ ] Automatic rendering after input completion

### Phase 4: Synchronization
- [ ] Model-DOM synchronization after input completion
- [ ] Apply pending changes
- [ ] Restore Selection

---

## Behavior by Scenario

### Scenario 1: AI Change During User Input

```
1. User is typing "Hello" in node A
   - editingNodes.add('nodeA')
   - activeTextNodeId = 'nodeA'

2. AI changes node A to "Hello AI"
   - onExternalChange('nodeA', { text: 'Hello AI' })
   - editingNodes.has('nodeA') === true
   - pendingExternalChanges.set('nodeA', change)
   - Don't render ✅

3. User completes input
   - onUserInputEnd('nodeA')
   - editingNodes.delete('nodeA')
   - pendingExternalChanges.has('nodeA') === true
   - Immediately render to reflect AI change ✅
```

### Scenario 2: Other Node Change During User Input

```
1. User is typing in node A
   - editingNodes.add('nodeA')

2. AI changes node B
   - onExternalChange('nodeB', change)
   - editingNodes.has('nodeB') === false
   - Immediately render ✅
   - Node A is skipped in reconcile and protected ✅
```

### Scenario 3: External Change After User Input Completion

```
1. User completes input in node A
   - editingNodes.delete('nodeA')

2. AI changes node A
   - onExternalChange('nodeA', change)
   - editingNodes.has('nodeA') === false
   - Immediately render ✅
```

---

## Considerations

### 1. Determining Input Completion Timing

**Problem:**
- Difficult to determine when input is complete
- IME composition completion, typing pause, etc.

**Solution:**
```typescript
class EditorViewDOM {
  private inputIdleTimer: Map<string, NodeJS.Timeout> = new Map();
  private readonly INPUT_IDLE_MS = 300; // Consider complete if no input for 300ms
  
  onUserInput(nodeId: string) {
    // Cancel previous timer
    const timer = this.inputIdleTimer.get(nodeId);
    if (timer) clearTimeout(timer);
    
    // Input start
    this.editingNodes.add(nodeId);
    
    // Consider complete if no input for 300ms
    const newTimer = setTimeout(() => {
      this.onUserInputEnd(nodeId);
      this.inputIdleTimer.delete(nodeId);
    }, this.INPUT_IDLE_MS);
    
    this.inputIdleTimer.set(nodeId, newTimer);
  }
}
```

### 2. Child Node Updates

**Problem:**
- Must protect node being edited but update child nodes
- Example: Child decorators of node being edited can be updated

**Solution:**
- Skip only node being edited in Reconcile
- Perform normal reconcile for child nodes

### 3. Selection Preservation

**Problem:**
- If node being edited is protected, Selection must also be preserved

**Solution:**
- TextNode reuse (TextNodePool)
- Selection restoration logic

---

## Exact Behavior of skipNodes

### Core Question: Do nodes in skipNodes skip reconcile?

**Answer: Yes, correct!**

### How skipNodes Works

**1. Nodes included in skipNodes:**
```typescript
if (skipNodes.has(sid)) {
  // ✅ This node itself skips reconcile
  // - Keep previous VNode and DOM as-is
  // - Do not update DOM
  // - Do not update attributes/styles/text
  // - Do not set effectTag
  return; // Skip reconcile
}
```

**2. Child Node Processing:**
```typescript
// If parent is in skipNodes
if (skipNodes.has(parentSid)) {
  // Skip parent but
  // child nodes can be reconciled
  // (Only protect node being edited, children can reflect external changes)
  for (const child of vnode.children) {
    if (!skipNodes.has(childSid)) {
      // Normal reconcile for children
      this.reconcile(child);
    }
  }
}
```

### Concrete Example

**Scenario:**
```
Node A (being edited)
├─ Child B (decorator)
└─ Child C (normal)

AI changes node A:
- Node A: Included in skipNodes → Skip reconcile ✅
- Child B: Not in skipNodes → Perform reconcile ✅
- Child C: Not in skipNodes → Perform reconcile ✅
```

**Result:**
- ✅ Node A remains as-is (user input protected)
- ✅ Children B, C are updated (external changes reflected)

---

## Conclusion

### Can It Be Done with Reconcile?

**Answer: Yes, it's possible!**

**Core:**
1. ✅ **Track nodes being edited based on sid**
2. ✅ **Skip nodes being edited at Reconcile level**
3. ✅ **Store external changes in pending and apply after input completion**

**Exact Behavior of skipNodes:**
- ✅ **Nodes in skipNodes = Skip reconcile**
- ✅ **Keep previous VNode and DOM as-is**
- ✅ **Do not update DOM (attributes/styles/text all)**
- ✅ **Child nodes can be updated** (only protect node being edited)

**Implementation Method:**
- Recommend Solution 4 (Hybrid Approach)
- Add `skipNodes` option to Reconcile
- Skip reconcile for nodes being edited
- Child nodes can be updated

**Advantages:**
- ✅ Complete protection of nodes being edited
- ✅ External changes also preserved (apply later)
- ✅ Handled at Reconcile level (clear responsibility separation)
- ✅ Accurate node identification based on sid

**Considerations:**
- ⚠️ Need to determine input completion timing
- ⚠️ Child node update handling
- ⚠️ Selection preservation

