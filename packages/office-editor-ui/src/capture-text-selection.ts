import type { Editor, ModelSelection } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { ownsEditorSelection } from './context-toolbar';

/** Snapshot a keyboard gesture before debounced selectionchange reaches the model. */
export function captureTextSelection(editor: Editor, view: Pick<EditorViewDOM,
  'contentEditableElement' | 'convertDOMSelectionToModel'>, options?: { allowBlurred?: boolean }): ModelSelection | undefined {
  const scope = view.contentEditableElement;
  const focused = scope.ownerDocument.activeElement;
  // Keep object selections and a toolbar/dialog's saved target intact. Embedded
  // editors own their keys and their DOM selection even inside this document.
  if (!focused || (!options?.allowBlurred && !scope.contains(focused)) || focused.closest('[data-editor-input-owner]') ||
    (editor.selection && editor.selection.type !== 'range')) return;
  const native = scope.ownerDocument.getSelection();
  if (!ownsEditorSelection(editor, native, scope)) return;
  const selection = view.convertDOMSelectionToModel(native!);
  return selection?.type === 'range' ? structuredClone(selection) : undefined;
}
