import { defineOperationDSL } from '../operations/define-operation-dsl';

/**
 * insertParagraph operation (DSL) — selection-based.
 *
 * - context.selection.current 기준으로 새 블록을 삽입한다. blockId/position은 payload에 없음.
 *
 * 사용
 * - insertParagraph()
 * - insertParagraph(blockType?)
 * - insertParagraph(blockType?, selectionAlias?)
 */
export interface InsertParagraphOperation {
  type: 'insertParagraph';
  payload: {
    blockType?: 'paragraph' | 'same';
    selectionAlias?: string;
  };
}

export const insertParagraph = defineOperationDSL(
  (blockType?: 'paragraph' | 'same', selectionAlias?: string) => ({
    type: 'insertParagraph',
    payload: {
      ...(blockType != null && { blockType }),
      ...(selectionAlias != null && { selectionAlias })
    }
  } as InsertParagraphOperation),
  { atom: false, category: 'content' }
);
