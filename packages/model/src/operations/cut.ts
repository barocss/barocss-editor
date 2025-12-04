import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import type { INode } from '../types';

export interface CutResult {
  json: INode[];
  text: string;
  deletedRange: any;
}

type CutOperation = {
  range: any; // ModelSelection
};

defineOperation(
  'cut',
  async (operation: any, context: TransactionContext) => {
    const { range } = operation.payload as CutOperation;
    if (!range) {
      throw new Error('[cut] range is required');
    }

    const json = context.dataStore.serializeRange(range);
    const text = context.dataStore.range.extractText(range);

    // 텍스트 삭제는 RangeOperations.deleteRange를 통해 수행
    context.dataStore.range.deleteRange(range);

    const result: CutResult = {
      json,
      text,
      deletedRange: range
    };

    return result as any;
  }
);


