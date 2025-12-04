# Renderer 비동기 처리 고려사항

## 현재 상태

### 1. DOMRenderer.render()
```typescript
render(
  container: HTMLElement,
  model: ModelData,
  decorators: Decorator[] = [],
  runtime?: Record<string, any>,
  selection?: { ... }
): void {
  // VNode 빌드 (동기)
  const vnode = this.builder.build(model.stype, model, { ... });
  
  // Reconcile (비동기 - Fiber 기반)
  this.reconciler.reconcile(container, vnode, model, runtime, decorators, selection);
  // ⚠️ reconcile은 즉시 반환되지만, 실제 DOM 업데이트는 비동기로 진행됨
}
```

### 2. Reconciler.reconcile()
```typescript
reconcile(...): void {
  // Fiber 기반 reconcile (비동기)
  reconcileWithFiber(container, rootVNode, prevVNode, context, fiberDeps, () => {
    // 완료 콜백
  });
  // ⚠️ 즉시 반환되지만, 실제 작업은 Fiber Scheduler가 비동기로 처리
}
```

## 문제점

1. **테스트 코드에서 await 사용**
   ```typescript
   await editorView.render(model as any); // ❌ render()는 void 반환
   ```

2. **완료 시점을 알 수 없음**
   - `render()` 호출 후 즉시 반환되지만, 실제 DOM 업데이트는 아직 진행 중일 수 있음
   - 테스트에서 DOM 상태를 확인하려면 `waitForFiber()` 같은 유틸리티가 필요

3. **React와의 차이점**
   - React 18: `createRoot().render()`는 동기 함수지만, 내부적으로는 비동기 처리
   - 하지만 React는 `flushSync()` 같은 동기 버전도 제공

## 해결 방안

### 방안 1: 현재 구조 유지 (권장)

**장점**:
- ✅ 기존 API 호환성 유지
- ✅ React와 유사한 패턴
- ✅ 호출자가 완료를 기다릴 필요가 없는 경우가 많음

**단점**:
- ⚠️ 완료를 기다려야 하는 경우 유틸리티 필요 (`waitForFiber()`)
- ⚠️ 테스트 코드에서 매번 `await waitForFiber()` 호출 필요

**사용 예시**:
```typescript
// 일반 사용
renderer.render(container, model); // 즉시 반환, 비동기로 처리

// 테스트에서 완료 대기
renderer.render(container, model);
await waitForFiber(); // Fiber 완료 대기
expect(container.innerHTML).toBe('...');
```

### 방안 2: render()를 비동기로 변경

**장점**:
- ✅ 완료 시점을 명확히 알 수 있음
- ✅ 테스트 코드가 간단해짐 (`await render()`)
- ✅ Promise 체이닝 가능

**단점**:
- ⚠️ 기존 API 변경 (breaking change)
- ⚠️ 모든 호출부 수정 필요
- ⚠️ 완료를 기다릴 필요가 없는 경우에도 await 필요

**사용 예시**:
```typescript
// 일반 사용
await renderer.render(container, model); // 완료 대기

// 테스트
await renderer.render(container, model);
expect(container.innerHTML).toBe('...'); // 완료 후 확인
```

### 방안 3: 하이브리드 접근 (동기 + 비동기 버전)

**장점**:
- ✅ 기존 API 호환성 유지
- ✅ 필요시 비동기 버전 사용 가능
- ✅ 유연성

**단점**:
- ⚠️ API 복잡도 증가
- ⚠️ 두 가지 패턴 혼재 가능

**사용 예시**:
```typescript
// 동기 버전 (기존)
renderer.render(container, model); // 즉시 반환

// 비동기 버전 (새로 추가)
await renderer.renderAsync(container, model); // 완료 대기
```

## 권장 사항

### 즉시 적용: 방안 1 유지

현재 구조를 유지하되, 테스트 코드를 수정:

```typescript
// 테스트 코드 수정
renderer.render(container, model);
await waitForFiber(); // Fiber 완료 대기
expect(container.innerHTML).toBe('...');
```

### 장기 개선: 방안 3 고려

필요시 비동기 버전 추가:

```typescript
// DOMRenderer에 추가
async renderAsync(
  container: HTMLElement,
  model: ModelData,
  decorators: Decorator[] = [],
  runtime?: Record<string, any>,
  selection?: { ... }
): Promise<void> {
  const vnode = this.builder.build(model.stype, model, { ... });
  
  return new Promise<void>((resolve) => {
    this.reconciler.reconcile(container, vnode, model, runtime, decorators, selection, () => {
      resolve(); // Fiber 완료 시 resolve
    });
  });
}
```

## 결론

**현재는 방안 1을 유지하는 것을 권장합니다:**
1. 기존 API 호환성 유지
2. React와 유사한 패턴
3. 대부분의 경우 완료를 기다릴 필요 없음
4. 테스트에서만 `waitForFiber()` 사용

**필요시 방안 3을 추가:**
- 완료를 기다려야 하는 특수한 경우를 위해 `renderAsync()` 메서드 추가
- 기존 `render()`는 그대로 유지

