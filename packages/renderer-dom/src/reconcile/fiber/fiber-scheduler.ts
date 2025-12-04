import { FiberNode, FiberPriority, FiberWorkStatus, EffectTag } from './types';

/**
 * Fiber Scheduler
 * 
 * Fiber 작업을 작은 단위로 나눠서 처리하고, 브라우저가 다른 작업을 처리할 수 있도록 yield
 */
/**
 * Fiber reconcile 함수 타입
 * 실제 reconcile 로직을 수행하는 함수
 */
export type FiberReconcileFunction = (
  fiber: FiberNode
) => void;

export class FiberScheduler {
  private workInProgress: FiberNode | null = null;
  private nextUnitOfWork: FiberNode | null = null;
  private reconcileFunction: FiberReconcileFunction;
  private onCompleteCallback: (() => void) | null = null;
  
  // 시간 제한 (5ms마다 yield)
  private timeSlice = 5; // milliseconds
  
  // 작업 상태
  private workStatus: FiberWorkStatus = FiberWorkStatus.Pending;
  
  // 동기 모드 (테스트 환경에서 사용)
  private syncMode: boolean = false;
  
  constructor(reconcileFunction: FiberReconcileFunction, onComplete?: () => void) {
    this.reconcileFunction = reconcileFunction;
    this.onCompleteCallback = onComplete || null;
    
    // 테스트 환경 감지: 자동으로 동기 모드 활성화
    this.syncMode = this.detectTestEnvironment();
  }
  
  /**
   * 테스트 환경 감지
   */
  private detectTestEnvironment(): boolean {
    // Vitest 환경 변수 확인
    if (typeof process !== 'undefined') {
      // VITEST 환경 변수 (vitest가 자동으로 설정)
      if (process.env.VITEST === 'true' || process.env.VITEST === '1') {
        return true;
      }
      // NODE_ENV가 test인 경우
      if (process.env.NODE_ENV === 'test') {
        return true;
      }
      // CI 환경에서도 테스트로 간주할 수 있지만, 여기서는 명시적으로만
    }
    
    // globalThis에 vitest가 있는지 확인
    if (typeof globalThis !== 'undefined') {
      if ((globalThis as any).vitest) {
        return true;
      }
      // vitest/globals가 활성화된 경우
      if ((globalThis as any).__vitest__) {
        return true;
      }
    }
    
    // import.meta.vitest 확인 (ESM 환경)
    try {
      // @ts-ignore - import.meta는 ESM 환경에서만 사용 가능
      if (typeof import.meta !== 'undefined' && (import.meta as any).vitest) {
        return true;
      }
    } catch {
      // import.meta가 없는 환경 (Node.js CJS 등)
    }
    
    return false;
  }
  
  /**
   * 동기 모드 설정 (명시적으로 제어하려는 경우)
   */
  setSyncMode(enabled: boolean): void {
    this.syncMode = enabled;
  }
  
  /**
   * 동기 모드 여부 확인
   */
  isSyncMode(): boolean {
    return this.syncMode;
  }
  
  /**
   * Fiber 작업 시작
   * 
   * @param rootFiber - 루트 Fiber Node
   * @param priority - 작업 우선순위
   */
  scheduleWork(rootFiber: FiberNode, priority: FiberPriority = FiberPriority.Normal): void {
    this.nextUnitOfWork = rootFiber;
    this.workStatus = FiberWorkStatus.InProgress;
    this.workLoop(priority);
  }
  
  /**
   * 작업 루프
   * 작은 단위로 작업을 처리하고 yield
   */
  private workLoop(priority: FiberPriority): void {
    // 동기 모드: 모든 작업을 한 번에 처리
    if (this.syncMode) {
      while (this.nextUnitOfWork) {
        this.nextUnitOfWork = this.performUnitOfWork(this.nextUnitOfWork);
      }
      // 모든 작업 완료
      this.workStatus = FiberWorkStatus.Completed;
      this.commitWork();
      // 완료 콜백 호출
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
      }
      return;
    }
    
    // 비동기 모드: 작은 단위로 나눠서 처리 (기존 로직)
    const startTime = performance.now();
    
    // 우선순위에 따라 timeSlice 조정
    const timeLimit = this.getTimeSliceForPriority(priority);
    
    while (this.nextUnitOfWork && this.shouldYield(startTime, timeLimit)) {
      // 단위 작업 수행
      this.nextUnitOfWork = this.performUnitOfWork(this.nextUnitOfWork);
    }
    
    // 아직 작업이 남아있으면 다음 프레임에서 계속
    if (this.nextUnitOfWork) {
      // requestIdleCallback 사용 (브라우저가 유휴 시간에 처리)
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(
          () => this.workLoop(priority),
          { timeout: 5 }
        );
      } else {
        // requestIdleCallback이 없으면 requestAnimationFrame 사용
        requestAnimationFrame(() => this.workLoop(priority));
      }
    } else {
      // 모든 작업 완료
      this.workStatus = FiberWorkStatus.Completed;
      this.commitWork();
      // 완료 콜백 호출
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
      }
    }
  }
  
  /**
   * 우선순위에 따른 timeSlice 반환
   */
  private getTimeSliceForPriority(priority: FiberPriority): number {
    switch (priority) {
      case FiberPriority.Immediate:
        return 10; // 즉시 처리 (더 긴 시간 할당)
      case FiberPriority.High:
        return 8;
      case FiberPriority.Normal:
        return 5;
      case FiberPriority.Low:
        return 3;
      case FiberPriority.Idle:
        return 2;
      default:
        return 5;
    }
  }
  
  /**
   * 시간 제한 체크
   */
  private shouldYield(startTime: number, timeLimit: number): boolean {
    return performance.now() - startTime < timeLimit;
  }
  
  /**
   * 단위 작업 수행
   * 하나의 Fiber를 reconcile하고 다음 Fiber 반환
   */
  protected performUnitOfWork(fiber: FiberNode): FiberNode | null {
    // 1. 현재 Fiber reconcile
    this.reconcileFiber(fiber);
    
    // 2. 자식이 있으면 자식 반환 (다음 작업)
    if (fiber.child) {
      return fiber.child;
    }
    
    // 3. 형제가 있으면 형제 반환
    if (fiber.sibling) {
      return fiber.sibling;
    }
    
    // 4. 부모로 돌아가서 형제 찾기
    // IMPORTANT: 부모로 돌아갈 때, 부모의 모든 자식이 처리되었으므로
    // 부모의 후처리(primitive text, stale decorator 제거)를 수행해야 함
    // 이를 위해 부모에 대해 fiberReconcile을 다시 호출
    let nextFiber = fiber.return;
    while (nextFiber) {
      // 부모로 돌아갈 때, 부모의 자식이 모두 처리되었으므로
      // 부모에 대해 fiberReconcile을 다시 호출하여 후처리 수행
      // (fiberReconcile은 자식이 없을 때만 후처리를 수행하므로, 
      //  부모로 돌아갈 때는 부모의 자식이 모두 처리된 상태이므로 후처리가 필요함)
      this.reconcileFiber(nextFiber);
      
      if (nextFiber.sibling) {
        return nextFiber.sibling;
      }
      nextFiber = nextFiber.return;
    }
    
    return null; // 완료
  }
  
  /**
   * Fiber reconcile
   * 실제 reconcile 함수를 호출
   */
  protected reconcileFiber(fiber: FiberNode): void {
    // 외부에서 제공된 reconcile 함수 호출
    this.reconcileFunction(fiber);
    
    // effectTag 결정 (reconcile 함수에서 설정할 수도 있음)
    if (!fiber.effectTag) {
      if (!fiber.prevVNode) {
        fiber.effectTag = EffectTag.PLACEMENT;
      } else if (fiber.vnode !== fiber.prevVNode) {
        fiber.effectTag = EffectTag.UPDATE;
      }
    }
  }
  
  /**
   * 모든 작업 완료 후 호출되는 콜백
   * 실제 DOM 조작은 reconcileFunction에서 수행되므로 여기서는 상태만 업데이트
   */
  private commitWork(): void {
    // 작업 완료 처리
    // 실제 DOM 조작은 reconcileFunction에서 이미 수행됨
    this.workInProgress = null;
  }
  
  /**
   * 작업 취소
   */
  cancel(): void {
    this.workStatus = FiberWorkStatus.Cancelled;
    this.nextUnitOfWork = null;
  }
  
  /**
   * 작업 상태 확인
   */
  getStatus(): FiberWorkStatus {
    return this.workStatus;
  }
}

