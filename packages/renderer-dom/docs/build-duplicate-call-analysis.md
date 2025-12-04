# build 함수 중복 호출 분석

## 문제 상황

테스트 로그를 보면 `VNodeBuilder.build`가 각 `inline-text` 노드마다 두 번씩 호출되고 있습니다:

```
[VNodeBuilder.build] START: nodeType=inline-text, sid=text-1, stype=inline-text, decoratorsCount=0
[VNodeBuilder.build] START: nodeType=inline-text, sid=text-1, stype=inline-text, decoratorsCount=0
```

## 호출 경로 분석

### 1차 호출: DOMRenderer.render()

```
DOMRenderer.render()
  └─> builder.build(model.stype, model, options)  [1차 호출]
      └─> VNodeBuilder.build()
          └─> _buildElement() 또는 _buildComponent()
              └─> _processChild()
                  └─> slot 처리 시: this.build(childType, child) [slot 내부에서 재호출 가능]
```

### 2차 호출: updateComponent 내부

```
reconciler.reconcile()
  └─> reconcileVNodeChildren()
      └─> updateComponent() [__isReconciling이 false일 때만]
          └─> buildFromElementTemplate() [2차 호출]
              └─> _buildElement()
                  └─> _processChild()
                      └─> slot 처리 시: this.build(childType, child) [slot 내부에서 재호출 가능]
```

## 중복 호출이 발생하는 이유

### 시나리오 1: updateComponent에서 buildFromElementTemplate 호출

`updateComponent`는 컴포넌트의 이전/다음 상태를 비교하기 위해:
1. `buildFromElementTemplate(prevElementTemplate, ...)` 호출
2. `buildFromElementTemplate(nextElementTemplate, ...)` 호출

이 두 호출은 컴포넌트 내부의 자식 요소들(예: `inline-text`)을 다시 빌드하게 됩니다.

**문제**: 이미 `DOMRenderer.render()`에서 전체 VNode 트리를 빌드했는데, `updateComponent`에서 다시 빌드하고 있습니다.

### 시나리오 2: slot 처리에서 build 호출

`_renderSlotGetChildren` 메서드에서:
```typescript
const childVNode = this.build(childType, child, childBuildOptions);
```

slot의 자식 요소들을 처리할 때 `build`를 직접 호출합니다.

**문제**: slot이 있는 컴포넌트의 경우, `buildFromElementTemplate` 내부에서 slot을 처리하면서 `build`가 다시 호출됩니다.

## 해결 방안

### 방안 1: updateComponent에서 VNode 재사용

`updateComponent`에서 `buildFromElementTemplate`을 호출하는 대신, 이미 빌드된 VNode를 재사용:

```typescript
// 현재: buildFromElementTemplate 호출
const prevVNodeForReconcile = context.builder.buildFromElementTemplate(prevElementTemplate, dataForBuildPrev, prevBuildOptions);
const nextVNodeForReconcile = context.builder.buildFromElementTemplate(nextElementTemplate, dataForBuildNext, nextBuildOptions);

// 개선: 이미 빌드된 VNode 재사용
// nextVNode는 reconcileVNodeChildren에서 이미 빌드되었으므로 재사용 가능
const nextVNodeForReconcile = nextVNode; // 이미 빌드된 VNode
```

**문제**: `nextVNode`는 컴포넌트의 루트 VNode이지, 컴포넌트 내부의 자식 VNode가 아닙니다.

### 방안 2: __isReconciling 플래그로 build 호출 차단

`build` 메서드 내부에서 `__isReconciling` 플래그를 확인하여 재호출 방지:

```typescript
build(nodeType: string, data: ModelData = {}, options?: VNodeBuildOptions): VNode {
  // __isReconciling이 true이면 build를 건너뛰고 캐시된 VNode 반환
  if ((options as any)?.__isReconciling) {
    // 캐시된 VNode 반환 또는 최소한의 빌드만 수행
  }
  // ...
}
```

**문제**: 이렇게 하면 컴포넌트 내부의 자식 요소들이 제대로 빌드되지 않을 수 있습니다.

### 방안 3: buildFromElementTemplate 최적화

`buildFromElementTemplate`이 호출될 때, 이미 빌드된 VNode가 있으면 재사용:

```typescript
public buildFromElementTemplate(template: ElementTemplate, data: ModelData, options?: VNodeBuildOptions): VNode {
  // 캐시 키 생성
  const cacheKey = `${template.tag}-${JSON.stringify(data)}-${JSON.stringify(options)}`;
  
  // 캐시 확인
  if (this._buildCache?.has(cacheKey)) {
    return this._buildCache.get(cacheKey);
  }
  
  // 빌드 수행
  const vnode = this._buildElement(template, data, options);
  
  // 캐시 저장
  if (this._buildCache) {
    this._buildCache.set(cacheKey, vnode);
  }
  
  return vnode;
}
```

**문제**: 데이터가 변경되면 캐시가 무효화되어야 하는데, 이를 추적하기 어렵습니다.

### 방안 4: updateComponent 호출 조건 개선

`updateComponent`가 호출되는 조건을 더 엄격하게 제한:

```typescript
// 현재: __isReconciling이 false일 때만 호출
if (!isReconciling) {
  this.components.updateComponent(prevChildVNode || {} as VNode, childVNode, host, context || ({} as any));
}

// 개선: 컴포넌트가 실제로 변경되었을 때만 호출
if (!isReconciling && hasComponentChanged(prevChildVNode, childVNode)) {
  this.components.updateComponent(prevChildVNode || {} as VNode, childVNode, host, context || ({} as any));
}
```

**문제**: `hasComponentChanged`를 정확히 판단하기 어렵습니다.

## 권장 해결 방안

**방안 2 + 방안 4 조합**:

1. `updateComponent`에서 `buildFromElementTemplate`을 호출할 때, 이미 빌드된 VNode의 자식들을 재사용
2. `__isReconciling` 플래그를 `build` 메서드에 전달하여 불필요한 재빌드 방지
3. slot 처리에서도 `__isReconciling` 플래그를 확인하여 재호출 방지

## 다음 단계

1. `build` 메서드에 `__isReconciling` 플래그 지원 추가
2. `updateComponent`에서 이미 빌드된 VNode 재사용 로직 추가
3. slot 처리에서 `__isReconciling` 플래그 확인 로직 추가
4. 테스트로 검증

