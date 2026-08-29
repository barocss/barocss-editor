/**
 * The operations: **what a transaction can be told to do**, and everything they offer.
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
 * ## Why every file, and everything in it
 *
 * The first version of this index exported only the *builders*, and broke the app: the old
 * `operations-dsl/index.ts` had been reaching back across the fence with `export * from
 * '../operations/tableStructure'` for a dozen files, so their **other** exports — `buildTableGrid`,
 * the table helpers, the payload types — were part of the package's surface and nothing said so. A
 * list of what one *kind* of export is called is a list that decides for callers what the rest of a
 * file is for.
 *
 * So: every operation file, whole. `dsl-builders.test.ts` keeps the builders honest by reading the
 * directory and asking whether each one can be imported.
 */
import './register-operations';

export * from './addChild';
export * from './applyMark';
export * from './autoMergeTextNodes';
export * from './batch';
export * from './clearSelection';
export * from './cloneNodeWithChildren';
export * from './copy';
export * from './copyNode';
export * from './create';
export * from './cut';
export * from './define-operation-dsl';
export * from './define-operation';
export * from './delete';
export * from './deleteRange';
export * from './deleteTextRange';
export * from './indentNode';
export * from './indentText';
export * from './insertCallout';
export * from './insertChecklist';
export * from './insertCodeBlock';
export * from './insertHorizontalRule';
export * from './insertImage';
export * from './insertMathBlock';
export * from './insertPageBreakAtCaret';
export * from './insertParagraph';
export * from './insertTable';
export * from './insertText';
export * from './mergeBlockNodes';
export * from './mergeListItems';
export * from './mergeTextNodes';
export * from './moveBlockDown';
export * from './moveBlockUp';
export * from './moveChildren';
export * from './moveNode';
export * from './outdentNode';
export * from './outdentText';
export * from './paste';
export * from './removeChild';
export * from './removeChildren';
export * from './removeMark';
export * from './reorderChildren';
export * from './replacePattern';
export * from './replaceText';
export * from './restoreRuns';
export * from './restoreTextNodes';
export * from './selectNode';
export * from './selectRange';
export * from './selection-mapping-utils';
export * from './setAttrs';
export * from './setMarks';
export * from './setNode';
export * from './setSelection';
export * from './setText';
export * from './split-at-caret';
export * from './splitBlockNode';
export * from './splitListItem';
export * from './splitTextNode';
export * from './tableStructure';
export * from './toggleLink';
export * from './toggleMark';
export * from './transformNode';
export * from './unwrap';
export * from './update';
export * from './updateMark';
export * from './wrap';
export * from './wrapInBlockquote';
export * from './wrapInList';
