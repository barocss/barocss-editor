import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import type { SelectionContext } from './selection-context';

// SelectionContext is defined as a class, so only re-export as type
export type { SelectionContext };

/** Stash for the last block created in this transaction (used by setSelectionToLastCreatedBlock). */
export interface LastCreatedBlockStash {
  blockId: string;
  firstTextNodeId: string | null;
}

// Transaction context interface for operations
export interface TransactionContext {
  dataStore: DataStore; // DataStore instance
  selectionManager: SelectionManager; // SelectionManager instance
  selection: SelectionContext; // Selection context (before/current)
  schema?: any; // Schema instance
  /** Set by splitBlockNode/addChild when they create a block; read by setSelectionToLastCreatedBlock. */
  lastCreatedBlock?: LastCreatedBlockStash;
}