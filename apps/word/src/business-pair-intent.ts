import { wordFileText } from '@barocss/office-word';
import { captureTextSelection } from '@barocss/office-editor-ui';
import type { WordRuntime } from './runtime';

/** Capture the click's target before any flush/lock/policy can await. */
export function captureBusinessPairIntent(runtime: WordRuntime, authority: () => boolean) {
  const editor = runtime.editor, rootId = editor.getRootId();
  const viewSelection = captureTextSelection(editor, runtime.view, { allowBlurred: true });
  if (viewSelection) editor.updateSelection({ selection: viewSelection, applySelectionToView: false });
  const input = runtime.captureInputIntent({ command: 'addWordBookmark' }), selection = structuredClone(editor.selection);
  if (!rootId || !input || !authority() || !editor.isEditable) return null;
  const selectionText = JSON.stringify(selection), before = wordFileText(runtime.exportNativeDocument(), '');
  let retired = false;
  const retire = () => { retired = true; };
  const changed = () => { if (JSON.stringify(editor.selection) !== selectionText) retire(); };
  editor.on('editor:selection.model', changed); editor.on('editor:selection.change', changed);
  editor.on('editor:editable.change', retire); editor.on('editor:content.change', retire);
  const scope = runtime.view.contentEditableElement;
  const checkNative = () => {
    if (viewSelection && JSON.stringify(captureTextSelection(editor, runtime.view, { allowBlurred: true })) !== selectionText) retire();
  };
  if (viewSelection) scope.ownerDocument.addEventListener('selectionchange', checkNative);
  const live = () => { checkNative(); return !retired && input() && authority() && editor.isEditable && editor.getRootId() === rootId; };
  return { rootId, selection, live,
    current: () => live() && wordFileText(runtime.exportNativeDocument(), '') === before,
    dispose() {
      retired = true;
      if (viewSelection) scope.ownerDocument.removeEventListener('selectionchange', checkNative);
      editor.off('editor:selection.model', changed); editor.off('editor:selection.change', changed);
      editor.off('editor:editable.change', retire); editor.off('editor:content.change', retire);
    }
  };
}
