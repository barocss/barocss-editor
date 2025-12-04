# Fiber 동기 vs 비동기 처리 비교

## React의 접근 방식

### React는 테스트에서 어떻게 동작하는가?

1. **`act()` 사용**
   ```typescript
   import { act } from '@testing-library/react';
   
   act(() => {
     render(<Component />);
   });
   // act() 내부에서 모든 업데이트가 완료될 때까지 기다림
   ```

2. **동기 모드 지원**
   - React는 테스트 환경에서도 동기적으로 작동할 수 있음
   - `flushSync()`를 사용하면 강제로 동기 렌더링 가능
   ```typescript
   import { flushSync } from 'react-dom';
   
   flushSync(() => {
     root.render(<Component />);
   });
   // 즉시 완료, DOM이 업데이트됨
   ```

3. **자동 배치**
   - React는 자동으로 업데이트를 배치하고 플러시함
   - 테스트 환경에서는 대부분 동기적으로 처리됨

## 우리 구현의 문제점

### 현재 상황

1. **항상 비동기로 작동**
   ```typescript
   // FiberScheduler.workLoop()
   if (this.nextUnitOfWork) {
     // 항상 requestIdleCallback 또는 requestAnimationFrame 사용
     requestIdleCallback(() => this.workLoop(priority));
   }
   ```

2. **테스트 환경에서도 비동기**
   - 테스트 환경에서도 `requestIdleCallback`/`requestAnimationFrame` 사용
   - DOM 업데이트가 완료되기 전에 테스트가 실행됨
   - `waitForFiber()`로 임시 해결

3. **왜 이렇게 구현했는가?**
   - 실제 브라우저 환경에서의 동작을 시뮬레이션
   - 하지만 테스트 환경에서는 불필요한 복잡도

## 해결 방안

### 방안 1: 테스트 환경에서 동기 모드 지원 (권장)

FiberScheduler에 동기 모드 추가:

```typescript
export class FiberScheduler {
  private syncMode: boolean = false;
  
  setSyncMode(enabled: boolean): void {
    this.syncMode = enabled;
  }
  
  private workLoop(priority: FiberPriority): void {
    const startTime = performance.now();
    const timeLimit = this.getTimeSliceForPriority(priority);
    
    // 동기 모드: 모든 작업을 한 번에 처리
    if (this.syncMode) {
      while (this.nextUnitOfWork) {
        this.nextUnitOfWork = this.performUnitOfWork(this.nextUnitOfWork);
      }
      // 완료 처리
      this.workStatus = FiberWorkStatus.Completed;
      this.commitWork();
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
      }
      return;
    }
    
    // 비동기 모드 (기존 로직)
    while (this.nextUnitOfWork && this.shouldYield(startTime, timeLimit)) {
      this.nextUnitOfWork = this.performUnitOfWork(this.nextUnitOfWork);
    }
    
    if (this.nextUnitOfWork) {
      requestIdleCallback(() => this.workLoop(priority));
    } else {
      // 완료 처리
    }
  }
}
```

테스트에서 사용:

```typescript
// 테스트 setup
beforeEach(() => {
  // FiberScheduler를 동기 모드로 설정
  // 또는 테스트 환경 변수로 자동 감지
});

// 테스트 코드
renderer.render(container, model);
// 동기 모드에서는 즉시 완료되므로 waitForFiber() 불필요
expect(container.innerHTML).toBe('...');
```

### 방안 2: `flushSync()` 같은 API 제공

```typescript
class DOMRenderer {
  render(...): void {
    // 비동기 (기존)
  }
  
  renderSync(...): void {
    // 동기 버전
    const vnode = this.builder.build(...);
    // FiberScheduler를 동기 모드로 실행
    this.reconciler.reconcileSync(container, vnode, ...);
  }
}
```

### 방안 3: 환경 감지로 자동 전환

```typescript
// 테스트 환경 감지
const isTestEnvironment = typeof process !== 'undefined' && 
  (process.env.NODE_ENV === 'test' || process.env.VITEST);

// FiberScheduler 생성 시
const scheduler = new FiberScheduler(fiberReconcile, onComplete);
if (isTestEnvironment) {
  scheduler.setSyncMode(true);
}
```

## 권장 사항

### 단기: 방안 3 (환경 감지)

- 테스트 환경에서 자동으로 동기 모드 활성화
- 기존 코드 변경 최소화
- `waitForFiber()` 제거 가능

### 장기: 방안 2 (`renderSync()` 추가)

- 명시적인 동기/비동기 선택 가능
- React의 `flushSync()`와 유사한 패턴
- 더 나은 제어 가능

## 결론

**React는 테스트에서 `waitForFiber()`를 사용하지 않습니다:**
- React는 `act()` 또는 `flushSync()` 사용
- 테스트 환경에서 자동으로 동기적으로 작동

**우리가 `waitForFiber()`를 사용하는 이유:**
- 우리의 Fiber 스케줄러가 항상 비동기로 작동
- 테스트 환경에서도 비동기로 작동하여 DOM 업데이트가 지연됨

**해결책:**
- 테스트 환경에서 동기 모드 지원 추가
- 또는 `renderSync()` 같은 명시적 동기 API 제공
- `waitForFiber()`는 임시 해결책일 뿐

