# Reconciler 상세 동작 흐름

## 목차
1. [개요](#개요)
2. [핵심 개념](#핵심-개념)
3. [전체 흐름도](#전체-흐름도)
4. [주요 메서드 상세](#주요-메서드-상세)
5. [유틸리티 함수 역할](#유틸리티-함수-역할)
6. [데이터 구조](#데이터-구조)
7. [중요한 패턴과 전략](#중요한-패턴과-전략)

---

## 개요

Reconciler는 VNode 트리를 실제 DOM으로 변환하고, 이전 VNode 트리와 비교하여 최소한의 DOM 업데이트만 수행하는 핵심 컴포넌트입니다.

### 주요 목표
- **효율성**: 불필요한 DOM 조작 최소화
- **정확성**: VNode 트리를 정확하게 DOM으로 반영
- **재사용성**: 기존 DOM 요소를 최대한 재사용
- **순수성**: Selection 보존 등 외부 관심사와 분리

---

## 핵심 개념

### 1. VNode (Virtual Node)
- DOM 요소의 추상화 표현
- `tag`, `attrs`, `style`, `children`, `text` 등의 속성 포함
- `sid` (stable ID): 컴포넌트를 식별하는 고유 ID
- `decoratorSid`: 데코레이터를 식별하는 ID
- `meta.domElement`: 실제 DOM 요소에 대한 참조

### 2. prevVNode vs nextVNode
- **prevVNode**: 이전 렌더링 사이클의 VNode (prevVNodeTree에 저장)
- **nextVNode**: 현재 렌더링할 VNode (VNodeBuilder가 생성)
- 두 VNode를 비교하여 변경사항만 DOM에 반영

### 3. Host Element
- VNode가 실제로 렌더링되는 DOM 요소
- `data-bc-sid` 속성으로 컴포넌트 식별
- `data-decorator-sid` 속성으로 데코레이터 식별

### 4. Reconciliation (조정)
- prevVNode와 nextVNode를 비교하여 DOM을 업데이트하는 과정
- 재사용 가능한 DOM 요소는 재사용하고, 변경된 부분만 업데이트

---

## 전체 흐름도

```
reconcile(container, vnode, model)
    │
    ├─ 1. Root VNode 처리
    │   ├─ findFirstElementVNode: 첫 엘리먼트 찾기
    │   ├─ Host 찾기/생성 (sid 기반)
    │   └─ Attributes/Styles 업데이트
    │
    ├─ 2. Context 구축
    │   ├─ Registry, Builder 전달
    │   └─ Portal 방문 집합 초기화
    │
    └─ 3. reconcileVNodeChildren (재귀)
        │
        ├─ 3-1. vnode.text 처리 (handleVNodeTextProperty)
        │   └─ text만 있고 children이 없으면 텍스트 노드로 직접 렌더링
        │
        ├─ 3-2. prevChildToElement 맵 구축
        │   └─ prevChildVNode → DOM 요소 매핑
        │
        ├─ 3-3. Pre-clean (removeStaleEarly)
        │   └─ 예상되지 않는 요소 제거 (unmount 포함)
        │
        ├─ 3-4. 각 Child 처리 (processChildVNode)
        │   │
        │   ├─ Primitive text (string/number)
        │   │   └─ handlePrimitiveTextChild
        │   │
        │   ├─ Text-only VNode (tag 없고 text만)
        │   │   └─ handleTextOnlyVNode
        │   │
        │   ├─ Portal VNode
        │   │   └─ handlePortalVNode (외부 타겟에 렌더링)
        │   │
        │   └─ Element VNode
        │       ├─ Host 찾기 (findHostForChildVNode)
        │       │   ├─ SID 기반 매칭
        │       │   ├─ 구조적 매칭
        │       │   └─ 인덱스 기반 fallback
        │       │
        │       ├─ Host 생성/업데이트
        │       │   ├─ createHostElement (새로 생성)
        │       │   └─ updateHostElement (기존 업데이트)
        │       │
        │       ├─ Attributes/Styles 업데이트
        │       │
        │       ├─ Text content 처리
        │       │   ├─ vnode.text 처리
        │       │   ├─ model.text 처리
        │       │   └─ handleTextVNodeInChildren
        │       │
        │       └─ 재귀 reconcile (reconcileVNodeChildren)
        │
        ├─ 3-5. 순서 정렬 (reorder)
        │   └─ nextDomChildren 순서대로 DOM 재배치
        │
        ├─ 3-6. Meta 전송 (transferMetaFromPrevToNext)
        │   └─ prevVNode.meta → nextVNode.meta (domElement 참조 보존)
        │
        └─ 3-7. Stale 제거 (removeStale)
            └─ keep Set에 없는 요소 제거 (unmount 포함)
```

---

## 주요 메서드 상세

### 1. `reconcile(container, vnode, model, runtime?, decorators?)`

**목적**: 루트 레벨에서 VNode 트리를 DOM으로 변환

**단계**:

1. **Root VNode 준비**
   ```typescript
   // tag가 없거나 div인 경우, 첫 엘리먼트를 루트로 승격
   if (!rootVNode.tag || rootVNode.tag === 'div') {
     const firstEl = findFirstElementVNode(rootVNode);
     if (firstEl) rootVNode = firstEl;
   }
   ```

2. **Host 찾기/생성**
   ```typescript
   // sid 기반으로 기존 host 찾기
   const sid = vnode.sid || model.sid;
   let host = container.querySelector(`[data-bc-sid="${sid}"]`);
   
   if (!host) {
     // 새로 생성
     host = dom.createSimpleElement(rootVNode.tag, container);
     dom.setAttribute(host, 'data-bc-sid', sid);
   } else if (host.tagName !== rootVNode.tag) {
     // 태그 변경 시 교체
     const replacement = dom.createSimpleElement(rootVNode.tag, container);
     container.replaceChild(replacement, host);
     host = replacement;
   }
   ```

3. **Attributes/Styles 업데이트**
   ```typescript
   const prevVNode = prevVNodeTree.get(sid);
   dom.updateAttributes(host, prevVNode?.attrs, rootVNode.attrs);
   dom.updateStyles(host, prevVNode?.style, rootVNode.style);
   ```

4. **Children 재귀 처리**
   ```typescript
   reconcileVNodeChildren(host, prevVNode, rootVNode, context);
   ```

5. **prevVNode 저장**
   ```typescript
   prevVNodeTree.set(sid, rootVNode);
   ```

6. **Portal 클린업**
   ```typescript
   // 방문하지 않은 portal 제거
   for (const [pid, entry] of portalHostsById) {
     if (!visited.has(pid)) {
       entry.host.parentElement?.removeChild(entry.host);
       portalHostsById.delete(pid);
     }
   }
   ```

---

### 2. `reconcileVNodeChildren(parent, prevVNode, nextVNode, context)`

**목적**: VNode의 children을 재귀적으로 DOM으로 변환

**핵심 단계**:

#### Step 1: vnode.text 처리
```typescript
if (handleVNodeTextProperty(parent, nextVNode, prevVNode)) {
  return; // text만 있고 children이 없으면 여기서 종료
}
```

**동작**:
- `nextVNode.text`가 있고 `children`이 없으면 텍스트 노드로 직접 렌더링
- 기존 텍스트 노드 재사용 (MutationObserver 트리거 최소화)

#### Step 2: prevChildToElement 맵 구축
```typescript
const prevChildToElement = new Map<VNode | string | number, HTMLElement | Text>();
for (let i = 0; i < prevChildVNodes.length && i < parentChildren.length; i++) {
  prevChildToElement.set(prevChildVNodes[i], parentChildren[i]);
}
```

**목적**: 
- SID가 없는 요소들(mark wrapper 등)을 재사용하기 위한 매핑
- prevChildVNode → 실제 DOM 요소

#### Step 3: Pre-clean
```typescript
removeStaleEarly(parent, childVNodes, prevChildVNodes, components, context);
```

**동작**:
- 예상되지 않는 `data-bc-sid`를 가진 요소 제거
- unmountComponent 호출하여 컴포넌트 lifecycle 처리

**예시**:
```typescript
// childVNodes에 'sid1', 'sid3'만 있는 경우
// parent에 'sid2' 요소가 있으면 제거
```

#### Step 4: 각 Child 처리
```typescript
for (let childIndex = 0; childIndex < childVNodes.length; childIndex++) {
  const domNode = processChildVNode(
    parent, child, childIndex,
    prevChildVNodes, prevChildToElement,
    dom, components, context,
    reconcileFunction,
    currentVisitedPortalIds, portalHostsById
  );
  
  if (domNode !== null) {
    nextDomChildren.push(domNode);
  }
}
```

**processChildVNode의 동작**:
1. Primitive text → `handlePrimitiveTextChild`
2. Text-only VNode → `handleTextOnlyVNode`
3. Portal VNode → `handlePortalVNode` (null 반환)
4. Element VNode:
   - Host 찾기 (`findHostForChildVNode`)
   - Host 생성/업데이트 (`createHostElement` / `updateHostElement`)
   - Attributes/Styles 업데이트
   - Text content 처리
   - 재귀 reconcile

#### Step 5: 순서 정렬
```typescript
reorder(parent, nextDomChildren);
```

**동작**:
- `nextDomChildren` 배열의 순서대로 DOM 재배치
- `insertBefore`를 사용하여 올바른 위치로 이동

#### Step 6: Meta 전송
```typescript
transferMetaFromPrevToNext(prevVNode, nextVNode);
```

**목적**:
- `prevVNode.meta.domElement`를 `nextVNode.meta.domElement`로 전송
- DOM 요소 참조를 보존하여 다음 렌더링에서 재사용 가능
- 재귀적으로 children의 meta도 전송

#### Step 7: Stale 제거
```typescript
removeStale(parent, new Set(nextDomChildren), context, prevMap, expectedSids);
```

**동작**:
- `keep` Set에 없는 요소 제거
- `expectedSids`에 없는 요소 강제 제거
- unmountComponent 호출

---

## 유틸리티 함수 역할

### VNode 유틸리티 (`vnode-utils.ts`)

#### `findFirstElementVNode(node)`
- VNode 트리에서 첫 번째 element VNode 찾기
- 루트 VNode가 placeholder일 때 사용

#### `normalizeClasses(classValue)`
- 다양한 형식의 class 값을 배열로 정규화
- 지원 형식: string, array, object (class-names 스타일)

#### `vnodeStructureMatches(prev, next)`
- 두 VNode의 구조가 일치하는지 확인
- 비교 항목: tag, class, children count
- SID가 없는 요소(mark wrapper) 매칭에 사용

---

### DOM 유틸리티 (`dom-utils.ts`)

#### `findChildHost(parent, vnode, childIndex?)`
- parent의 direct children 중에서 vnode에 해당하는 host 찾기
- 전략:
  1. `data-bc-sid` 또는 `data-decorator-sid` 기반 매칭
  2. 인덱스와 태그 기반 fallback

#### `queryHost(parent, sid)`
- `:scope > [data-bc-sid="${sid}"]` 셀렉터로 direct child 찾기

#### `reorder(parent, ordered)`
- `ordered` 배열의 순서대로 DOM children 재배치
- `insertBefore`를 사용하여 최소한의 이동만 수행

---

### Meta 유틸리티 (`meta-utils.ts`)

#### `transferMetaFromPrevToNext(prevVNode, nextVNode)`
- `prevVNode.meta`를 `nextVNode.meta`로 전송
- 특히 `meta.domElement` 참조 보존
- 재귀적으로 children의 meta도 전송
- 조건:
  - 구조가 일치하거나
  - SID가 일치하거나
  - decoratorSid가 일치

---

### Text Node 핸들러 (`text-node-handlers.ts`)

#### `handleVNodeTextProperty(parent, nextVNode, prevVNode)`
- `vnode.text`가 있고 `children`이 없을 때 처리
- 기존 텍스트 노드 재사용 (MutationObserver 트리거 최소화)

#### `handlePrimitiveTextChild(parent, child)`
- Primitive text (string/number) 처리
- 첫 번째 텍스트 노드 재사용

#### `handleTextOnlyVNode(parent, childVNode, childIndex, context)`
- Text-only VNode (tag 없고 text만) 처리
- 위치 조정 포함

#### `updateHostTextContent(host, text)`
- Host element의 텍스트 콘텐츠 업데이트
- 기존 텍스트 노드 재사용

---

### Host Finding (`host-finding.ts`)

#### `findHostForChildVNode(parent, childVNode, childIndex, prevChildVNodes, prevChildToElement)`
- Child VNode에 해당하는 기존 host 찾기
- 전략 (우선순위 순):
  1. **SID 기반 매칭** (parent 내부)
  2. **전역 SID 검색** (cross-parent move 지원)
  3. **구조적 매칭** (같은 인덱스)
  4. **전체 구조적 매칭** (다른 인덱스)
  5. **인덱스 기반 fallback**

#### `findPrevChildVNode(childVNode, childIndex, prevChildVNodes)`
- 현재 childVNode에 해당하는 prevChildVNode 찾기
- 전략:
  1. SID 기반 매칭
  2. decoratorSid 기반 매칭
  3. 구조적 매칭 (같은 인덱스)

---

### Host Management (`host-management.ts`)

#### `createHostElement(parent, childVNode, childIndex, dom, components, context)`
- 새로운 host element 생성
- `data-bc-sid` 또는 `data-decorator-*` 속성 설정
- 올바른 위치에 삽입
- Component lifecycle: `mountComponent` 호출

#### `updateHostElement(host, parent, childVNode, childIndex, prevChildVNode, prevChildVNodes, dom, components, context)`
- 기존 host element 업데이트
- 위치 조정 (다른 parent로 이동 또는 같은 parent 내 재배치)
- Decorator 속성 업데이트
- Component lifecycle: `updateComponent` 호출
  - `__isReconciling` 플래그로 무한 루프 방지

---

### Child Processing (`child-processing.ts`)

#### `processChildVNode(...)`
- 단일 child VNode를 처리하여 DOM node 반환
- 처리 순서:
  1. Primitive text → Text node
  2. Text-only VNode → Text node
  3. Portal VNode → null (외부 타겟에 렌더링)
  4. Element VNode:
     - Host 찾기/생성/업데이트
     - Attributes/Styles 업데이트
     - Text content 처리
     - 재귀 reconcile
     - Cleanup (stray text nodes 제거)

#### `handleTextVNodeInChildren(host, childVNode)`
- `vnode.text`가 없지만 children에 text-only VNode가 있을 때 처리
- Block decorator 필터링

#### `cleanupStrayTextNodes(host, childVNode)`
- Element children이 있을 때 stray text nodes 제거
- 예외: text VNode가 children에 있으면 제거하지 않음

---

### Pre-clean (`pre-clean.ts`)

#### `removeStaleEarly(parent, childVNodes, prevChildVNodes, components, context)`
- 예상되지 않는 요소를 미리 제거
- `desiredChildSids`에 없는 `data-bc-sid` 요소 제거
- unmountComponent 호출

---

### Portal Handler (`portal-handler.ts`)

#### `handlePortalVNode(childVNode, dom, reconcileFunc, currentVisitedPortalIds, portalHostsById)`
- Portal VNode 처리
- 외부 타겟에 portal host 생성/찾기
- Portal content를 host에 reconcile
- Portal ID 추적 (클린업용)

---

## 데이터 구조

### Reconciler 인스턴스 변수

```typescript
class Reconciler {
  // prevVNode 트리 저장 (sid → prevVNode)
  private prevVNodeTree: Map<string, VNode> = new Map();
  
  // portal 관리: portalId → { target, host }
  private portalHostsById: Map<string, { target: HTMLElement, host: HTMLElement }> = new Map();
  
  // 현재 렌더에서 방문된 portalId 집합
  private currentVisitedPortalIds: Set<string> | null = null;
}
```

### Context 구조

```typescript
const context = {
  registry: RendererRegistry,
  builder: VNodeBuilder,
  parent: HTMLElement,
  decorators: Decorator[],
  getComponent: (name: string) => Component,
  reconcile: (vnode, container, reconcileContext) => void,
  __isReconciling?: boolean  // 무한 루프 방지 플래그
};
```

### prevChildToElement 맵

```typescript
// prevChildVNode → DOM element 매핑
const prevChildToElement = new Map<VNode | string | number, HTMLElement | Text>();

// 사용 목적:
// - SID가 없는 요소(mark wrapper) 재사용
// - 구조적 매칭 시 DOM 요소 참조
```

---

## 중요한 패턴과 전략

### 1. DOM 요소 재사용 전략

#### SID 기반 재사용 (최우선)
```typescript
// Component나 Decorator는 SID로 고유하게 식별
if (childVNode.sid) {
  host = parent.querySelector(`[data-bc-sid="${childVNode.sid}"]`);
}
```

#### 구조적 매칭 (SID 없을 때)
```typescript
// Mark wrapper 등 SID가 없는 요소는 구조로 매칭
if (vnodeStructureMatches(prevChildVNode, childVNode)) {
  host = prevChildVNode.meta.domElement;
}
```

#### 인덱스 기반 Fallback
```typescript
// 마지막 수단: 같은 인덱스의 같은 태그 재사용
if (childIndex < parent.children.length) {
  const candidate = parent.children[childIndex];
  if (candidate.tagName === childVNode.tag) {
    host = candidate;
  }
}
```

### 2. Text Node 재사용 전략

**목적**: MutationObserver 트리거 최소화

```typescript
// 기존 텍스트 노드 재사용
const existingTextNode = parent.firstChild;
if (existingTextNode && existingTextNode.nodeType === 3) {
  if (existingTextNode.textContent !== expectedText) {
    existingTextNode.textContent = expectedText;  // 내용만 변경
  }
  return existingTextNode;  // 재사용
}
```

### 3. 무한 루프 방지

**문제**: `updateComponent`가 내부에서 `reconcile`을 호출하면 무한 루프 발생

**해결**: `__isReconciling` 플래그 사용

```typescript
if (context.__isReconciling) {
  // updateComponent 호출하지 않고 DOM만 직접 업데이트
  dom.updateAttributes(host, prevVNode.attrs, nextVNode.attrs);
} else {
  // 정상적으로 updateComponent 호출
  components.updateComponent(prevVNode, nextVNode, host, context);
}
```

### 4. Portal 처리

**특징**: Portal은 현재 parent 아래에 DOM을 생성하지 않음

```typescript
if (handlePortalVNode(...)) {
  return null;  // nextDomChildren에 추가하지 않음
}
```

**동작**:
1. Portal target에 host 생성/찾기
2. Portal content를 host에 reconcile
3. Portal ID 추적 (클린업용)

### 5. Meta 전송 패턴

**목적**: DOM 요소 참조를 다음 렌더링에서 재사용

```typescript
// prevVNode.meta.domElement → nextVNode.meta.domElement
transferMetaFromPrevToNext(prevVNode, nextVNode);

// 재귀적으로 children의 meta도 전송
// 조건: 구조 일치 또는 SID 일치
```

### 6. Stale 제거 전략

**두 단계 제거**:

1. **Pre-clean** (reconcileVNodeChildren 시작 시)
   - 예상되지 않는 요소를 미리 제거
   - `desiredChildSids`에 없는 요소 제거

2. **Final Clean** (reconcileVNodeChildren 종료 시)
   - `keep` Set에 없는 요소 제거
   - `expectedSids`에 없는 요소 강제 제거

### 7. 순서 보장

**reorder 함수**:
- `nextDomChildren` 배열의 순서대로 DOM 재배치
- `insertBefore`를 사용하여 최소한의 이동만 수행

---

## 예시: 전체 흐름

### 시나리오: 간단한 텍스트 업데이트

```
초기 상태:
  VNode: { tag: 'div', sid: 'root', children: [
    { tag: 'span', text: 'Hello' }
  ]}
  DOM: <div data-bc-sid="root">
         <span>Hello</span>
       </div>

업데이트:
  VNode: { tag: 'div', sid: 'root', children: [
    { tag: 'span', text: 'World' }
  ]}
```

**처리 과정**:

1. `reconcile` 호출
   - Root host 찾기: `data-bc-sid="root"` 요소
   - Attributes/Styles 업데이트 (변경 없음)

2. `reconcileVNodeChildren` 호출
   - `handleVNodeTextProperty`: false (children 있음)
   - `prevChildToElement` 맵 구축
   - `removeStaleEarly`: 실행 (변경 없음)

3. `processChildVNode` 호출
   - `findHostForChildVNode`: 구조적 매칭으로 `<span>` 찾기
   - `updateHostElement`: 위치 확인 (변경 없음)
   - `updateHostTextContent`: 'Hello' → 'World' 업데이트
   - 재귀 reconcile: children 없음

4. `reorder`: 순서 확인 (변경 없음)
5. `transferMetaFromPrevToNext`: meta 전송
6. `removeStale`: stale 제거 (변경 없음)

**결과**:
- `<span>` 요소 재사용
- 텍스트 노드 재사용 (내용만 변경)
- 최소한의 DOM 조작

---

## 성능 최적화 전략

### 1. DOM 조작 최소화
- 기존 요소 재사용
- 텍스트 노드 재사용
- 불필요한 DOM 조작 방지

### 2. MutationObserver 트리거 최소화
- 텍스트 노드 재사용 (내용만 변경)
- 불필요한 DOM 업데이트 방지

### 3. 효율적인 매칭
- SID 기반 매칭 (O(1))
- 구조적 매칭 (필요할 때만)
- 인덱스 기반 fallback

### 4. 재귀 호출 최적화
- `__isReconciling` 플래그로 무한 루프 방지
- 불필요한 재렌더링 방지

---

## 디버깅 팁

### 1. 로그 활용
- `[Reconciler] reconcile: START/END`
- `[Reconciler] reconcileVNodeChildren: START/END`
- `[Reconciler] reconcileVNodeChildren: processing child`

### 2. 단위 테스트
- 각 유틸리티 함수는 독립적으로 테스트 가능
- 문제 발생 시 해당 함수만 테스트하여 원인 파악

### 3. DOM 상태 확인
- `prevVNodeTree`에 저장된 이전 상태 확인
- `meta.domElement` 참조 확인

---

## 주의사항

### 1. SID는 절대 생성하지 않음
- SID는 항상 model에서 가져옴
- 절대 임의로 생성하지 않음

### 2. Portal 클린업
- 렌더 종료 시 방문하지 않은 portal 제거
- 메모리 누수 방지

### 3. Component Lifecycle
- mount/update/unmount 올바른 순서로 호출
- 에러 처리 포함

### 4. Text Node 재사용
- MutationObserver 트리거 최소화를 위해 재사용
- 내용이 같으면 업데이트하지 않음

---

## 참고 자료

- [VNode 구조 예시](./vnode-structure-examples.md)
- [Reconciler 분석](./reconciler-analysis.md)
- [Component Update Flow](./component-update-flow.md)
- [Text Rendering Architecture](./text-rendering-architecture.md)

