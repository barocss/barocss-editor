import { BaseAdapter } from '@barocss/collaboration';
import type { DataStore, AtomicOperation } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import type { AdapterConfig } from '@barocss/collaboration';

/**
 * Options for YjsAdapter
 */
export interface YjsAdapterOptions {
  /**
   * Y.Doc instance
   */
  ydoc: any; // Y.Doc

  /**
   * Y.Map instance (defaults to ydoc.getMap('barocss-document'))
   */
  ymap?: any; // Y.Map

  /**
   * Adapter configuration
   */
  config?: AdapterConfig;
}

/**
 * Yjs adapter for collaborative editing
 * 
 * @example
 * ```typescript
 * import { YjsAdapter } from '@barocss/collaboration-yjs';
 * import * as Y from 'yjs';
 * import { WebsocketProvider } from 'y-websocket';
 * 
 * const ydoc = new Y.Doc();
 * const provider = new WebsocketProvider('ws://localhost:1234', 'my-room', ydoc);
 * 
 * const adapter = new YjsAdapter({
 *   ydoc,
 *   ymap: ydoc.getMap('barocss-document'),
 *   config: { clientId: 'user-1' }
 * });
 * 
 * await adapter.connect(dataStore);
 * ```
 */
export class YjsAdapter extends BaseAdapter {
  private ydoc: any; // Y.Doc
  private ymap: any; // Y.Map
  private updateHandler?: (update: Uint8Array, origin: any) => void;
  private isApplyingRemote: boolean = false;

  constructor(options: YjsAdapterOptions) {
    super(options.config || {});
    this.ydoc = options.ydoc;
    this.ymap = options.ymap || this.ydoc.getMap('barocss-document');
  }

  protected async doConnect(): Promise<void> {
    // Listen to Yjs updates
    this.updateHandler = (update: Uint8Array, origin: any) => {
      // Ignore updates from this client
      if (origin === this) {
        return;
      }

      this.isApplyingRemote = true;
      try {
        this.handleYjsUpdate(update);
      } finally {
        this.isApplyingRemote = false;
      }
    };

    this.ymap.observe(this.updateHandler);

    // Load initial state from Yjs
    await this.loadFromYjs();
  }

  protected async doDisconnect(): Promise<void> {
    if (this.updateHandler) {
      this.ymap.unobserve(this.updateHandler);
      this.updateHandler = undefined;
    }
  }

  protected async doSendOperation(operation: AtomicOperation): Promise<void> {
    // Convert AtomicOperation to Yjs update
    const yjsUpdate = this.operationToYjs(operation);
    
    // Apply update to Yjs (will trigger updateHandler on other clients)
    this.ymap.set(operation.nodeId, yjsUpdate);
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
    // Convert INode tree to Yjs structure
    const yjsData = this.nodeToYjs(rootNode);
    this.ymap.set('root', yjsData);
  }

  protected isRemoteOperation(operation: AtomicOperation): boolean {
    return this.isApplyingRemote;
  }

  /**
   * Convert AtomicOperation to Yjs format
   */
  private operationToYjs(operation: AtomicOperation): any {
    return {
      type: operation.type,
      nodeId: operation.nodeId,
      data: operation.data,
      timestamp: operation.timestamp,
      parentId: operation.parentId,
      position: operation.position
    };
  }

  /**
   * Convert INode tree to Yjs structure
   */
  private nodeToYjs(node: INode): any {
    const result: any = {
      sid: node.sid,
      stype: node.stype,
      text: node.text,
      attributes: node.attributes
    };

    if (node.content && Array.isArray(node.content)) {
      result.content = node.content.map((childId) => {
        const child = this.dataStore?.getNode(childId as string);
        return child ? this.nodeToYjs(child) : childId;
      });
    }

    return result;
  }

  /**
   * Handle Yjs update and convert to AtomicOperations
   */
  private handleYjsUpdate(update: Uint8Array): void {
    // Decode Yjs update and extract operations
    // This is a simplified version - full implementation would
    // properly decode Yjs updates and convert them to AtomicOperations
    
    const operations: AtomicOperation[] = [];
    
    // Iterate through ymap entries and convert to operations
    this.ymap.forEach((value: any, key: string) => {
      if (key === 'root') {
        // Handle root node update
        return;
      }

      if (value && typeof value === 'object' && value.type) {
        operations.push({
          type: value.type,
          nodeId: key,
          data: value.data,
          timestamp: value.timestamp || Date.now(),
          parentId: value.parentId,
          position: value.position
        });
      }
    });

    // Apply operations to DataStore
    operations.forEach((op) => {
      this.applyOperationToDataStore(op).catch((error) => {
        console.error('[YjsAdapter] Error applying operation:', error);
      });
    });
  }

  /**
   * Load initial state from Yjs
   */
  private async loadFromYjs(): Promise<void> {
    if (!this.dataStore) {
      return;
    }

    // Load root node from Yjs
    const rootData = this.ymap.get('root');
    if (rootData) {
      const rootNode = this.yjsToNode(rootData);
      if (rootNode) {
        // Rebuild node tree in DataStore
        await this.rebuildNodeTree(rootNode);
      }
    }
  }

  /**
   * Convert Yjs data to INode
   */
  private yjsToNode(data: any): INode | null {
    if (!data || !data.stype) {
      return null;
    }

    const node: INode = {
      sid: data.sid,
      stype: data.stype,
      text: data.text,
      attributes: data.attributes
    };

    if (data.content && Array.isArray(data.content)) {
      node.content = data.content.map((child: any) => {
        if (typeof child === 'string') {
          return child;
        }
        return this.yjsToNode(child);
      }).filter(Boolean) as string[];
    }

    return node;
  }

  /**
   * Rebuild node tree in DataStore from Yjs data
   */
  private async rebuildNodeTree(node: INode): Promise<void> {
    if (!this.dataStore) {
      return;
    }

    // This is a simplified version - full implementation would
    // properly rebuild the entire tree with all relationships
    this.dataStore.setNode(node, false);
  }
}

