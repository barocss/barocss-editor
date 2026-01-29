---
name: package-datastore
description: Transactional, schema-aware node store (INode, IMark, sid, stype). Use when working with document nodes, transactions, overlay/COW, lock, content/mark operations, or collaboration operation events.
---

# @barocss/datastore

## Scope

- **Storage**: `Map<sid, INode>`; SID format `sessionId:globalCounter` (e.g. `"0:1"`).
- **Transactional overlay**: `begin()` → overlay writes → `end()` → `commit()` or `rollback()`. Read path: deletedIds → overlay → base.
- **Lock**: `acquireLock(ownerId)` / `releaseLock(lockId)`; use in try/finally around transactions when concurrent.
- **Operations**: `createNode`, `updateNode`, `deleteNode`, `content.addChild`, `content.removeChild`, `content.moveNode`, `content.reorderChildren`; schema via `registerSchema` / `setSchema`.
- **Collaboration**: `emitOperation(AtomicOperation)`, `onOperation(callback)`; operations have `type`, `nodeId`, `data`, `timestamp`, `parentId`, `position`.

## Rules

1. **Do not** write to DataStore outside a transaction when using overlay; use `begin` → mutations → `end` → `commit` (or `rollback`).
2. **SID**: assigned by DataStore on `createNode`; use for all node references in operations and collaboration.
3. **Schema**: validate node types and content with registered schema; use `transformNode` for type changes.
4. **Document traversal**: `createDocumentIterator`, `createRangeIterator`, `traverse(visitor)`, `getNodesInRange`.
5. **References**: `packages/datastore/`; docs under `packages/datastore/docs/` (iterator, drop-behavior, transaction-integration).

## Quick reference

- Package: `packages/datastore/`
- Deps: `@barocss/schema`
- Types: `INode`, `IMark`, `AtomicOperation`, `DocumentIteratorOptions`, `DocumentVisitor`
