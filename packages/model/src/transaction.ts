import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { TransactionOperation, OpFunction, OpResult } from './transaction-dsl';
import { globalOperationRegistry } from './operations/define-operation';
import { createTransactionContext, TransactionContext } from '.';
import { Editor } from '@barocss/editor-core';

export interface Transaction {
  sid: string;
  operations: TransactionOperation[];
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
   * 트랜잭션 실행 (핵심 기능)
   */
  async execute(operations: (TransactionOperation | OpFunction)[]): Promise<TransactionResult> {
    let lockId: string | null = null;
    
    try {
      // 1. 글로벌 락 획득
      lockId = await this._dataStore.acquireLock('transaction-execution');

      // 2. 트랜잭션 시작
      this._beginTransaction('DSL Transaction');

      // 3. DataStore overlay 트랜잭션 시작
      this._dataStore.begin();

      const context = createTransactionContext(
        this._dataStore, 
        this._editor.selectionManager.clone(), 
        this._schema!
      );

      // Selection 스냅샷
      const selectionBefore = context.selection.before;

      // 4. 모든 operations 실행 및 결과 수집 (OpFunction은 _executeOperation에서 처리)
      const executedOperations: TransactionOperation[] = [];
      const inverseOperations: TransactionOperation[] = [];
      
      for (const operation of operations) {
        const result = await this._executeOperation(operation, context);
        if (Array.isArray(result)) {
          // 배열인 경우 각 operation의 결과 확인
          for (const op of result) {
            if (op.result && op.result.ok === false) {
              // operation이 실패한 경우 트랜잭션 중단
              this._dataStore.end();
              return {
                success: false,
                error: op.result.error || 'Operation failed',
                operations: executedOperations,
                selectionBefore,
                selectionAfter: context.selection.current
              };
            }
          }
          executedOperations.push(...result);
          // 각 operation의 inverse 수집
          result.forEach(op => {
            if (op.result?.inverse) {
              inverseOperations.push(op.result.inverse);
            }
          });
        } else if (result) {
          // 단일 operation인 경우 결과 확인
          if (result.result && result.result.ok === false) {
            // operation이 실패한 경우 트랜잭션 중단
            this._dataStore.end();
            return {
              success: false,
              error: result.result.error || 'Operation failed',
              operations: executedOperations,
              selectionBefore,
              selectionAfter: context.selection.current
            };
          }
          executedOperations.push(result);
          if (result.result?.inverse) {
            inverseOperations.push(result.result.inverse);
          }
        }
      }

      // 6. overlay 종료 및 커밋
      this._dataStore.end();
      this._dataStore.commit();

      // 최종 selection 상태
      const selectionAfter = context.selection.current;

      // 7. 히스토리에 추가 (성공한 경우에만)
      if (executedOperations.length > 0 && this._shouldAddToHistory(executedOperations)) {
        this._editor.historyManager.push({
          operations: executedOperations,
          inverseOperations: inverseOperations.reverse(), // 역순으로 저장
          description: this._currentTransaction?.description
        });
      }

      // 8. 성공 결과 반환
      const result = {
        success: true,
        errors: [],
        transactionId: this._currentTransaction!.sid,
        operations: executedOperations,
        selectionBefore,
        selectionAfter
      };

      // 9. 이벤트 발생 (View 계층에 알림)
      // editor:content.change → render() 트리거
      this._editor.emit('editor:content.change', { 
        content: (this._editor as any).document, 
        transaction: result 
      });
      
      // selectionAfter를 updateSelection으로 전달
      // SelectionManager에 저장 + editor:selection.model 이벤트 발생
      if (selectionAfter) {
        this._editor.updateSelection(selectionAfter);
      }

      // 10. 정리
      this._currentTransaction = null;
      return result;

    } catch (error: any) {
      // 에러 발생 시 overlay 롤백
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
        selectionAfter: selectionBefore // 에러 시 변경 없음
      };
    } finally {
      // 9. 글로벌 락 해제
      if (lockId) {
        this._dataStore.releaseLock(lockId);
      }
    }
  }


  /**
   * 트랜잭션 시작 (내부용)
   */
  private _beginTransaction(description?: string): string {
    if (this._currentTransaction) {
      throw new Error('Transaction already in progress');
    }

    const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this._currentTransaction = {
      id: transactionId,
      operations: [],
      timestamp: new Date(),
      description
    };

    return transactionId;
  }

  /**
   * OpFunction을 실행하여 실제 operation으로 변환
   */
  private async _executeOpFunction(opFn: OpFunction, context: TransactionContext): Promise<TransactionOperation[]> {
    const result = await opFn.execute(context);
    
    // OpResult인 경우 처리
    if (result && typeof result === 'object' && 'success' in result) {
      const opResult = result as OpResult;
      if (!opResult.success) {
        throw new Error(opResult.error || 'OpFunction failed');
      }
      
      // OpResult는 operation을 생성하지 않음 (inverse는 나중에 undo할 때 사용)
      return []; // 성공했지만 operation이 없는 경우
    }
    
    // void인 경우 (아무것도 반환하지 않음)
    return [];
  }

  /**
   * 개별 operation 실행
   */
  private async _executeOperation(operation: TransactionOperation | OpFunction, context: TransactionContext): Promise<TransactionOperation | TransactionOperation[]> {
    // OpFunction인 경우 처리
    if (operation && typeof operation === 'object' && 'type' in operation && operation.type === 'op-function') {
      const opResults = await this._executeOpFunction(operation as OpFunction, context);
      return opResults;
    }
    
    // 일반 TransactionOperation인 경우
    const def = globalOperationRegistry.get(operation.type);
    if (!def) {
      throw new Error(`Unknown operation type: ${operation.type}`);
    }
    // operation 객체를 복사해서 사용 (참조 문제 방지)
    const operationCopy = JSON.parse(JSON.stringify(operation));
    const result = await def.execute(operationCopy as any, context);
    return {
      ...operationCopy,
      result
    };
  }

  /**
   * 히스토리에 추가할지 결정
   */
  private _shouldAddToHistory(operations: TransactionOperation[]): boolean {
    // 빈 operations는 히스토리에 추가하지 않음
    if (operations.length === 0) return false;
    
    // undo/redo operation은 히스토리에 추가하지 않음
    if (this._isUndoRedoOperation) return false;
    
    return true;
  }

}