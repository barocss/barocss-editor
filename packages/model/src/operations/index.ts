/**
 * The operations: **what a transaction can be told to do**.
 *
 * ## One operation, one file
 *
 * Which is what this package's own README says. Its example is `defineOperation('setText', …)` and
 * `export const setText = defineOperationDSL(…)` in one place, and twenty-four of these files did
 * exactly that. The other thirty-six kept the builder in a parallel `operations-dsl/` directory —
 * one file per operation on each side, with the same doc comment copied into both.
 *
 * That split was the whole of the problem, and it showed up as something stranger than duplication:
 * this index was a single side-effecting `import './register-operations'`, so the **documented** kind
 * could not be imported at all. Including `setAttrs`, the most used operation in the repository,
 * hand-written as `{ type: 'setAttrs', payload: { … } }` eighty-four times across three products.
 * That is almost certainly where the habit came from — the first thing anyone reached for was not
 * there, so they wrote the object, and everything after it followed the local style.
 *
 * ## Why the exports are written out
 *
 * A star export cannot say what it exports, and `dsl-builders.test.ts` is what keeps this list
 * honest: it reads every file in this directory, finds every `defineOperationDSL`, and asks whether
 * that builder can be imported. A builder written and left out of this list fails there.
 */
import './register-operations';

export type { SetSelectionOperation } from './setSelection';

export { addChild } from './addChild';
export { applyMark } from './applyMark';
export { autoMergeTextNodes } from './autoMergeTextNodes';
export { batch } from './batch';
export { clearSelection } from './clearSelection';
export { cloneNodeWithChildren } from './cloneNodeWithChildren';
export { copy } from './copy';
export { copyNode } from './copyNode';
export { create } from './create';
export { cut } from './cut';
export { deleteOp } from './delete';
export { deleteRange } from './deleteRange';
export { deleteTextRange } from './deleteTextRange';
export { indentNode } from './indentNode';
export { indentText } from './indentText';
export { insertCallout } from './insertCallout';
export { insertChecklist } from './insertChecklist';
export { insertCodeBlock } from './insertCodeBlock';
export { insertHorizontalRule } from './insertHorizontalRule';
export { insertImage } from './insertImage';
export { insertMathBlock } from './insertMathBlock';
export { insertParagraph } from './insertParagraph';
export { insertTable } from './insertTable';
export { insertText } from './insertText';
export { mergeBlockNodes } from './mergeBlockNodes';
export { mergeListItems } from './mergeListItems';
export { mergeTextNodes } from './mergeTextNodes';
export { moveBlockDown } from './moveBlockDown';
export { moveBlockUp } from './moveBlockUp';
export { moveChildren } from './moveChildren';
export { moveNode } from './moveNode';
export { outdentNode } from './outdentNode';
export { outdentText } from './outdentText';
export { paste } from './paste';
export { removeChild } from './removeChild';
export { removeChildren } from './removeChildren';
export { removeMark } from './removeMark';
export { reorderChildren } from './reorderChildren';
export { replacePattern } from './replacePattern';
export { replaceText } from './replaceText';
export { restoreTextNodes } from './restoreTextNodes';
export { selectNode } from './selectNode';
export { selectRange } from './selectRange';
export { setAttrs } from './setAttrs';
export { setMarks } from './setMarks';
export { setNode } from './setNode';
export { setText } from './setText';
export { splitBlockNode } from './splitBlockNode';
export { splitListItem } from './splitListItem';
export { splitTextNode } from './splitTextNode';
export { insertTableRow } from './tableStructure';
export { deleteTableRow } from './tableStructure';
export { insertTableColumn } from './tableStructure';
export { deleteTableColumn } from './tableStructure';
export { mergeTableCells } from './tableStructure';
export { splitTableCell } from './tableStructure';
export { toggleLink } from './toggleLink';
export { toggleMark } from './toggleMark';
export { transformNode } from './transformNode';
export { unwrap } from './unwrap';
export { update } from './update';
export { updateMark } from './updateMark';
export { wrap } from './wrap';
export { wrapInBlockquote } from './wrapInBlockquote';
export { wrapInList } from './wrapInList';
