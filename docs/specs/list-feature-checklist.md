# List feature implementation checklist (issue #1)

Implementation Agent: use this checklist when implementing **Add list support (bullet list + ordered list)**. Do not skip steps; run tests after each layer.

Ref: `docs/specs/editor.md` §3.4, `packages/model/SPEC.md` §3.3, `.cursor/skills/model-operation-creation/SKILL.md`.

---

## 1. Schema

- [ ] **Confirm** `list` and `listItem` exist in app schema. `apps/editor-react/src/schema.ts` already has:
  - `list`: content `listItem+`, attrs `type` (default `"bullet"`).
  - `listItem`: content `block+`.
- [ ] If the renderer (e.g. renderer-dom) does not map `list` / `listItem` to DOM, add or extend node views so that `list` renders as `<ul>` or `<ol>` and `listItem` as `<li>` (with block content inside). Check `packages/renderer-dom` (or editor-view) for stype → tag/component mapping.

---

## 2. Model operations

- [ ] **toggleList** (or **wrapInList**):
  - Add `packages/model/src/operations/toggleList.ts` (or `wrapInList.ts`): `defineOperation('toggleList', ...)` with payload `{ listType: 'bullet' | 'ordered' }`. Behavior: wrap current block(s) in a `list` node containing `listItem`(s), or unwrap if already in a list. Set `context.lastCreatedBlock` so selectionAfter is caret in the focused list item’s first text node.
  - Add `packages/model/src/operations-dsl/toggleList.ts`: `defineOperationDSL` building `{ type: 'toggleList', payload: { listType } }`.
  - Register in `register-operations.ts` and export from `operations-dsl/index.ts`.
  - Add `packages/model/test/operations/toggleList.exec.test.ts`: assert document structure and selectionAfter in a text node.
- [ ] **splitListItem**:
  - Add `packages/model/src/operations/splitListItem.ts`: `defineOperation('splitListItem', ...)`. Behavior: when selection is inside a list item (e.g. in a paragraph), insert a new list item after the current one (with one empty block, e.g. paragraph); set `lastCreatedBlock` so selectionAfter is caret in the new list item’s first text node. If not inside a list item, can no-op or delegate to insertParagraph.
  - Add `packages/model/src/operations-dsl/splitListItem.ts` and register/export.
  - Add `packages/model/test/operations/splitListItem.exec.test.ts`: assert new list item created and selectionAfter.nodeId is a text node id.
- [ ] Run: `pnpm --filter @barocss/model test -- test/operations/toggleList.exec.test.ts`, `pnpm --filter @barocss/model test -- test/operations/splitListItem.exec.test.ts`, then `pnpm --filter @barocss/model test:run`.

---

## 3. Extension

- [ ] Add list extension (e.g. `packages/extensions/src/list.ts`): register command(s) that run `toggleList` (or wrapInList) with `listType: 'bullet'` or `'ordered'`. Optionally register a command for splitListItem (or map Enter in list context to splitListItem in editor-view).
- [ ] Keybinding: e.g. Mod+Shift+8 for bullet list, Mod+Shift+7 for ordered list (or follow existing pattern in heading/paragraph).
- [ ] Ensure Enter key in list item context triggers splitListItem (may require editor-view or input-handler change to detect “inside list item” and dispatch splitListItem instead of insertParagraph).
- [ ] Add or extend extension tests in `packages/extensions/test/`; run `pnpm --filter @barocss/extensions test:run`.

---

## 4. E2E

- [ ] Add `apps/editor-react/tests/list.spec.ts`: at least (1) apply bullet list to a paragraph and assert list DOM (e.g. `[data-bc-stype="list"]`, `[data-bc-stype="listItem"]`), (2) press Enter inside a list item and assert new list item and caret in new item.
- [ ] Run `pnpm test:e2e:react` and fix any failures.

---

## 5. Documentation

- [ ] Update **apps/docs-site** if needed: api (model operations, extension), architecture or guides that mention blocks/commands. Build: `pnpm --filter @barocss/docs-site build`.

---

## Verification (before PR)

1. `pnpm --filter @barocss/model test -- test/operations/toggleList.exec.test.ts` (and splitListItem)
2. `pnpm --filter @barocss/model test:run`
3. `pnpm --filter @barocss/extensions test:run`
4. `pnpm test:e2e:react`

Ref: `.cursor/AGENTS.md` § Verification by scenario → New feature.
