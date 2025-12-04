/**
 * ReconcileScheduler: lightweight coalescing utility for multiple render requests
 * - Modes: 'raf' | 'microtask' | 'immediate'
 * - For successive enqueues to the same container, only the last next is rendered
 */
export type BatchMode = 'raf' | 'microtask' | 'immediate';

export interface ReconcileFn<TVNode> {
  (prev: TVNode | null, next: TVNode | null, container: HTMLElement): void;
}

export class ReconcileScheduler<TVNode extends Record<string, any> = any> {
  private scheduled = false;
  private pendingPrev: TVNode | null = null;
  private pendingNext: TVNode | null = null;
  private pendingContainer: HTMLElement | null = null;
  private readonly render: ReconcileFn<TVNode>;
  private mode: BatchMode = 'raf';

  constructor(render: ReconcileFn<TVNode>, mode: BatchMode = 'raf') {
    this.render = render;
    this.mode = mode;
  }

  setMode(mode: BatchMode) {
    this.mode = mode;
  }

  /** 렌더 요청을 큐에 추가(코얼레싱 대상) */
  enqueue(prev: TVNode | null, next: TVNode | null, container: HTMLElement) {
    // Coalescing: 항상 pending prev를 사용하여 렌더 누락 방지
    // 첫 번째만 prev를 저장하고, 나머지는 pendingNext만 업데이트
    if (!this.scheduled) {
      this.pendingPrev = prev;
      this.pendingNext = next;
      this.pendingContainer = container;
      this.scheduled = true;
      
      if (this.mode === 'raf') {
        const raf = (typeof requestAnimationFrame !== 'undefined')
          ? requestAnimationFrame
          : ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as any);
        raf(() => this.flush());
      } else if (this.mode === 'microtask') {
        Promise.resolve().then(() => this.flush());
      } else {
        this.flush();
      }
    } else {
      // 기존 스케줄이 있으면 next만 업데이트 (prev는 유지)
      this.pendingNext = next;
    }
  }

  private getTextFromVNode(vnode: TVNode | null): string {
    if (!vnode) return 'null';
    const anyVNode: any = vnode as any;
    if (anyVNode && anyVNode.text !== undefined) return String(anyVNode.text);
    if (anyVNode && anyVNode.children) {
      const firstChild = anyVNode.children[0];
      if (firstChild && typeof firstChild === 'object' && (firstChild as any).text !== undefined) {
        return String((firstChild as any).text);
      }
    }
    return 'unknown';
  }

  /** 보류된 마지막 prev/next 쌍을 렌더 */
  flush() {
    this.scheduled = false;
    if (!this.pendingContainer) return;
    const prev = this.pendingPrev;
    const next = this.pendingNext;
    const container = this.pendingContainer;
    this.pendingPrev = null;
    this.pendingNext = null;
    this.pendingContainer = null;
    this.render(prev, next, container);
    
  }
}


