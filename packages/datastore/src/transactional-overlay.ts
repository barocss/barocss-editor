/**
 * TransactionalOverlay
 *
 * Non-invasive skeleton for a copy-on-write transactional overlay.
 * This file intentionally avoids importing `DataStore` to prevent
 * circular dependencies while we integrate step by step.
 */

export type OverlayNodeMap = Map<string, unknown>;

export interface OverlayStateSnapshot {
  baseVersion: number;
  sessionId: number;
}

export interface AtomicOperationRecord {
  type: 'create' | 'update' | 'delete' | 'move';
  nodeId: string;
  data?: unknown;
  timestamp: number;
  parentId?: string;
  position?: number;
}

export class TransactionalOverlay {
  // Copy-on-Write overlays and bookkeeping
  private readonly overlayNodes: OverlayNodeMap = new Map();
  private readonly deletedNodeIds: Set<string> = new Set();
  private readonly touchedParents: Set<string> = new Set();
  /**
   * Base-map state as it was before this transaction first wrote each node.
   *
   * Content operations mirror their change onto the node object they already
   * hold so that later operations in the same transaction read the new state.
   * That object is often the base node, so the write escapes the overlay and a
   * rollback would otherwise leave it behind. Restoring these on rollback is
   * what makes the discard complete.
   */
  private readonly baseSnapshots: Map<string, unknown> = new Map();
  private opBuffer: AtomicOperationRecord[] = [];
  private active: boolean = false;

  constructor(_options: { getVersion: () => number; sessionId: number }) {
    // options reserved for future snapshot/versioning
  }

  begin(): void {
    if (this.active) return;
    this.active = true;
    this.opBuffer = [];
    this.overlayNodes.clear();
    this.deletedNodeIds.clear();
    this.touchedParents.clear();
    this.baseSnapshots.clear();
  }

  end(): AtomicOperationRecord[] {
    // Return a shallow copy to prevent external mutation
    return this.opBuffer.slice();
  }

  getCollectedOperations(): AtomicOperationRecord[] {
    return this.opBuffer.slice();
  }

  commit(_applyToBase: (ops: AtomicOperationRecord[]) => void): void {
    if (!this.active) return;
    const ops = this.opBuffer.slice();
    // Delegate application to caller to avoid direct coupling for now
    _applyToBase(ops);
    this.reset();
  }

  rollback(): void {
    if (!this.active) return;
    this.reset();
  }

  isActive(): boolean {
    return this.active;
  }

  // Minimal API to buffer operations while we wire writes later
  recordOperation(op: AtomicOperationRecord): void {
    if (!this.active) return;
    this.opBuffer.push(op);
  }

  // Placeholder getters for future read path (overlay > deleted > base)
  hasDeleted(nodeId: string): boolean {
    return this.deletedNodeIds.has(nodeId);
  }

  // Overlay node accessors (for read path composition)
  hasOverlayNode(nodeId: string): boolean {
    return this.overlayNodes.has(nodeId);
  }

  getOverlayNode<T = unknown>(nodeId: string): T | undefined {
    return this.overlayNodes.get(nodeId) as T | undefined;
  }

  private reset(): void {
    this.active = false;
    this.opBuffer = [];
    this.overlayNodes.clear();
    this.deletedNodeIds.clear();
    this.touchedParents.clear();
    this.baseSnapshots.clear();
  }

  /** Record a node's pre-transaction state, once, before it is first written. */
  snapshotBase(nodeId: string, node: unknown): void {
    if (!this.active || node == null) return;
    if (!this.baseSnapshots.has(nodeId)) {
      this.baseSnapshots.set(nodeId, { ...(node as Record<string, unknown>) });
    }
  }

  /** Pre-transaction state of every node this transaction wrote. */
  getBaseSnapshots(): Map<string, unknown> {
    return this.baseSnapshots;
  }

  // ---- Write helpers (COW) ----
  upsertNode<T extends { id?: string; parentId?: string }>(node: T, _opType: 'create' | 'update'): void {
    if (!this.active) return;
    const id = (node as any).sid as string;
    this.overlayNodes.set(id, node);
    // Operation recording is centralized in DataStore._emitOperation
  }

  updateNodeFields<T extends object>(nodeId: string, updates: Partial<T>, _parentId?: string): void {
    if (!this.active) return;
    const existing = (this.overlayNodes.get(nodeId) as any) || {};
    const merged = { ...existing, ...updates };
    this.overlayNodes.set(nodeId, merged);
    // Operation recording is centralized in DataStore._emitOperation
  }

  markDeleted(nodeId: string, _parentId?: string): void {
    if (!this.active) return;
    this.deletedNodeIds.add(nodeId);
    this.overlayNodes.delete(nodeId);
    // Operation recording is centralized in DataStore._emitOperation
  }

  markParentTouched(parentId: string): void {
    if (!this.active) return;
    this.touchedParents.add(parentId);
  }

  /**
   * Ids written or re-parented during the current transaction, excluding
   * deletions. This is the scope a commit-time schema check has to cover:
   * nothing outside it can have changed shape.
   */
  getWrittenNodeIds(): string[] {
    if (!this.active) return [];
    const ids = new Set<string>();
    for (const id of this.overlayNodes.keys()) ids.add(id);
    for (const id of this.touchedParents) ids.add(id);
    for (const id of this.deletedNodeIds) ids.delete(id);
    return [...ids];
  }
}


