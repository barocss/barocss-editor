import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { TransactionOperation, OpFunction, OpResult } from './transaction-dsl';
import { globalOperationRegistry } from './operations/define-operation';
import { createTransactionContext, TransactionContext } from '.';
import { Editor } from '@barocss/editor-core';

export interface Transaction {
  sid: string;
  operations: (TransactionOperation | OpFunction)[];
  timestamp: Date;
  description?: string;
}

import type { ModelSelection } from '@barocss/editor-core';

export interface TransactionResult {
  success: boolean;
  errors: string[];
  data?: any;
  transactionId?: string;
  operations?: TransactionOperation[];
  selectionBefore?: ModelSelection | null;
  selectionAfter?: ModelSelection | null;
}

export class TransactionManager {
  private _dataStore: DataStore;
  private _currentTransaction: Transaction | null = null;
  private _schema?: Schema;
  private _editor: Editor;
  public _isUndoRedoOperation: boolean = false;

  constructor(editor: Editor) {
    this._editor = editor;
    this._dataStore = editor.dataStore;
    this._schema = editor.dataStore.getActiveSchema();
  }

  setSchema(schema: Schema): void {
    this._schema = schema;
  }

  /**
   * Execute transaction (core functionality)
   */
  async execute(
    operations: (TransactionOperation | OpFunction)[],
    options?: { applySelectionToView?: boolean }
  ): Promise<TransactionResult> {
    let lockId: string | null = null;
    
    try {
      // 1. Acquire global lock
      lockId = await this._dataStore.acquireLock('transaction-execution');

      // 2. Start transaction
      this._beginTransaction('DSL Transaction');

      // 3. Start DataStore overlay transaction
      this._dataStore.begin();

      const context = createTransactionContext(
        this._dataStore, 
        this._editor.selectionManager.clone(), 
        this._schema!
      );

      // Selection snapshot
      const selectionBefore = context.selection.before;

      // 4. Execute all operations and collect results (OpFunction is handled in _executeOperation)
      const executedOperations: TransactionOperation[] = [];
      const inverseOperations: TransactionOperation[] = [];
      type OpWithResult = TransactionOperation & {
        result?: { ok?: boolean; error?: string; inverse?: unknown; selectionAfter?: { nodeId: string; offset: number } };
      };
      let lastSelectionAfter: { nodeId: string; offset: number } | null = null;

      for (const operation of operations) {
        const result = await this._executeOperation(operation, context);
        if (Array.isArray(result)) {
          for (const op of result as OpWithResult[]) {
            if (op.result && op.result.ok === false) {
              this._dataStore.end();
              return {
                success: false,
                errors: [op.result.error || 'Operation failed'],
                operations: executedOperations,
                selectionBefore,
                selectionAfter: context.selection.current
              };
            }
            if (op.result?.selectionAfter) lastSelectionAfter = op.result.selectionAfter;
          }
          executedOperations.push(...(result as TransactionOperation[]));
          (result as OpWithResult[]).forEach(op => {
            if (op.result?.inverse) {
              inverseOperations.push(op.result.inverse as TransactionOperation);
            }
          });
        } else if (result) {
          const single = result as OpWithResult;
          if (single.result && single.result.ok === false) {
            this._dataStore.end();
            return {
              success: false,
              errors: [single.result.error || 'Operation failed'],
              operations: executedOperations,
              selectionBefore,
              selectionAfter: context.selection.current
            };
          }
          if (single.result?.selectionAfter) lastSelectionAfter = single.result.selectionAfter;
          executedOperations.push(single as TransactionOperation);
          if (single.result?.inverse) {
            inverseOperations.push(single.result.inverse as TransactionOperation);
          }
        }
      }

      // 5. Selection resolution (after all operations, before commit)
      // Prefer selectionAfter from operation result (nodeId may be $alias; resolve via resolveAlias).
      if (context.selection.current) {
        if (lastSelectionAfter) {
          const nodeId = this._dataStore.resolveAlias(lastSelectionAfter.nodeId);
          context.selection.setCaret(nodeId, lastSelectionAfter.offset);
        } else if (context.lastCreatedBlock) {
          const nodeId =
            context.lastCreatedBlock.firstTextNodeId ?? context.lastCreatedBlock.blockId;
          context.selection.setCaret(nodeId, 0);
        }
      }

      // 6. End overlay and commit
      this._dataStore.end();
      this._dataStore.commit();

      // Final selection state
      const selectionAfter = context.selection.current;

      // 7. Add to history (only on success)
      if (executedOperations.length > 0 && this._shouldAddToHistory(executedOperations)) {
        this._editor.historyManager.push({
          operations: executedOperations,
          inverseOperations: inverseOperations.reverse(), // Store in reverse order
          description: this._currentTransaction?.description
        });
      }

      // 8. Return success result
      const result = {
        success: true,
        errors: [],
        transactionId: this._currentTransaction!.sid,
        operations: executedOperations,
        selectionBefore,
        selectionAfter
      };

      // 9. Emit event (notify View layer)
      // editor:content.change → triggers render()
      this._editor.emit('editor:content.change', { 
        content: (this._editor as any).document, 
        transaction: result 
      });
      
      // After hooks: Call extension onTransaction handlers
      const extensions = (this._editor as any).getSortedExtensions?.() || [];
      if (extensions.length > 0) {
        const transactionForHooks: Transaction = {
          sid: this._currentTransaction!.sid,
          operations: executedOperations,
          timestamp: this._currentTransaction!.timestamp,
          description: this._currentTransaction!.description
        };
        extensions.forEach((ext: { onTransaction?: (editor: Editor, transaction: Transaction) => void }) => {
          ext.onTransaction?.(this._editor, transactionForHooks);
        });
      }
      
      // Pass selectionAfter to updateSelection only when applySelectionToView !== false
      // (e.g. skip for remote sync or programmatic change)
      const applySelectionToView = options?.applySelectionToView !== false;
      if (selectionAfter && applySelectionToView) {
        this._editor.updateSelection(selectionAfter);
      }

      // 10. Cleanup
      this._currentTransaction = null;
      return result;

    } catch (error: any) {
      // Rollback overlay on error
      try { this._dataStore.rollback(); } catch (_) {}
      
      const transactionId = this._currentTransaction?.sid;
      const selectionBefore = this._editor.selectionManager.getCurrentSelection();
      this._currentTransaction = null;

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        transactionId,
        operations: [],
        selectionBefore,
        selectionAfter: selectionBefore // No change on error
      };
    } finally {
      // 9. Release global lock
      if (lockId) {
        this._dataStore.releaseLock(lockId);
      }
    }
  }


  /**
   * Start transaction (internal use)
   */
  private _beginTransaction(description?: string): string {
    if (this._currentTransaction) {
      throw new Error('Transaction already in progress');
    }

    const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this._currentTransaction = {
      sid: transactionId,
      operations: [],
      timestamp: new Date(),
      description
    };

    return transactionId;
  }

  /**
   * Execute OpFunction to convert to actual operation
   */
  private async _executeOpFunction(opFn: OpFunction, context: TransactionContext): Promise<TransactionOperation[]> {
    const result = await opFn.execute(context);
    
    // Handle OpResult case
    if (result && typeof result === 'object' && 'success' in result) {
      const opResult = result as OpResult;
      if (!opResult.success) {
        throw new Error(opResult.error || 'OpFunction failed');
      }
      
      // OpResult does not create operation (inverse is used later for undo)
      return []; // Success but no operation
    }
    
    // void case (returns nothing)
    return [];
  }

  /**
   * Execute individual operation
   */
  private async _executeOperation(operation: TransactionOperation | OpFunction, context: TransactionContext): Promise<TransactionOperation | TransactionOperation[]> {
    // Handle OpFunction case
    if (operation && typeof operation === 'object' && 'type' in operation && operation.type === 'op-function') {
      const opResults = await this._executeOpFunction(operation as OpFunction, context);
      return opResults;
    }
    
    // Regular TransactionOperation case
    const def = globalOperationRegistry.get(operation.type);
    if (!def) {
      throw new Error(`Unknown operation type: ${operation.type}`);
    }
    // Copy operation object to use (prevent reference issues)
    const operationCopy = JSON.parse(JSON.stringify(operation));
    const result = await def.execute(operationCopy as any, context);
    return {
      ...operationCopy,
      result
    };
  }

  /**
   * Determine whether to add to history
   */
  private _shouldAddToHistory(operations: TransactionOperation[]): boolean {
    // Don't add empty operations to history
    if (operations.length === 0) return false;
    
    // Don't add undo/redo operations to history
    if (this._isUndoRedoOperation) return false;
    
    return true;
  }

}