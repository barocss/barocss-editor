# 테스트 커버리지 요약

## 전체 상향식 렌더링 패턴 테스트

### 1. 관련 테스트 파일

1. **`test/core/full-top-down-render-pattern.test.ts`** (신규 생성)
   - Model + Props + State = 문서 개념 테스트
   - changeState 이벤트 처리 테스트
   - 전체 상향식 빌드 검증

2. **`test/core/reconciler-component-state-integration.test.ts`**
   - changeState 이벤트 → 전체 재렌더링 테스트
   - renderScheduled 플래그로 중복 렌더링 방지 테스트
   - queueMicrotask를 통한 배치 처리 테스트
   - nextVNode 재사용 테스트

### 2. 테스트 커버리지

#### 2.1 Model + Props + State = 문서 개념

✅ **테스트됨**:
- `should build VNode tree from combined Model + Props + State`
  - Model, Props, State가 합쳐져서 하나의 "문서"를 구성하는지 검증
  - changeState 이벤트로 전체 "문서" 재빌드 검증

- `should rebuild entire document from top when state changes`
  - State 변경 시 최상위부터 전체 빌드되는지 검증
  - VNodeBuilder.build가 최상위부터 호출되는지 검증

#### 2.2 changeState 이벤트 처리

✅ **테스트됨**:
- `should receive changeState event and trigger full re-render with lastModel`
  - changeState 이벤트가 DOMRenderer에서 받아지는지 검증
  - lastModel, lastDecorators, lastRuntime을 사용하여 전체 재렌더링하는지 검증
  - queueMicrotask를 통한 비동기 처리 검증

- `should use lastModel, lastDecorators, lastRuntime for re-render`
  - 저장된 lastModel, lastDecorators, lastRuntime이 재렌더링에 사용되는지 검증

- `should prevent duplicate renders with renderScheduled flag`
  - renderScheduled 플래그로 중복 렌더링이 방지되는지 검증
  - 빠른 연속 state 변경 시 한 번만 렌더링되는지 검증

- `should batch multiple changeState events with queueMicrotask`
  - 여러 changeState 이벤트가 queueMicrotask로 배치 처리되는지 검증
  - microtask 전에는 렌더링이 호출되지 않는지 검증

#### 2.3 전체 상향식 빌드 검증

✅ **테스트됨**:
- `should build from top to bottom when VNodeBuilder.build is called`
  - VNodeBuilder.build가 최상위부터 호출되는지 검증
  - 빌드 순서가 top-down인지 검증

- `should reconcile entire VNode tree from top to bottom`
  - Reconciler.reconcile이 전체 VNode 트리를 순회하는지 검증
  - 최상위 VNode부터 reconcile이 시작되는지 검증

### 3. changeState 플로우 테스트 상세

#### 3.1 DOMRenderer에서 changeState 이벤트 수신

**테스트**: `should receive changeState event and trigger full re-render with lastModel`

```typescript
// 1. Initial render (lastModel 저장)
renderer.render(container, model);

// 2. changeState 이벤트 발생
componentManager.emit('changeState', 'comp-1', { state: { ... } });

// 3. queueMicrotask 대기
await new Promise(resolve => queueMicrotask(resolve));

// 4. render가 lastModel과 함께 호출되는지 검증
expect(renderSpy).toHaveBeenCalled();
expect(lastCall[1]).toEqual(expect.objectContaining({ sid: 'doc-1' })); // lastModel
```

**검증 사항**:
- ✅ changeState 이벤트가 DOMRenderer에서 수신됨
- ✅ renderScheduled 플래그로 중복 방지
- ✅ queueMicrotask를 통한 비동기 처리
- ✅ lastModel, lastDecorators, lastRuntime 사용

#### 3.2 전체 재렌더링 플로우

**테스트**: `should rebuild entire document from top when state changes`

```typescript
// 1. State 변경
instance.state = { count: 10 };

// 2. changeState 이벤트 발생
componentManager.emit('changeState', 'child-1', { ... });

// 3. VNodeBuilder.build가 최상위부터 호출되는지 검증
expect(buildSpy).toHaveBeenCalled();
expect(calls[0][0]).toBe('parent'); // 최상위부터 빌드
```

**검증 사항**:
- ✅ 최상위부터 전체 VNode 트리 빌드
- ✅ 전체 VNode 트리 reconcile
- ✅ 컴포넌트 하나만 업데이트하지 않음

### 4. 테스트 실행 결과

```
✅ test/core/full-top-down-render-pattern.test.ts
   - 8개 테스트 모두 통과

✅ test/core/reconciler-component-state-integration.test.ts
   - 7개 테스트 모두 통과
```

### 5. 부족한 테스트 영역

현재 테스트로 충분히 커버되고 있으나, 다음 영역을 추가로 검증할 수 있습니다:

1. **복잡한 중첩 구조에서의 전체 빌드**
   - 깊게 중첩된 컴포넌트 구조에서도 최상위부터 빌드되는지

2. **여러 컴포넌트 동시 State 변경**
   - 여러 컴포넌트의 state가 동시에 변경될 때도 한 번만 렌더링되는지

3. **Props 변경 시 전체 빌드**
   - Props 변경 시에도 전체 빌드가 이루어지는지

### 6. 요약

✅ **Model + Props + State = 문서 개념**: 테스트됨
✅ **changeState 이벤트 처리**: 테스트됨
✅ **전체 상향식 빌드**: 테스트됨
✅ **lastModel, lastDecorators, lastRuntime 사용**: 테스트됨
✅ **renderScheduled 플래그**: 테스트됨
✅ **queueMicrotask 배치 처리**: 테스트됨

모든 핵심 개념과 플로우가 테스트로 검증되었습니다.

