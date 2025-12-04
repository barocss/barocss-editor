# Reconcile Flow 분석

## 현재 문제
- VNode 구조가 동일한데 DOM이 계속 바뀐다
- 테스트는 통과하는데 브라우저에서는 실패한다

## Reconcile 단계별 분석

### 1. createFiberTree (Fiber 트리 생성)

**입력:**
- `vnode`: 현재 VNode
- `prevVNode`: 이전 VNode (deprecated, alternate 사용)
- `alternateFiber`: 이전 Fiber (React 방식)

**처리:**
1. `alternateFiber?.vnode`에서 `prevVNode` 가져오기
2. 자식 VNode를 순회하면서:
   - `alternate.child`에서 매칭되는 이전 자식 Fiber 찾기
   - 매칭 우선순위:
     1. sid/key로 매칭
     2. index로 매칭 (같은 index, 같은 tag)
     3. tag로만 매칭 (ID가 없는 경우, 이미 매칭된 alternate 제외)
3. 매칭된 `prevChildAlternate`를 `alternate`로 전달하여 자식 Fiber 생성

**출력:**
- Fiber 트리 (각 Fiber에 `alternate` 설정)

**문제점:**
- `alternate`가 제대로 전달되지 않으면 `prevVNode`가 없음
- tag로만 매칭할 때 여러 개의 같은 tag가 있으면 첫 번째 것만 매칭됨

### 2. renderFiberNode (Render Phase)

**입력:**
- `fiber`: 현재 Fiber
- `fiber.alternate`: 이전 Fiber

**처리:**
1. `fiber.alternate?.vnode`에서 `prevVNode` 가져오기
2. `prevVNode?.meta?.domElement` 재사용 (타입이 같을 때만)
3. 재사용 실패 시 새 DOM 요소 생성
4. `vnode.meta.domElement`에 저장

**출력:**
- `fiber.domElement` 설정
- `vnode.meta.domElement` 설정

**문제점:**
- `prevVNode`가 없으면 항상 새로 생성됨
- 새로 생성되면 속성이 제대로 설정되지 않을 수 있음

### 3. commitFiberNode (Commit Phase)

**입력:**
- `fiber`: 현재 Fiber
- `fiber.alternate`: 이전 Fiber

**처리:**
1. `fiber.alternate?.vnode`에서 `prevVNode` 가져오기
2. `effectTag`에 따라 DOM 조작:
   - `PLACEMENT`: 새 DOM 삽입
   - `UPDATE`: 속성/스타일 업데이트
   - `DELETION`: DOM 제거
3. `updateAttributes(domElement, prevVNode?.attrs, vnode.attrs)`
4. `updateStyles(domElement, prevVNode?.style, vnode.style)`

**출력:**
- DOM 업데이트 완료

**문제점:**
- `prevVNode?.attrs`가 없으면 기존 속성을 제거할 수 있음
- `updateAttributes`가 `prevAttrs`가 없을 때 모든 속성을 제거하고 새로 설정

## 핵심 문제

### 1. alternate 전달 문제
- `rootFiber`가 제대로 저장되지 않을 수 있음
- `createFiberTree`에서 `alternate`가 제대로 전달되지 않을 수 있음

### 2. prevVNode 로드 문제
- `alternate`가 없으면 `prevVNode`가 없음
- `prevVNode`가 없으면 `prevVNode?.meta?.domElement`도 없음
- 결과: 항상 새로 생성됨

### 3. 속성 업데이트 문제 (가장 심각)
**현재 동작:**
```typescript
// renderFiberNode에서 prevVNode?.meta?.domElement 재사용
if (prevVNode?.meta?.domElement && !typeChanged) {
  domElement = prevVNode.meta.domElement; // 재사용
} else {
  // 새로 생성
  domElement = dom.createSimpleElement(String(vnode.tag));
  // vnode.attrs만 설정
  if (vnode.attrs) {
    for (const [key, value] of Object.entries(vnode.attrs)) {
      dom.setAttribute(domElement, key, String(value));
    }
  }
}
```

**문제 시나리오:**
1. 첫 렌더링: `prevVNode` 없음 → 새 DOM 생성, `vnode.attrs` 설정
2. 두 번째 렌더링: `prevVNode`가 `alternate`에서 제대로 로드되지 않음
3. `renderFiberNode`에서 `prevVNode?.meta?.domElement`가 없음 → 새 DOM 생성
4. 새 DOM에 `vnode.attrs`만 설정 (기존 DOM의 속성은 손실)
5. `commitFiberNode`에서 `updateAttributes(domElement, undefined, vnode.attrs)` 호출
6. `prevAttrs`가 `undefined`이므로 제거 로직은 실행되지 않지만, 기존 DOM의 속성은 이미 손실됨

**근본 원인:**
- `renderFiberNode`에서 DOM을 재사용하지 못하면 새로 생성됨
- 새로 생성된 DOM은 `vnode.attrs`만 가지고 있음
- 기존 DOM의 속성(예: `style`, `class`)이 손실됨

## 해결 방안

### 1. alternate 전달 확인
- `rootFiber`가 제대로 저장되는지 확인
- `createFiberTree`에서 `alternate`가 제대로 전달되는지 확인

### 2. prevVNode 로드 확인
- `renderFiberNode`에서 `fiber.alternate?.vnode`가 제대로 로드되는지 확인
- `commitFiberNode`에서도 동일하게 확인

### 3. 속성 업데이트 개선 (수정 완료)
**문제:**
- `prevVNode?.attrs`가 없을 때 `updateAttributes`가 기존 DOM의 속성을 보존하지 않음
- `renderFiberNode`에서 DOM을 재사용할 때 기존 속성이 손실될 수 있음

**해결:**
- `updateAttributes`에서 `prevAttrs`가 없을 때 기존 DOM의 속성을 읽어서 보존
- `class`, `style`, `data-*` 속성들을 읽어서 `actualPrevAttrs`로 사용

**수정된 코드:**
```typescript
public updateAttributes(
  element: HTMLElement, 
  prevAttrs: Record<string, any> | undefined,
  nextAttrs: Record<string, any>
): void {
  // IMPORTANT: prevAttrs가 없으면 기존 DOM의 속성을 읽어서 보존
  let actualPrevAttrs = prevAttrs;
  if (!actualPrevAttrs) {
    actualPrevAttrs = {};
    
    // class/className
    const existingClass = element.getAttribute('class');
    if (existingClass) {
      actualPrevAttrs['class'] = existingClass;
      actualPrevAttrs['className'] = existingClass;
    }
    
    // style
    const existingStyle = element.getAttribute('style');
    if (existingStyle) {
      actualPrevAttrs['style'] = existingStyle;
    }
    
    // data-* 속성들
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      if (attr.name.startsWith('data-')) {
        actualPrevAttrs[attr.name] = attr.value;
      }
    }
  }
  
  // ... 나머지 로직은 동일
}
```

**효과:**
- `renderFiberNode`에서 DOM을 재사용할 때 기존 속성이 보존됨
- `commitFiberNode`에서 `updateAttributes`를 호출할 때 기존 속성이 보존됨
- mark wrapper의 `style`, `class` 속성이 손실되지 않음

