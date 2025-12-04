# Fiber 동기 모드 구현

## 구현 내용

### 1. FiberScheduler에 동기 모드 추가

**파일**: `packages/renderer-dom/src/reconcile/fiber/fiber-scheduler.ts`

- `syncMode` 플래그 추가
- `detectTestEnvironment()`: 테스트 환경 자동 감지
  - `process.env.VITEST === 'true'`
  - `process.env.NODE_ENV === 'test'`
  - `globalThis.vitest` 존재 여부
- `setSyncMode()`: 명시적으로 동기 모드 제어
- `isSyncMode()`: 동기 모드 여부 확인

### 2. workLoop() 수정

**동기 모드**:
```typescript
if (this.syncMode) {
  while (this.nextUnitOfWork) {
    this.nextUnitOfWork = this.performUnitOfWork(this.nextUnitOfWork);
  }
  // 즉시 완료 처리
  return;
}
```

**비동기 모드** (기존 로직):
- `requestIdleCallback` 또는 `requestAnimationFrame` 사용
- 작은 단위로 나눠서 처리

## 동작 방식

### 테스트 환경 (자동 동기 모드)

1. FiberScheduler 생성 시 자동으로 테스트 환경 감지
2. 동기 모드 활성화
3. 모든 Fiber 작업을 한 번에 처리
4. `renderer.render()` 호출 후 즉시 DOM 업데이트 완료
5. **`waitForFiber()` 불필요**

### 프로덕션 환경 (비동기 모드)

1. 테스트 환경이 아니면 비동기 모드로 작동
2. `requestIdleCallback` 또는 `requestAnimationFrame` 사용
3. 작은 단위로 나눠서 처리하여 브라우저 응답성 유지
4. 기존 동작과 동일

## 테스트 수정

### 변경 전
```typescript
renderer.render(container, model);
await waitForFiber(); // ❌ 불필요
expect(container.innerHTML).toBe('...');
```

### 변경 후
```typescript
renderer.render(container, model);
// 동기 모드에서 즉시 완료되므로 waitForFiber() 불필요
expect(container.innerHTML).toBe('...');
```

## 장점

1. **React와 유사한 패턴**
   - React는 테스트에서 `act()` 또는 `flushSync()` 사용
   - 우리는 자동으로 동기 모드 활성화

2. **테스트 코드 간소화**
   - `waitForFiber()` 제거
   - `async/await` 제거 가능

3. **프로덕션 성능 유지**
   - 프로덕션에서는 여전히 비동기 모드
   - 브라우저 응답성 유지

4. **명시적 제어 가능**
   - 필요시 `setSyncMode(true/false)`로 제어 가능

## 비동기 모드 사용 (프로덕션)

프로덕션 환경에서는 자동으로 비동기 모드로 작동합니다:

```typescript
// 프로덕션 환경
renderer.render(container, model);
// 비동기로 처리됨 (requestIdleCallback 사용)
// 완료를 기다리려면 onComplete 콜백 사용
```

## 주의사항

1. **테스트 환경 감지**
   - Vitest 환경 변수 확인
   - 정확한 감지를 위해 환경 변수 설정 확인 필요

2. **동기 모드 성능**
   - 테스트 환경에서만 사용
   - 프로덕션에서는 사용하지 않음 (브라우저 응답성 저하)

3. **CustomFiberScheduler**
   - `FiberScheduler`를 상속받으므로 동기 모드 자동 상속
   - 추가 수정 불필요

