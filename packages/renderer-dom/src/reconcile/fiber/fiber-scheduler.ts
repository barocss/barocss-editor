import { FiberNode, FiberPriority, FiberWorkStatus, EffectTag } from './types';

/**
 * Fiber Scheduler
 * 
 * Break Fiber work into small units and yield so browser can handle other work
 */
/**
 * Fiber reconcile function type
 * Function that performs actual reconcile logic
 */
export type FiberReconcileFunction = (
  fiber: FiberNode
) => void;

export class FiberScheduler {
  private workInProgress: FiberNode | null = null;
  private nextUnitOfWork: FiberNode | null = null;
  private reconcileFunction: FiberReconcileFunction;
  private onCompleteCallback: (() => void) | null = null;
  
  // Time limit (yield every 5ms)
  private timeSlice = 5; // milliseconds
  
  // Work status
  private workStatus: FiberWorkStatus = FiberWorkStatus.Pending;
  
  // Sync mode (used in test environment)
  private syncMode: boolean = false;
  
  constructor(reconcileFunction: FiberReconcileFunction, onComplete?: () => void) {
    this.reconcileFunction = reconcileFunction;
    this.onCompleteCallback = onComplete || null;
    
    // Detect test environment: automatically enable sync mode
    this.syncMode = this.detectTestEnvironment();
  }
  
  /**
   * Detect test environment
   */
  private detectTestEnvironment(): boolean {
    // Check Vitest environment variables
    if (typeof process !== 'undefined') {
      // VITEST environment variable (automatically set by vitest)
      if (process.env.VITEST === 'true' || process.env.VITEST === '1') {
        return true;
      }
      // If NODE_ENV is test
      if (process.env.NODE_ENV === 'test') {
        return true;
      }
      // Can also consider CI environment as test, but only explicitly here
    }
    
    // Check if vitest exists in globalThis
    if (typeof globalThis !== 'undefined') {
      if ((globalThis as any).vitest) {
        return true;
      }
      // If vitest/globals is enabled
      if ((globalThis as any).__vitest__) {
        return true;
      }
    }
    
    // Check import.meta.vitest (ESM environment)
    try {
      // @ts-ignore - import.meta is only available in ESM environment
      if (typeof import.meta !== 'undefined' && (import.meta as any).vitest) {
        return true;
      }
    } catch {
      // Environment without import.meta (Node.js CJS, etc.)
    }
    
    return false;
  }
  
  /**
   * Set sync mode (when explicitly controlling)
   */
  setSyncMode(enabled: boolean): void {
    this.syncMode = enabled;
  }
  
  /**
   * Check if sync mode is enabled
   */
  isSyncMode(): boolean {
    return this.syncMode;
  }
  
  /**
   * Start Fiber work
   * 
   * @param rootFiber - Root Fiber Node
   * @param priority - Work priority
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
    // Synchronous mode: process all work at once
    if (this.syncMode) {
      while (this.nextUnitOfWork) {
        this.nextUnitOfWork = this.performUnitOfWork(this.nextUnitOfWork);
      }
      // All work completed
      this.workStatus = FiberWorkStatus.Completed;
      this.commitWork();
      // Call completion callback
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
      }
      return;
    }
    
    // Asynchronous mode: process in small units (existing logic)
    const startTime = performance.now();
    
    // Adjust timeSlice according to priority
    const timeLimit = this.getTimeSliceForPriority(priority);
    
    while (this.nextUnitOfWork && this.shouldYield(startTime, timeLimit)) {
      // Perform unit work
      this.nextUnitOfWork = this.performUnitOfWork(this.nextUnitOfWork);
    }
    
    // Continue in next frame if work remains
    if (this.nextUnitOfWork) {
      // Use requestIdleCallback (browser processes during idle time)
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(
          () => this.workLoop(priority),
          { timeout: 5 }
        );
      } else {
        // Use requestAnimationFrame if requestIdleCallback is not available
        requestAnimationFrame(() => this.workLoop(priority));
      }
    } else {
      // All work completed
      this.workStatus = FiberWorkStatus.Completed;
      this.commitWork();
      // Call completion callback
      if (this.onCompleteCallback) {
        this.onCompleteCallback();
      }
    }
  }
  
  /**
   * Return timeSlice according to priority
   */
  private getTimeSliceForPriority(priority: FiberPriority): number {
    switch (priority) {
      case FiberPriority.Immediate:
        return 10; // Immediate processing (allocate longer time)
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
   * Perform unit work
   * Reconcile one Fiber and return next Fiber
   */
  protected performUnitOfWork(fiber: FiberNode): FiberNode | null {
    // 1. Reconcile current Fiber
    this.reconcileFiber(fiber);
    
    // 2. Return child if exists (next work)
    if (fiber.child) {
      return fiber.child;
    }
    
    // 3. Return sibling if exists
    if (fiber.sibling) {
      return fiber.sibling;
    }
    
    // 4. Go back to parent and find sibling
    // IMPORTANT: When going back to parent, all children of parent have been processed,
    // so must perform parent's post-processing (remove primitive text, stale decorator)
    // To do this, call fiberReconcile again on parent
    let nextFiber = fiber.return;
    while (nextFiber) {
      // When returning to parent, all of parent's children have been processed
      // Call fiberReconcile again on parent to perform post-processing
      // (fiberReconcile only performs post-processing when there are no children,
      //  so when returning to parent, all children are processed and post-processing is needed)
      this.reconcileFiber(nextFiber);
      
      if (nextFiber.sibling) {
        return nextFiber.sibling;
      }
      nextFiber = nextFiber.return;
    }
    
    return null; // Complete
  }
  
  /**
   * Fiber reconcile
   * Call actual reconcile function
   */
  protected reconcileFiber(fiber: FiberNode): void {
    // Call reconcile function provided externally
    this.reconcileFunction(fiber);
    
    // Determine effectTag (may be set by reconcile function)
    if (!fiber.effectTag) {
      if (!fiber.prevVNode) {
        fiber.effectTag = EffectTag.PLACEMENT;
      } else if (fiber.vnode !== fiber.prevVNode) {
        fiber.effectTag = EffectTag.UPDATE;
      }
    }
  }
  
  /**
   * Callback called after all work completes
   * Actual DOM manipulation is performed in reconcileFunction, so only update state here
   */
  private commitWork(): void {
    // Handle work completion
    // Actual DOM manipulation already performed in reconcileFunction
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

