import type { DataStore, AtomicOperation } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import type { CollaborationAdapter, AdapterConfig } from './types';

/**
 * Base adapter implementation with common functionality
 */
export abstract class BaseAdapter implements CollaborationAdapter {
  protected dataStore: DataStore | null = null;
  protected config: AdapterConfig;
  protected connected: boolean = false;
  private operationHandler?: (operation: AtomicOperation) => void;

  constructor(config: AdapterConfig = {}) {
    this.config = {
      debug: false,
      ...config
    };
  }

  async connect(dataStore: DataStore): Promise<void> {
    if (this.connected) {
      throw new Error('Adapter is already connected');
    }

    this.dataStore = dataStore;

    // Listen to local operations
    this.operationHandler = (operation: AtomicOperation) => {
      this.handleLocalOperation(operation).catch((error) => {
        console.error('[BaseAdapter] Error handling local operation:', error);
      });
    };

    dataStore.onOperation(this.operationHandler);

    await this.doConnect();
    this.connected = true;

    if (this.config.debug) {
      console.log('[BaseAdapter] Connected to collaboration backend');
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    if (this.dataStore && this.operationHandler) {
      this.dataStore.offOperation(this.operationHandler);
      this.operationHandler = undefined;
    }

    await this.doDisconnect();
    this.connected = false;
    this.dataStore = null;

    if (this.config.debug) {
      console.log('[BaseAdapter] Disconnected from collaboration backend');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendOperation(operation: AtomicOperation): Promise<void> {
    if (!this.connected) {
      throw new Error('Adapter is not connected');
    }

    // Apply transformation if provided
    let transformedOp = operation;
    if (this.config.transformOperation) {
      transformedOp = this.config.transformOperation(operation);
    }

    await this.doSendOperation(transformedOp);
  }

  async receiveOperation(operation: AtomicOperation): Promise<void> {
    if (!this.dataStore) {
      throw new Error('DataStore is not connected');
    }

    // Apply the operation to DataStore
    await this.doReceiveOperation(operation);
  }

  async getDocumentState(): Promise<INode | null> {
    if (!this.dataStore) {
      throw new Error('DataStore is not connected');
    }

    return await this.doGetDocumentState();
  }

  async setDocumentState(rootNode: INode): Promise<void> {
    if (!this.connected) {
      throw new Error('Adapter is not connected');
    }

    await this.doSetDocumentState(rootNode);
  }

  /**
   * Handle local operation from DataStore
   * Override this to customize behavior
   */
  protected async handleLocalOperation(operation: AtomicOperation): Promise<void> {
    // Only send operations that are not from remote sync
    // (to avoid circular updates)
    if (!this.isRemoteOperation(operation)) {
      await this.sendOperation(operation);
    }
  }

  /**
   * Check if an operation is from remote sync
   * Override this to implement custom detection logic
   */
  protected isRemoteOperation(operation: AtomicOperation): boolean {
    // Default: assume all operations are local
    // Subclasses should override this
    return false;
  }

  /**
   * Apply operation to DataStore without triggering operation events
   * This is used when receiving remote operations
   */
  protected async applyOperationToDataStore(operation: AtomicOperation): Promise<void> {
    if (!this.dataStore) {
      throw new Error('DataStore is not connected');
    }

    // Temporarily remove operation listener to avoid circular updates
    const handler = this.operationHandler;
    if (handler) {
      this.dataStore.offOperation(handler);
    }

    try {
      // Apply operation based on type
      switch (operation.type) {
        case 'create': {
          if (operation.data) {
            this.dataStore.setNode(operation.data as INode, false);
          }
          break;
        }
        case 'update': {
          if (operation.data) {
            const node = this.dataStore.getNode(operation.nodeId);
            if (node) {
              this.dataStore.updateNode(operation.nodeId, operation.data, false);
            }
          }
          break;
        }
        case 'delete': {
          this.dataStore.deleteNode(operation.nodeId);
          break;
        }
        case 'move': {
          if (operation.parentId !== undefined && operation.position !== undefined) {
            this.dataStore.content.moveNode(
              operation.nodeId,
              operation.parentId,
              operation.position
            );
          }
          break;
        }
      }
    } finally {
      // Re-add operation listener
      if (handler) {
        this.dataStore.onOperation(handler);
      }
    }
  }

  // Abstract methods to be implemented by subclasses
  protected abstract doConnect(): Promise<void>;
  protected abstract doDisconnect(): Promise<void>;
  protected abstract doSendOperation(operation: AtomicOperation): Promise<void>;
  protected abstract doReceiveOperation(operation: AtomicOperation): Promise<void>;
  protected abstract doGetDocumentState(): Promise<INode | null>;
  protected abstract doSetDocumentState(rootNode: INode): Promise<void>;
}

