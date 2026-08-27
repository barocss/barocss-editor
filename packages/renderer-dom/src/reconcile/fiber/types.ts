import { VNode } from '../../vnode/types';

/**
 * Effect Tag - DOM manipulation type
 * 
 * Same concept as React's effectTag, indicates DOM manipulation to perform in Commit Phase
 */
export const EffectTag = {
  /** Need to insert new DOM element (mount) */
  PLACEMENT: 'PLACEMENT',
  /** Need to update existing DOM element (update) */
  UPDATE: 'UPDATE',
  /** Need to remove existing DOM element (unmount) */
  DELETION: 'DELETION',
} as const;

export type EffectTagType = typeof EffectTag[keyof typeof EffectTag] | null;

/**
 * Fiber Node - work unit
 * 
 * Similar structure to React's Fiber, structure for processing VNode in small units
 */
export interface FiberNode {
  // VNode info
  vnode: VNode;
  prevVNode: VNode | undefined;
  
  // DOM info
  domElement: HTMLElement | Text | null;
  parent: HTMLElement; // Actual DOM parent
  
  // Fiber tree structure
  parentFiber: FiberNode | null;      // Parent Fiber
  child: FiberNode | null;             // First child Fiber
  sibling: FiberNode | null;           // Next sibling Fiber
  return: FiberNode | null;            // Fiber to return to after work completes (usually same as parentFiber)
  
  // Work status
  effectTag: EffectTagType;
  alternate: FiberNode | null;         // Previous Fiber (for diffing)
  
  // Context
  context: any;

  /**
   * What this pass already did, for the pass after it.
   *
   * One entry so far: a node that **owns its DOM** is mounted in the render phase, because its
   * element is what the commit is about to place rather than something to put inside a wrapper. The
   * commit reads this so it does not mount the same component twice.
   */
  meta?: { mounted?: boolean };
  
  // Index (position in children array)
  index: number;
  
  // Primitive text children info (stored to process after child Fiber processing)
  primitiveTextChildren?: Array<{ text: string | number; index: number }>;
}

/**
 * Fiber work priority
 */
export enum FiberPriority {
  Immediate = 1,    // Process immediately (user input, etc.)
  High = 2,         // High priority
  Normal = 3,       // Normal priority
  Low = 4,          // Low priority
  Idle = 5          // Process during idle time
}

/**
 * Fiber work status
 */
export enum FiberWorkStatus {
  Pending = 'pending',     // Pending
  InProgress = 'in-progress', // In progress
  Completed = 'completed',     // Completed
  Cancelled = 'cancelled'      // Cancelled
}

