# Reconciler 업데이트 플로우 상세 문서

## 개요

이 문서는 `Reconciler` 클래스에서 `DOMRenderer.render()`를 여러 번 호출할 때 발생하는 업데이트 플로우를 상세히 설명합니다. 특히 decorator가 적용되어 텍스트가 분할되는 경우의 처리 방식을 다룹니다.

## 핵심 요약

### data('text') 개념과 Decorator로 인한 텍스트 분할

**핵심 개념:**
- `data('text')`는 **템플릿의 children**에 정의됩니다
  ```typescript
  define('inline-text', element('span', [data('text')]))
  //                                 ^^^^^^^^^^^^
  //                                 템플릿의 children에 있음
  ```
- `data('text')`가 처리되면 생성된 VNode들이 **부모 VNode의 children**으로 들어갑니다
- mark와 decorator가 있으면 분할된 VNode들이 children으로 들어갑니다

**중요 원칙:**
1. **원본 컴포넌트 VNode는 하나만 존재**: `inline-text` (sid: `text-14`) 같은 컴포넌트 VNode는 하나만 존재하며, `sid`를 유지합니다.
2. **텍스트는 decorator range를 기반으로 분할**: Decorator의 `range` (startOffset, endOffset)는 전체 텍스트를 기준으로 한 절대 위치입니다.
3. **분할된 텍스트는 원본 컴포넌트의 children으로 들어감**: 분할된 텍스트 VNode들과 decorator VNode는 모두 원본 컴포넌트의 children으로 들어갑니다.
4. **분할된 텍스트 VNode는 `sid`를 가지지 않음**: 분할된 텍스트 VNode들은 일반 span이며 `sid`를 가지지 않습니다.

**예시:**
- 원본: `"Hello World"` (sid: `text-14`)
- Decorator: `chip-before` (range: [0, 5], position: `before`)
- 결과 구조:
  ```
  {
    sid: 'text-14',
    stype: 'inline-text',
    children: [
      { decoratorSid: 'chip-before', ... },  // decorator VNode
      { tag: 'span', text: 'Hello' },        // 분할된 텍스트 (sid 없음)
      { tag: 'span', text: ' World' }       // 분할된 텍스트 (sid 없음)
    ]
  }
  ```

### 여러 번 render() 호출 시 동작

1. **첫 번째 render()**: decorator 없이 텍스트만 렌더링
2. **두 번째 render()**: decorator 추가로 텍스트 분할, 원본 컴포넌트 VNode는 `sid`로 정확히 매칭됨
3. **updateComponent 호출**: 원본 컴포넌트 VNode가 매칭되면 `updateComponent`가 호출됨
4. **구조 변경 처리**: children 구조가 변경되면 분할된 텍스트 VNode는 새로 생성됨

### ✅ 버그 수정 완료: model.text가 children을 덮어쓰는 문제

**문제 (수정 전):**
- `reconcile()` 메서드에서 `model.text`가 있으면 `reconcileVNodeChildren()` 이후에 children을 모두 지우고 텍스트만 설정했습니다.
- 결과적으로 decorator가 VNode에는 있지만 DOM에는 렌더링되지 않았습니다.

**해결:**
- ✅ children이 있으면 `model.text`를 무시하도록 수정 완료
- `reconcile()` 메서드와 `reconcileVNodesToDOM()` 메서드 모두 수정
- 자세한 내용은 4.0절, 5.0절, 8.1절 참조

## 1. 전체 플로우 개요

```
DOMRenderer.render()
  ↓
VNodeBuilder.build() - Model + Decorators → VNode 트리 생성
  ↓
Reconciler.reconcile() - VNode 트리 → DOM 업데이트
  ↓
Reconciler.reconcileVNodeChildren() - 자식 VNode 재귀 처리
  ↓
ComponentManager.updateComponent() - 컴포넌트 업데이트 (조건부)
```

## 2. render() 호출 시 상세 플로우

### 2.1 DOMRenderer.render()

```typescript
render(container: HTMLElement, model: ModelData, decorators: Decorator[] = [], runtime?: Record<string, any>): void
```

**단계:**
1. `VNodeBuilder.build()`로 Model과 Decorators를 기반으로 VNode 트리 생성
2. `Reconciler.reconcile()` 호출하여 VNode 트리를 DOM에 반영

**중요 사항:**
- decorator는 VNodeBuilder에서 처리되어 VNode 트리에 포함됨
- 텍스트에 decorator가 적용되면 VNode가 여러 개로 분리됨 (아래 참조)

### 2.2 VNodeBuilder.build() - Decorator 처리

텍스트에 inline decorator가 적용되면 `_buildMarkedRunsWithDecorators()`가 호출되어 텍스트가 분할됩니다.

#### 2.2.1 data('text') 개념과 텍스트 분할 규칙

**핵심 개념:**
- `data('text')`는 **템플릿의 children**에 정의됩니다
  ```typescript
  define('inline-text', element('span', { className: 'text' }, [data('text')]))
  //                                                              ^^^^^^^^^^^^
  //                                                              템플릿의 children에 있음
  ```
- `VNodeBuilder._processChild()`에서 `data('text')`를 처리할 때:
  1. `model.text` 값을 가져옴
  2. mark와 decorator가 있으면 `_buildMarkedRunsWithDecorators()` 호출
  3. 생성된 VNode들을 `orderedChildren.push()`로 추가
- `VNodeBuilder._buildElement()`에서 최종 설정:
  ```typescript
  vnode.children = [...orderedChildren]
  ```
  → `data('text')`에서 생성된 VNode들이 **부모 VNode의 children**으로 들어감

**텍스트 분할 규칙:**
- Decorator의 `range` (startOffset, endOffset)는 **전체 텍스트를 기준**으로 한 절대 위치입니다
- Decorator range를 기반으로 텍스트를 분할합니다
- 분할된 텍스트는 **원본 컴포넌트의 children**으로 들어갑니다
- **원본 컴포넌트 VNode는 하나만 존재**하며, `sid`는 유지됩니다

**예시:**
- 원본 텍스트: `"Hello World"` (sid: `text-14`, stype: `inline-text`)
- Decorator: `chip-before` (position: `before`, range: [0, 5])
  - range [0, 5]는 "Hello World"의 처음 5글자 "Hello"를 의미합니다

**처리 과정:**

**단계 1: 템플릿 정의**
```typescript
define('inline-text', element('span', { className: 'text' }, [data('text')]))
//                                                              ^^^^^^^^^^^^
//                                                              템플릿의 children에 data('text')가 있음
```

**단계 2: VNodeBuilder._buildElement()에서 템플릿 children 처리**
- `template.children`를 순회하며 `_processChild()` 호출 (673-675번 라인)
- `data('text')`를 만나면 `_processChild()`에서 처리

**단계 3: VNodeBuilder._processChild()에서 data('text') 처리** (1011-1127번 라인)
1. `model.text` 값을 가져옴: `"Hello World"`
2. mark와 decorator 확인
3. `_buildMarkedRunsWithDecorators()` 호출:
   - `splitTextByDecorators("Hello World", [chip-before])` 호출
     - boundaries: [0, 5, 11] (decorator range의 시작/끝 + 텍스트 끝)
     - runs 생성:
       - `{ text: "Hello", start: 0, end: 5, decorator: chip-before }`
       - `{ text: " World", start: 5, end: 11, decorator: undefined }`
   - 각 run에 대해 VNode 생성:
     - 첫 번째 run (decorator 있음, position: `before`):
       - decorator VNode 생성: `{ decoratorSid: 'chip-before', tag: 'span', ... }`
       - 텍스트 VNode 생성: `{ tag: 'span', text: 'Hello' }` (sid 없음, 일반 span)
       - `nodes.push(decoratorVNode)`, `nodes.push(inner)`
     - 두 번째 run (decorator 없음):
       - 텍스트 VNode 생성: `{ tag: 'span', text: ' World' }` (sid 없음, 일반 span)
       - `nodes.push(inner)`
4. 생성된 VNode들을 `orderedChildren`에 추가: `orderedChildren.push(n)` (1127번 라인)

**단계 4: VNodeBuilder._buildElement()에서 최종 설정** (743-745번 라인)
```typescript
vnode.children = [...orderedChildren]
```
→ `data('text')`에서 생성된 VNode들이 **부모 VNode의 children**으로 들어감

**최종 VNode 구조:**
```
{
  sid: 'text-14',
  stype: 'inline-text',
  tag: 'span',
  children: [
    { decoratorSid: 'chip-before', tag: 'span', ... },  // decorator VNode
    { tag: 'span', text: 'Hello' },                     // 분할된 텍스트 (sid 없음)
    { tag: 'span', text: ' World' }                    // 분할된 텍스트 (sid 없음)
  ]
}
```

**최종 DOM 구조:**
```html
<span class="text" data-bc-sid="text-14" data-bc-stype="inline-text">
  <span class="chip" data-decorator-sid="chip-before" ...>CHIP</span>
  <span>Hello</span>
  <span> World</span>
</span>
```

**중요 사항:**
- `data('text')`는 **템플릿의 children**에 정의되며, 처리되면 생성된 VNode들이 **부모 VNode의 children**으로 들어갑니다
- 원본 컴포넌트 VNode (`text-14`)는 **하나만 존재**하며, `sid`를 유지합니다
- 분할된 텍스트 VNode들은 **일반 span**이며 `sid`를 가지지 않습니다
- Decorator VNode는 `decoratorSid`를 가지며, 원본 컴포넌트의 children으로 들어갑니다
- `prevVNodeTree`는 `text-14`의 전체 VNode 구조를 저장하므로, 분할된 구조도 함께 저장됩니다

**개념 검증:**
- ✅ `data('text')`는 템플릿의 children에 있음
- ✅ 처리되면 생성된 VNode들이 부모 VNode의 children으로 들어감
- ✅ mark와 decorator가 있으면 분할된 VNode들이 children으로 들어감
- ✅ 이는 올바른 개념입니다!

### 2.3 Reconciler.reconcile()

```typescript
reconcile(container: HTMLElement, vnode: VNode, model: ModelData, runtime?: RuntimeCtx, decorators?: any[]): void
```

**단계:**
1. Root VNode의 `sid`로 기존 host 찾기 또는 생성
2. `prevVNode` 가져오기: `this.prevVNodeTree.get(sid)`
3. Attributes/Styles 업데이트
4. `prevVNode` 저장: `this.prevVNodeTree.set(sid, { ...rootVNode })`
5. `reconcileVNodeChildren()` 호출하여 자식 처리

**중요 사항:**
- `prevVNodeTree`는 `sid` 단위로만 저장됨
- Decorator로 분할된 VNode는 각각 다른 구조를 가지지만, 같은 `sid`를 가질 수 있음

### 2.4 Reconciler.reconcileVNodeChildren()

```typescript
private reconcileVNodeChildren(parent: HTMLElement, prevVNode: VNode | undefined, nextVNode: VNode, context?: any): void
```

**단계:**
1. `nextVNode.children` 순회
2. 각 child VNode에 대해:
   - `findChildHost()`로 기존 DOM 요소 찾기
   - 없으면 새로 생성
   - 있으면 `updateComponent()` 호출 (조건부)

**prevVNode 매칭:**
```typescript
let prevChildVNode: VNode | undefined = undefined;
if (childVNode.sid) {
  prevChildVNode = prevChildVNodes.find(
    (c): c is VNode => typeof c === 'object' && 'sid' in c && c.sid === childVNode.sid
  );
} else if (childVNode.decoratorSid) {
  prevChildVNode = prevChildVNodes.find(
    (c): c is VNode => typeof c === 'object' && 'decoratorSid' in c && c.decoratorSid === childVNode.decoratorSid
  );
}
```

**실제 구조:**
- 원본 컴포넌트 VNode (`text-14`)는 하나만 존재하므로, `sid`로 매칭이 정확합니다
- 분할된 텍스트 VNode들은 `sid`가 없으므로 매칭되지 않으며, 새로 생성됩니다
- Decorator VNode는 `decoratorSid`로 매칭됩니다

**예시:**
- 이전 렌더 (decorator 없음):
  ```
  {
    sid: 'text-14',
    children: [{ tag: 'span', text: 'Hello World' }]  // 또는 text: 'Hello World'
  }
  ```
- 다음 렌더 (decorator 있음):
  ```
  {
    sid: 'text-14',
    children: [
      { decoratorSid: 'chip-before', tag: 'span', ... },
      { tag: 'span', text: 'Hello' },      // sid 없음
      { tag: 'span', text: ' World' }      // sid 없음
    ]
  }
  ```
- `text-14` VNode 자체는 `sid`로 정확히 매칭됩니다
- 분할된 텍스트 VNode들은 `sid`가 없으므로 새로 생성됩니다

### 2.5 ComponentManager.updateComponent()

```typescript
updateComponent(prevVNode: VNode, nextVNode: VNode, container: HTMLElement, context: ReconcileContext, wip: DOMWorkInProgress): void
```

**호출 조건:**
1. `reconcileVNodeChildren()`에서 기존 host를 찾았을 때
2. `!isDecorator && childVNode.stype`일 때
3. `!isReconciling`일 때 (무한 루프 방지)

**중요 로직:**
```typescript
const isReconciling = !!(context as any)?.__isReconciling;
if (!isReconciling) {
  this.components.updateComponent(prevChildVNode || {} as VNode, childVNode, host, context || ({} as any));
} else {
  // __isReconciling이 true면 DOM 속성만 업데이트
  if (childVNode.attrs) {
    this.dom.updateAttributes(host, prevChildVNode?.attrs, childVNode.attrs);
  }
  if (childVNode.style) {
    this.dom.updateStyles(host, prevChildVNode?.style, childVNode.style);
  }
}
```

**문제점:**
- `prevChildVNode`가 `undefined`이거나 잘못된 VNode일 수 있음
- Decorator로 분할된 경우, `prevChildVNode`가 전체 텍스트를 가진 VNode일 수 있음
- `updateComponent` 내부에서 `prevVNode`와 `nextVNode`를 비교할 때 구조 불일치 발생

## 3. Decorator로 인한 VNode 분할 처리

### 3.1 분할 과정

**VNodeBuilder._buildMarkedRunsWithDecorators():**
1. 텍스트를 mark 범위로 분할 (marks가 있는 경우)
2. 각 mark run에 대해 decorator 범위로 다시 분할
3. 각 decorator run에 대해 VNode 생성

**결과:**
- 원본 컴포넌트 VNode는 하나만 존재하며 `sid`를 유지
- 분할된 텍스트 VNode들은 일반 span이며 `sid`를 가지지 않음
- Decorator VNode는 `decoratorSid`를 가짐
- 모든 VNode는 원본 컴포넌트의 children으로 들어감

### 3.2 Reconciler에서의 처리

**현재 방식:**
- `findChildHost()`는 `sid` 또는 `decoratorSid`로 DOM 요소를 찾음
- 원본 컴포넌트 VNode는 `sid`로 정확히 매칭됨
- 분할된 텍스트 VNode들은 `sid`가 없으므로 새로 생성됨
- Decorator VNode는 `decoratorSid`로 매칭됨

**특징:**
- 원본 컴포넌트 VNode는 하나만 존재하므로 매칭 문제가 없음
- 분할된 텍스트 VNode들은 `sid`가 없으므로 항상 새로 생성됨 (이전 DOM 요소 재사용 불가)
- Decorator VNode는 `decoratorSid`로 정확히 매칭됨

## 4. 여러 번 render() 호출 시 문제점

### 4.0 model.text와 children 충돌 문제 (중요)

**문제:**
`reconcile()` 메서드에서 `model.text`가 있으면 `reconcileVNodeChildren()` 이후에 children을 모두 지우고 텍스트만 설정하는 로직이 있습니다.

**문제 코드:**
```typescript
// reconcile() 메서드의 152-157번 라인
this.reconcileVNodeChildren(host, prevVNode, rootVNode, context);

// 루트 모델이 텍스트를 가지는 경우, host의 텍스트를 직접 설정
if ((model as any)?.text !== undefined && (model as any)?.text !== null) {
  const doc = host.ownerDocument || document;
  while (host.firstChild) host.removeChild(host.firstChild);  // ⚠️ children 모두 삭제!
  host.appendChild(doc.createTextNode(String((model as any).text)));
}
```

**영향:**
- Decorator가 적용되어 VNode의 children에 decorator VNode와 분할된 텍스트 VNode가 포함되어 있어도
- `model.text`가 있으면 children을 모두 지우고 원본 텍스트만 설정됨
- 결과적으로 decorator가 DOM에 렌더링되지 않음

**예시:**
- VNode 구조:
  ```
  {
    sid: 'text-14',
    children: [
      { decoratorSid: 'chip-before', ... },
      { tag: 'span', text: 'Hello' },
      { tag: 'span', text: ' World' }
    ]
  }
  ```
- Model: `{ sid: 'text-14', text: 'Hello World' }`
- 결과 DOM: `<span data-bc-sid="text-14">Hello World</span>` (decorator 없음!)

**해결 방안:**
1. `model.text`가 있어도 VNode에 children이 있으면 children을 우선시
2. `reconcileVNodeChildren()`의 617-624번 라인처럼 children 체크 로직 추가
3. 또는 `model.text` 설정 로직을 `reconcileVNodeChildren()` 이전으로 이동

**현재 상태:**
- `reconcileVNodeChildren()` 내부에서는 children이 있으면 model.text를 무시하는 로직이 있음 (617-624번 라인)
- 하지만 `reconcile()` 메서드에서는 이 체크가 없음

### 4.1 prevVNode 저장 문제

**현재 구현:**
```typescript
// reconcileVNodesToDOM()에서
if (sid) {
  this.prevVNodeTree.set(String(sid), { ...vnode });
}
```

**실제 동작:**
- `prevVNodeTree`는 `sid` 단위로 전체 VNode 구조를 저장함
- Decorator로 분할된 경우, 분할된 children 구조도 함께 저장됨
- 다음 렌더에서 `prevVNode`를 가져올 때 전체 구조를 가져옴

**잠재적 문제:**
- `prevVNode`의 children 구조가 다음 렌더의 children 구조와 다를 수 있음
- 예: 이전 렌더에는 decorator가 없었고, 다음 렌더에는 decorator가 추가됨
- 이 경우 `prevChildVNodes`와 `nextChildVNodes`의 구조가 완전히 다름

### 4.2 updateComponent 호출 문제

**조건:**
```typescript
if (!isDecorator && childVNode.stype) {
  if (!isReconciling) {
    this.components.updateComponent(prevChildVNode || {} as VNode, childVNode, host, context || ({} as any));
  }
}
```

**문제:**
- `prevChildVNode`가 `undefined`이거나 잘못된 VNode일 수 있음
- `updateComponent` 내부에서 `prevVNode`와 `nextVNode`의 구조가 다를 수 있음
- Decorator로 분할된 경우, `prevVNode`는 전체 텍스트를 가지고 `nextVNode`는 분할된 텍스트를 가짐

### 4.3 DOM 요소 매칭 문제

**현재 구현:**
```typescript
private findChildHost(parent: HTMLElement, vnode: VNode): HTMLElement | null {
  if (isDecorator) {
    const decoratorSid = vnode.decoratorSid;
    if (decoratorSid) {
      return parent.querySelector(`:scope > [data-decorator-sid="${decoratorSid}"]`);
    }
  } else {
    const sid = vnode.sid;
    if (sid) {
      return parent.querySelector(`:scope > [data-bc-sid="${sid}"]`);
    }
  }
  return null;
}
```

**실제 동작:**
- 원본 컴포넌트 VNode는 `sid`로 정확히 매칭됨 (하나만 존재하므로)
- 분할된 텍스트 VNode들은 `sid`가 없으므로 항상 새로 생성됨
- Decorator VNode는 `decoratorSid`로 정확히 매칭됨

**잠재적 문제:**
- 분할된 텍스트 VNode들은 `sid`가 없으므로 이전 DOM 요소를 재사용할 수 없음
- 매 렌더마다 새로운 DOM 요소가 생성되어 성능 저하 가능
- 하지만 구조가 변경되면 어차피 재생성이 필요하므로 큰 문제는 아님

## 5. 해결 방안

### 5.0 model.text와 children 충돌 해결 (우선순위 높음)

**문제:**
`reconcile()` 메서드에서 `model.text`가 있으면 children을 무시하고 텍스트만 설정하는 로직이 decorator 렌더링을 방해합니다.

**해결 방안 1: children 우선 체크 추가**
```typescript
// reconcile() 메서드 수정
this.reconcileVNodeChildren(host, prevVNode, rootVNode, context);

// 루트 모델이 텍스트를 가지는 경우, host의 텍스트를 직접 설정
// BUT: children이 있으면 children을 우선시 (decorator가 children에 포함됨)
if ((model as any)?.text !== undefined && (model as any)?.text !== null) {
  // children이 있으면 model.text를 무시 (children에 decorator가 포함될 수 있음)
  if (!rootVNode.children || rootVNode.children.length === 0) {
    const doc = host.ownerDocument || document;
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(doc.createTextNode(String((model as any).text)));
  }
}
```

**해결 방안 2: reconcileVNodesToDOM()에도 동일한 로직 적용**
```typescript
// reconcileVNodesToDOM() 메서드의 361-365번 라인 수정
// 텍스트 모델이 제공되면 호스트 텍스트 보장 (children diff 이후)
// BUT: children이 있으면 children을 우선시
if (model && (model as any)?.text !== undefined && (model as any)?.text !== null) {
  // children이 있으면 model.text를 무시
  if (!vnode.children || vnode.children.length === 0) {
    const doc = host.ownerDocument || document;
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(doc.createTextNode(String((model as any).text)));
  }
}
```

**해결 방안 3: VNode.text 속성 우선 사용**
- `model.text` 대신 `vnode.text`를 우선 사용
- VNodeBuilder가 이미 텍스트를 처리했으므로 model.text는 fallback으로만 사용

### 5.1 prevVNode 저장 개선

**제안:**
- `prevVNodeTree`를 `sid` 단위가 아닌 전체 VNode 트리 구조로 저장
- 또는 분할된 VNode에 대해 별도의 매핑 사용

**구현 예시:**
```typescript
// 전체 VNode 트리 저장
private prevVNodeTree: Map<string, VNode> = new Map();
private prevVNodeTreeFull: VNode | null = null; // 전체 트리 저장

// reconcile() 종료 시
this.prevVNodeTreeFull = { ...vnode };
```

### 5.2 prevVNode 매칭 개선

**현재 상태:**
- 원본 컴포넌트 VNode는 `sid`로 정확히 매칭됨 (문제 없음)
- 분할된 텍스트 VNode들은 `sid`가 없으므로 매칭되지 않음 (의도된 동작)
- Decorator VNode는 `decoratorSid`로 정확히 매칭됨 (문제 없음)

**개선 제안:**
- 분할된 텍스트 VNode에 대해 순차적 매칭을 고려할 수 있음
- 하지만 구조가 변경되면 어차피 재생성이 필요하므로 큰 이점은 없음
- 현재 구현이 적절함

### 5.3 updateComponent 호출 조건 개선

**제안:**
- `prevChildVNode`가 유효한지 확인
- 구조가 일치하는지 확인 후 `updateComponent` 호출

**구현 예시:**
```typescript
if (!isDecorator && childVNode.stype) {
  if (!isReconciling) {
    // prevChildVNode 유효성 확인
    if (prevChildVNode && prevChildVNode.stype === childVNode.stype) {
      this.components.updateComponent(prevChildVNode, childVNode, host, context || ({} as any));
    } else {
      // 구조가 다르면 mount/unmount 처리
      if (prevChildVNode) {
        this.components.unmountComponent(prevChildVNode, context);
      }
      this.components.mountComponent(childVNode, host, context);
    }
  }
}
```

### 5.4 DOM 요소 매칭 개선

**현재 상태:**
- 원본 컴포넌트 VNode는 `sid`로 정확히 매칭됨 (문제 없음)
- 분할된 텍스트 VNode들은 `sid`가 없으므로 항상 새로 생성됨 (의도된 동작)
- Decorator VNode는 `decoratorSid`로 정확히 매칭됨 (문제 없음)

**개선 제안:**
- 분할된 텍스트 VNode에 대해 순차적 매칭을 고려할 수 있음
- 하지만 구조가 변경되면 어차피 재생성이 필요하므로 큰 이점은 없음
- 현재 구현이 적절함

**성능 최적화 고려사항:**
- 분할된 텍스트 VNode에 대해 `key` 속성을 추가하여 매칭 개선 가능
- 하지만 텍스트 내용이 변경되면 어차피 재생성이 필요하므로 큰 이점은 없음

## 6. 디버깅 가이드

### 6.1 로그 포인트

**Reconciler.reconcileVNodeChildren():**
```typescript
if (childVNode.sid === 'text-14') {
  console.log('[Reconciler.reconcileVNodeChildren] text-14 updateComponent call:', {
    sid: childVNode.sid,
    stype: childVNode.stype,
    contextDecoratorsCount: contextDecorators.length,
    text14DecoratorsCount: text14Decorators.length,
    isReconciling: (context as any)?.__isReconciling
  });
}
```

**ComponentManager.updateComponent():**
```typescript
if (componentId === 'text-14') {
  console.log('[ComponentManager.updateComponent] text-14 decorator update:', {
    componentId,
    contextDecoratorsCount: contextDecorators.length,
    nextDecoratorsCount: nextDecorators.length
  });
}
```

### 6.2 확인 사항

1. **prevVNode 저장 확인:**
   - `prevVNodeTree.get(sid)`가 올바른 VNode를 반환하는지
   - Decorator로 분할된 경우 전체 구조가 저장되는지

2. **prevVNode 매칭 확인:**
   - `prevChildVNode`가 올바르게 찾아지는지
   - 원본 컴포넌트 VNode는 `sid`로 정확히 매칭되는지

3. **updateComponent 호출 확인:**
   - `isReconciling` 플래그가 올바르게 설정되는지
   - `prevChildVNode`가 유효한지
   - Element template인 경우 updateComponent가 호출되지 않을 수 있음

4. **DOM 요소 매칭 확인:**
   - `findChildHost()`가 올바른 DOM 요소를 찾는지
   - 원본 컴포넌트 VNode는 `sid`로 정확히 매칭되는지

5. **model.text와 children 충돌 확인:**
   - VNode에 children이 있는데도 `model.text`가 children을 덮어쓰는지
   - Decorator가 VNode에는 있지만 DOM에는 렌더링되지 않는지
   - Container HTML을 확인하여 children이 실제로 렌더링되었는지 확인

## 7. 테스트 시나리오

### 7.1 기본 시나리오

1. 첫 렌더링 (decorator 없음)
2. Decorator 추가 후 두 번째 렌더링
3. Decorator 제거 후 세 번째 렌더링

### 7.2 복잡한 시나리오

1. 여러 decorator 추가/제거
2. 텍스트 변경과 decorator 변경 동시 발생
3. 동일한 modelData로 여러 번 render() 호출

### 7.3 문제 재현 시나리오

1. `text-14`에 decorator 추가
2. 텍스트가 분할되어 원본 컴포넌트의 children 구조가 변경됨
3. 두 번째 render() 호출 시 `updateComponent`가 호출되지만:
   - `prevVNode`의 children 구조와 `nextVNode`의 children 구조가 다름
   - `prevChildVNode` 매칭이 어려울 수 있음
4. 구조 변경으로 인한 DOM 재생성 발생 가능

### 7.4 model.text와 children 충돌 재현 시나리오

1. `text-14`에 decorator 추가
2. VNodeBuilder가 VNode를 생성:
   ```
   {
     sid: 'text-14',
     children: [
       { decoratorSid: 'chip-before', ... },
       { tag: 'span', text: 'Hello' },
       { tag: 'span', text: ' World' }
     ]
   }
   ```
3. `reconcile()` 메서드 호출:
   - `reconcileVNodeChildren()` 실행 → children이 DOM에 렌더링됨
   - 이후 `model.text` 체크 → children을 모두 지우고 텍스트만 설정
4. 결과: decorator가 DOM에 렌더링되지 않음

**테스트 결과:**
```
Container HTML: <span data-bc-sid="text-14" data-bc-stype="inline-text" class="text">Hello World</span>
Text element children: []  // children이 모두 삭제됨!
```

## 8. 버그 수정 이력

### 8.1 model.text가 children을 덮어쓰는 문제 (수정 완료)

**위치:** `packages/renderer-dom/src/reconcile/reconciler.ts`

**문제:**
- `reconcile()` 메서드 (152-157번 라인): `model.text`가 있으면 children을 모두 지우고 텍스트만 설정
- `reconcileVNodesToDOM()` 메서드 (361-365번 라인): 동일한 문제

**영향:**
- Decorator가 적용되어 VNode의 children에 포함되어 있어도 DOM에 렌더링되지 않음
- `model.text`가 있으면 항상 원본 텍스트만 표시됨

**해결 상태:**
- ✅ 수정 완료 (2024년)
- 수정 내용: children이 있으면 `model.text`를 무시하도록 로직 추가

**수정 내용:**
```typescript
// reconcile() 메서드 수정 (156번 라인)
if (!rootVNode.children || rootVNode.children.length === 0) {
  // children이 없을 때만 model.text 설정
}

// reconcileVNodesToDOM() 메서드 수정 (368번 라인)
if (!vnode.children || vnode.children.length === 0) {
  // children이 없을 때만 model.text 설정
}
```

**테스트 결과:**
- ✅ `reconciler-update-flow.test.ts`: 8개 테스트 모두 통과
- ✅ `vnode-decorator-structure.test.ts`: 5개 테스트 모두 통과
- ✅ Decorator가 DOM에 올바르게 렌더링됨

## 9. 요약

### 9.1 핵심 발견 사항

1. **VNode 구조는 올바름**
   - Decorator가 적용되면 텍스트가 분할되어 원본 컴포넌트의 children으로 들어감
   - 원본 컴포넌트 VNode는 하나만 존재하며 `sid`를 유지
   - 분할된 텍스트 VNode는 `sid`가 없음 (일반 span)

2. **Reconciler의 prevVNode 매칭은 정상 작동**
   - 원본 컴포넌트 VNode는 `sid`로 정확히 매칭됨
   - Decorator VNode는 `decoratorSid`로 정확히 매칭됨
   - 분할된 텍스트 VNode는 새로 생성됨 (의도된 동작)

3. **중요한 버그 발견**
   - `model.text`가 있으면 children을 덮어쓰는 로직이 decorator 렌더링을 방해
   - VNode에는 decorator가 있지만 DOM에는 렌더링되지 않음
   - 해결 방안: children 우선 체크 로직 추가 필요

### 9.2 완료된 작업

1. **✅ 버그 수정 완료**
   - `reconcile()` 메서드의 152-161번 라인 수정
   - `reconcileVNodesToDOM()` 메서드의 364-373번 라인 수정
   - children이 있으면 `model.text`를 무시하도록 변경

2. **✅ 테스트 통과 확인**
   - `reconciler-update-flow.test.ts`: 8개 테스트 모두 통과
   - `vnode-decorator-structure.test.ts`: 5개 테스트 모두 통과
   - Decorator가 DOM에 올바르게 렌더링됨

3. **추가 검증 (선택사항)**
   - 다양한 decorator 시나리오 테스트
   - 성능 테스트 (여러 번 render() 호출)

## 10. 참고 자료

- `packages/renderer-dom/src/reconcile/reconciler.ts`
  - `reconcile()` 메서드: 37-169번 라인
  - `reconcileVNodesToDOM()` 메서드: 265-390번 라인
  - `reconcileVNodeChildren()` 메서드: 402-631번 라인
- `packages/renderer-dom/src/component-manager.ts`
  - `updateComponent()` 메서드: 911-1163번 라인
- `packages/renderer-dom/src/vnode/factory.ts`
  - `_buildMarkedRunsWithDecorators()` 메서드: 2238-2340번 라인
- `packages/renderer-dom/test/core/vnode-decorator-structure.test.ts`
- `packages/renderer-dom/test/core/reconciler-update-flow.test.ts`
- `packages/renderer-dom/test/core/dom-renderer-simple-rerender.test.ts`
- `packages/renderer-dom/test/core/dom-renderer-multiple-render.test.ts`

