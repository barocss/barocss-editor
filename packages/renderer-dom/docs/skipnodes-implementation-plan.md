# skipNodes 구현 계획

## 목표

사용자 입력 중인 노드를 reconcile에서 제외하여 외부 변경(AI, 동시편집)으로부터 보호

---

## 핵심 개념

### 1. 입력 중인 노드 추적 (Editing Nodes Tracking)

**개념:**
- Selection 기반으로 현재 편집 중인 노드의 `sid` 추출
- `editingNodes: Set<string>`으로 관리
- 입력 시작/종료 시점에 추가/제거

**시점:**
- **입력 시작**: `beforeinput`, `input` 이벤트 발생 시
- **입력 종료**: `compositionend`, `blur`, 일정 시간 후 (debounce)

### 2. skipNodes 전달 경로

```
EditorViewDOM
  └─ editingNodes: Set<string> (입력 중인 노드 sid 목록)
      └─ DOMRenderer.render()
          └─ Reconciler.reconcile(skipNodes)
              └─ reconcileWithFiber(skipNodes)
                  └─ renderFiberNode(skipNodes 체크)
                  └─ commitFiberNode(skipNodes 체크)
```

### 3. skipNodes 처리 규칙

**skipNodes에 포함된 노드:**
- ✅ `renderFiberNode`에서 스킵 (effectTag 설정 안 함)
- ✅ `commitFiberNode`에서 스킵 (DOM 업데이트 안 함)
- ✅ 이전 VNode와 DOM을 그대로 유지
- ✅ 자식 노드는 reconcile 가능 (입력 중인 노드만 보호)

---

## 수정 위치

### 1. EditorViewDOM (입력 중인 노드 추적)

**파일:** `packages/editor-view-dom/src/editor-view-dom.ts`

**추가할 내용:**
```typescript
export class EditorViewDOM {
  // 입력 중인 노드 추적
  private editingNodes: Set<string> = new Set();
  
  /**
   * Selection 기반으로 현재 편집 중인 노드의 sid 추출
   */
  private getEditingNodeSids(): Set<string> {
    const sids = new Set<string>();
    const selection = window.getSelection();
    
    if (!selection || selection.rangeCount === 0) {
      return sids;
    }
    
    const range = selection.getRangeAt(0);
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    
    // anchor/focus 노드에서 sid 추출
    const getSidFromNode = (node: Node): string | null => {
      let el: Element | null = null;
      if (node.nodeType === Node.TEXT_NODE) {
        el = node.parentElement;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        el = node as Element;
      }
      
      if (!el) return null;
      
      const foundEl = el.closest('[data-bc-sid]');
      return foundEl?.getAttribute('data-bc-sid') || null;
    };
    
    const startSid = getSidFromNode(startNode);
    const endSid = getSidFromNode(endNode);
    
    if (startSid) sids.add(startSid);
    if (endSid) sids.add(endSid);
    
    return sids;
  }
  
  /**
   * 입력 시작 시점에 호출
   */
  private onInputStart(): void {
    const sids = this.getEditingNodeSids();
    sids.forEach(sid => this.editingNodes.add(sid));
  }
  
  /**
   * 입력 종료 시점에 호출
   */
  private onInputEnd(): void {
    // debounce 후 제거 (입력 완료 후 일정 시간 대기)
    setTimeout(() => {
      this.editingNodes.clear();
    }, 500);
  }
}
```

**연결 지점:**
- `InputHandler`의 `handleInput` 이벤트에서 `onInputStart()` 호출
- `InputHandler`의 `compositionend` 이벤트에서 `onInputEnd()` 호출

---

### 2. DOMRenderer (skipNodes 전달)

**파일:** `packages/renderer-dom/src/dom-renderer.ts`

**수정할 내용:**
```typescript
export class DOMRenderer {
  render(
    container: HTMLElement,
    vnode: VNode,
    model: ModelData,
    options?: {
      skipNodes?: Set<string>  // 입력 중인 노드 목록
    }
  ): void {
    // ...
    this.reconciler.reconcile(
      container,
      vnode,
      model,
      runtime,
      decorators,
      options?.skipNodes  // skipNodes 전달
    );
  }
}
```

---

### 3. Reconciler (skipNodes 옵션 추가)

**파일:** `packages/renderer-dom/src/reconcile/reconciler.ts`

**수정할 내용:**
```typescript
export class Reconciler {
  reconcile(
    container: HTMLElement,
    vnode: VNode,
    model: ModelData,
    runtime?: RuntimeCtx,
    decorators?: any[],
    skipNodes?: Set<string>  // 입력 중인 노드 목록
  ): void {
    const sid = vnode.sid || String(model?.sid || '');
    
    // skipNodes에 포함된 노드는 reconcile 스킵
    if (skipNodes?.has(sid)) {
      // 이전 VNode와 DOM 유지
      // 자식 노드는 reconcile 가능
      this.reconcileChildrenOnly(container, vnode, model, runtime, decorators, skipNodes);
      return;
    }
    
    // 일반 reconcile 수행
    // ...
    reconcileWithFiber(
      container,
      rootVNode,
      prevVNode,
      context,
      {
        dom: this.dom,
        components: this.components,
        currentVisitedPortalIds: this.currentVisitedPortalIds,
        portalHostsById: this.portalHostsById,
        skipNodes: skipNodes  // skipNodes 전달
      },
      onComplete
    );
  }
  
  /**
   * 자식 노드만 reconcile (부모는 스킵)
   */
  private reconcileChildrenOnly(
    container: HTMLElement,
    vnode: VNode,
    model: ModelData,
    runtime?: RuntimeCtx,
    decorators?: any[],
    skipNodes?: Set<string>
  ): void {
    const parentDom = vnode.meta?.domElement as HTMLElement || container;
    
    // 자식 노드들은 일반 reconcile
    // 단, skipNodes에 포함된 자식은 스킵
    for (const child of vnode.children || []) {
      if (typeof child === 'object' && child !== null) {
        const childVNode = child as VNode;
        const childSid = childVNode.sid || '';
        
        if (skipNodes?.has(childSid)) {
          // 입력 중인 자식도 스킵
          continue;
        }
        
        // 일반 reconcile (자식은 업데이트)
        this.reconcile(parentDom, childVNode, model, runtime, decorators, skipNodes);
      }
    }
  }
}
```

---

### 4. FiberReconcileDependencies (skipNodes 추가)

**파일:** `packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts`

**수정할 내용:**
```typescript
export interface FiberReconcileDependencies {
  dom: DOMOperations;
  components: ComponentManager;
  currentVisitedPortalIds: Set<string> | null;
  portalHostsById: Map<string, { target: HTMLElement; host: HTMLElement }>;
  skipNodes?: Set<string>;  // 입력 중인 노드 목록
}
```

---

### 5. renderFiberNode (skipNodes 체크)

**파일:** `packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts`

**수정할 내용:**
```typescript
export function renderFiberNode(
  fiber: FiberNode,
  deps: FiberReconcileDependencies,
  context: any
): void {
  const { dom, components, currentVisitedPortalIds, portalHostsById, skipNodes } = deps;
  const vnode = fiber.vnode;
  const prevVNode = fiber.prevVNode;
  
  // skipNodes에 포함된 노드는 render 스킵
  const sid = getVNodeId(vnode);
  if (sid && skipNodes?.has(sid)) {
    // 이전 VNode와 DOM 유지
    // effectTag 설정 안 함
    // 자식 노드는 계속 처리 (입력 중인 노드만 보호)
    return;
  }
  
  // 일반 render 로직 계속...
}
```

**주의사항:**
- `return`으로 스킵하면 자식 노드도 처리 안 됨
- 자식 노드는 계속 처리해야 하므로, 자식 Fiber는 별도로 처리 필요

**수정된 로직:**
```typescript
export function renderFiberNode(
  fiber: FiberNode,
  deps: FiberReconcileDependencies,
  context: any
): void {
  const { dom, components, currentVisitedPortalIds, portalHostsById, skipNodes } = deps;
  const vnode = fiber.vnode;
  const prevVNode = fiber.prevVNode;
  
  // skipNodes에 포함된 노드는 render 스킵
  const sid = getVNodeId(vnode);
  if (sid && skipNodes?.has(sid)) {
    // 이전 VNode와 DOM 유지
    // effectTag 설정 안 함
    // 하지만 자식 노드는 계속 처리해야 함
    // (자식 Fiber는 별도로 처리)
    
    // 자식 Fiber는 계속 처리 (입력 중인 노드만 보호)
    // fiber.child는 scheduler가 처리하므로 여기서는 스킵만
    return;
  }
  
  // 일반 render 로직 계속...
}
```

---

### 6. commitFiberNode (skipNodes 체크)

**파일:** `packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts`

**수정할 내용:**
```typescript
export function commitFiberNode(
  fiber: FiberNode,
  deps: FiberReconcileDependencies,
  context: any
): void {
  const { dom, components, skipNodes } = deps;
  const vnode = fiber.vnode;
  
  // skipNodes에 포함된 노드는 commit 스킵
  const sid = getVNodeId(vnode);
  if (sid && skipNodes?.has(sid)) {
    // DOM 업데이트 안 함
    // 이전 DOM 유지
    // 자식 노드는 계속 처리
    return;
  }
  
  // 일반 commit 로직 계속...
}
```

---

## 구현 순서

### Phase 1: 기본 구조 추가
1. ✅ `FiberReconcileDependencies`에 `skipNodes` 추가
2. ✅ `Reconciler.reconcile()`에 `skipNodes` 옵션 추가
3. ✅ `DOMRenderer.render()`에 `skipNodes` 옵션 추가

### Phase 2: Fiber reconciler 수정
4. ✅ `renderFiberNode`에서 `skipNodes` 체크
5. ✅ `commitFiberNode`에서 `skipNodes` 체크
6. ✅ 자식 노드 처리 로직 확인

### Phase 3: EditorViewDOM 연동
7. ✅ `EditorViewDOM`에 `editingNodes` Set 추가
8. ✅ Selection 기반 sid 추출 로직 추가
9. ✅ 입력 시작/종료 시점 추적
10. ✅ `DOMRenderer.render()` 호출 시 `skipNodes` 전달

### Phase 4: 테스트
11. ✅ 단위 테스트 작성
12. ✅ 통합 테스트 작성
13. ✅ 실제 사용 시나리오 테스트

---

## Selection 기반 sid 추출 상세

### 현재 코드 활용

**기존 코드:**
- `InputHandler.resolveModelTextNodeId()`: 텍스트 노드에서 sid 추출
- `EditorViewDOM._convertDOMSelectionToModel()`: Selection에서 sid 추출

**활용 방법:**
```typescript
/**
 * Selection 기반으로 현재 편집 중인 노드의 sid 추출
 */
private getEditingNodeSids(): Set<string> {
  const sids = new Set<string>();
  const selection = window.getSelection();
  
  if (!selection || selection.rangeCount === 0) {
    return sids;
  }
  
  const range = selection.getRangeAt(0);
  
  // anchor/focus 노드에서 sid 추출
  const getSidFromNode = (node: Node): string | null => {
    let el: Element | null = null;
    if (node.nodeType === Node.TEXT_NODE) {
      el = node.parentElement;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      el = node as Element;
    }
    
    if (!el) return null;
    
    const foundEl = el.closest('[data-bc-sid]');
    return foundEl?.getAttribute('data-bc-sid') || null;
  };
  
  const startSid = getSidFromNode(range.startContainer);
  const endSid = getSidFromNode(range.endContainer);
  
  if (startSid) sids.add(startSid);
  if (endSid && endSid !== startSid) sids.add(endSid);
  
  return sids;
}
```

---

## 주의사항

### 1. 자식 노드 처리

**문제:**
- `renderFiberNode`에서 `return`하면 자식 Fiber도 처리 안 됨
- 하지만 자식 노드는 업데이트 가능해야 함

**해결:**
- `renderFiberNode`에서 스킵하더라도 자식 Fiber는 scheduler가 계속 처리
- 자식 Fiber의 `renderFiberNode`에서도 각각 `skipNodes` 체크
- 결과적으로 입력 중인 노드만 스킵, 자식은 업데이트 가능

### 2. 입력 종료 시점

**문제:**
- 언제 입력이 종료되었는지 판단 어려움
- `blur` 이벤트만으로는 부족

**해결:**
- `compositionend` + `input` 이벤트 debounce
- 일정 시간(500ms) 후 자동 제거
- `blur` 이벤트에서 즉시 제거

### 3. 다중 노드 입력

**문제:**
- Selection이 여러 노드에 걸쳐 있을 수 있음
- 모든 노드를 보호해야 함

**해결:**
- `Set<string>`으로 여러 sid 관리
- anchor/focus 노드 모두 추출하여 추가

---

## 테스트 시나리오

### 시나리오 1: 단일 노드 입력 보호
1. 노드 A에 입력 시작
2. AI가 노드 A 변경 시도
3. 노드 A는 reconcile 스킵 (입력 보호)
4. 자식 노드는 업데이트 가능

### 시나리오 2: 다중 노드 입력 보호
1. 노드 A, B에 걸쳐 Selection
2. AI가 노드 A, B 변경 시도
3. 노드 A, B 모두 reconcile 스킵
4. 다른 노드는 업데이트 가능

### 시나리오 3: 입력 종료 후 동기화
1. 노드 A에 입력 중
2. AI가 노드 A 변경 (pending에 저장)
3. 입력 종료 (500ms 후)
4. pending 변경 적용

---

## 다음 단계

1. **구현 시작**: Phase 1부터 순차적으로 구현
2. **테스트**: 각 Phase마다 테스트 작성
3. **통합**: EditorViewDOM과 연동
4. **최적화**: 성능 및 사용자 경험 개선

