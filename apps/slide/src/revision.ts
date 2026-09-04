/**
 * **`office-editor-ui` 로 갔습니다.**
 *
 * These two lines were here and identically in `apps/word/src/revision.ts`, and the comment in both
 * named the condition for ending it: *if a third product wants this line too, that is the point at
 * which an `office-react` package has two data points instead of a guess.* That point arrived.
 *
 * Re-exported rather than deleted so the call sites here keep their short import.
 */
export { useDocumentRevision, useEditorRevision } from '@barocss/office-editor-ui';
