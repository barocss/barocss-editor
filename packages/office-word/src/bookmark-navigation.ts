import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { bookmarkSelection } from './bookmark-commands';

export function jumpToWordBookmark(editor: Editor, view: EditorViewDOM, name: string, kind = 'bookmark'): boolean {
  const at = bookmarkSelection(editor, name, kind);
  if (!at) return false;
  view.contentEditableElement.focus({ preventScroll: true });
  editor.updateSelection({ selection: at, applySelectionToView: true });
  view.contentEditableElement.querySelector(`[data-bc-sid="${CSS.escape(at.startNodeId)}"]`)?.scrollIntoView({ block: 'center' });
  return true;
}
