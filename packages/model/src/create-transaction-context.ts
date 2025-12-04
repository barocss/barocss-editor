import { DataStore } from '@barocss/datastore';
import { SelectionManager } from '@barocss/editor-core';
import type { Schema } from '@barocss/schema';
import type { TransactionContext } from './types';
import { SelectionContext } from './selection-context';

/**
 * TransactionContext를 생성하는 팩토리 함수
 * 테스트와 실제 사용 모두에서 일관된 방식으로 TransactionContext를 생성할 수 있도록 함
 */
export function createTransactionContext(
  dataStore: DataStore,
  selectionManager: SelectionManager,
  schema: Schema
): TransactionContext {
  // DataStore에 schema 등록
  dataStore.registerSchema(schema);

  // Selection 스냅샷
  const before = selectionManager.getCurrentSelection();

  // SelectionContext 인스턴스 생성
  const selectionContext = new SelectionContext(before);

  return {
    dataStore,
    selectionManager,
    selection: selectionContext,
    schema
  };
}
