# mountComponent 재호출 문제 분석

## 문제 상황

`reconciler-component-state-integration.test.ts`의 `should rebuild only when nextVNode is missing or empty` 테스트가 실패합니다.

### 테스트 시나리오
1. 첫 번째 render: `p-1` (paragraph)와 `text-1` (inline-text) 컴포넌트 마운트
2. 두 번째 render: 같은 모델로 재렌더링
3. 예상: `mountComponent`가 호출되지 않아야 함 (이미 마운트된 컴포넌트)
4. 실제: `mountComponent`가 3번 호출됨

## 원인 분석

### 1. sid 자동 생성 (해결됨)
- **문제**: `stype`이 있지만 `sid`가 없는 경우 `findHostForChildVNode`가 매칭 실패
- **해결**: VNodeBuilder에서 `stype`이 있을 때 `componentManager.generateComponentId`로 `sid` 자동 생성
- **상태**: ✅ 완료

### 2. findHostForChildVNode가 host를 찾지 못함 (진행 중)

`findHostForChildVNode`는 다음 전략을 순서대로 시도합니다:

#### Strategy 1: prevVNode.children에서 찾기
- `prevChildVNodes`에서 `sid`로 매칭하여 `prevChildVNode` 찾기
- `prevChildVNode.meta.domElement` 사용
- **문제**: `prevVNode.children`의 `meta.domElement`가 제대로 저장되지 않았을 수 있음

#### Strategy 2: findChildHost (parent.children에서 찾기)
- `parent.children`에서 `data-bc-sid`로 찾기
- **문제**: `parent`가 올바르지 않을 수 있음 (Fiber의 parent가 업데이트되지 않았을 수 있음)

#### Strategy 3: 전역 검색 (querySelector)
- `parent.ownerDocument.querySelector`로 전역 검색
- **문제**: DOM에 요소가 있음에도 찾지 못할 수 있음

### 3. createHostElement 내부 검색도 실패

`createHostElement` 내부에서도 전역 검색을 시도하지만 실패:
- `parent.children`에서 찾기
- 전역 검색 (`querySelector`)
- **문제**: `existingHost`를 찾았지만 `getComponentInstance`가 인스턴스를 반환하지 않아 `mountComponent` 호출

### 4. prevVNode 저장 시점 문제 (의심)

`prevVNode`는 `onComplete` 콜백에서 저장됩니다:
- 동기 모드에서는 모든 Fiber 작업이 완료된 후 `onComplete` 호출
- 이 시점에 모든 자식 노드의 `meta.domElement`가 설정되어 있어야 함
- **문제**: `cloneVNodeTree`가 자식 노드의 `meta.domElement`를 포함하지만, 실제로는 없을 수 있음

## 핵심 문제

### 문제 1: findHostForChildVNode가 host를 찾지 못함

`findHostForChildVNode`는 3가지 전략을 시도하지만 모두 실패:

1. **Strategy 1 (prevVNode.children)**: `prevChildVNode.meta.domElement`가 없음
2. **Strategy 2 (findChildHost)**: `parent.children`에서 찾지 못함
3. **Strategy 3 (전역 검색)**: `querySelector`로 찾지 못함

### 문제 2: createHostElement 내부 검색도 실패

`createHostElement` 내부에서도 전역 검색을 시도하지만 실패:
- `parent.children`에서 찾기 실패
- 전역 검색 (`querySelector`) 실패
- 결과: `existingHost`가 `null`이 되어 새 host 생성 → `mountComponent` 호출

### 문제 3: prevVNode.children의 meta.domElement 누락

가능한 원인:
- `onComplete` 시점에 자식 노드의 `meta.domElement`가 아직 설정되지 않음
- `cloneVNodeTree`가 자식 노드의 `meta.domElement`를 복사하지 않음
- `prevVNode`가 저장될 때 자식 노드의 `meta.domElement`가 없음

## 해결 방안

### 방안 1: prevVNode 저장 시점 확인
- `onComplete` 콜백이 호출될 때 모든 자식 Fiber의 `meta.domElement`가 설정되어 있는지 확인
- `cloneVNodeTree`가 자식 노드의 `meta.domElement`를 제대로 복사하는지 확인

### 방안 2: findHostForChildVNode 디버깅
- 전역 검색이 실패하는 이유 확인:
  - `vnode.sid`가 올바른지
  - DOM에 실제로 요소가 존재하는지
  - `parent.ownerDocument`가 올바른지
- 로그 추가하여 각 전략의 실패 원인 확인

### 방안 3: createHostElement 개선
- `existingHost`를 찾았을 때 `getComponentInstance`가 인스턴스를 반환하지 않는 이유 확인
- `existingHost`가 이미 DOM에 있으면 무조건 재사용 (이미 구현됨, 하지만 작동하지 않음)

## 코드 분석 결과

### VNode 참조 구조
- `createFiberTree`에서 `childVNode`를 그대로 사용하여 자식 Fiber 생성
- `reconcileFiberNode`에서 `vnode.meta.domElement = host;` 설정
- `rootVNode.children`이 원본 VNode를 참조하므로, 자식 Fiber의 `vnode.meta.domElement`가 설정되면 `rootVNode.children`에도 반영됨
- 따라서 `cloneVNodeTree` 호출 시점에는 모든 자식 노드의 `meta.domElement`가 설정되어 있어야 함

### 가능한 원인
1. **prevVNode 전달 문제**: `reconcileFiberNode`에서 `prevVNode.children`이 제대로 전달되지 않음
2. **parent 문제**: `findHostForChildVNode`의 `parent`가 올바르지 않음 (Fiber의 parent가 업데이트되지 않았을 수 있음)
3. **전역 검색 실패**: `querySelector`가 실제로 DOM에서 요소를 찾지 못함 (타이밍 문제 또는 DOM 구조 문제)

## 디버깅 결과

### 확인된 사실
1. **두 번째 render에서 `prevVNode`는 정상적으로 전달됨**:
   - `p-1`: `prevVNodeExists: true, prevChildVNodesWithMeta: 1`
   - `text-1`: `prevVNodeExists: true, prevChildVNodesCount: 0` (자식이 없으므로 정상)

2. **`findHostForChildVNode`가 `prevChildVNodes`에서 찾지 못함**:
   - `p-1`의 경우: `prevChildVNodesWithMeta: 1`이지만, `findHostForChildVNode`가 host를 찾지 못함
   - `text-1`의 경우: `prevVNodeExists: true`이지만, `prevChildVNodesCount: 0` (부모의 `prevVNode.children`이 비어있음)

3. **전역 검색도 실패**:
   - `foundElements: []` - DOM에 요소가 있음에도 `querySelector`가 찾지 못함

### 핵심 문제
- `p-1`의 `prevVNode.children`에 `text-1`의 `prevVNode`가 포함되어 있지만, `findHostForChildVNode`가 이를 찾지 못함
- 전역 검색에서도 DOM 요소를 찾지 못함 (타이밍 문제 또는 DOM 구조 문제)

## 최신 디버깅 결과

### 해결된 부분
1. **`prevVNode` 자체에서 host 찾기 로직 추가**: `prevVNode.sid === vnode.sid`이고 `prevVNode.meta.domElement`가 있으면 host를 찾음
2. **로그 확인**: `prevVNode 자체에서 host 찾음`과 `기존 host 업데이트` 로그가 나타남

### 남은 문제
1. **`updateComponent` 내부에서 `mountComponent` 호출**: 
   - `updateComponent`가 호출될 때 `instance.mounted`가 false이거나 `instance.element`가 없으면 `mountComponent`를 호출함
   - 첫 번째 render에서 `mountComponent`가 호출되었지만, `instance.mounted`나 `instance.element`가 제대로 설정되지 않았을 수 있음

## 해결 완료 ✅

### 최종 해결 방법
1. **`prevVNode` 자체에서 host 찾기**: `prevVNode.sid === vnode.sid`이고 `prevVNode.meta.domElement`가 있으면 host를 찾음
2. **`prevVNode`를 `prevChildVNode`로 사용**: `prevChildVNodes`에서 찾지 못한 경우, `prevVNode` 자체가 현재 vnode와 매칭되면 `prevVNode`를 `prevChildVNode`로 사용
3. **`stype`과 `index`를 합쳐서 자동 생성 `sid` 생성**: 자동 생성된 `sid`는 `stype-index` 형식으로 생성되어, 같은 `stype`과 `index`를 가진 컴포넌트는 같은 `instance`를 공유

### 변경 사항
- `generateComponentId`에 `index` 옵션 추가: `stype-index` 형식으로 일관된 ID 생성
- `reconcileFiberNode`에서 자동 생성 `sid` 생성 시 `fiber.index` 사용
- `updateHostElement`에서 자동 생성 `sid` 생성 시 `childIndex` 사용
- `reconcileFiberNode`에서 `prevVNode`를 `prevChildVNode`로 사용하도록 수정

### 테스트 결과
✅ `should rebuild only when nextVNode is missing or empty` 테스트 통과

