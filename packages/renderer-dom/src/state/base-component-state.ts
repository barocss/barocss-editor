import type { ComponentManager } from '../component-manager';
import { getBuildInProgressFlag } from '../vnode/utils/build-guard';
import { logger, LogCategory } from '../utils/logger';

export class BaseComponentState {
  protected data: Record<string, any> = {};
  private componentManager?: ComponentManager;
  private sid?: string;

  constructor(initial?: Record<string, any>, options?: {
    componentManager?: ComponentManager;
    sid?: string;
  }) {
    if (initial && typeof initial === 'object') {
      this.data = { ...initial };
    }
    if (options) {
      this.componentManager = options.componentManager;
      this.sid = options.sid;
    }
  }

  init(initial: Record<string, any>): void {
    if (!initial) return;
    Object.assign(this.data, initial);
  }

  set(patch: Record<string, any>): void {
    if (!patch) return;
    if (getBuildInProgressFlag()) {
      return;
    }
    // Prevent setState during updateComponent to avoid infinite loops
    if (this.componentManager && this.componentManager.getReconciling()) {
      logger.warn(LogCategory.COMPONENT, 'setState called during reconciliation, ignoring', {
        sid: this.sid,
        patch
      });
      return;
    }
    Object.assign(this.data, patch);
    
    // Emit changeState event if componentManager and sid are available
    if (this.componentManager && this.sid) {
      logger.debug(LogCategory.COMPONENT, 'emitting changeState', {
        sid: this.sid,
        patch,
        state: this.data
      });
      this.componentManager.emit('changeState', this.sid, {
        state: this.snapshot(),
        patch: patch
      });
    }
  }

  get<T = any>(key: string): T {
    return this.data[key] as T;
  }

  snapshot(): Record<string, any> {
    return { ...this.data };
  }

  /**
   * Mount component to DOM
   * This method will be called by Reconciler when a component needs to be mounted.
   * Implementation will be added later.
   * 
   * @param vnode - VNode to mount
   * @param container - Container element to mount into
   * @param context - Reconcile context
   * @returns Mounted DOM element or null
   */
  mount(vnode: any, container: HTMLElement, context: any): HTMLElement | null {
    // TODO: Implementation will be added later
    return null;
  }

  /**
   * Unmount component from DOM
   * This method will be called by Reconciler when a component needs to be unmounted.
   * Implementation will be added later.
   */
  unmount(): void {
    // TODO: Implementation will be added later
  }
}


