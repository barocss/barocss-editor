# Skipped Tests

This document lists all `it.skip` and `describe.skip` in the repo with reason and condition to unskip.

---

## packages/editor-view-dom

### test/integration/mutation-observer-integration.test.ts

| Test / Describe | Reason | Unblock condition |
|-----------------|--------|-------------------|
| `텍스트 노드 변경 시 InputHandler.handleTextContentChange가 호출되어야 함` | DOM text changes are classified as UNKNOWN; `handleTextContentChange` is not invoked. | MutationObserver → InputHandler flow: classify text mutations and call `handleTextContentChange`. |
| `텍스트 변경 시 모델 트랜잭션이 실행되어야 함` | Same as above. | Same. |
| `IME 조합 중 텍스트 변경은 보류되어야 함` | `InputHandler` does not expose a composition API. | Add composition API to InputHandler or test via EditorViewDOM composition path. |
| `onTextChange 이벤트가 InputHandler로 전달되어야 함` | Same UNKNOWN classification for text mutations. | Same as first row. |
| `DOM 텍스트 노드 변경이 감지되어야 함` | Same. | Same. |
| `여러 텍스트 노드 변경이 순차적으로 처리되어야 함` | Same. | Same. |

### test/event-handlers/input-handler-ime-composition.test.ts

| Test / Describe | Reason | Unblock condition |
|-----------------|--------|-------------------|
| `IME Composition` (describe) | InputHandler has no composition API. | Restore or add composition API; or cover via EditorViewDOM composition tests. |
| `commitPendingImmediate` (describe) | Same. | Same. |
| `commitPendingImmediate - Additional Cases` (describe) | Same. | Same. |
| `IME Composition - Timer Test` (describe) | Same. | Same. |

### test/integration/complex-scenarios-integration.test.ts

| Test / Describe | Reason | Unblock condition |
|-----------------|--------|-------------------|
| `renders conditionally based on model data` | DSL helpers `when()` (conditional rendering) not implemented or not wired in renderer. | Implement/wire `when()` in DSL or renderer. |
| `renders items using each` | DSL helper `each()` (iterative rendering) not implemented or not wired. | Implement/wire `each()` in DSL or renderer. |

### test/integration/form-elements-integration.test.ts

| Test / Describe | Reason | Unblock condition |
|-----------------|--------|-------------------|
| `handles form element onChange event` | Form element `onChange` handling not implemented in renderer or event binding. | Implement onChange (and similar) binding for form elements in renderer/event layer. |

---

## packages/editor-core

### test/extensions.test.ts

| Test / Describe | Reason | Unblock condition |
|-----------------|--------|-------------------|
| `Extensions` (describe) | Extension implementations live in `@barocss/extensions`; tests run there to avoid editor-core depending on extensions (cycle). | Keep tests in extensions package; or introduce test-only dependency and unskip here. |

### test/editor.test.ts

| Test / Describe | Reason | Unblock condition |
|-----------------|--------|-------------------|
| `Extension Sets` (describe) | Extension sets (createBasicExtensions, ExtensionSets) live in `@barocss/extensions`; tested there. | Same as Extensions. |

### test/editor-selection-integration.test.ts

| Test / Describe | Reason | Unblock condition |
|-----------------|--------|-------------------|
| `Editor + SelectionManager 통합 테스트` (describe) | Intentionally skipped; selection integration covered elsewhere or pending. | Decide scope and re-enable or move tests. |

---

## packages/renderer-dom

### test/core/reconciler-advanced-cases.test.ts

| Test / Describe | Reason | Unblock condition |
|-----------------|--------|-------------------|
| `Portal stability: render to body and retain by id across re-renders` | Reconciler portal support not complete; portal content may not be retained by id across re-renders. | Implement or fix portal handling in reconciler. |

### test/core/fiber-reconcile-complex-decorator.test.ts

| Test / Describe | Reason | Unblock condition |
|-----------------|--------|-------------------|
| `다른 부모 아래에 같은 decoratorSid를 가진 VNode가 있는 경우` | Current implementation reuses same DOM element via global search by decoratorSid; expected behavior is per-parent scope. | Scope decorator host finding to parent subtree or define and implement correct semantics. |

### test/core/fiber-reconcile-deep-nested-complex.test.ts

| Test / Describe | Reason | Unblock condition |
|-----------------|--------|-------------------|
| `깊게 중첩 + 여러 mark + 여러 decorator + 같은 decoratorSid` | Same decoratorSid semantics as above in a deep nested scenario. | Same as fiber-reconcile-complex-decorator. |

### test/core/reconcile-utils-host-finding.test.ts

| Test / Describe | Reason | Unblock condition |
|-----------------|--------|-------------------|
| `should find host globally by sid when not in parent` | Global search by sid was removed; compare only by children (React-like). | If global host finding is required, reintroduce with clear semantics; else update or remove test. |
