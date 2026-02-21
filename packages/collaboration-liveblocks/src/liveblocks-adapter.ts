import { BaseAdapter, DefaultAwarenessManager, ConflictResolver } from '@barocss/collaboration';
import type { AtomicOperation } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import type { AdapterConfig, AwarenessManager, CursorPosition, ConflictResolutionConfig } from '@barocss/collaboration';

export interface LiveblocksAdapterOptions {
  room: any;
  config?: AdapterConfig;
  conflictResolution?: Partial<ConflictResolutionConfig>;
}

export class LiveblocksAdapter extends BaseAdapter {
  private room: any;
  private unsubscribeOps?: () => void;
  private unsubscribePresence?: () => void;
  private isApplyingRemote: boolean = false;
  private _awarenessManager: DefaultAwarenessManager;
  public readonly conflictResolver: ConflictResolver;

  constructor(options: LiveblocksAdapterOptions) {
    super(options.config || {});
    this.room = options.room;
    this._awarenessManager = new DefaultAwarenessManager();
    this.conflictResolver = new ConflictResolver(options.conflictResolution);

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
    this.unsubscribeOps = this.room.subscribe('operations', (operations: any[]) => {
      this._handleRemoteOperations(operations);
    });

    if (this.room.subscribe && typeof this.room.getOthers === 'function') {
      this.unsubscribePresence = this.room.subscribe('others', (others: any[]) => {
        this._handlePresenceUpdate(others);
      });
    }

    if (this.config.user && typeof this.room.updatePresence === 'function') {
      this.room.updatePresence({
        user: this.config.user,
        cursor: null
      });
    }

    await this._loadFromLiveblocks();
  }

  protected async doDisconnect(): Promise<void> {
    if (this.unsubscribeOps) {
      this.unsubscribeOps();
      this.unsubscribeOps = undefined;
    }
    if (this.unsubscribePresence) {
      this.unsubscribePresence();
      this.unsubscribePresence = undefined;
    }
    this._awarenessManager.destroy();
  }

  protected async doSendOperation(operation: AtomicOperation): Promise<void> {
    const liveblocksOp = {
      type: operation.type,
      nodeId: operation.nodeId,
      data: operation.data,
      timestamp: operation.timestamp,
      parentId: operation.parentId,
      position: operation.position
    };

    this.room.update((root: any) => {
      if (!root.operations) root.operations = [];
      root.operations.push(liveblocksOp);
    });
  }

  protected async doReceiveOperation(operation: AtomicOperation): Promise<void> {
    await this.applyOperationToDataStore(operation);
  }

  protected async doGetDocumentState(): Promise<INode | null> {
    if (!this.dataStore) return null;
    return this.dataStore.getRootNode() ?? null;
  }

  protected async doSetDocumentState(rootNode: INode): Promise<void> {
    this.room.update((root: any) => {
      root.document = this._nodeToJson(rootNode);
    });
  }

  protected isRemoteOperation(_operation: AtomicOperation): boolean {
    return this.isApplyingRemote;
  }

  setLocalCursor(anchor: CursorPosition, head: CursorPosition): void {
    this._awarenessManager.setLocalCursor(anchor, head);
    if (typeof this.room.updatePresence === 'function') {
      this.room.updatePresence({ cursor: { anchor, head } });
    }
  }

  clearLocalCursor(): void {
    this._awarenessManager.clearLocalCursor();
    if (typeof this.room.updatePresence === 'function') {
      this.room.updatePresence({ cursor: null });
    }
  }

  private _handleRemoteOperations(operations: any[]): void {
    if (!this.dataStore) return;

    this.isApplyingRemote = true;
    try {
      for (const op of operations) {
        const atomicOp: AtomicOperation = {
          type: op.type,
          nodeId: op.nodeId,
          data: op.data,
          timestamp: op.timestamp || Date.now(),
          parentId: op.parentId,
          position: op.position
        };
        this.applyOperationToDataStore(atomicOp).catch(error => {
          console.error('[LiveblocksAdapter] Error applying operation:', error);
        });
      }
    } finally {
      this.isApplyingRemote = false;
    }
  }

  private _handlePresenceUpdate(others: any[]): void {
    for (const other of others) {
      if (!other.connectionId) continue;
      const presence = other.presence;
      if (!presence) continue;

      this._awarenessManager.applyRemoteState(String(other.connectionId), {
        clientId: String(other.connectionId),
        user: presence.user || { id: String(other.connectionId) },
        cursor: presence.cursor || null,
        lastActive: Date.now()
      });
    }
  }

  private async _loadFromLiveblocks(): Promise<void> {
    try {
      const operations = this.room.get?.('operations');
      if (operations && Array.isArray(operations)) {
        this._handleRemoteOperations(operations);
      }
    } catch {
      // Room may not have operations yet
    }
  }

  private _nodeToJson(node: INode): any {
    const result: any = {
      sid: node.sid,
      stype: node.stype,
    };
    if ((node as any).text !== undefined) result.text = (node as any).text;
    if (node.attributes) result.attributes = node.attributes;
    if (node.content) {
      result.content = node.content.map((childId: any) => {
        if (typeof childId === 'string') {
          const child = this.dataStore?.getNode(childId);
          return child ? this._nodeToJson(child) : childId;
        }
        return childId;
      });
    }
    return result;
  }
}
