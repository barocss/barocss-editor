# Model package: improvements and optional enhancements

Review of `@barocss/model` against its role (transaction execution, operations, selection resolution, position/size) and optional enhancements. References: DataStore gap analysis, ProseMirror model, SPEC.md.

---

## 1. Current model scope

- **Transaction**: Lock → overlay → run operations → resolve selectionAfter → commit; one TransactionResult per run.
- **Operations**: defineOperation + defineOperationDSL; payload + TransactionContext (dataStore, schema, selection); return ok/error/inverse/selectionAfter.
- **Selection resolution**: After all ops, selectionAfter = lastCreatedBlock’s caret or context.selection.current; applied to view when applySelectionToView !== false.
- **PositionCalculator**: Absolute position ↔ nodeId + offset; getNodePath, getParentId, getSiblingIndex, getTextLength, calculateDistance, isTextNode, isContainerNode.
- **DSL**: transaction(editor, ops).commit(); control(nodeId, ops); node/textNode/mark builders; operations exported from operations-dsl.

---

## 2. Role vs other packages

| Responsibility        | Owner        | Note                                      |
|-----------------------|-------------|-------------------------------------------|
| Position/size         | **model**   | PositionCalculator; datastore stays by-id  |
| Document size (total) | **model**   | Optional getDocumentSize() on calculator |
| Slice / copy-paste    | **model**   | copy, paste, cut operations               |
| Undo/redo             | editor-core | HistoryManager, inverse ops               |
| Schema definition     | @barocss/schema | model uses schema from context        |
| CRDT / sync           | adapters    | datastore emit/apply operations           |

No overlap issues; optional improvements are additive.

---

## 3. Optional enhancements (implemented or recommended)

### 3.1 PositionCalculator.getDocumentSize()

- **Goal**: ProseMirror-style total document “size” (number of positions in the linear model).
- **Place**: `PositionCalculator` in model (same counting as findNodeByAbsolutePosition).
- **Behavior**: Traverse root and return total offset (node boundaries + text length); 0 when no root or empty.
- **Status**: Implemented in `position.ts`; tests in `test/operations/position.exec.test.ts`.

### 3.2 updateMark DSL

- **Goal**: Use updateMark from DSL like other ops: `control(nodeId, [ updateMark(markType, range, newAttrs) ])` and `updateMark(nodeId, markType, range, newAttrs)`.
- **Place**: `operations-dsl/updateMark.ts` + export in `operations-dsl/index.ts`.
- **Status**: Implemented; runtime was in `operations/updateMark.ts`; DSL added and exported; tests in `updateMark.exec.test.ts`.

### 3.3 TransactionContext.schema type

- **Goal**: Replace `schema?: any` with `schema?: Schema` (from `@barocss/schema`) for type safety.
- **Place**: `types.ts` (TransactionContext).
- **Status**: Optional; low risk, improves editor/extension typings.

### 3.4 Model package docs

- **Goal**: Single place for “what model owns” and “optional improvements” (this doc).
- **Place**: `packages/model/docs/model-improvements.md`.
- **Status**: Done.

---

## 4. What not to change

- **Position/size API**: Stays in model (PositionCalculator); datastore remains node/ID-centric.
- **Operation semantics**: Still defined by exec tests and SPEC.md; new ops follow the same defineOperation + DSL + exec test flow.
- **Selection resolution**: Flow (ops → resolve selectionAfter → commit → updateSelection) remains as in SPEC and transaction-selection.md.

---

## 5. References

- Model SPEC: `packages/model/SPEC.md`
- DataStore gap analysis: `packages/datastore/docs/datastore-gap-analysis.md`
- Transaction/selection: `docs/transaction-selection.md`, `docs/selection-application-flow.md`
- Operation creation: `.cursor/skills/model-operation-creation/SKILL.md`
