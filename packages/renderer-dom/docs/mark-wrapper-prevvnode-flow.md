# Mark Wrapper prevVNode 흐름 분석

## 문제 상황

### 현재 구조

1. **첫 번째 렌더링:**
   ```
   Model: { sid: 'text-1', text: 'Hello', marks: [...] }
   ↓
   VNode: { sid: 'text-1', children: [markWrapperVNode] }
   ↓
   DOM: <span data-bc-sid="text-1"><span class="mark-bold">Hello</span></span>
   ↓
   prevVNodeTree.set('text-1', clonedVNode)
   ```

2. **두 번째 렌더링:**
   ```
   Model: { sid: 'text-1', text: 'Hello World', marks: [...] }
   ↓
   VNode: { sid: 'text-1', children: [markWrapperVNode] }
   ↓
   prevVNode = prevVNodeTree.get('text-1') // ✅ 찾음
   ↓
   createFiberTree(text-1 VNode, prevVNode)
   ↓
   markWrapper Fiber 생성 시:
   - prevChildVNode = prevVNode.children[0] // ❓ 찾을 수 있나?
   ```

### 핵심 문제

**질문:** `prevVNode.children`에 mark wrapper가 포함되어 있는가?

**답변:** 
- `cloneVNodeTree`는 children을 재귀적으로 복사하므로 포함되어야 함
- 하지만 `prevVNode.children`이 실제로 mark wrapper를 포함하는지 확인 필요

## 실제 흐름 확인

### 1. prevVNode 저장 시점

```typescript
// packages/renderer-dom/src/reconcile/reconciler.ts:133-135
if (sid) {
  const cloned = cloneVNodeTree(rootVNode);
  this.prevVNodeTree.set(String(sid), cloned);
}
```

**확인 사항:**
- `rootVNode.children`에 mark wrapper가 있는가?
- `cloneVNodeTree`가 children을 올바르게 복사하는가?

### 2. prevVNode 조회 시점

```typescript
// packages/renderer-dom/src/reconcile/reconciler.ts:57
const prevVNode = this.prevVNodeTree.get(String(sid));
```

**확인 사항:**
- `prevVNode`가 올바르게 조회되는가?
- `prevVNode.children`에 mark wrapper가 있는가?

### 3. createFiberTree에서 prevChildVNode 찾기

```typescript
// packages/renderer-dom/src/reconcile/fiber/fiber-tree.ts:64-98
// prevChildVNode 찾기: sid로 매칭 → 인덱스로 매칭 → 태그와 클래스로 매칭
```

**확인 사항:**
- `prevVNode.children`에 mark wrapper가 있는가?
- 태그와 클래스 매칭이 작동하는가?

## 디버깅 방법

### 로그 추가

```typescript
// packages/renderer-dom/src/reconcile/reconciler.ts
console.log('[reconciler.reconcile] prevVNode 저장:', {
  sid,
  rootVNodeChildrenCount: rootVNode.children?.length || 0,
  rootVNodeChildren: rootVNode.children?.map((c: any) => ({
    tag: c.tag,
    class: c.attrs?.class,
    sid: c.sid,
    decoratorSid: c.decoratorSid
  })),
  clonedChildrenCount: cloned.children?.length || 0,
  clonedChildren: cloned.children?.map((c: any) => ({
    tag: c.tag,
    class: c.attrs?.class,
    sid: c.sid,
    decoratorSid: c.decoratorSid
  }))
});
```

```typescript
// packages/renderer-dom/src/reconcile/fiber/fiber-tree.ts
console.log('[createFiberTree] prevChildVNode 찾기:', {
  childIndex: i,
  childVNodeTag: childVNode.tag,
  childVNodeClass: childVNode.attrs?.class,
  prevVNodeExists: !!prevVNode,
  prevVNodeChildrenCount: prevVNode?.children?.length || 0,
  prevVNodeChildren: prevVNode?.children?.map((c: any) => ({
    tag: c.tag,
    class: c.attrs?.class,
    sid: c.sid,
    decoratorSid: c.decoratorSid
  })),
  prevChildVNodeFound: !!prevChildVNode,
  prevChildVNodeTag: prevChildVNode?.tag,
  prevChildVNodeClass: prevChildVNode?.attrs?.class
});
```

## 예상 시나리오

### 시나리오 1: prevVNode.children에 mark wrapper가 있는 경우

1. 첫 번째 렌더링:
   - `rootVNode.children = [markWrapperVNode]`
   - `cloned.children = [markWrapperVNode]` ✅
   - `prevVNodeTree.set('text-1', cloned)`

2. 두 번째 렌더링:
   - `prevVNode = prevVNodeTree.get('text-1')` ✅
   - `prevVNode.children = [markWrapperVNode]` ✅
   - `createFiberTree`에서 `prevChildVNode = prevVNode.children[0]` ✅
   - `fiber.prevVNode = markWrapperVNode` ✅
   - `reconcileFiberNode`에서 `prevVNode` 사용 가능 ✅

**결과:** 정상 작동해야 함

### 시나리오 2: prevVNode.children에 mark wrapper가 없는 경우

1. 첫 번째 렌더링:
   - `rootVNode.children = [markWrapperVNode]`
   - 하지만 `cloneVNodeTree` 시점에 `rootVNode.children`이 이미 변경됨?
   - 또는 `cloneVNodeTree`가 children을 올바르게 복사하지 않음?

2. 두 번째 렌더링:
   - `prevVNode.children = []` 또는 다른 구조
   - `createFiberTree`에서 `prevChildVNode`를 찾지 못함
   - `fiber.prevVNode = undefined`
   - `reconcileFiberNode`에서 `prevVNode` 없음

**결과:** 문제 발생

## 해결 방안

### 방안 1: cloneVNodeTree 시점 확인

`cloneVNodeTree`가 호출되는 시점에 `rootVNode.children`이 올바른지 확인

### 방안 2: prevVNode.children 구조 확인

`prevVNode.children`에 실제로 mark wrapper가 포함되어 있는지 로그로 확인

### 방안 3: createFiberTree 로직 개선

이미 완료:
- 태그와 클래스로 매칭 시도 ✅
- 인덱스 매칭 실패 시에도 찾을 수 있도록 ✅

추가 필요:
- `prevVNode.children`이 비어있을 때의 처리
- `prevVNode.children` 구조가 예상과 다를 때의 처리

