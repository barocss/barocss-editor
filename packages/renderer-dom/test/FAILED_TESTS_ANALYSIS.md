# Failed Test Analysis

## Issue 1: reconciler-component-state-integration.test.ts

### Test: `should rebuild only when nextVNode is missing or empty`

**Expected Behavior:**
- First render: `mountComponent` called (normal)
- Second render (same model): `mountComponent` not called, `updateComponent` called

**Actual Behavior:**
- `mountComponent` called 3 times on second render

**Cause Analysis:**
1. `findHostForChildVNode` cannot find host
2. `createHostElement` is called
3. Inside `createHostElement`, it finds existing host but logic checking if component is already mounted via `getComponentInstance` does not work properly
4. Or `prevVNode` is not properly stored/passed, so `findHostForChildVNode` cannot find host

**Solution Direction:**
- Verify `meta.domElement` is included when storing `prevVNode`
- Verify logic for `findHostForChildVNode` finding host
- Improve logic for checking already-mounted component inside `createHostElement`

---

## Issue 2: reconciler-selection-pool.behavior.test.ts

### Test: `does not let non-selection run steal selectionTextNode even when using pool`

**Expected Behavior:**
- Initial: `<span>abcde</span>` (initialText is Text node with 'abcde')
- Updated: `<span>ab</span><span>cde</span>` (cde is selection run)
- Non-selection run ('ab') should not reuse selectionTextNode

**Actual Behavior:**
- `abNode` equals `initialText` (reused)

**Cause Analysis:**
- Non-selection run reuses selectionTextNode in selection node reuse logic
- TextNodePool logic does not protect selectionTextNode

**Solution Direction:**
- Check if selectionTextNode when reusing TextNode
- Modify so non-selection run does not reuse selectionTextNode

---

## Issue 3: reconciler-mark-wrapper-reuse.test.ts

### Test 1: `should reuse mark wrapper span when text changes`

**Expected Behavior:**
- Initial: `<span data-bc-sid="text-1">Hello</span>`
- Updated: `<span data-bc-sid="text-1">Hello World</span>` (same DOM element reused)

**Actual Behavior:**
- `textContent` is 'HelloHello World' (duplicate rendering)

**Cause Analysis:**
- Text node not properly updated, only added
- Or existing text not removed

### Test 2: `should reuse mark wrapper span when text changes (with actual mark rendering)`

**Expected Behavior:**
- Mark wrapper reused and text updated

**Actual Behavior:**
- `textContent` is empty string

**Cause Analysis:**
- Text inside mark wrapper not properly rendered

### Test 3: `should reuse nested mark wrappers (bold + italic)`

**Expected Behavior:**
- Nested mark wrapper rendered

**Actual Behavior:**
- `querySelector` returns null (not rendered)

**Cause Analysis:**
- Nested mark wrapper rendering logic issue

**Solution Direction:**
- Verify text node update logic
- Verify mark wrapper reuse logic
- Verify nested mark wrapper rendering logic
