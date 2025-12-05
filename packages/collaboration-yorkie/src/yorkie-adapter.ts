import { BaseAdapter } from '@barocss/collaboration';
import type { DataStore, AtomicOperation } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import type { AdapterConfig } from '@barocss/collaboration';

/**
 * Options for YorkieAdapter
 */
export interface YorkieAdapterOptions {
  /**
   * Yorkie Client instance
   */
  client: any; // Yorkie Client

  /**
   * Yorkie Document instance
   */
  doc: any; // Yorkie Document

  /**
   * Adapter configuration
   */
  config?: AdapterConfig;
}

/**
 * Yorkie adapter for collaborative editing
 * 
 * @example
 * ```typescript
 * import { YorkieAdapter } from '@barocss/collaboration-yorkie';
 * import { Client, Document } from '@yorkie-js/yorkie-js-sdk';
 * 
 * const client = new Client('http://localhost:8080');
 * await client.activate();
 * 
 * const doc = new Document('my-doc');
 * await client.attach(doc);
 * 
 * const adapter = new YorkieAdapter({
 *   client,
 *   doc,
 *   config: { clientId: 'user-1' }
 * });
 * 
 * await adapter.connect(dataStore);
 * ```
 */
export class YorkieAdapter extends BaseAdapter {
  private client: any; // Yorkie Client
  private doc: any; // Yorkie Document
  private isApplyingRemote: boolean = false;

  constructor(options: YorkieAdapterOptions) {
    super(options.config || {});
    this.client = options.client;
    this.doc = options.doc;
  }

  protected async doConnect(): Promise<void> {
    // Subscribe to document changes
    this.doc.subscribe((event: any) => {
      if (event.type === 'snapshot' || event.type === 'remote-change') {
        this.handleYorkieChange(event);
      }
    });

    // Load initial state
    await this.loadFromYorkie();
  }

  protected async doDisconnect(): Promise<void> {
    // Unsubscribe from document changes
    // Note: Yorkie SDK may not have explicit unsubscribe
    // This depends on the actual SDK API
  }

  protected async doSendOperation(operation: AtomicOperation): Promise<void> {
    // Convert AtomicOperation to Yorkie update
    this.doc.update((root: any) => {
      if (!root.operations) {
        root.operations = [];
      }
      
      root.operations.push({
        type: operation.type,
        nodeId: operation.nodeId,
        data: operation.data,
        timestamp: operation.timestamp,
        parentId: operation.parentId,
        position: operation.position
      });
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
    this.doc.update((root: any) => {
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
   * Handle Yorkie document change
   */
  private handleYorkieChange(event: any): void {
    if (!this.dataStore) {
      return;
    }

    this.isApplyingRemote = true;
    try {
      // Extract operations from Yorkie document
      const operations = this.doc.getRoot().operations;
      if (operations && Array.isArray(operations)) {
        operations.forEach((op: any) => {
          this.applyOperationToDataStore({
            type: op.type,
            nodeId: op.nodeId,
            data: op.data,
            timestamp: op.timestamp || Date.now(),
            parentId: op.parentId,
            position: op.position
          }).catch((error) => {
            console.error('[YorkieAdapter] Error applying operation:', error);
          });
        });
      }
    } finally {
      this.isApplyingRemote = false;
    }
  }

  /**
   * Load initial state from Yorkie
   */
  private async loadFromYorkie(): Promise<void> {
    await this.handleYorkieChange({ type: 'snapshot' });
  }
}

