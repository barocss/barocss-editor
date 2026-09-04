import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { TransactionOperation, OpFunction, OpResult } from './transaction-dsl';
import { globalOperationRegistry } from './operations/define-operation';
import { createTransactionContext, TransactionContext } from '.';
import type { Editor } from '@barocss/editor-core';
import type { TransactionOptions } from './transaction-dsl';

export interface Transaction {
  sid: string;
  operations: (TransactionOperation | OpFunction)[];
  timestamp: Date;
  description?: string;
}

import type { ModelSelection } from '@barocss/editor-core';

/** Mapping from old absolute range to new range after document change (e.g. for selection remap). */
export interface PositionMapping {
  mapRange(start: number, end: number): [number, number];
}

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
  /**
   * Whether a commit is rejected when it would leave the document schema-invalid.
   * On by default — this is the invariant the editor relies on. Turn it off only
   * for a document deliberately edited outside its schema.
   */
  public _validateSchemaOnCommit: boolean = true;

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
  /**
   * Drop a selection whose nodes are gone.
   *
   * Dropped rather than moved: where a caret should go after the text under it
   * was deleted is the deleting operation's business, and every operation that
   * knows says so through `selectionAfter`. This is only for the case nobody
   * answered — and there, no selection is the truthful answer. A caret pointing
   * at text that does not exist is not a position.
   */
  private _clearDanglingSelection(): void {
    const editor = this._editor as any;
    const selection = editor.selection;
    if (!selection) return;

    const store = this._dataStore as any;
    if (!store?.getNode) return;

    for (const sid of [selection.startNodeId, selection.endNodeId]) {
      if (sid && !store.getNode(sid)) {
        editor.updateSelection?.(null);
        return;
      }
    }
  }

  async execute(
    operations: (TransactionOperation | OpFunction)[],
    options?: TransactionOptions
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

      // 6. End overlay, verify the result is schema-valid, then commit.
      // Operations are free to build structures step by step — intermediate
      // states may legitimately violate the content model — but what lands in
      // the document must not. Undo/redo replays operations that were already
      // accepted, so it is exempt; re-checking it would reject a valid rollback
      // whose intermediate shape differs.
      this._dataStore.end();

      if (!this._isUndoRedoOperation && this._validateSchemaOnCommit) {
        const validation = this._dataStore.validateTransactionScope(this._schema);
        if (!validation.valid) {
          this._dataStore.rollback();
          return {
            success: false,
            errors: validation.errors,
            operations: executedOperations,
            selectionBefore,
            selectionAfter: context.selection.current
          };
        }
      }

      this._dataStore.commit();

      // Final selection state
      const selectionAfter = context.selection.current;
      this._warnOnDanglingSelection(selectionBefore, selectionAfter, executedOperations);

      /**
       * 7. Add to history (only on success, and only if this is an *edit*)
       *
       * `recordInHistory: false` is for a write that maintains derived state — see the
       * option. A reaction that recorded made undo undo *it* rather than the reader's
       * edit, and then ran again and wrote the same thing back.
       */
      /**
       * A write that is a *consequence* of the reader's edit goes into that edit's own
       * entry — see `appendToPreviousEntry` and `HistoryManager.appendToLast`. It refuses
       * when there is no edit to belong to, and then this records nothing, which is the
       * same answer `recordInHistory: false` gives.
       */
      if (
        options?.appendToPreviousEntry === true &&
        executedOperations.length > 0 &&
        this._shouldAddToHistory(executedOperations)
      ) {
        this._editor.historyManager.appendToLast({
          operations: executedOperations,
          inverseOperations: inverseOperations.reverse()
        });
      } else if (
        options?.recordInHistory !== false &&
        options?.appendToPreviousEntry !== true &&
        executedOperations.length > 0 &&
        this._shouldAddToHistory(executedOperations)
      ) {
        const shouldPreserveSelection = options?.preserveSelectionInHistory !== false;
        this._editor.historyManager.push({
          operations: executedOperations,
          inverseOperations: inverseOperations.reverse(), // Store in reverse order
          description: this._currentTransaction?.description,
          ...(shouldPreserveSelection
            ? {
                metadata: {
                  selectionBefore: selectionBefore ? { ...selectionBefore } : null,
                  selectionAfter: selectionAfter ? { ...selectionAfter } : null
                }
              }
            : {})
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

      // 9. Put the selection somewhere that exists, before anyone is told.
      //
      // A transaction that removes nodes leaves the selection naming them, and
      // nothing used to notice. Everything listening to the change below is
      // then handed a caret pointing into deleted text: a toolbar asking which
      // commands can run walked from a removed node and threw, and the throw
      // came out of a React render and unmounted the editor. Repairing after
      // the event would be too late, because the listeners have already run.
      this._clearDanglingSelection();

      // 10. Emit event (notify View layer)
      // editor:content.change → triggers render()
      // `content` is built only if somebody asks for it. It is a full conversion
      // of the document, it was made on every keystroke, and nothing in the
      // codebase reads it — the view re-renders from the store and every other
      // listener uses the event as a signal that something changed.
      const editor = this._editor as any;
      this._editor.emit('editor:content.change', {
        get content() {
          return editor.document;
        },
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
      if (applySelectionToView) {
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
    /**
     * Copy the operation, **keeping the keys whose value is `undefined`**.
     *
     * It was `JSON.parse(JSON.stringify(operation))`, and JSON has no word for `undefined`: a key
     * holding one is not written, so it is not read back. That matters here because `setAttrs` reads
     * exactly those keys — *"`null` removes the attribute … so 'not set' is expressible for every
     * type, once, here"* — and `undefined` is the other half of the same sentence.
     *
     * What it cost, measured on the site builder's panel: **emptying a number field did nothing.**
     * A reader clears 최소 폭, the field goes blank, the command reports success, and the attribute
     * still holds 3000 — because `{ minWidth: undefined }` arrived at the operation as `{}`. Silent
     * in every product, for as long as the copy has been here.
     *
     * `structuredClone` keeps them. The fallback is the old behaviour rather than nothing, because a
     * runtime without it is a runtime this has always worked on.
     */
    const operationCopy =
      typeof structuredClone === 'function'
        ? structuredClone(operation)
        : JSON.parse(JSON.stringify(operation));
    const result = await def.execute(operationCopy as any, context);
    return {
      ...operationCopy,
      result
    };
  }

  /**
   * Determine whether to add to history
   */
  /**
   * Complain when a transaction leaves the selection on a node it deleted.
   *
   * An operation that removes the node the caret is standing in has to say where
   * the caret goes — `context.selection.setCaret` is how — and nothing forces it
   * to. When one forgets, the symptom appears a keystroke later and somewhere
   * else: the next command finds no node to act on and silently does nothing.
   *
   * This catches the case where the node is *gone*. It does not catch a caret
   * that is merely in the wrong place — a merge that moves a node rather than
   * deleting it leaves the caret on something that still exists, just no longer
   * where the user is looking, and no check here can tell that from a caret the
   * operation meant to leave alone. That one is only visible by measuring what
   * the next keystroke does.
   *
   * A warning rather than a repair. Where the caret belongs after an edit is
   * something only the operation knows — the seam it just joined, the position
   * it just vacated — and guessing on its behalf would replace a visible defect
   * with an invisible one.
   */
  private _warnOnDanglingSelection(
    before: ModelSelection | null,
    after: ModelSelection | null,
    operations: Array<{ type?: string }>
  ): void {
    const dead = (selection: ModelSelection | null): string[] =>
      !selection
        ? []
        : [selection.startNodeId, selection.endNodeId]
            .filter((sid): sid is string => typeof sid === 'string')
            .filter((sid, index, all) => all.indexOf(sid) === index)
            .filter((sid) => !this._dataStore.getNode(sid));

    // Two shapes of the same failure. Either the caret still points at a node
    // that is gone, or the caret was on a node that is gone and nothing replaced
    // it — the store clears a selection whose node dies, so the second is what
    // this usually looks like from here.
    const lost = dead(after);
    const destroyed = lost.length === 0 && !after ? dead(before) : [];
    if (lost.length === 0 && destroyed.length === 0) return;

    console.warn(
      '[Transaction] left no usable caret. Removed:',
      [...lost, ...destroyed].join(', '),
      '- an operation that deletes the node the caret is in must say where the',
      'caret goes, with context.selection.setCaret(). Operations run:',
      operations.map((op) => op.type).join(', ')
    );
  }

  private _shouldAddToHistory(operations: TransactionOperation[]): boolean {
    // Don't add empty operations to history
    if (operations.length === 0) return false;
    
    // Don't add undo/redo operations to history
    if (this._isUndoRedoOperation) return false;
    
    return true;
  }

}
