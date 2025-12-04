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
  private readonly baseAccessor: {
    getVersion: () => number;
  };

  private readonly sessionId: number;

  // Copy-on-Write overlays and bookkeeping
  private readonly overlayNodes: OverlayNodeMap = new Map();
  private readonly deletedNodeIds: Set<string> = new Set();
  private readonly touchedParents: Set<string> = new Set();
  private opBuffer: AtomicOperationRecord[] = [];
  private active: boolean = false;
  private snapshot?: OverlayStateSnapshot;

  constructor(options: { getVersion: () => number; sessionId: number }) {
    this.baseAccessor = { getVersion: options.getVersion };
    this.sessionId = options.sessionId;
  }

  begin(): void {
    if (this.active) return;
    this.active = true;
    this.snapshot = {
      baseVersion: this.baseAccessor.getVersion(),
      sessionId: this.sessionId,
    };
    this.opBuffer = [];
    this.overlayNodes.clear();
    this.deletedNodeIds.clear();
    this.touchedParents.clear();
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
    this.snapshot = undefined;
    this.opBuffer = [];
    this.overlayNodes.clear();
    this.deletedNodeIds.clear();
    this.touchedParents.clear();
  }

  // ---- Write helpers (COW) ----
  upsertNode<T extends { id?: string; parentId?: string }>(node: T, opType: 'create' | 'update'): void {
    if (!this.active) return;
    const id = (node as any).sid as string;
    this.overlayNodes.set(id, node);
    // Operation recording is centralized in DataStore._emitOperation
  }

  updateNodeFields<T extends object>(nodeId: string, updates: Partial<T>, parentId?: string): void {
    if (!this.active) return;
    const existing = (this.overlayNodes.get(nodeId) as any) || {};
    const merged = { ...existing, ...updates };
    this.overlayNodes.set(nodeId, merged);
    // Operation recording is centralized in DataStore._emitOperation
  }

  markDeleted(nodeId: string, parentId?: string): void {
    if (!this.active) return;
    this.deletedNodeIds.add(nodeId);
    this.overlayNodes.delete(nodeId);
    // Operation recording is centralized in DataStore._emitOperation
  }

  markParentTouched(parentId: string): void {
    if (!this.active) return;
    this.touchedParents.add(parentId);
  }
}


