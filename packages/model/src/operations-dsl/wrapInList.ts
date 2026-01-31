import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * wrapInList operation (DSL) — selection-based.
 * Wraps the current block in a list (bullet/ordered) or unwraps if already in a list.
 */
export interface WrapInListOperation {
  type: 'wrapInList';
  payload: WrapInListPayload;
}

export interface WrapInListPayload {
  listType?: 'bullet' | 'ordered';
}

export const wrapInList = defineOperationDSL(
  (listType?: 'bullet' | 'ordered') =>
    ({
      type: 'wrapInList',
      payload: { ...(listType != null && { listType }) }
    }) as WrapInListOperation,
  { atom: false, category: 'content' }
);
