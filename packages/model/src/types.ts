import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import type { SelectionContext } from './selection-context';

// SelectionContext는 클래스로 정의되어 있으므로 타입으로만 re-export
export type { SelectionContext };

// Transaction context interface for operations
export interface TransactionContext {
  dataStore: DataStore; // DataStore instance
  selectionManager: SelectionManager; // SelectionManager instance
  selection: SelectionContext; // Selection context (before/current)
  schema?: any; // Schema instance
}