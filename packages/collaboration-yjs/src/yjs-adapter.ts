import { BaseAdapter, DefaultAwarenessManager, ConflictResolver } from '@barocss/collaboration';
import type { AtomicOperation } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import type { AdapterConfig, AwarenessManager, CursorPosition, ConflictResolutionConfig } from '@barocss/collaboration';

export interface YjsAdapterOptions {
  ydoc: any;
  ymap?: any;
  awareness?: any;
  config?: AdapterConfig;
  conflictResolution?: Partial<ConflictResolutionConfig>;
}

export class YjsAdapter extends BaseAdapter {
  private ydoc: any;
  private ymap: any;
  private yawareness: any;
  private observeHandler?: (events: any[], txn: any) => void;
  private awarenessHandler?: (change: any) => void;
  private isApplyingRemote: boolean = false;
  private _pendingOps: Map<string, AtomicOperation> = new Map();
  private _operationLog: AtomicOperation[] = [];
  private _maxLogSize = 500;
  private _awarenessManager: DefaultAwarenessManager;
  private _conflictResolver: ConflictResolver;

  constructor(options: YjsAdapterOptions) {
    super(options.config || {});
    this.ydoc = options.ydoc;
    this.ymap = options.ymap || this.ydoc.getMap('barocss-document');
    this.yawareness = options.awareness || null;
    this._awarenessManager = new DefaultAwarenessManager();
    this._conflictResolver = new ConflictResolver(options.conflictResolution);

    if (this.config.user) {
      this._awarenessManager.setLocalState({
        clientId: this.config.clientId || 'local',
        user: this.config.user
      });
    }
  }

  get awareness(): AwarenessManager {
    return this._awarenessManager;
  }

  protected async doConnect(): Promise<void> {
    this.observeHandler = (events: any[], txn: any) => {
      if (txn.origin === this) return;

      this.isApplyingRemote = true;
      try {
        this._handleYjsEvents(events);
      } finally {
        this.isApplyingRemote = false;
      }
    };
    this.ymap.observeDeep(this.observeHandler);

    if (this.yawareness) {
      this.awarenessHandler = (change: { added: number[]; updated: number[]; removed: number[] }) => {
        this._handleAwarenessUpdate(change);
      };
      this.yawareness.on('change', this.awarenessHandler);

      if (this.config.user) {
        this.yawareness.setLocalState({
          user: this.config.user,
          cursor: null
        });
      }
    }

    await this._loadFromYjs();
  }

  protected async doDisconnect(): Promise<void> {
    if (this.observeHandler) {
      this.ymap.unobserveDeep(this.observeHandler);
      this.observeHandler = undefined;
    }
    if (this.yawareness && this.awarenessHandler) {
      this.yawareness.off('change', this.awarenessHandler);
      this.awarenessHandler = undefined;
    }
    this._awarenessManager.destroy();
  }

  protected async doSendOperation(operation: AtomicOperation): Promise<void> {
    this._logOperation(operation);

    this.ydoc.transact(() => {
      const nodeMap = this._getOrCreateNodeMap(operation.nodeId);

      switch (operation.type) {
        case 'create':
          if (operation.data) {
            this._syncNodeToYjs(operation.nodeId, operation.data as INode);
          }
          break;
        case 'update':
          if (operation.data) {
            for (const [key, value] of Object.entries(operation.data)) {
              nodeMap.set(key, value);
            }
          }
          break;
        case 'delete':
          this.ymap.delete(operation.nodeId);
          break;
        case 'move':
          nodeMap.set('parentId', operation.parentId);
          nodeMap.set('position', operation.position);
          break;
      }
    }, this);
  }

  protected async doReceiveOperation(operation: AtomicOperation): Promise<void> {
    const pendingLocal = this._pendingOps.get(operation.nodeId);
    let resolvedOp = operation;
    if (pendingLocal) {
      resolvedOp = this._conflictResolver.resolve(pendingLocal, operation);
      this._pendingOps.delete(operation.nodeId);
    }
    await this.applyOperationToDataStore(resolvedOp);
  }

  protected async doGetDocumentState(): Promise<INode | null> {
    if (!this.dataStore) return null;
    return this.dataStore.getRootNode() ?? null;
  }

  protected async doSetDocumentState(rootNode: INode): Promise<void> {
    this.ydoc.transact(() => {
      this._syncNodeTreeToYjs(rootNode);
    }, this);
  }

  protected isRemoteOperation(_operation: AtomicOperation): boolean {
    return this.isApplyingRemote;
  }

  setLocalCursor(anchor: CursorPosition, head: CursorPosition): void {
    this._awarenessManager.setLocalCursor(anchor, head);

    if (this.yawareness) {
      const current = this.yawareness.getLocalState() || {};
      this.yawareness.setLocalState({
        ...current,
        cursor: { anchor, head }
      });
    }
  }

  clearLocalCursor(): void {
    this._awarenessManager.clearLocalCursor();

    if (this.yawareness) {
      const current = this.yawareness.getLocalState() || {};
      this.yawareness.setLocalState({ ...current, cursor: null });
    }
  }

  private _handleYjsEvents(events: any[]): void {
    const operations: AtomicOperation[] = [];

    for (const event of events) {
      if (event.target === this.ymap) {
        for (const [key, change] of event.changes.keys) {
          if (change.action === 'add' || change.action === 'update') {
            const value = this.ymap.get(key);
            if (value && typeof value === 'object') {
              operations.push({
                type: change.action === 'add' ? 'create' : 'update',
                nodeId: key,
                data: value.toJSON ? value.toJSON() : value,
                timestamp: Date.now()
              });
            }
          } else if (change.action === 'delete') {
            operations.push({
              type: 'delete',
              nodeId: key,
              timestamp: Date.now()
            });
          }
        }
      }
    }

    for (const op of operations) {
      this.applyOperationToDataStore(op).catch(error => {
        console.error('[YjsAdapter] Error applying remote operation:', error);
      });
    }
  }

  private _handleAwarenessUpdate(change: { added: number[]; updated: number[]; removed: number[] }): void {
    if (!this.yawareness) return;

    const states = this.yawareness.getStates();

    for (const clientId of [...change.added, ...change.updated]) {
      const state = states.get(clientId);
      if (state && clientId !== this.ydoc.clientID) {
        this._awarenessManager.applyRemoteState(String(clientId), {
          clientId: String(clientId),
          user: state.user || { id: String(clientId) },
          cursor: state.cursor || null,
          lastActive: Date.now()
        });
      }
    }

    for (const clientId of change.removed) {
      this._awarenessManager.removeRemoteState(String(clientId));
    }
  }

  private _getOrCreateNodeMap(nodeId: string): any {
    let nodeMap = this.ymap.get(nodeId);
    if (!nodeMap) {
      try {
        nodeMap = new (this.ydoc.getMap('__temp__').constructor)();
        this.ymap.set(nodeId, nodeMap);
      } catch {
        this.ymap.set(nodeId, {});
        nodeMap = this.ymap.get(nodeId);
      }
    }
    return nodeMap;
  }

  private _syncNodeToYjs(nodeId: string, node: INode): void {
    const data: Record<string, any> = {
      sid: node.sid || nodeId,
      stype: node.stype,
    };
    if (node.text !== undefined) data.text = node.text;
    if (node.attributes) data.attributes = node.attributes;
    if (node.marks) data.marks = node.marks;
    if (node.content) data.content = node.content;

    this.ymap.set(nodeId, data);
  }

  private _syncNodeTreeToYjs(node: INode): void {
    if (!node.sid) return;
    this._syncNodeToYjs(node.sid, node);

    if (Array.isArray(node.content)) {
      for (const childId of node.content) {
        const child = typeof childId === 'string'
          ? this.dataStore?.getNode(childId)
          : childId;
        if (child && typeof child === 'object' && (child as INode).sid) {
          this._syncNodeTreeToYjs(child as INode);
        }
      }
    }
  }

  private async _loadFromYjs(): Promise<void> {
    if (!this.dataStore) return;

    const entries: Array<[string, any]> = [];
    this.ymap.forEach((value: any, key: string) => {
      entries.push([key, value]);
    });

    if (entries.length === 0) return;

    this.isApplyingRemote = true;
    try {
      for (const [_nodeId, value] of entries) {
        const data = value && typeof value.toJSON === 'function' ? value.toJSON() : value;
        if (data && data.stype) {
          const node = this._yjsToNode(data);
          if (node) {
            this.dataStore.setNode(node, false);
          }
        }
      }
    } finally {
      this.isApplyingRemote = false;
    }
  }

  private _yjsToNode(data: any): INode | null {
    if (!data || !data.stype) return null;

    const node: INode = {
      sid: data.sid,
      stype: data.stype,
    };
    if (data.text !== undefined) (node as any).text = data.text;
    if (data.attributes) node.attributes = data.attributes;
    if (data.marks) (node as any).marks = data.marks;
    if (data.content) node.content = data.content;

    return node;
  }

  private _logOperation(op: AtomicOperation): void {
    this._operationLog.push(op);
    if (this._operationLog.length > this._maxLogSize) {
      this._operationLog = this._operationLog.slice(-this._maxLogSize);
    }
  }
}
