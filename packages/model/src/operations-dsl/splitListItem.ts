import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * splitListItem operation (DSL) — selection-based.
 * When inside a list item, creates a new list item after the current one and moves the caret there.
 */
export interface SplitListItemOperation {
  type: 'splitListItem';
  payload: Record<string, unknown>;
}

export const splitListItem = defineOperationDSL(
  () =>
    ({
      type: 'splitListItem',
      payload: {}
    }) as SplitListItemOperation,
  { atom: false, category: 'content' }
);
