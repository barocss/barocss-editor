# Decorator 제거 시 텍스트 분할 문제 분석

## 문제 상황

### 테스트 케이스: "decorator 추가 → 제거 → 다시 추가"

**3단계: decorator 제거 후 예상 결과**
```
Expected: "<div><p class="paragraph" data-bc-sid="p-1"><span class="text" data-bc-sid="text-1">Hello World</span></p></div>"
```

**실제 결과**
```
Received: "<div><p class="paragraph" data-bc-sid="p-1"><span class="text" data-bc-sid="text-1">Hello World<span>Hello</span><span>World</span></span></p></div>"
```

### 문제점
- Decorator는 제거되었지만, decorator가 생성한 분할된 텍스트 요소(`<span>Hello</span><span>World</span>`)가 DOM에 남아있음
- 텍스트 노드 "Hello World"와 분할된 요소들이 공존하는 상태

## 분석 관점

### 1. Reconcile 입장에서의 관찰

**핵심 질문**: Reconcile 입장에서는 그냥 VNode가 변경되었을 뿐인가?

- **예**: Reconcile은 VNodeBuilder가 생성한 VNode 트리를 받아서 DOM과 비교하고 업데이트함
- **문제 가능성**: 
  1. VNodeBuilder가 decorator 제거 시 올바른 VNode를 생성하지 않았을 수 있음
  2. Reconcile이 decorator가 생성한 분할된 텍스트 요소를 제거하지 못했을 수 있음

### 2. 가능한 원인

#### 원인 1: VNodeBuilder 문제
- Decorator가 제거되었을 때 VNodeBuilder가 여전히 분할된 텍스트 구조를 생성
- 예: `[{ tag: 'span', text: 'Hello' }, { tag: 'span', text: 'World' }]` 형태로 생성
- Reconcile은 이 VNode를 그대로 처리하므로 분할된 요소가 남음

#### 원인 2: Reconcile 처리 문제
- VNodeBuilder가 올바른 VNode를 생성했지만, Reconcile이 이전에 decorator가 생성한 DOM 요소를 제거하지 못함
- 예: `removeStaleDecorators`가 decorator 요소만 제거하고, decorator가 생성한 분할된 텍스트 요소는 제거하지 않음

#### 원인 3: 테스트 케이스 문제
- 테스트가 잘못된 예상 결과를 가지고 있을 수 있음
- 실제로는 decorator 제거 시 분할된 텍스트가 남는 것이 정상 동작일 수 있음

## 조사 필요 사항

### 1. VNodeBuilder 동작 확인
- Decorator가 있을 때: 어떤 VNode 구조를 생성하는가?
- Decorator가 제거되었을 때: 어떤 VNode 구조를 생성하는가?
- Decorator가 다시 추가되었을 때: 어떤 VNode 구조를 생성하는가?

### 2. Reconcile 처리 확인
- Decorator VNode가 children에 포함되어 있을 때: 어떻게 처리되는가?
- Decorator가 제거되었을 때: 이전 decorator가 생성한 DOM 요소는 어떻게 처리되는가?
- `removeStaleDecorators` 함수: 어떤 요소를 제거하는가?

### 3. DOM 구조 확인
- Decorator가 있을 때 DOM 구조
- Decorator가 제거되었을 때 예상 DOM 구조
- 실제 DOM 구조와의 차이점

## 다음 단계

1. **VNodeBuilder 로그 확인**: Decorator 제거 시 어떤 VNode를 생성하는지 확인
2. **Reconcile 로그 확인**: 생성된 VNode를 어떻게 처리하는지 확인
3. **DOM 구조 비교**: 예상 DOM과 실제 DOM의 차이점 분석
4. **원인 특정**: VNodeBuilder 문제인지, Reconcile 문제인지, 테스트 문제인지 판단

## 실제 조사 결과

### 핵심 질문: Reconcile 입장에서는 그냥 VNode가 변경되었을 뿐인가?

**답변**: 맞습니다. Reconcile은 VNodeBuilder가 생성한 VNode 트리를 받아서 DOM과 비교하고 업데이트합니다.

### 가능한 시나리오

#### 시나리오 1: VNodeBuilder가 decorator 제거 시 올바른 VNode를 생성하지 않음
- Decorator가 있을 때: `children: [decoratorVNode, splitTextVNode1, splitTextVNode2, ...]`
- Decorator가 제거되었을 때: VNodeBuilder가 여전히 분할된 텍스트 구조를 생성
  - 예: `children: [{ tag: 'span', text: 'Hello' }, { tag: 'span', text: 'World' }]`
- Reconcile은 이 VNode를 그대로 처리하므로 분할된 요소가 DOM에 남음

#### 시나리오 2: VNodeBuilder는 올바른 VNode를 생성하지만, Reconcile이 이전 DOM을 제거하지 못함
- Decorator가 제거되었을 때: VNodeBuilder가 `{ tag: 'span', text: 'Hello World', children: [] }` 생성
- 하지만 이전에 decorator가 생성한 DOM 요소(`<span>Hello</span><span>World</span>`)가 남아있음
- `removeStaleDecorators`는 `data-decorator-sid`를 가진 요소만 제거하고, decorator가 생성한 분할된 텍스트 요소는 제거하지 않음

#### 시나리오 3: 테스트 케이스 문제
- 테스트가 잘못된 예상 결과를 가지고 있을 수 있음
- 실제로는 decorator 제거 시 분할된 텍스트가 남는 것이 정상 동작일 수 있음

### 현재 `removeStaleDecorators` 동작

```typescript
export function removeStaleDecorators(
  fiber: FiberNode,
  deps: FiberReconcileDependencies
): void {
  // 현재 children에서 decoratorSid 수집
  const expectedDecoratorSids = new Set<string>();
  if (vnode.children) {
    for (const child of vnode.children) {
      if (typeof child === 'object' && child !== null) {
        const childVNode = child as VNode;
        if (childVNode.decoratorSid) {
          expectedDecoratorSids.add(childVNode.decoratorSid);
        }
      }
    }
  }
  
  // DOM에서 decorator 요소 찾기 및 제거
  const decoratorElements = Array.from(host.children).filter(
    (el): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      const decoratorSid = el.getAttribute('data-decorator-sid');
      return !!decoratorSid;
    }
  );
  
  for (const decoratorEl of decoratorElements) {
    const decoratorSid = decoratorEl.getAttribute('data-decorator-sid');
    if (decoratorSid && !expectedDecoratorSids.has(decoratorSid)) {
      // 더 이상 children에 없는 decorator는 제거
      try {
        host.removeChild(decoratorEl);
      } catch {
        // 이미 제거되었을 수 있음
      }
    }
  }
}
```

**문제점**: 
- `removeStaleDecorators`는 `data-decorator-sid`를 가진 요소만 제거합니다
- Decorator가 생성한 분할된 텍스트 요소(`<span>Hello</span>`, `<span>World</span>`)는 `data-decorator-sid`가 없으므로 제거되지 않습니다
- 이 요소들은 decorator가 텍스트를 분할할 때 생성된 것이지만, decorator VNode 자체는 아닙니다

### 해결 방안

1. **VNodeBuilder 확인**: Decorator 제거 시 VNodeBuilder가 어떤 VNode를 생성하는지 확인
   - 만약 분할된 텍스트 구조를 생성한다면, VNodeBuilder 수정 필요
   - 만약 단순 텍스트를 생성한다면, Reconcile 문제

2. **Reconcile 개선**: Decorator가 제거되었을 때, decorator가 생성한 분할된 텍스트 요소도 제거
   - `removeStaleDecorators`를 확장하여 `data-decorator-sid`가 없는 요소 중에서도 decorator가 생성한 것으로 추정되는 요소를 제거
   - 또는 VNodeBuilder가 decorator 제거 시 올바른 VNode를 생성하도록 보장

3. **테스트 검증**: 테스트 케이스가 올바른지 확인

## 핵심 인사이트

### Reconcile의 관점
- **Reconcile은 VNodeBuilder의 출력만 처리합니다**
- VNodeBuilder가 decorator 제거 시 분할된 텍스트 구조를 생성하면, Reconcile은 이를 그대로 DOM에 반영합니다
- VNodeBuilder가 단순 텍스트를 생성하면, Reconcile은 이를 DOM에 반영하지만, 이전에 decorator가 생성한 DOM 요소는 자동으로 제거되지 않습니다

### 문제의 본질
**Decorator가 텍스트를 분할할 때 생성한 DOM 요소(`<span>Hello</span>`, `<span>World</span>`)는:**
1. Decorator VNode 자체가 아님 (따라서 `data-decorator-sid`가 없음)
2. VNodeBuilder가 decorator 제거 시 단순 텍스트 VNode를 생성하면, 이 요소들은 VNode에 없음
3. Reconcile은 VNode에 없는 요소를 자동으로 제거하지 않음 (React의 key 기반 매칭과 유사)
4. `removeStaleDecorators`는 `data-decorator-sid`를 가진 요소만 제거하므로, 이 요소들은 제거되지 않음

### 해결책
1. **VNodeBuilder 수정**: Decorator 제거 시 분할된 텍스트 구조를 생성하지 않도록 보장
2. **Reconcile 개선**: Decorator 제거 시, decorator가 생성한 분할된 텍스트 요소도 제거하는 로직 추가
3. **하이브리드 접근**: VNodeBuilder가 올바른 VNode를 생성하도록 보장하고, Reconcile에서도 안전장치로 stale 요소 제거

## VNodeBuilder 동작 분석

### `_processDecoratorsForChildren` 로직

```typescript
private _processDecoratorsForChildren(
  vnode: VNode,
  data: ModelData,
  decorators: Decorator[]
): void {
  // 1. 기존 decorator 노드 제거
  const originalChildren = vnode.children.filter((child: any) => {
    if (isVNode(child)) {
      return !isDecoratorNode(child);
    }
    return true;
  });

  // 2. 각 child에 대해 decorator 처리
  for (const child of originalChildren) {
    // ... decorator 처리 로직
  }
}
```

**중요한 점**:
- `_processDecoratorsForChildren`은 **decorator 노드만** 제거합니다
- Decorator가 텍스트를 분할할 때 생성한 분할된 텍스트 VNode는 `originalChildren`에 포함되어 있습니다
- Decorator가 제거되면, 이 분할된 텍스트 VNode들이 그대로 남아있을 수 있습니다

### 텍스트 분할 시점

텍스트 분할은 `_processDataTemplateChild`에서 발생합니다:

```typescript
if ((marks && marks.length > 0) || inlineDecorators.length > 0) {
  flushTextParts();
  const nodes = this._buildMarkedRunsWithDecorators(resolved, textMarks, inlineDecorators, data);
  this._flushAndAddVNodes(flushTextParts, nodes, orderedChildren);
}
```

**핵심**: 
- Decorator가 있으면 `_buildMarkedRunsWithDecorators`가 텍스트를 분할하여 여러 VNode를 생성합니다
- 이 분할된 VNode들은 `orderedChildren`에 추가됩니다
- Decorator가 제거되면, `_processDecoratorsForChildren`은 decorator 노드만 제거하고, 분할된 텍스트 VNode는 그대로 남습니다

### 예상되는 문제

**시나리오**: Decorator가 제거되었을 때
1. VNodeBuilder는 decorator 없이 텍스트를 다시 빌드합니다
2. `_processDataTemplateChild`에서 `inlineDecorators.length === 0`이므로 분할하지 않고 `currentTextParts.push(resolved)`를 실행합니다
3. 하지만 이전에 decorator가 생성한 분할된 텍스트 VNode는 `originalChildren`에 남아있을 수 있습니다
4. `_processDecoratorsForChildren`은 decorator 노드만 제거하므로, 분할된 텍스트 VNode는 그대로 남습니다

**결론**: 
- VNodeBuilder가 decorator 제거 시 올바른 VNode를 생성하지 않을 가능성이 높습니다
- 분할된 텍스트 VNode가 `originalChildren`에 남아있어서, decorator 제거 후에도 분할된 구조가 유지됩니다

## 핵심 질문 재분석

### VNodeBuilder에서 VNode는 제대로 생성되고 있는가?

**답변**: 확인 필요. VNodeBuilder가 decorator 제거 시 올바른 VNode를 생성하는지 확인해야 합니다.

### Reconcile/Fiber 입장

- **Reconcile은 VNodeBuilder의 출력만 처리합니다**
- VNodeBuilder가 올바른 VNode를 생성하면, Reconcile/Fiber는 이를 그대로 DOM에 반영합니다
- VNodeBuilder가 잘못된 VNode를 생성하면, Reconcile/Fiber도 잘못된 DOM을 생성합니다

### VNodeBuilder에서 왜 안 지워지는가?

**가설 1: `_processDecoratorsForChildren`이 분할된 텍스트 VNode를 제거하지 않음**
- `_processDecoratorsForChildren`은 decorator 노드만 필터링합니다
- 분할된 텍스트 VNode는 decorator 노드가 아니므로 `originalChildren`에 남아있습니다
- `_processInlineDecorators`가 호출되지만, 이미 분할된 텍스트 VNode가 `originalChildren`에 있으면 다시 빌드하지 않을 수 있습니다

**가설 2: `_processInlineDecorators`가 분할된 텍스트를 다시 합치지 않음**
- `_processInlineDecorators`는 inline decorator를 처리합니다
- 하지만 decorator가 제거되었을 때, 이미 분할된 텍스트 VNode를 다시 합치지 않을 수 있습니다

**가설 3: VNodeBuilder가 전체를 다시 빌드하지 않음**
- VNodeBuilder는 `_processDecoratorsForChildren`에서 기존 children을 재사용합니다
- Decorator가 제거되었을 때, 분할된 텍스트 VNode가 있는 children을 그대로 재사용할 수 있습니다

## `_processInlineDecorators` 동작 분석

### 핵심 문제 발견

`_processDecoratorsForChildren`의 로직을 보면:

```typescript
for (const child of originalChildren) {
  if (isVNode(child)) {
    const childVNode = child as VNode;
    // Only process component VNodes (those with stype)
    if (!childVNode.stype) {
      // Non-component nodes (text, etc.) are added as-is
      newChildren.push(child);
      continue;
    }
    // ...
    // Process inline decorators and recursively process children
    this._processInlineDecorators(childVNode, nodeDecorators, String(childSid), data);
  }
}
```

**문제점**:
- `!childVNode.stype`인 경우 (분할된 텍스트 VNode 등)는 `newChildren.push(child)`로 그대로 추가됩니다
- `_processInlineDecorators`는 `stype`이 있는 VNode에만 호출됩니다
- **분할된 텍스트 VNode는 `stype`이 없으므로, decorator 제거 시에도 그대로 남아있습니다**

### `_processInlineDecorators`는 언제 호출되는가?

1. `_processDecoratorsForChildren`에서 `stype`이 있는 child VNode에 대해 호출됩니다
2. `_processDecorators`에서도 `stype`이 있는 VNode에 대해 호출됩니다

**하지만**: 분할된 텍스트 VNode는 `stype`이 없으므로, `_processInlineDecorators`가 호출되지 않습니다!

### 실제 문제

**시나리오**: Decorator가 제거되었을 때
1. `_processDecoratorsForChildren`이 호출됩니다
2. Decorator 노드는 필터링되어 제거됩니다
3. 하지만 분할된 텍스트 VNode (`{ tag: 'span', text: 'Hello' }`, `{ tag: 'span', text: 'World' }`)는 `stype`이 없으므로:
   - `!childVNode.stype` 조건에 걸려서 `newChildren.push(child)`로 그대로 추가됩니다
   - `_processInlineDecorators`가 호출되지 않습니다
4. 결과: 분할된 텍스트 VNode가 그대로 남아있습니다

**결론**: 
- **VNodeBuilder가 decorator 제거 시 올바른 VNode를 생성하지 않습니다**
- 분할된 텍스트 VNode는 `stype`이 없어서 `_processInlineDecorators`가 호출되지 않습니다
- 따라서 decorator 제거 시에도 분할된 텍스트 VNode가 그대로 남아있습니다

## 최종 원인 분석

### 핵심 문제

**VNodeBuilder는 decorator 제거 시 전체를 다시 빌드하지 않습니다**

1. **`_processDecoratorsForChildren`의 동작**:
   - Decorator 노드만 필터링하여 제거합니다
   - 기존 children을 재사용합니다 (`originalChildren`)
   - `stype`이 없는 VNode (분할된 텍스트 VNode 등)는 그대로 추가합니다

2. **분할된 텍스트 VNode의 특성**:
   - `stype`이 없습니다 (component VNode가 아님)
   - Decorator가 텍스트를 분할할 때 생성된 VNode입니다
   - `{ tag: 'span', text: 'Hello' }` 형태입니다

3. **`_processInlineDecorators`의 한계**:
   - `stype`이 있는 VNode에만 호출됩니다
   - 실제로는 아무것도 하지 않습니다 (주석: "Inline decorators are handled by _buildMarkedRunsWithDecorators")
   - 분할된 텍스트 VNode는 처리되지 않습니다

### 왜 안 지워지는가?

**답변**: VNodeBuilder가 decorator 제거 시 전체를 다시 빌드하지 않고, 기존 children을 재사용하기 때문입니다.

**흐름**:
1. Decorator가 있을 때: `_buildMarkedRunsWithDecorators`가 텍스트를 분할하여 여러 VNode 생성
2. Decorator가 제거되었을 때:
   - `_processDecoratorsForChildren`이 호출됨
   - Decorator 노드만 필터링하여 제거
   - 분할된 텍스트 VNode는 `stype`이 없어서 그대로 `newChildren`에 추가됨
   - `_processInlineDecorators`가 호출되지 않음
3. 결과: 분할된 텍스트 VNode가 그대로 남아있음

### 해결 방안

1. **VNodeBuilder 수정**: Decorator 제거 시 전체를 다시 빌드
   - `_processDecoratorsForChildren`에서 분할된 텍스트 VNode를 감지하고 다시 합치기
   - 또는 decorator 제거 시 해당 VNode의 children을 다시 빌드하기

2. **Reconcile 개선**: VNodeBuilder가 올바른 VNode를 생성하지 못하는 경우를 대비
   - Decorator 제거 시, 분할된 텍스트 요소를 제거하는 로직 추가
   - 하지만 이는 근본적인 해결책이 아닙니다 (VNodeBuilder가 올바른 VNode를 생성해야 함)

**권장 해결책**: VNodeBuilder 수정
- Decorator 제거 시 분할된 텍스트 VNode를 감지하고 다시 합치는 로직 추가
- 또는 decorator 제거 시 해당 VNode의 children을 다시 빌드하기

## 핵심 원칙 재확인

### VNodeBuilder는 단방향으로 VNode를 생성해야 함

**사용자 피드백**: "vnodebuilder 빌더는 단 방향으로 vnode 를 생성 해야해, 그러니깐 decorator 를 재사용 할 필요가 없는거야"

**답변**: 맞습니다!

### 현재 문제

`_processDecoratorsForChildren`이 기존 children을 재사용하고 있습니다:

```typescript
const originalChildren = vnode.children.filter((child: any) => {
  if (isVNode(child)) {
    return !isDecoratorNode(child);
  }
  return true;
});
```

**문제점**:
- 기존 `vnode.children`을 재사용합니다
- Decorator 노드만 필터링하고, 분할된 텍스트 VNode는 그대로 남겨둡니다
- 이것은 **양방향 업데이트** 방식입니다 (기존 VNode를 수정)

### 올바른 접근

**VNodeBuilder는 항상 model과 decorators를 기반으로 처음부터 VNode를 빌드해야 합니다**

1. **단방향 흐름**: Model + Decorators → VNode
2. **재사용 없음**: 기존 VNode를 재사용하거나 수정하지 않음
3. **항상 처음부터 빌드**: Decorator가 변경되면 전체를 다시 빌드

### 해결 방안

**`_processDecoratorsForChildren`을 제거하거나 수정**:
- 기존 children을 재사용하지 않고, model과 decorators를 기반으로 처음부터 빌드
- 또는 `_processDecoratorsForChildren`이 호출되기 전에 이미 올바른 VNode가 빌드되어 있어야 함

**핵심**: VNodeBuilder의 `build()` 메서드는 항상 model과 decorators를 받아서 처음부터 VNode를 빌드해야 합니다. 기존 VNode를 재사용하거나 수정하는 로직은 없어야 합니다.

