# renderer-react: Spec vs Implementation Verification

This document records the result of verifying the implementation against `renderer-react-spec.md`.

---

## 1. Verification Summary

| Spec requirement | Status | Notes |
|-----------------|--------|--------|
| **§1–2** Same input (Registry + ModelData), React-only output, no renderer-dom dep | ✅ | buildToReact + React.createElement; deps: dsl, react peer. |
| **§2.2** key = model.sid, data-bc-sid, data-bc-stype on root | ✅ | buildElement sets props.key, data-bc-sid, data-bc-stype. |
| **§2.3** Lookup: registry.get(nodeType) or equivalent; throw if not found | ✅ **Fixed** | Was using registry.getComponent(nodeType), which does not resolve define() templates (stored in _renderers). Switched to registry.get(nodeType). |
| **§2.3** Element/slot/data resolution | ✅ | processChildren: slot → model.content + buildToReact; data → text/marks; element → buildElement. |
| **§2.3** Contextual component: minimal context stub | ✅ | makeMinimalContext provides registry.getComponent, getState/setState no-ops. |
| **§2.3** External (managesDOM): placeholder | ✅ | createElement('div', { key, data-bc-sid, data-bc-stype }, 'Component'). |
| **§4** No selection logic in renderer-react | ✅ | No selection context or restore. |
| **§5** splitTextByMarks: boundaries, global + ranged marks, types per run | ✅ | utils/marks.ts: boundaries from range clamp; types from global + overlapping ranged. |
| **§5** getMarkRenderer(markType), buildMarkRunToReact, stable keys | ✅ | resolveMarkTemplate; key = `${keyBase}_${markType}_${i}`. |
| **§5** Unregistered mark: skip wrapper, text still rendered | ✅ | if (!elementTmpl) continue; inner stays. |
| **§6.1** ReactRenderer.build(model): requires model.stype, calls buildToReact | ✅ | Throws if !model?.stype; returns buildToReact(registry, model.stype, model). |
| **§6.2** buildToReact(registry, nodeType, model, options?) | ✅ | contextStub optional; minimal context used when resolving contextual. |
| **§10** No array index as key when sid available | ✅ | key = model.sid; mark run key = sid_r${ri}, mark wrapper key = keyBase_markType_i. |
| **§10** No renderer-dom dependency | ✅ | Only @barocss/dsl and react. |

---

## 2. Bug Fixed

- **Registry lookup**: Implementation used `registry.getComponent(nodeType)`. In DSL, `define(nodeType, element(...))` stores the definition in `_renderers` via `register()`. `getComponent(nodeType)` only looks at `_components`, so it returned `undefined` for all define()‑registered node types. **Fix**: Use `registry.get(nodeType)` and then `def.template`. `get()` returns a definition from either `_renderers` or (wrapped) `_components`.

---

## 3. Gaps / Not Yet Implemented (per spec)

- **§8 / Phase 1**: Done — `test:run` script, vitest config, and unit tests for splitTextByMarks and buildToReact added.
- **§7** when() / each(): Not in buildToReact (spec says “not in current buildToReact”).
- **§7** Decorators, portals, component state: Out of scope (spec).

---

## 4. Checklist (spec §8.4) – Implementation vs Tests

| Item | Implementation | Tests |
|------|----------------|-------|
| build(model) returns ReactNode when registered | ✅ | ✅ build-to-react.test.ts |
| build(model) throws when stype missing / unregistered | ✅ | ✅ build-to-react.test.ts |
| Root has key, data-bc-sid, data-bc-stype | ✅ | ✅ build-to-react.test.ts |
| slot('content') expands; children have key/data-bc-* | ✅ | ✅ build-to-react.test.ts |
| data('text') no marks → text (or span) | ✅ | (covered by slot test) |
| data('text') with marks → split runs, wrappers | ✅ | (not yet; add when needed) |
| splitTextByMarks: global, range, overlap, clamp | ✅ | ✅ split-text-by-marks.test.ts |
| Unregistered mark → skip wrapper, text present | ✅ | (not yet; add when needed) |
| Contextual component → context stub, correct output | ✅ | (not yet; add when needed) |

---

## 5. Next Steps

1. ~~Add `test:run` and vitest config to renderer-react (Phase 1).~~ Done.
2. ~~Add unit tests for splitTextByMarks (no React).~~ Done: test/split-text-by-marks.test.ts.
3. ~~Add unit tests for buildToReact / ReactRenderer.build (prop assertions).~~ Done: test/build-to-react.test.ts.
4. Optional: add tests for data('text') with marks, unregistered mark skip, contextual component.
