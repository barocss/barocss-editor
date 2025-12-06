import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import type { SelectionContext } from './selection-context';

// SelectionContext is defined as a class, so only re-export as type
export type { SelectionContext };

// Transaction context interface for operations
export interface TransactionContext {
  dataStore: DataStore; // DataStore instance
  selectionManager: SelectionManager; // SelectionManager instance
  selection: SelectionContext; // Selection context (before/current)
  schema?: any; // Schema instance
}