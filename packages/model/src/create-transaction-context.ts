import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import type { Schema } from '@barocss/schema';
import type { TransactionContext } from './types';
import { SelectionContext } from './selection-context';

/**
 * Factory function for creating TransactionContext
 * Enables consistent TransactionContext creation in both tests and actual usage
 */
export function createTransactionContext(
  dataStore: DataStore,
  selectionManager: SelectionManager,
  schema: Schema
): TransactionContext {
  // Register schema in DataStore
  dataStore.registerSchema(schema);

  // Selection snapshot
  const before = selectionManager.getCurrentSelection();

  // Snapshot must be value-copied to avoid shared object mutation
  // during transaction execution.
  const beforeClone = before ? { ...before } : null;

  // Create SelectionContext instance
  const selectionContext = new SelectionContext(beforeClone);

  return {
    dataStore,
    selectionManager,
    selection: selectionContext,
    schema,
    lastCreatedBlock: undefined
  };
}
