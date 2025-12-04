/**
 * Work In Progress interfaces for DOM Reconcile
 * - Defines Work In Progress nodes for efficient DOM reconciliation
 * - Supports priority-based processing and performance tracking
 * - Uses types from @barocss/reconcile to avoid duplication
 */
import { VNode } from './vnode/types';

// Local minimal types to decouple from external reconcile package
export type RenderPriority = 0 | 1 | 2 | 3;

export interface ReconcileStats {
  frameCount: number;
  averageFrameTime: number;
  totalNodes: number;
  updatedNodes: number;
  insertedNodes: number;
  removedNodes: number;
  replacedNodes: number;
}

export interface DOMWorkInProgress {
  id: string;
  sid?: string;
  type: 'text' | 'element' | 'component' | 'portal' | 'canvas' | 'conditional';
  vnode: VNode;
  domNode?: Node;
  parent?: DOMWorkInProgress;
  children: DOMWorkInProgress[];
  sibling?: DOMWorkInProgress;
  child?: DOMWorkInProgress;
  // Optional ordering hints from reconciler
  desiredIndex?: number;
  orderIndex?: number;
  
  // 변경사항 추적
  needsUpdate: boolean;
  isNew: boolean;
  isDeleted: boolean;
  changes: string[];
  
  // 이전 상태
  previousVNode?: VNode;
  previousDOMNode?: Node;
  
  // 렌더링 상태
  renderPriority: RenderPriority;
  isRendered: boolean;
  startTime?: number;
  endTime?: number;
  error?: any;
  
  // 성능 추적
  renderTime?: number;
  updateTime?: number;
}

// Local alias for stats type
export type DOMReconcileStats = ReconcileStats;

// Aliases for terminology: RenderUnit is the conceptual name for DOMWorkInProgress
export type RenderUnit = DOMWorkInProgress;
