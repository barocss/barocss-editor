import type { AtomicOperation, DataStore } from '@barocss/datastore';
import type { INode } from '@barocss/datastore';

/**
 * Collaboration adapter interface for integrating external CRDT/OT libraries
 * with Barocss DataStore
 */
export interface CollaborationAdapter {
  /**
   * Initialize the adapter with a DataStore instance
   */
  connect(dataStore: DataStore): Promise<void>;

  /**
   * Disconnect the adapter and cleanup resources
   */
  disconnect(): Promise<void>;

  /**
   * Check if the adapter is currently connected
   */
  isConnected(): boolean;

  /**
   * Send a local operation to the collaboration backend
   */
  sendOperation(operation: AtomicOperation): Promise<void>;

  /**
   * Receive a remote operation from the collaboration backend
   * and apply it to the DataStore
   */
  receiveOperation(operation: AtomicOperation): Promise<void>;

  /**
   * Get the current document state from the collaboration backend
   */
  getDocumentState(): Promise<INode | null>;

  /**
   * Set the document state in the collaboration backend
   */
  setDocumentState(rootNode: INode): Promise<void>;
}

/**
 * Adapter configuration options
 */
export interface AdapterConfig {
  /**
   * Unique identifier for this client/session
   */
  clientId?: string;

  /**
   * User information for presence/awareness
   */
  user?: {
    id: string;
    name?: string;
    color?: string;
    avatar?: string;
  };

  /**
   * Enable/disable operation logging
   */
  debug?: boolean;

  /**
   * Custom operation transformation function
   */
  transformOperation?: (op: AtomicOperation) => AtomicOperation;
}

/**
 * Operation metadata for collaboration
 */
export interface OperationMetadata {
  /**
   * Client/session ID that generated this operation
   */
  clientId: string;

  /**
   * Timestamp when the operation was created
   */
  timestamp: number;

  /**
   * Vector clock or logical timestamp for ordering
   */
  vectorClock?: number | Record<string, number>;

  /**
   * Operation sequence number
   */
  sequence?: number;
}

/**
 * Extended AtomicOperation with collaboration metadata
 */
export interface CollaborationOperation extends AtomicOperation {
  metadata?: OperationMetadata;
}

