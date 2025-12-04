# Mark Wrapper 재사용 문제 분석

## 현재 상태

### 통과한 테스트
- ✅ `fiber-find-host-mark-wrapper.test.ts` (2개 테스트 통과)
- ✅ `fiber-mark-wrapper-reuse.test.ts` (6개 테스트 통과)
- ✅ `fiber-process-primitive-text-mark-wrapper.test.ts` (2개 테스트 통과)
- ✅ `fiber-create-fiber-tree-mark-wrapper.test.ts` (2개 테스트 통과)

**총 12개 단위 테스트 모두 통과**

### 실패한 테스트
- ❌ `reconciler-mark-wrapper-reuse.test.ts` (7개 실패, 3개 통과)

## 실패 원인 분석

### 문제 1: 텍스트 중복 (`'HelloHello World'`)

**증상:**
```
Expected: "Hello World"
Received: "HelloHello World"
```

**원인:**
- `processPrimitiveTextChildren`이 기존 텍스트 노드를 제거하지 않고 새 텍스트 노드를 추가함
- `handlePrimitiveTextChild`가 기존 텍스트 노드를 찾지 못하거나, 찾았지만 업데이트하지 않고 새로 생성함

**관련 코드:**
- `packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts:745-780` (`processPrimitiveTextChildren`)
- `packages/renderer-dom/src/reconcile/utils/text-node-handlers.ts:60-127` (`handlePrimitiveTextChild`)

**예상 시나리오:**
1. 초기 렌더링: mark wrapper에 `'Hello'` 텍스트 노드 생성
2. 업데이트: `processPrimitiveTextChildren` 호출
3. `handlePrimitiveTextChild('Hello World', 0)` 호출
4. 기존 텍스트 노드를 찾지 못하거나, 찾았지만 업데이트하지 않고 새 텍스트 노드 생성
5. 결과: `'Hello'` + `'Hello World'` = `'HelloHello World'`

### 문제 2: Mark Wrapper가 null (`updatedMarkWrapper === null`)

**증상:**
```
Expected: <HTMLElement>
Received: null
```

**원인:**
- `reconcileFiberNode`가 mark wrapper를 재사용하지 못하고 새로 생성하거나 제거함
- `prevVNode`가 `undefined`일 때 `findHostForChildVNode`가 mark wrapper를 찾지 못함

**관련 코드:**
- `packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts:126-577` (`reconcileFiberNode`)
- `packages/renderer-dom/src/reconcile/utils/host-finding.ts:27-234` (`findHostForChildVNode`)
- `packages/renderer-dom/src/reconcile/utils/dom-utils.ts:16-68` (`findChildHost`)

**예상 시나리오:**
1. 초기 렌더링: mark wrapper DOM 요소 생성 (`<span class="mark-bold">Hello</span>`)
2. 업데이트: `reconcileFiberNode` 호출
3. `prevVNode`가 `undefined` (로그: `prevVNodeExists: false`)
4. `prevChildVNodes`가 빈 배열 (`prevChildVNodesCount: 0`)
5. `findHostForChildVNode` 호출:
   - Strategy 1 (Key-based): 실패 (vnodeId가 없음)
   - Strategy 2 (Type-based): 실패 (prevChildVNodes가 비어있음)
   - Strategy 3 (Index-based): `findChildHost` 호출하지만 실패
6. `createHostElement` 호출하여 새 DOM 요소 생성
7. 기존 mark wrapper는 `removeStaleChildren`에서 제거됨
8. 결과: `updatedMarkWrapper === null`

### 문제 3: `prevVNode`가 `undefined`인 이유

**로그 분석:**
```
[reconcileFiberNode] prevVNode 정보: {
  prevVNodeExists: false,
  prevVNodeSid: undefined,
  prevVNodeHasDomElement: false,
  prevChildVNodesCount: 0,
  prevChildVNodesWithMeta: 0,
  prevChildVNodesDetails: [],
```

**원인:**
- `createFiberTree`에서 mark wrapper의 `prevChildVNode`를 찾지 못함
- `prevVNode?.children?.[i]`로 인덱스 매칭을 시도하지만, 인덱스가 맞지 않거나 `prevVNode.children`이 비어있음

**관련 코드:**
- `packages/renderer-dom/src/reconcile/fiber/fiber-tree.ts:64-79` (`createFiberTree`의 `prevChildVNode` 찾기)

**예상 시나리오:**
1. 첫 번째 렌더링: `createFiberTree` 호출, `prevVNode = undefined`
2. 두 번째 렌더링: `createFiberTree` 호출
3. 부모 VNode (text-1)의 `prevVNode`는 있지만, mark wrapper의 `prevChildVNode`를 찾지 못함
4. 인덱스 매칭 실패: `prevVNode?.children?.[i]`가 `undefined`
5. 결과: mark wrapper Fiber의 `prevVNode = undefined`

## 해결 방안

### 방안 1: `handlePrimitiveTextChild` 수정

**문제:** 기존 텍스트 노드를 찾지 못하거나, 찾았지만 업데이트하지 않고 새로 생성함

**해결:**
1. `handlePrimitiveTextChild`에서 기존 텍스트 노드를 먼저 찾기
2. 찾았으면 업데이트, 못 찾았으면 새로 생성
3. 기존 텍스트 노드가 있으면 제거 후 새로 생성 (또는 업데이트)

**수정 위치:**
- `packages/renderer-dom/src/reconcile/utils/text-node-handlers.ts:60-127`

### 방안 2: `findChildHost`의 클래스 매칭 개선

**문제:** `prevVNode`가 없을 때 `findChildHost`가 mark wrapper를 찾지 못함

**해결:**
1. `findChildHost`에서 클래스 매칭 로직 개선
2. 인덱스 매칭 실패 시, 모든 자식 요소를 순회하며 클래스 매칭 시도
3. `usedDomElements`를 고려하여 이미 사용된 요소는 제외

**수정 위치:**
- `packages/renderer-dom/src/reconcile/utils/dom-utils.ts:42-65`

### 방안 3: `createFiberTree`의 `prevChildVNode` 찾기 개선

**문제:** 인덱스 매칭이 실패하여 `prevChildVNode`를 찾지 못함

**해결:**
1. 인덱스 매칭 실패 시, 태그와 클래스로 매칭 시도
2. `prevVNode.children`을 순회하며 같은 태그와 클래스를 가진 VNode 찾기

**수정 위치:**
- `packages/renderer-dom/src/reconcile/fiber/fiber-tree.ts:64-79`

## 테스트 진행 방법

### 1단계: 문제 재현 및 디버깅

```bash
# 실패하는 테스트만 실행
cd packages/renderer-dom
pnpm test:run test/core/reconciler-mark-wrapper-reuse.test.ts -t "should reuse mark wrapper span when text changes"
```

**확인 사항:**
1. `prevVNode`가 `undefined`인지 확인
   - 로그: `prevVNodeExists: false`
   - 원인: `createFiberTree`에서 `prevChildVNode`를 찾지 못함
2. `findHostForChildVNode`가 호출되는지 확인
   - 로그: `[findHostForChildVNode] prevChildVNode를 찾지 못함`
   - 원인: `prevChildVNodes`가 비어있어 Strategy 1, 2 실패
3. `findChildHost`가 호출되는지 확인
   - 로그: `[findHostForChildVNode] 전역 검색 실패`
   - 원인: Strategy 3의 `findChildHost`가 mark wrapper를 찾지 못함
4. `processPrimitiveTextChildren`이 호출되는지 확인
   - 로그: 없음 (디버그 로그 추가 필요)
   - 원인: `fiber.child`가 없을 때만 호출됨
5. `handlePrimitiveTextChild`가 기존 텍스트 노드를 찾는지 확인
   - 로그: 없음 (디버그 로그 추가 필요)
   - 원인: `childIndex` 위치에 텍스트 노드가 없으면 새로 생성

### 2단계: 단위 테스트로 개별 함수 검증

```bash
# 각 함수별 테스트 실행
pnpm test:run test/core/fiber-find-host-mark-wrapper.test.ts
pnpm test:run test/core/fiber-process-primitive-text-mark-wrapper.test.ts
pnpm test:run test/core/fiber-create-fiber-tree-mark-wrapper.test.ts
```

**확인 사항:**
1. 각 함수가 예상대로 동작하는지 확인
   - ✅ `findHostForChildVNode`: Strategy 2, 3 모두 통과
   - ✅ `processPrimitiveTextChildren`: 텍스트 업데이트 통과
   - ✅ `createFiberTree`: `prevVNode` 설정 통과
2. 엣지 케이스 (prevVNode가 없는 경우) 처리 확인
   - ⚠️ `prevVNode`가 없을 때 `findChildHost`가 mark wrapper를 찾는지 확인 필요
   - ⚠️ `prevVNode`가 없을 때 `handlePrimitiveTextChild`가 기존 텍스트 노드를 찾는지 확인 필요

### 3단계: 수정 및 검증

**수정 순서:**

#### 3-1. `handlePrimitiveTextChild` 수정 (텍스트 중복 문제)

**문제:**
- `childIndex` 위치에 텍스트 노드가 없으면 새로 생성
- 기존 텍스트 노드를 찾지 못하면 중복 생성

**수정 방안:**
```typescript
// packages/renderer-dom/src/reconcile/utils/text-node-handlers.ts
export function handlePrimitiveTextChild(
  parent: HTMLElement,
  child: string | number,
  childIndex?: number
): Text {
  const doc = parent.ownerDocument || document;
  const expectedText = String(child);
  
  if (childIndex !== undefined) {
    const childNodes = Array.from(parent.childNodes);
    let textNodeToUse: Text | null = null;
    
    // childIndex 위치에 text node가 있는지 확인
    if (childIndex < childNodes.length) {
      const nodeAtIndex = childNodes[childIndex];
      if (nodeAtIndex && nodeAtIndex.nodeType === Node.TEXT_NODE) {
        textNodeToUse = nodeAtIndex as Text;
      }
    }
    
    // IMPORTANT: childIndex 위치에 텍스트 노드가 없으면, 
    // 모든 텍스트 노드를 확인하여 재사용 가능한 것 찾기
    if (!textNodeToUse) {
      for (const node of childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          textNodeToUse = node as Text;
          break; // 첫 번째 텍스트 노드 재사용
        }
      }
    }
    
    // ... 나머지 로직
  }
}
```

**테스트:**
```bash
pnpm test:run test/core/fiber-process-primitive-text-mark-wrapper.test.ts
```

#### 3-2. `findChildHost` 수정 (mark wrapper 찾기 문제)

**문제:**
- `childIndex` 위치의 요소만 확인
- 인덱스가 맞지 않으면 찾지 못함

**수정 방안:**
```typescript
// packages/renderer-dom/src/reconcile/utils/dom-utils.ts
export function findChildHost(
  parent: HTMLElement,
  vnode: VNode,
  childIndex?: number,
  usedDomElements?: Set<HTMLElement>
): HTMLElement | null {
  // ... 기존 로직 ...
  
  // Fallback: sid가 없는 경우 (예: mark wrapper span)
  if (childIndex !== undefined && vnode.tag && !vnode.decoratorSid) {
    const children = Array.from(parent.children);
    
    // IMPORTANT: childIndex 위치의 요소를 먼저 확인
    if (childIndex < children.length) {
      const candidate = children[childIndex] as HTMLElement;
      if (candidate && candidate.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
        const hasSid = candidate.hasAttribute('data-bc-sid') || candidate.hasAttribute('data-decorator-sid');
        if (!hasSid) {
          if (vnode.attrs?.class || vnode.attrs?.className) {
            const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
            const candidateClasses = candidate.className ? candidate.className.split(/\s+/).filter(Boolean) : [];
            const classesMatch = vnodeClasses.every(cls => candidateClasses.includes(cls));
            if (classesMatch) {
              if (!usedDomElements || !usedDomElements.has(candidate)) {
                return candidate;
              }
            }
          } else {
            if (!usedDomElements || !usedDomElements.has(candidate)) {
              return candidate;
            }
          }
        }
      }
    }
    
    // IMPORTANT: childIndex 위치에서 찾지 못하면, 모든 자식 요소를 순회
    for (const candidate of children) {
      if (usedDomElements && usedDomElements.has(candidate as HTMLElement)) {
        continue;
      }
      if (candidate.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
        const hasSid = candidate.hasAttribute('data-bc-sid') || candidate.hasAttribute('data-decorator-sid');
        if (!hasSid) {
          if (vnode.attrs?.class || vnode.attrs?.className) {
            const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
            const candidateClasses = candidate.className ? candidate.className.split(/\s+/).filter(Boolean) : [];
            const classesMatch = vnodeClasses.every(cls => candidateClasses.includes(cls));
            if (classesMatch) {
              return candidate as HTMLElement;
            }
          } else {
            return candidate as HTMLElement;
          }
        }
      }
    }
  }
  
  return null;
}
```

**테스트:**
```bash
pnpm test:run test/core/fiber-find-host-mark-wrapper.test.ts
```

#### 3-3. `createFiberTree` 수정 (prevChildVNode 찾기 문제)

**문제:**
- 인덱스 매칭만 시도
- 인덱스가 맞지 않으면 `prevChildVNode`를 찾지 못함

**수정 방안:**
```typescript
// packages/renderer-dom/src/reconcile/fiber/fiber-tree.ts
// prevChildVNode 찾기: sid로 매칭 (인덱스 매칭보다 더 정확)
let prevChildVNode: VNode | undefined;
const childId = childVNode.sid || childVNode.decoratorSid;
if (childId && prevVNode?.children) {
  prevChildVNode = prevVNode.children.find(
    (c): c is VNode => {
      if (typeof c !== 'object' || c === null) return false;
      const prevId = c.sid || c.decoratorSid;
      return prevId === childId;
    }
  );
}
// Fallback: 인덱스로 매칭
if (!prevChildVNode) {
  prevChildVNode = prevVNode?.children?.[i] as VNode | undefined;
}
// IMPORTANT: 인덱스 매칭도 실패하면, 태그와 클래스로 매칭 시도
if (!prevChildVNode && prevVNode?.children && childVNode.tag && !childVNode.decoratorSid) {
  prevChildVNode = prevVNode.children.find(
    (c): c is VNode => {
      if (typeof c !== 'object' || c === null) return false;
      if (c.tag !== childVNode.tag) return false;
      if (c.decoratorSid) return false; // decorator VNode는 제외
      // 클래스 매칭
      if (childVNode.attrs?.class || childVNode.attrs?.className) {
        const vnodeClasses = normalizeClasses(childVNode.attrs.class || childVNode.attrs.className);
        const prevClasses = normalizeClasses(c.attrs?.class || c.attrs?.className);
        return vnodeClasses.every(cls => prevClasses.includes(cls));
      }
      return true; // 클래스가 없으면 태그만으로 매칭
    }
  );
}
```

**테스트:**
```bash
pnpm test:run test/core/fiber-create-fiber-tree-mark-wrapper.test.ts
```

**각 수정 후 통합 테스트:**
```bash
pnpm test:run test/core/reconciler-mark-wrapper-reuse.test.ts
```

### 4단계: 전체 테스트 실행

```bash
# 모든 reconcile 관련 테스트 실행
pnpm test:run test/core/*reconcile*.test.ts

# 모든 fiber 관련 테스트 실행
pnpm test:run test/core/fiber-*.test.ts
```

## 디버깅 팁

### 로그 활성화

테스트 환경에서 디버그 로그를 활성화하려면:

```typescript
// test 파일에서
(globalThis as any).__DEBUG_RECONCILE__ = true;
```

### 주요 로그 포인트

1. `[reconcileFiberNode] prevVNode 정보` - prevVNode 상태 확인
   - `prevVNodeExists: false` → `prevVNode`가 없음
   - `prevChildVNodesCount: 0` → `prevChildVNodes`가 비어있음
2. `[findHostForChildVNode] prevChildVNode를 찾지 못함` - Strategy 1, 2 실패
3. `[findHostForChildVNode] 전역 검색 실패` - Strategy 3 실패
4. `[processPrimitiveTextChildren]` - 텍스트 처리 확인 (로그 추가 필요)

### 디버그 로그 추가

`processPrimitiveTextChildren`에 로그 추가:

```typescript
// packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts
export function processPrimitiveTextChildren(
  fiber: FiberNode,
  deps: FiberReconcileDependencies
): void {
  if (!fiber.primitiveTextChildren || fiber.primitiveTextChildren.length === 0) {
    return;
  }
  
  const host = fiber.domElement;
  if (!host) {
    return;
  }
  
  if (process.env.NODE_ENV === 'test' || (globalThis as any).__DEBUG_RECONCILE__) {
    console.log('[processPrimitiveTextChildren]', {
      hostTag: host.tagName,
      hostClasses: host.className,
      primitiveTextChildren: fiber.primitiveTextChildren,
      existingTextNodes: Array.from(host.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => (n as Text).textContent)
    });
  }
  
  // ... 나머지 로직
}
```

`handlePrimitiveTextChild`에 로그 추가:

```typescript
// packages/renderer-dom/src/reconcile/utils/text-node-handlers.ts
export function handlePrimitiveTextChild(
  parent: HTMLElement,
  child: string | number,
  childIndex?: number
): Text {
  const expectedText = String(child);
  
  if (process.env.NODE_ENV === 'test' || (globalThis as any).__DEBUG_RECONCILE__) {
    console.log('[handlePrimitiveTextChild]', {
      expectedText,
      childIndex,
      parentTag: parent.tagName,
      parentClasses: parent.className,
      existingTextNodes: Array.from(parent.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => ({
        text: (n as Text).textContent,
        index: Array.from(parent.childNodes).indexOf(n)
      }))
    });
  }
  
  // ... 나머지 로직
}
```

### DOM 구조 확인

테스트 중간에 DOM 구조를 확인하려면:

```typescript
console.log('DOM 구조:', container.innerHTML);
console.log('Mark wrapper:', container.querySelector('span.mark-bold'));
console.log('Text nodes:', Array.from(container.querySelectorAll('*')).map(el => ({
  tag: el.tagName,
  classes: el.className,
  textContent: el.textContent,
  childNodes: Array.from(el.childNodes).map(n => ({
    type: n.nodeType === Node.TEXT_NODE ? 'TEXT' : 'ELEMENT',
    text: n.nodeType === Node.TEXT_NODE ? (n as Text).textContent : (n as Element).tagName
  }))
})));
```

## 예상 결과

### 성공 시나리오

1. 초기 렌더링: `<span class="mark-bold">Hello</span>` 생성
2. 업데이트: 
   - `findHostForChildVNode`가 기존 mark wrapper 찾기
   - `processPrimitiveTextChildren`이 기존 텍스트 노드 업데이트
   - 결과: `<span class="mark-bold">Hello World</span>` (같은 DOM 요소)

### 실패 시나리오 (현재)

1. 초기 렌더링: `<span class="mark-bold">Hello</span>` 생성
2. 업데이트:
   - `findHostForChildVNode`가 기존 mark wrapper를 찾지 못함
   - 새 mark wrapper 생성 또는 기존 것 제거
   - `processPrimitiveTextChildren`이 새 텍스트 노드 추가
   - 결과: `null` 또는 `'HelloHello World'`

