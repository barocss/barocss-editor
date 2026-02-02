# DataStore gap analysis (vs other editors)

Investigation of whether the datastore package needs additional work, with reference to ProseMirror, Lexical, and Yjs/CRDT patterns.

---

## 1. Current DataStore scope

- **Storage**: Normalized `Map<sid, INode>`; SID format `sessionId:globalCounter`.
- **Transactions**: Overlay (COW), `begin()` → mutations → `end()` → `commit()` or `rollback()`; operations collected as `AtomicOperation[]`.
- **Lock**: `acquireLock(ownerId)` / `releaseLock(lockId)` for concurrent writes.
- **Content**: `addChild`, `removeChild`, `moveNode`, `reorderChildren`, `cloneNodeWithChildren`; split/merge (text, block); range ops (insertText, deleteTextRange, getTextLength).
- **Query**: `getNode`, `getParent`, `getChildren`, `getNodePath`, `getNodeDepth`, `traverse`, `createDocumentIterator`, `getNodesInRange`, `getNodesInRange`, drop/editable/selectable/draggable/droppable metadata.
- **Schema**: `registerSchema`, `setActiveSchema`, validation on set/update.
- **Serialization**: `exportToTree`, `exportToJSON`, `loadFromJSON`, `restoreFromSnapshot`; loader/exporter (DataStoreManager).
- **Collaboration**: `emitOperation(AtomicOperation)`, `onOperation(callback)`; operations have type, nodeId, data, timestamp, parentId, position.
- **Snapshot / clone**: `clone()` (full store copy), `restoreFromSnapshot(nodes, rootNodeId?, version)`; `version`, `getVersion()`.

---

## 2. Comparison with other editors

### ProseMirror (prosemirror-model)

| Concept | ProseMirror | Barocss DataStore |
|--------|-------------|-------------------|
| Document | Single root Node; content as Fragment (sibling sequence) | Root node by `rootNodeId`; children via `node.content` (sid refs) |
| Position | Integer offset in document; `doc.resolve(pos)` → ResolvedPos | NodeId + offset (selection); **model** has `PositionCalculator` (absolute ↔ nodeId+offset) |
| Size | `doc.content.size` (integer) | `range.getTextLength(selection)` for a range; no single "document size" on datastore |
| Slice | Open/closed slice for copy/paste | Model/operations handle replace; no Slice type in datastore |
| Transform / Step | Step applied to doc; mapping for positions | Overlay + operations; position mapping in model/editor-core |

**Conclusion**: Position/size/slice are handled in **model** or **editor-core**; datastore stays node/ID-centric. No required change in datastore for ProseMirror parity.

### Lexical (EditorState, node tree)

| Concept | Lexical | Barocss DataStore |
|--------|---------|-------------------|
| State | EditorState (node tree + selection); immutable after update | Mutable store; overlay for transaction isolation; `clone()` for full copy |
| Updates | `editor.update(() => { ... })` | `begin()` → mutations → `end()` → `commit()` |
| Serialization | `editor.getEditorState()`, JSON; node `exportJSON` / `importFromJSON` | `exportToJSON`, `loadFromJSON`; node shape in INode |
| Listeners | Update listeners, mutation listeners | `onOperation` for collaboration; no fine-grained "subscribe to node" |

**Conclusion**: Different update model (mutable store + overlay vs immutable state). Barocss design is consistent; no need to add immutable snapshot API to datastore unless a use case (e.g. time-travel) requires it.

### Yjs / CRDT

| Concept | Yjs | Barocss DataStore |
|--------|-----|-------------------|
| Sync | `Y.applyUpdate()`, `Y.encodeStateAsUpdate()`, state vector | `emitOperation` / `onOperation`; collaboration adapters (yjs, liveblocks) translate operations |
| Merging | CRDT merge in Y.Doc | Central or adapter-specific; datastore emits operations, does not merge remote CRDT |

**Conclusion**: DataStore is operation-source and sink; CRDT/merge lives in adapters. No CRDT logic required inside datastore.

---

## 3. Optional enhancements (non-blocking)

- **Document size (integer)**: ProseMirror-style `doc.content.size`. Could add `getDocumentSize()` (e.g. total character count or token count) on datastore or keep in model (PositionCalculator). Low priority; model already has position/size for ranges.
- **Immutable read-only snapshot**: Return a frozen copy of the store at current (or given) version for time-travel or safe reads. Current `clone()` is a full copy; no versioned snapshot API. Add only if needed.
- **Fine-grained subscriptions**: e.g. "notify when node X or its descendants change". Currently only `onOperation` (all operations). Optional for reactive UIs; not required for current stack.

---

## 4. What not to add (by design)

- **Undo/redo**: Belongs in editor state / history layer (model or editor-core), not in datastore. Overlay + operations already support it above.
- **Position/size API**: Kept in **model** (`PositionCalculator`); datastore remains node/ID-centric.
- **Schema definition**: In `@barocss/schema`; datastore only validates against registered schema.
- **CRDT merge**: In collaboration adapters; datastore emits and applies operations.

---

## 5. Conclusion

- **DataStore is in good shape** for current Barocss architecture: normalized store, overlay, lock, content/range/mark ops, traversal, schema validation, serialization, collaboration events, clone/snapshot restore.
- **No required work** identified from ProseMirror, Lexical, or Yjs comparison; responsibilities are split (position/size in model, undo in history, CRDT in adapters).
- **Optional later**: `getDocumentSize()` if needed, or versioned read-only snapshot / subscriptions if a concrete use case appears.

---

## 6. References

- DataStore README: `packages/datastore/README.md`
- Skill: `.cursor/skills/package-datastore/SKILL.md`
- Ownership/collaboration: `packages/datastore/docs/ownership-and-collaboration.md`
- Model position: `packages/model/src/position.ts` (PositionCalculator)
