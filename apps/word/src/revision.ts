/**
 * **`office-editor-ui` 로 갔습니다.**
 *
 * These two lines were here and identically in `apps/slide/src/revision.ts`, with a comment in both
 * saying the duplication was deliberate and naming the condition for ending it: *if a third product
 * wants this line too, that is the point at which an `office-react` package has two data points
 * instead of a guess.* A note wants it, the site's inspector wants it, and `useControls` wanted it.
 *
 * Re-exported rather than deleted so the twelve call sites here keep their short import — what moved
 * is where the line lives, not what any of them says.
 */
export { useDocumentRevision, useEditorRevision } from '@barocss/office-editor-ui';
