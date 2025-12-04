# 텍스트 렌더링 아키텍처

## 개요

이 문서는 renderer-dom의 텍스트 렌더링 아키텍처를 설명합니다. 텍스트는 두 가지 경로로 처리되며, 각각의 목적과 사용 사례가 다릅니다.

## 핵심 원칙

### 1. `data('text')` 처리: 항상 children에 유지

**원칙**: `data('text')`가 직접 처리된 경우, 텍스트는 항상 children에 유지되어 mark와 decorator가 적용될 수 있도록 합니다.

**이유**:
- `data('text')`는 모델의 텍스트를 가져오며, mark와 decorator가 적용될 수 있음
- 텍스트가 여러 VNode로 분할될 수 있음 (mark 범위에 따라)
- 텍스트가 collapse되면 mark/decorator 적용 불가

**처리 과정**:
```typescript
// Template: element('span', {}, [data('text')])
// Model: { text: 'Hello', marks: [{ type: 'bold', range: [0, 5] }] }

// VNode 구조
{
  tag: 'span',
  children: [  // ✅ 항상 children에 유지
    {
      tag: 'strong',
      children: [
        {
          tag: 'span',
          children: [
            { text: 'Hello', children: [] }
          ]
        }
      ]
    }
  ]
}
```

### 2. 일반 텍스트: `vnode.text`로 collapse 가능

**원칙**: 일반 텍스트 (문자열 배열, text() 함수)는 단일 텍스트 child인 경우 `vnode.text`로 collapse하여 성능을 최적화합니다.

**이유**:
- mark/decorator가 적용되지 않는 단순 텍스트
- collapse하여 VNode 구조를 단순화
- reconciler에서 `vnode.text`를 직접 처리하여 효율적

**처리 과정**:
```typescript
// Template: element('span', {}, ['Test Component'])
// 또는: element('span', {}, [text('Test Component')])

// VNode 구조 (collapse됨)
{
  tag: 'span',
  text: 'Test Component',  // ✅ vnode.text로 collapse
  children: []
}

// Reconciler에서 처리
if (nextVNode.text !== undefined && (!nextVNode.children || nextVNode.children.length === 0)) {
  parent.appendChild(doc.createTextNode(String(nextVNode.text)));
}
```

## 두 가지 경로의 구분

### 경로 1: `data('text')` 처리

**조건**: `hasDataTextProcessed.value === true`

**특징**:
- 항상 children에 유지
- mark/decorator 처리 가능
- 텍스트가 여러 VNode로 분할될 수 있음
- 항상 `<span>`으로 감싸짐 (mark/decorator 처리 후)

**사용 사례**:
- `inline-text` 모델의 텍스트 렌더링
- 모델의 `text` 속성을 사용하는 모든 경우
- mark나 decorator가 적용될 수 있는 텍스트

### 경로 2: 일반 텍스트

**조건**: `hasDataTextProcessed.value === false` && 단일 텍스트 child

**특징**:
- `vnode.text`로 collapse 가능
- mark/decorator 처리 불가
- reconciler에서 직접 처리
- DOM에 텍스트 노드로 직접 렌더링

**사용 사례**:
- `element('span', {}, ['Test Component'])` - 문자열 배열 직접 사용
- `element('span', {}, [text('Test Component')])` - text() 함수 사용
- `element('span', 'Test Component')` - 문자열 직접 사용 (오버로드)
- 정적 텍스트나 라벨 등

## 아키텍처 결정의 이유

### 왜 두 가지 경로를 사용하는가?

1. **성능 최적화**
   - 단순 텍스트는 collapse하여 VNode 구조 단순화
   - 불필요한 DOM 요소 생성 방지

2. **유연성**
   - `data('text')`는 mark/decorator 처리를 위해 항상 children에 유지
   - 일반 텍스트는 성능을 위해 collapse 가능

3. **일관성**
   - `data('text')`는 항상 동일한 방식으로 처리 (children에 유지)
   - 일반 텍스트는 항상 동일한 방식으로 처리 (collapse 가능)

### 잠재적 문제와 해결

**문제**: 두 가지 경로가 존재하여 복잡해 보일 수 있음

**해결**:
- 명확한 구분: `data('text')` vs 일반 텍스트
- 일관된 처리: 각 경로는 항상 동일한 방식으로 처리
- 문서화: 이 문서로 아키텍처를 명확히 설명

## 구현 세부사항

### VNodeBuilder

**파일**: `packages/renderer-dom/src/vnode/factory.ts`

#### `_buildElement` (line 746-765)

```typescript
// data('text') 처리 여부 확인
if (orderedChildren.length === 1 && 
    !orderedChildren[0].tag && 
    orderedChildren[0].text !== undefined && 
    !hasDataTextProcessed.value) {
  // 일반 텍스트: collapse
  vnode.text = String(orderedChildren[0].text);
  vnode.children = [];
} else if (orderedChildren.length > 0) {
  // data('text') 또는 복잡한 구조: children에 유지
  vnode.children = [...orderedChildren];
}
```

#### `_processChild` (line 1029-1032)

```typescript
// data('text') 처리 시 플래그 설정
if (child.path === 'text' && hasDataTextProcessed) {
  hasDataTextProcessed.value = true;
}
```

### Reconciler

**파일**: `packages/renderer-dom/src/reconcile/reconciler.ts`

#### `reconcileVNodeChildren` (line 423-442)

```typescript
// vnode.text 처리 (collapse된 텍스트)
if (nextVNode.text !== undefined && 
    (!nextVNode.children || nextVNode.children.length === 0)) {
  // 텍스트 노드로 직접 렌더링
  parent.appendChild(doc.createTextNode(String(nextVNode.text)));
  return;
}

// children 처리 (data('text') 또는 복잡한 구조)
// ...
```

## 테스트 커버리지

### 텍스트 렌더링 테스트

**파일**: `packages/renderer-dom/test/core/vnode-builder-text-rendering.test.ts`

다음 시나리오를 검증:
- ✅ `element('span', {}, ['Test Component'])` - 문자열 배열 직접 사용
- ✅ `element('span', {}, [text('Test Component')])` - text() 함수 사용
- ✅ `element('span', 'Test Component')` - 문자열 직접 사용 (오버로드)
- ✅ 혼합 콘텐츠 (텍스트 + 요소)
- ✅ 빈 텍스트 처리

### Mark/Decorator 테스트

**파일**: `packages/renderer-dom/test/core/mark-decorator-complex.test.ts`

다음 시나리오를 검증:
- ✅ `data('text')` 처리 시 mark 적용
- ✅ `data('text')` 처리 시 decorator 적용
- ✅ 복잡한 mark/decorator 조합

## ContentEditable에서의 동작

### 실시간 텍스트 입력 시나리오

contenteditable 상태에서 사용자가 텍스트를 입력할 때:

1. **사용자 입력** → DOM이 직접 변경됨
2. **MutationObserver 감지** → InputHandler 처리
3. **모델 업데이트** → mark/decorator 범위 자동 조정
4. **Renderer 재렌더링** → reconciler.reconcile() 호출
5. **Reconciler 업데이트** → prevVNode와 nextVNode 비교하여 DOM 업데이트

### Reconciler의 효율적 업데이트

**sid 기반 매칭**:
```typescript
// findChildHost: sid로 기존 DOM 요소 찾기
let host = this.findChildHost(parent, childVNode);
if (!host && childVNode.sid) {
  // 전역 검색 (cross-parent move 지원)
  const global = parent.ownerDocument?.querySelector(
    `[data-bc-sid="${childVNode.sid}"]`
  ) as HTMLElement | null;
  if (global) host = global;
}
```

**prevVNode 비교**:
```typescript
// prevVNodeTree에서 이전 상태 가져오기
const prevVNode = sid ? this.prevVNodeTree.get(String(sid)) : undefined;

// 변경된 부분만 업데이트
if (childVNode.attrs) {
  this.dom.updateAttributes(host, prevChildVNode?.attrs, childVNode.attrs);
}
```

### Mark/Decorator 적용 보장

**`data('text')` 처리 경로**:
- 텍스트 입력 시 모델이 업데이트됨
- `data('text')`는 항상 children에 유지되므로 mark/decorator 적용 가능
- VNodeBuilder가 새로운 mark/decorator 구조 생성
- Reconciler가 sid 기반으로 기존 요소를 찾아 업데이트

**예시 시나리오**:
```typescript
// 1. 초기 상태
Model: { text: 'Hello', marks: [{ type: 'bold', range: [0, 5] }] }
DOM: <span><strong><span>Hello</span></strong></span>

// 2. 사용자가 ' World' 입력
DOM (사용자 입력): <span><strong><span>Hello</span></strong> World</span>

// 3. MutationObserver 감지 → 모델 업데이트
Model: { text: 'Hello World', marks: [{ type: 'bold', range: [0, 5] }] }

// 4. Renderer 재렌더링
VNode: {
  tag: 'span',
  children: [
    { tag: 'strong', children: [{ tag: 'span', children: [{ text: 'Hello' }] }] },
    { tag: 'span', children: [{ text: ' World' }] }
  ]
}

// 5. Reconciler 업데이트
// - 기존 <strong> 요소는 sid로 찾아서 유지
// - 새 <span> 요소는 추가
// - DOM 구조가 올바르게 업데이트됨
```

### 성능 고려사항

**장점**:
1. ✅ **sid 기반 매칭**: 기존 DOM 요소를 효율적으로 찾아 재사용
2. ✅ **prevVNode 비교**: 변경된 부분만 업데이트
3. ✅ **일관된 구조**: mark/decorator가 항상 동일한 방식으로 처리

**주의사항**:
1. ⚠️ **전체 VNode 트리 재빌드**: 매번 VNodeBuilder가 전체 트리를 다시 빌드
   - 하지만 mark/decorator 처리는 필수이므로 불가피
2. ⚠️ **DOM 조작 최소화**: reconciler가 기존 요소를 재사용하여 최소한의 DOM 조작
3. ⚠️ **커서 위치 보존**: editor-view-dom에서 별도로 처리 (reconciler 범위 밖)

### Selection 보존 문제 및 해결 방안

**핵심 문제**:
contenteditable에서 사용자가 텍스트를 입력할 때:
1. 사용자 입력 → DOM이 직접 변경됨 (브라우저 selection이 특정 text node를 가리킴)
2. MutationObserver 감지 → 모델 업데이트
3. `editor.executeTransaction()` 호출
4. 이벤트 리스너가 `render()` 호출
5. **Reconciler가 DOM 업데이트 → Text Node가 삭제/재생성 → Selection이 깨짐** ⚠️

**브라우저 Selection의 한계**:
- 브라우저 selection은 DOM 노드에 대한 직접 참조를 유지
- 노드가 삭제되면 selection이 깨짐
- Selection 복원은 불안정하고 브라우저마다 동작이 다를 수 있음
- **따라서 Selection을 복원하는 것보다, Selection이 있는 Text Node를 보존하는 것이 근본적인 해결책**

**ContentEditable의 특성**:
1. **한 번에 하나의 text node만 편집됨**: 키 입력 시 특정 text node만 변경
2. **다른 text node는 바뀌지 않음**: 편집 중이 아닌 text node는 그대로 유지
3. **Mark/Decorator 범위만 조정**: text node 구조는 유지하고 mark/decorator의 range/offset만 업데이트

**해결 방안: Text Node Pool 및 Selection 보호**

#### 1. Text Node Pool 개념

Reconciler가 text node를 재사용하여 selection이 깨지지 않도록 함:

```typescript
// reconciler.ts
private reconcileVNodeChildren(parent: HTMLElement, prevVNode: VNode | undefined, nextVNode: VNode, context?: any, isRecursive: boolean = false): void {
  // 1. Selection이 있는 text node 찾기
  const selection = window.getSelection();
  const activeTextNodes = new Set<Text>();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    // Selection이 가리키는 text node 수집
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      activeTextNodes.add(range.startContainer as Text);
    }
    if (range.endContainer.nodeType === Node.TEXT_NODE && range.endContainer !== range.startContainer) {
      activeTextNodes.add(range.endContainer as Text);
    }
  }
  
  // 2. Text node 재사용 로직
  for (let childIndex = 0; childIndex < childVNodes.length; childIndex++) {
    const child = childVNodes[childIndex];
    
    // Text-only VNode 처리
    if (typeof child === 'object' && child !== null && 
        !(child as VNode).tag && (child as VNode).text !== undefined) {
      const childVNode = child as VNode;
      const childNodes = Array.from(parent.childNodes);
      
      // 기존 text node 찾기 (위치 기반 또는 selection 기반)
      let existingTextNode: Text | null = null;
      
      // 우선순위 1: Selection이 있는 text node (절대 보호)
      for (const textNode of activeTextNodes) {
        if (textNode.parentNode === parent) {
          // 같은 parent에 있고, 위치가 맞으면 재사용
          const index = childNodes.indexOf(textNode);
          if (index === childIndex || (index === -1 && childIndex === 0)) {
            existingTextNode = textNode;
            break;
          }
        }
      }
      
      // 우선순위 2: 같은 위치의 기존 text node
      if (!existingTextNode && childIndex < childNodes.length) {
        const nodeAtIndex = childNodes[childIndex];
        if (nodeAtIndex && nodeAtIndex.nodeType === 3) {
          existingTextNode = nodeAtIndex as Text;
        }
      }
      
      if (existingTextNode) {
        // 기존 text node 재사용 (textContent만 업데이트)
        existingTextNode.textContent = String(childVNode.text);
        nextDomChildren.push(existingTextNode);
      } else {
        // 새 text node 생성 (selection이 없는 경우만)
        const textNode = doc.createTextNode(String(childVNode.text));
        const referenceNode = childIndex < childNodes.length ? childNodes[childIndex] : null;
        parent.insertBefore(textNode, referenceNode);
        nextDomChildren.push(textNode);
      }
      continue;
    }
    
    // Element VNode 처리 (mark/decorator 구조)
    // ... 기존 로직 ...
  }
  
  // 3. Stale 노드 제거 (하지만 selection이 있는 text node는 보호)
  this.removeStale(parent, new Set(nextDomChildren), context, prevMap, activeTextNodes);
}
```

#### 2. Selection이 있는 Text Node 보호

`removeStale`에서 selection이 있는 text node는 절대 삭제하지 않음:

```typescript
// reconciler.ts
private removeStale(
  parent: HTMLElement, 
  keep: Set<HTMLElement | Text>, 
  context?: any, 
  prevMap?: Map<string, VNode>,
  protectedTextNodes?: Set<Text>
): void {
  const children = Array.from(parent.childNodes);
  for (const ch of children) {
    if (!keep.has(ch as HTMLElement | Text)) {
      // Selection이 있는 text node는 절대 삭제하지 않음
      if (ch.nodeType === 3 && protectedTextNodes?.has(ch as Text)) {
        console.log('[Reconciler] Protected text node from removal (has selection)');
        continue;
      }
      
      // Text 노드는 lifecycle 처리 불필요
      if (ch.nodeType === 1) { // Element node
        const element = ch as HTMLElement;
        // ... unmount 로직 ...
      }
      parent.removeChild(ch);
    }
  }
}
```

#### 3. Mark/Decorator 구조 변경 시 Text Node 보존

Mark/decorator 구조가 변경되어도 실제 text node는 재사용:

```typescript
// reconciler.ts
// Mark/decorator 구조가 변경되어도:
// - <span><strong><span>Hello</span></strong></span>
// - <span><em><span>Hello</span></em></span>
// 위와 같이 구조가 바뀌어도 "Hello" text node는 재사용

private reconcileVNodeChildren(parent: HTMLElement, prevVNode: VNode | undefined, nextVNode: VNode, context?: any, isRecursive: boolean = false): void {
  // ... selection 보호 로직 ...
  
  // Mark/decorator 구조 변경 시:
  // 1. 기존 text node를 찾아서 재사용
  // 2. 부모 요소(mark/decorator)만 변경
  // 3. text node는 그대로 유지하여 selection 보존
}
```

**구현 전략**:

1. **Text Node 매핑**: VNode와 실제 DOM text node를 매핑하여 추적
2. **Selection 감지**: `reconcileVNodeChildren` 시작 시 selection이 있는 text node 수집
3. **재사용 우선순위**:
   - Selection이 있는 text node (최우선)
   - 같은 위치의 기존 text node
   - 새 text node 생성 (최후)
4. **Stale 제거 보호**: `removeStale`에서 selection이 있는 text node는 절대 삭제하지 않음

**장점**:
- ✅ Selection이 깨지지 않음 (text node가 삭제되지 않으므로)
- ✅ 브라우저 selection 복원 불필요 (원본 노드가 유지됨)
- ✅ ContentEditable 특성에 맞음 (편집 중인 text node만 변경)
- ✅ Mark/Decorator 범위 조정 가능 (text node는 유지하고 구조만 변경)

**주의사항**:
- ⚠️ Text node가 너무 많아지면 메모리 문제 가능 (하지만 일반적으로 문제 없음)
- ⚠️ Mark/decorator 구조 변경 시 text node 위치 조정 필요
- ⚠️ Selection이 있는 text node의 textContent만 업데이트하고 구조는 유지해야 함

### 결론

현재 아키텍처는 **contenteditable에서의 실시간 텍스트 입력을 잘 지원**하지만, **selection 보존**은 추가 개선이 필요합니다:

1. ✅ **Mark/Decorator 적용**: `data('text')`는 항상 children에 유지되어 mark/decorator가 올바르게 적용됨
2. ✅ **효율적 업데이트**: sid 기반 매칭과 prevVNode 비교로 최소한의 DOM 조작
3. ✅ **일관성**: 텍스트 입력 시에도 동일한 VNode 구조 유지
4. ✅ **안정성**: 기존 DOM 요소를 재사용하여 불필요한 재생성 방지
5. ⚠️ **Selection 보존**: 현재 `applyModelSelectionWithRetry()`로 복원 시도하지만, reconciler 업데이트 중 selection이 깨질 수 있음 (개선 필요)

## 결론

현재 아키텍처는 **두 가지 경로를 명확히 구분**하여:

1. ✅ **성능 최적화**: 단순 텍스트는 collapse하여 효율적 처리
2. ✅ **유연성**: `data('text')`는 mark/decorator 처리를 위해 항상 children에 유지
3. ✅ **일관성**: 각 경로는 항상 동일한 방식으로 처리
4. ✅ **명확성**: 문서로 아키텍처를 명확히 설명
5. ✅ **ContentEditable 지원**: 실시간 텍스트 입력 시에도 mark/decorator가 올바르게 적용됨

이 접근 방식은 에디터의 특성에 맞으며, 성능과 유지보수성을 모두 고려한 최적의 해결책입니다.

## 참고 문서

- `text-vnode-bug-fix.md`: 버그 수정 과정과 전체적인 개념
- `reconciler-text-vnode-solution.md`: 해결 방안 문서

