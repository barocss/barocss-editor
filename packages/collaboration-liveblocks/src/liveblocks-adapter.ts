import { BaseAdapter } from '@barocss/collaboration';
import type { DataStore, AtomicOperation } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import type { AdapterConfig } from '@barocss/collaboration';

/**
 * Options for LiveblocksAdapter
 */
export interface LiveblocksAdapterOptions {
  /**
   * Liveblocks Room instance
   */
  room: any; // Liveblocks Room

  /**
   * Adapter configuration
   */
  config?: AdapterConfig;
}

/**
 * Liveblocks adapter for collaborative editing
 * 
 * @example
 * ```typescript
 * import { LiveblocksAdapter } from '@barocss/collaboration-liveblocks';
 * import { createClient } from '@liveblocks/client';
 * 
 * const client = createClient({
 *   publicApiKey: 'your-api-key'
 * });
 * 
 * const room = client.enter('my-room');
 * 
 * const adapter = new LiveblocksAdapter({
 *   room,
 *   config: { clientId: 'user-1' }
 * });
 * 
 * await adapter.connect(dataStore);
 * ```
 */
export class LiveblocksAdapter extends BaseAdapter {
  private room: any; // Liveblocks Room
  private unsubscribe?: () => void;
  private isApplyingRemote: boolean = false;

  constructor(options: LiveblocksAdapterOptions) {
    super(options.config || {});
    this.room = options.room;
  }

  protected async doConnect(): Promise<void> {
    // Subscribe to room updates
    this.unsubscribe = this.room.subscribe('operations', (operations: any[]) => {
      this.handleLiveblocksUpdate(operations);
    });

    // Load initial state
    await this.loadFromLiveblocks();
  }

  protected async doDisconnect(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  protected async doSendOperation(operation: AtomicOperation): Promise<void> {
    // Convert AtomicOperation to Liveblocks update
    const liveblocksOp = {
      type: operation.type,
      nodeId: operation.nodeId,
      data: operation.data,
      timestamp: operation.timestamp,
      parentId: operation.parentId,
      position: operation.position
    };

    // Send to Liveblocks room
    this.room.update((root: any) => {
      if (!root.operations) {
        root.operations = [];
      }
      root.operations.push(liveblocksOp);
    });
  }

  protected async doReceiveOperation(operation: AtomicOperation): Promise<void> {
    await this.applyOperationToDataStore(operation);
  }

  protected async doGetDocumentState(): Promise<INode | null> {
    if (!this.dataStore) {
      return null;
    }

    const rootNodeId = this.dataStore.getRootNodeId();
    if (!rootNodeId) {
      return null;
    }

    return this.dataStore.getRootNode();
  }

  protected async doSetDocumentState(rootNode: INode): Promise<void> {
    this.room.update((root: any) => {
      root.document = {
        sid: rootNode.sid,
        stype: rootNode.stype,
        text: rootNode.text,
        attributes: rootNode.attributes,
        content: rootNode.content || []
      };
    });
  }

  protected isRemoteOperation(operation: AtomicOperation): boolean {
    return this.isApplyingRemote;
  }

  /**
   * Handle Liveblocks room update
   */
  private handleLiveblocksUpdate(operations: any[]): void {
    if (!this.dataStore) {
      return;
    }

    this.isApplyingRemote = true;
    try {
      operations.forEach((op: any) => {
        this.applyOperationToDataStore({
          type: op.type,
          nodeId: op.nodeId,
          data: op.data,
          timestamp: op.timestamp || Date.now(),
          parentId: op.parentId,
          position: op.position
        }).catch((error) => {
          console.error('[LiveblocksAdapter] Error applying operation:', error);
        });
      });
    } finally {
      this.isApplyingRemote = false;
    }
  }

  /**
   * Load initial state from Liveblocks
   */
  private async loadFromLiveblocks(): Promise<void> {
    const operations = this.room.get('operations');
    if (operations && Array.isArray(operations)) {
      await this.handleLiveblocksUpdate(operations);
    }
  }
}

