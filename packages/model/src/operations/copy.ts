import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import type { INode } from '@barocss/datastore';

export interface CopyResult {
  json: INode[];
  text: string;
}

type CopyOperation = {
  range: any; // ModelSelection (using any at runtime due to dependency on editor-core types)
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


