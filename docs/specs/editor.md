# Editor-Wide Specification

This document states the **editor-wide behavior and guarantees**: document model, selection semantics, and operation semantics that span model, extensions, and view. Package-level details live in each package’s `SPEC.md` or in linked architecture docs.

---

## 1. Document model

### 1.1 Tree structure

- The document is a **tree of nodes**. Each node has an identity (e.g. `sid`), a type (`stype`), and optional content (children or text).
- **Block nodes**: contain a list of child nodes (e.g. paragraph contains inline nodes). Blocks are the unit of “line” or “block” in the UI.
- **Text nodes**: leaf nodes that hold a string. Editable text lives only in text nodes.
- **Marks**: applied to ranges of text (e.g. bold, italic). Stored and applied per range; operations (e.g. insertText, deleteTextRange) preserve or transform marks as defined per operation.

Schema (e.g. `@barocss/schema`) defines allowed node types, groups (block vs inline), and attributes. The datastore stores nodes; the model applies operations and resolves selection.

### 1.2 Data flow (high level)

```
User input / Command → Editor (transaction) → Model operations → Datastore (overlay → commit)
                                                      ↓
                                              selectionAfter
                                                      ↓
                              Editor Core (updateSelection) → View (DOM/React selection)
```

- **Transaction**: one or more operations run in a single transaction; content changes are committed together; one **selectionAfter** is produced and applied to the view when `applySelectionToView !== false`.
- **Selection resolution**: after all operations run, the model resolves the final selection (e.g. from `context.selection.current` or from “new block” rules). That result is `selectionAfter`. See `docs/transaction-selection.md` and `docs/selection-application-flow.md`.

---

## 2. Selection semantics

### 2.1 Model selection

- **ModelSelection**: identifies a range in the document (e.g. `type: 'range'`, `startNodeId`, `startOffset`, `endNodeId`, `endOffset`). Collapsed selection (caret) is a range with start equals end.
- **selectionAfter**: the selection that the model outputs after a transaction. It is applied to the view (Editor Core → DOM/React) when `applySelectionToView !== false`.

### 2.2 Invariants (guarantees)

- **selectionAfter** must reference **valid nodes and offsets** after the transaction (e.g. node ids exist, offsets within node bounds).
- For operations that create or focus a new block (e.g. insertParagraph), **selectionAfter** must place the caret in a **text node** when the document has editable text there (so that subsequent typing targets the correct node). Concretely: `selectionAfter.nodeId` (or the start node of the range) should refer to a text node when the intent is “caret in that block’s text”. See `packages/model/SPEC.md` and operation exec tests.

### 2.3 When selection is applied

- Selection is **resolved once per transaction**, after all operations run and before commit. Only the result (`selectionAfter`) is passed to the editor and then to the view. See `docs/transaction-selection.md`.

---

## 3. Operation semantics (editor-wide)

Operations are defined in `@barocss/model`; their concrete inputs/outputs and invariants are in `packages/model/SPEC.md` and in `packages/model/test/operations/*.exec.test.ts`. This section states **high-level, cross-layer** guarantees that the editor relies on.

### 3.1 insertParagraph

- **Input**: current selection (from transaction context); optional payload (e.g. `blockType`, `selectionAlias`).
- **Behavior**: Inserts a new block (paragraph or same type as current) at a position derived from the selection (block end, block start, or split at caret). The caret is moved to the new block (or the start of the split).
- **Guarantee**: After the transaction, **selectionAfter** places the caret in a **text node** of the new or focused block (so that the next keypress goes into that text). The exec tests assert this (e.g. `selectionAfter.nodeId` is a text node id, `firstTextNodeId` is defined).

### 3.2 insertText

- **Input**: current selection; text to insert; optional marks.
- **Behavior**: Inserts the given text at the selection; may merge/split text nodes. Selection is updated to the end of the inserted text.
- **Guarantee**: **selectionAfter** is a valid range in a text node (the inserted or adjacent text).

### 3.3 deleteTextRange / deleteContentBackward

- **Behavior**: Removes content in the given range or backward from the caret. Selection is updated to the resulting position.
- **Guarantee**: **selectionAfter** is valid and points into a text node when the resulting block still has text.

### 3.4 List operations (bullet / ordered list)

- **Schema**: The editor schema may define `list` (content: listItem+, attrs: type = "bullet" | "ordered") and `listItem` (content: block+). When present, list blocks are the unit of bullet/numbered list in the UI.
- **toggleList / wrapInList** (or equivalent): Wrap the current block(s) in a list (bullet or ordered), or unwrap if the selection is already inside a list. Input: list type (bullet | ordered); selection from context. Output: document change; **selectionAfter** in a text node of the focused list item.
- **splitListItem**: When the caret is inside a list item (e.g. in its paragraph’s text), create a new list item after the current one (with an empty paragraph or block), and move the caret into that new item’s first text node. Behavior is analogous to insertParagraph but in list context. **Guarantee**: **selectionAfter** places the caret in a **text node** of the new list item (so that the next keypress goes into that text). Exec tests must assert this (e.g. selectionAfter.nodeId is a text node id).

If the schema does not define list/listItem, these operations are not applicable; the implementation checklist should add schema nodes when the app schema is extended for lists.

### 3.5 Blockquote

- **wrapInBlockquote**: Wrap the current block in a blockquote (blockQuote > block), or unwrap if already inside a blockquote. **selectionAfter**: caret stays in the same text node.

### 3.6 Other operations

- **toggleMark**, **setNode**, **transformNode**, etc.: each has inputs/outputs and invariants defined in the model package. Extension commands compose these operations; the view maps input events to commands. For each operation, the model’s exec tests and `packages/model/SPEC.md` are the source of truth.

---

## 4. User-visible behavior (summary)

- **Typing**: Input events (e.g. insertText, deleteContentBackward) are mapped to model operations by the editor-view; the model updates the document and produces **selectionAfter**; the view applies the selection to the DOM so the caret is in the right place.
- **Enter (insert paragraph)**: Command runs insertParagraph (or equivalent); a new block is inserted and the caret moves into its text node so that typing continues there.
- **Enter (in list item)**: When the caret is inside a list item, the command runs splitListItem (or equivalent); a new list item is created and the caret moves into its text node.
- **Block type / list / marks**: Commands run the corresponding model operations (setNode, toggleList, toggleMark, etc.); the document and selection are updated; the view re-renders and applies selection.

E2E tests (e.g. `apps/editor-react/tests/`) assert this behavior in the browser. When changing semantics, update the editor spec, the model spec (or operation spec), and the tests together.

---

## 5. References

- **Transaction and selection resolution**: `docs/transaction-selection.md`, `docs/selection-application-flow.md`
- **Model operations and invariants**: `packages/model/SPEC.md`, `packages/model/test/operations/*.exec.test.ts`
- **Architecture and package roles**: `docs/architecture-package-relationships.md`, `docs/README.md`
- **Portal (renderer-dom)**: `docs/dom/portal-system-spec.md`

---

## 6. Standard contracts for this editor platform

This section is used as the checklist when comparing behavior to `ProseMirror`-style editors.

### 6.1 Command and selection contract

- Every editor-facing command must run through a **single model transaction** and emit exactly one `selectionAfter` resolution path for the transaction.
- View selection is updated only when the command is local (`transaction(..., { source: 'local' })` path, or equivalent local dispatch flow), by handling `editor:selection.model`.
- Remote/model-origin updates can pass through the same selection resolution logic but should keep DOM selection writes disabled unless explicitly intended.
- If the same command changes both content and selection, selection should be restored relative to transformed content (same source of truth as model selection), not by re-parsing DOM offsets.

### 6.2 History contract

- A history entry should represent one logical editor command when the command is user initiated.
- For history operations that create/replace blocks, `selectionAfter` must point to a valid location in text content for the next insertion point.
- Undo/redo replay should preserve `selectionAfter` semantics consistently across view layers (DOM/React).

### 6.3 Acceptance tests for standard compliance

- `packages/editor-core/test/commands.test.ts` (command-to-transaction wiring)
- `packages/editor-core/test/undo-redo-history.test.ts` (history shape and replay)
- `packages/editor-core/test/editor.test.ts` (selection event flow)
- `packages/editor-view-dom/test/core/editor-view-dom.test.ts` (local vs remote selection application)
- `packages/editor-view-react/test/EditorView.test.tsx` (selection conversion entry points)

Whenever the platform behavior is changed, update both the corresponding section above and the package-level tests.

### 6.4 Behavioral baseline vs ProseMirror-style editors

- **Local-only DOM-sync contract**: the model dispatch path for local edits uses DOM selection sync; remote payloads must be metadata-only for model reconciliation and must not directly call DOM selection APIs.
- **Selection source semantics**:
  - `source: 'remote'` (or equivalent remote flags) must result in `applySelectionToView: false`.
  - Local command outputs (default path) should keep `applySelectionToView` as true.
- **Undo/redo semantic parity**:
  - Undo/redo should replay operations against model state first, then restore selection metadata in a deterministic order.
  - History snapshots must not be created from direct storage mutations outside editor transactions.

### 6.5 DSL and rendering contract (editor-standard differentiator)

This project’s standard is **Model → DSL → VNode → DOM**.

- **Model is authoritative**: `@barocss/model` owns structural mutation and selection resolution.
- **Schema is authoritative**: `@barocss/schema` defines valid types and document grammar.
- **DSL is declarative render contract**: `@barocss/dsl` defines node-level render semantics separately from model logic.
  - A node type (`stype`) can have multiple renderers via template variants.
  - `@barocss/renderer-dom` converts DSL templates to VNodes and applies reconciliation by `sid`.
  - Renderer behavior is tested by package-local tests, and rendering side effects are not a source of truth.
- **Selection contract is model-driven**: UI selection updates come from `selectionAfter` only, never from raw DOM diff.
- **Local/remote split**: DOM selection is applied only to local paths unless explicitly requested.

Why this is a strong point vs others:
- `ProseMirror/TipTap` tightly couple schema + command lifecycle with render behavior through NodeSpecs/NodeViews.
- `Slate`/`Lexical` often use editor-state data structure + React render adapters as parallel layers.
- `EditorJS` focuses on block-typed data model + plugin renderers and is less suitable for deeply structured mixed-inline editing.
- In our stack, DSL is an explicit package-level API with first-class governance: same DSL can target multiple renderers with predictable identity/selection invariants.

Standard test anchors:
- `packages/dsl/tests/*` (template/build contract)
- `packages/renderer-dom/test/*` (VNode/ reconciliation contract and decorator identity)
- `packages/editor-core/test/commands.test.ts` (model command + transaction entry)
- `packages/editor-view-dom/test/*` and `packages/editor-view-react/test/*` (selection application boundaries)

### 6.6 Competitive comparison baseline (this editor vs prosemirror, tiptap, editorjs, slate, lexical)

| Area | Barocss | ProseMirror | TipTap | EditorJS | Slate | Lexical |
|---|---|---|---|---|---|---|
| Document model | Tree with explicit `sid` and explicit schema-validated node types | Tree of Node objects + `Schema` + transaction mapping | PM schema wrapper + rich extensions | Ordered blocks + tool-defined payload | Node tree with `Element`/`Text` shape + operation paths | Node graph with formatted text ranges |
| Render contract | `schema -> DSL -> renderer(vnode)` (first-class render layer) | NodeView + direct DOM state | Same core + extensions/NodeViews | Tool renderer per block type | React render callbacks (`renderElement`, `renderLeaf`) | DecoratorNode + editor-state render adapters |
| Identity model | `sid` drives reconcile and update targeting | Internal node identity + marks by position/state | Internal PM node identity + attrs | Usually key-based tool IDs | Path-based node keys + range mapping | Node keys + editor-state internal handles |
| Selection authority | One model-resolved `selectionAfter` per command transaction | Transaction state selection + plugin/dispatch path | Transaction selection + extension hooks | Plugin-specific selection semantics | Editor state selection path mapping | EditorState selection APIs |
| Command/transaction boundary | One command call -> one model transaction -> one selection emission | Transaction builder + dispatch pipeline | PM command wrappers around PM transactions | Action + plugin-level side effects | Command chain + operation application | Command transform + update pipeline |
| History | Operation-first, selection-aware model history | PM history plugin over transactions | PM history + extension hooks | Editor-state snapshots + block-level deltas | History plugin over operations/path transforms | History plugin snapshots + transforms |
| Extensibility surface | `@barocss/extensions` + commands + decorators + DSL + adapters | Plugins + NodeSpecs + PM plugins | Extensions + plugins + NodeViews | Tool APIs + config | Plugins + custom editor methods | Plugins + nodes/decorators + transforms |
| Collaboration | Remote operations can be replayed through transaction path; DOM selection writes gated | Collaboration plugins (Yjs, etc.) manage awareness + steps | Inherits PM collaboration ecosystem | SDK-level sync integrations | App-specific providers | Provider integrations + CRDT options |
| DSL story | Explicit first-class package (`@barocss/dsl`) with registry + templates, reusable across renderers | No separate DSL package | No separate DSL package | Tool schema mapping, not DSL-first | No dedicated DSL package | No dedicated DSL package |
| Local/remote selection sync | Explicit local-only DOM write policy (`applySelectionToView`) | Editor-owned selection updates, collaboration adapters decide metadata-only sync | Same PM-owned flow + extension hooks | Dependent on integration plugin | App-level policy per integration | App-level policy per integration |

Observed advantages of this architecture:
- Deterministic node identity (`sid`-driven reconcile identity) and deterministic selection projection target.
- Clean separation of structural logic and rendering behavior via a standalone DSL contract.
- Clear selection source-of-truth in model (`selectionAfter`), suitable for replay/undo/collaboration.
- Pluggable renderer path: DOM/React/front-end renderers can evolve independently as long as they consume DSL outputs and honor `sid` contracts.

### 6.7 Baseline strengths and remaining risks

#### Strengths to keep
- Stable identity model allows targeted updates without path-based fragility.
- Command/selection atomicity gives a strict "one user action = one state intent" contract.
- Declarative templates make render behavior reviewable by package-level contracts, not implicit component behavior.
- Local-only DOM selection write policy avoids selection fights under async or remote updates.

#### Risks before claiming “beyond ProseMirror”
- Collaboration replay currently depends on reliable operation transport and source-of-truth `selectionAfter`; protocol-level op metadata still needs stronger guarantees.
- Renderer-specific behavior (especially decorators and portals) can diverge if custom components bypass DSL contract.
- Full gap to PM ecosystem (history plugins, mature schema tooling, ecosystem NodeViews) remains, so migration paths should be explicit.

#### Recommendation
Keep the standard focused on three hard guarantees:
1. **sid + selection lifecycle as invariant** across model and renderers.
2. **local/remote split** enforced at the Editor Core dispatch boundary.
3. **DSL as versioned API** with schema-registered node types and render contracts.

Gap watchlist (to keep improving):
- Editor-level collaborative operation metadata is defined, but we currently defer live CRDT/OT convergence behavior.
- Complex node views (math, charts, diagrams) should prefer DSL + component contract over direct DOM patch hacks to avoid divergence.
- `EditorJS`-style drag/drop block workflows can be matched only if command-level operations preserve block-order atomicity with selection intent.
- For practical execution, see `/docs/input-selection-stability-matrix.md` (IME/selection platform matrix and test priorities).
