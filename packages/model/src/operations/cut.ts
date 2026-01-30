import { defineOperation } from './define-operation';
import type { TransactionContext } from '../types';
import type { INode } from '@barocss/datastore';

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

    // Text deletion is performed via RangeOperations.deleteRange
    context.dataStore.range.deleteRange(range);

    const result: CutResult = {
      json,
      text,
      deletedRange: range
    };

    return result as any;
  }
);


