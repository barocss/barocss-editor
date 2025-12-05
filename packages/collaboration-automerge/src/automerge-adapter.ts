import { BaseAdapter } from '@barocss/collaboration';
import type { DataStore, AtomicOperation } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';
import type { AdapterConfig } from '@barocss/collaboration';

/**
 * Options for AutomergeAdapter
 */
export interface AutomergeAdapterOptions {
  /**
   * Function to get current Automerge doc
   */
  getDoc: () => any; // Automerge.Doc

  /**
   * Function to update Automerge doc
   */
  setDoc: (doc: any) => void;

  /**
   * Callback for remote changes
   */
  onChange?: (doc: any) => void;

  /**
   * Adapter configuration
   */
  config?: AdapterConfig;
}

/**
 * Automerge adapter for collaborative editing
 * 
 * @example
 * ```typescript
 * import { AutomergeAdapter } from '@barocss/collaboration-automerge';
 * import * as A from 'automerge';
 * 
 * let doc = A.init();
 * 
 * const adapter = new AutomergeAdapter({
 *   getDoc: () => doc,
 *   setDoc: (newDoc) => { doc = newDoc; },
 *   onChange: (newDoc) => {
 *     // Handle remote changes
 *   },
 *   config: { clientId: 'user-1' }
 * });
 * 
 * await adapter.connect(dataStore);
 * ```
 */
export class AutomergeAdapter extends BaseAdapter {
  private getDoc: () => any; // Automerge.Doc
  private setDoc: (doc: any) => void;
  private onChange?: (doc: any) => void;
  private isApplyingRemote: boolean = false;

  constructor(options: AutomergeAdapterOptions) {
    super(options.config || {});
    this.getDoc = options.getDoc;
    this.setDoc = options.setDoc;
    this.onChange = options.onChange;
  }

  protected async doConnect(): Promise<void> {
    // Load initial state from Automerge
    await this.loadFromAutomerge();
  }

  protected async doDisconnect(): Promise<void> {
    // Cleanup if needed
  }

  protected async doSendOperation(operation: AtomicOperation): Promise<void> {
    const doc = this.getDoc();
    
    // Convert AtomicOperation to Automerge change
    const newDoc = this.applyOperationToAutomerge(doc, operation);
    this.setDoc(newDoc);

    // Notify onChange if provided
    if (this.onChange) {
      this.onChange(newDoc);
    }
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
    const doc = this.getDoc();
    const newDoc = this.nodeToAutomerge(doc, rootNode);
    this.setDoc(newDoc);
  }

  protected isRemoteOperation(operation: AtomicOperation): boolean {
    return this.isApplyingRemote;
  }

  /**
   * Apply AtomicOperation to Automerge doc
   */
  private applyOperationToAutomerge(doc: any, operation: AtomicOperation): any {
    // This is a simplified version - full implementation would
    // properly convert AtomicOperations to Automerge changes
    
    // For now, we'll use a simple approach of storing operations
    // in an Automerge list
    const Automerge = require('automerge');
    
    return Automerge.change(doc, (draft: any) => {
      if (!draft.operations) {
        draft.operations = [];
      }
      
      draft.operations.push({
        type: operation.type,
        nodeId: operation.nodeId,
        data: operation.data,
        timestamp: operation.timestamp,
        parentId: operation.parentId,
        position: operation.position
      });
    });
  }

  /**
   * Convert INode tree to Automerge structure
   */
  private nodeToAutomerge(doc: any, node: INode): any {
    const Automerge = require('automerge');
    
    return Automerge.change(doc, (draft: any) => {
      draft.root = {
        sid: node.sid,
        stype: node.stype,
        text: node.text,
        attributes: node.attributes,
        content: node.content || []
      };
    });
  }

  /**
   * Load initial state from Automerge
   */
  private async loadFromAutomerge(): Promise<void> {
    if (!this.dataStore) {
      return;
    }

    const doc = this.getDoc();
    
    // Extract operations from Automerge doc
    if (doc.operations && Array.isArray(doc.operations)) {
      this.isApplyingRemote = true;
      try {
        for (const op of doc.operations) {
          await this.applyOperationToDataStore({
            type: op.type,
            nodeId: op.nodeId,
            data: op.data,
            timestamp: op.timestamp || Date.now(),
            parentId: op.parentId,
            position: op.position
          });
        }
      } finally {
        this.isApplyingRemote = false;
      }
    }
  }
}

