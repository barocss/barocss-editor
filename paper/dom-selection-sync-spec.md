# DOM Selection ↔ Model Synchronization Spec

## 1. Scope and Goals

This spec defines how the editor represents and synchronizes text selections between the browser DOM and the Model. It standardizes:
- DOM Selection → Model selection (id+offset)
- Model selection (id+offset) → DOM Selection
- Responsibilities between SelectionManager and Renderer

Non-goals: command semantics, transaction details, clipboard policy.

## 2. Selection Model

- Inline-text container: element with `data-bc-sid="<id>"` representing a single logical inline text run stream (marks may fragment DOM, but the logical stream is contiguous).
- Selection shape (recommended):
```typescript
interface ModelRangeSelection {
  startNodeId: string;
  startOffset: number;
  endNodeId: string;
  endOffset: number;
  collapsed: boolean;
  direction: 'forward' | 'backward';
}
```
- Offsets:
  - Text-bearing nodes: 0..textLength (inclusive end at caret positions)
  - Non-text nodes: 0 (before), 1 (after)
- Direction:
  - `forward`: anchor position is before focus position in document order
  - `backward`: focus position is before anchor position in document order

## 3. Text Run Index

Renderer builds a per-inline container Text Run Index during render:
```typescript
interface TextRun { domTextNode: Text; start: number; end: number; } // [start, end)
type TextRunIndex = Map<string /*nodeId*/, { runs: TextRun[]; total: number; byNode?: Map<Text, {start:number;end:number}> }>
```
Construction rules:
- Traverse descendant Text nodes in DOM pre-order.
- Assign cumulative ranges; exclude decorator/external component subtrees.
- Store optional `byNode` map for O(1) reverse lookup.
- Invalidate and rebuild on reconcile when a container’s subtree changes.

Renderer exposes the index via reconcile hooks or a getter; it does not own selection logic.

## 4. DOM → Model (id+offset)

Input: `window.getSelection()`.
For each endpoint (anchor, focus):
1) Find closest ancestor `[data-bc-sid]` from the selection container → `id` (inline container).
2) Get that container's runs `{ runs, total }` from the Text Run Index.
3) If the selection node is a Text node found in `byNode`, use it; otherwise snap to nearest Text node by policy (forward/backward).
4) Compute `offset = run.start + localOffset`.

Direction calculation:
1) Same node selection: `direction = startOffset <= endOffset ? 'forward' : 'backward'`
2) Cross-node selection: Use anchor/focus nodes to determine direction
3) Fallback: Use DOM document position comparison

Return:
```typescript
{ startNodeId, startOffset, endNodeId, endOffset, collapsed, direction }
```

Edge cases:
- Empty container → only offset 0 is valid.
- Non-Text anchor/focus → snap to nearest Text node.
- Missing index → build lazily or fall back to TreeWalker to collect Text nodes, then compute offsets.

## 5. Model → DOM

Input: `{ id, offset }` endpoints.
For each endpoint:
1) Resolve container by `[data-bc-sid="id"]`.
2) Get its runs (sorted by `start`).
3) Binary-search run where `start ≤ offset < end`; compute `localOffset = offset - start`.
4) Set DOM Range endpoint to `(run.domTextNode, localOffset)`.

Clamp offsets to `[0, total]`. Empty container policy: place caret before/after container as product rules define.

## 6. Responsibilities

- SelectionManager (owner):
  - Reads DOM Selection; converts to id+offset using the Text Run Index.
  - Applies Model selection back to DOM.
  - Handles policies (snapping, IME protection, error handling, retries).

- Renderer:
  - Maintains Text Run Index per container.
  - Exposes index via hooks/options (read-only).
  - Performs keyed reconcile to preserve DOM nodes when possible; if forced replace occurs, SelectionManager re-applies selection from model.

## 7. IME and Stability

- Prefer in-place text/attr mutations to preserve active Text node during IME.
- When reconcile forces replacement (tag/namespace/component mismatch), SelectionManager must re-apply the selection using the model range after the render cycle.

## 8. Error Handling

- Node not found → fallback to empty selection or nearest valid anchor.
- Invalid offsets → clamp to valid range and retry.
- DOM access failure → retry or fallback based on policy.

## 9. Minimal API (SelectionManager)

```typescript
interface SelectionManager {
  getSelection(): ModelRangeSelection | null;                // DOM → Model (read)
  applySelection(sel: ModelRangeSelection): void;            // Model → DOM (write)
  onSelectionChange(cb: (sel: ModelRangeSelection|null) => void): () => void;
}
```

## 10. Performance Notes

- Cache Text Run Index per container; invalidate precisely on subtree changes.
- Use `byNode` reverse map for O(1) DOM → run resolution; fallback TreeWalker is allowed but should be rare.
- Avoid whitespace normalization mismatch between model text and render output.

### Selection Change Optimization

- **Debouncing**: Apply debouncing to `selectionchange` events to prevent excessive processing.
  - Normal selection changes: 16ms debouncing (60fps)
  - Drag operations: 100ms debouncing for performance
- **Drag Detection**: Track mouse events to detect drag state and apply appropriate debouncing.
- **Immediate Processing**: Process selection immediately when drag ends to ensure accurate final state.

## 11. Examples

Simple inline container mapping:
```html
<span data-bc-sid="text-1">A<b>B</b>C</span>
```
Runs: `[A] [B] [C]` with ranges `[0,1) [1,2) [2,3)` over the logical text `ABC`.
- Caret positions (global): `0 ^A 1 ^B 2 ^C 3`
- B only selection (range): `{ start: 1, end: 2 }`
- Caret at end of B: `{ offset: 2 }` (DOM `B` local offset 1 + run.start 1)


