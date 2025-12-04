import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import type { INode } from '../types';

export interface CopyResult {
  json: INode[];
  text: string;
}

type CopyOperation = {
  range: any; // ModelSelection (에디터 코어 타입에 의존하므로 런타임에서는 any로 둔다)
};

defineOperation(
  'copy',
  async (operation: any, context: TransactionContext) => {
    const { range } = operation.payload as CopyOperation;
    if (!range) {
      throw new Error('[copy] range is required');
    }

    const json = context.dataStore.serializeRange(range);
    const text = context.dataStore.range.extractText(range);

    const result: CopyResult = { json, text };
    return result as any;
  }
);


