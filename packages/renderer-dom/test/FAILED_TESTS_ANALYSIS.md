# 실패한 테스트 분석

## 문제 1: reconciler-component-state-integration.test.ts

### 테스트: `should rebuild only when nextVNode is missing or empty`

**기대 동작:**
- 첫 번째 render: `mountComponent` 호출 (정상)
- 두 번째 render (같은 모델): `mountComponent` 호출 안 됨, `updateComponent` 호출됨

**실제 동작:**
- 두 번째 render에서 `mountComponent`가 3번 호출됨

**원인 분석:**
1. `findHostForChildVNode`가 host를 찾지 못함
2. `createHostElement`가 호출됨
3. `createHostElement` 내부에서 이미 존재하는 host를 찾지만, `getComponentInstance`로 확인할 때 이미 마운트된 컴포넌트인지 확인하는 로직이 제대로 작동하지 않음
4. 또는 `prevVNode`가 제대로 저장/전달되지 않아서 `findHostForChildVNode`가 host를 찾지 못함

**해결 방향:**
- `prevVNode` 저장 시 `meta.domElement` 포함 확인
- `findHostForChildVNode`가 host를 찾는 로직 확인
- `createHostElement` 내부에서 이미 마운트된 컴포넌트 확인 로직 개선

---

## 문제 2: reconciler-selection-pool.behavior.test.ts

### 테스트: `does not let non-selection run steal selectionTextNode even when using pool`

**기대 동작:**
- Initial: `<span>abcde</span>` (initialText는 'abcde'를 가진 Text 노드)
- Updated: `<span>ab</span><span>cde</span>` (cde는 selection run)
- Non-selection run ('ab')은 selectionTextNode를 재사용하면 안 됨

**실제 동작:**
- `abNode`가 `initialText`와 같음 (재사용됨)

**원인 분석:**
- Selection 노드 재사용 로직에서 non-selection run이 selectionTextNode를 재사용하고 있음
- TextNodePool 로직에서 selectionTextNode를 보호하지 않음

**해결 방향:**
- TextNode 재사용 시 selectionTextNode인지 확인
- Non-selection run은 selectionTextNode를 재사용하지 않도록 수정

---

## 문제 3: reconciler-mark-wrapper-reuse.test.ts

### 테스트 1: `should reuse mark wrapper span when text changes`

**기대 동작:**
- Initial: `<span data-bc-sid="text-1">Hello</span>`
- Updated: `<span data-bc-sid="text-1">Hello World</span>` (같은 DOM 요소 재사용)

**실제 동작:**
- `textContent`가 'HelloHello World' (중복 렌더링)

**원인 분석:**
- 텍스트 노드가 제대로 업데이트되지 않고 추가만 됨
- 또는 기존 텍스트가 제거되지 않음

### 테스트 2: `should reuse mark wrapper span when text changes (with actual mark rendering)`

**기대 동작:**
- Mark wrapper가 재사용되고 텍스트가 업데이트됨

**실제 동작:**
- `textContent`가 빈 문자열

**원인 분석:**
- Mark wrapper 내부의 텍스트가 제대로 렌더링되지 않음

### 테스트 3: `should reuse nested mark wrappers (bold + italic)`

**기대 동작:**
- Nested mark wrapper가 렌더링됨

**실제 동작:**
- `querySelector`가 null 반환 (렌더링되지 않음)

**원인 분석:**
- Nested mark wrapper 렌더링 로직 문제

**해결 방향:**
- 텍스트 노드 업데이트 로직 확인
- Mark wrapper 재사용 로직 확인
- Nested mark wrapper 렌더링 로직 확인

