import type { Editor, ModelSelection } from '@barocss/editor-core';
import { DOMSelectionHandler } from '@barocss/editor-view-dom';
import { ownsEditorSelection } from '@barocss/office-editor-ui';
import { planNoteInputRule } from './input-rules';

export function installNoteInputRules(editor: Editor, host: HTMLElement) {
  const converter = new DOMSelectionHandler(editor, { contentEditableElement: host });
  const apply = (event: Event, input: string) => {
    if (event.defaultPrevented || event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="false"]')) return;
    const selection = host.ownerDocument.getSelection();
    if (!selection || !ownsEditorSelection(editor, selection, host)) return;
    const range = converter.convertDOMSelectionToModel(selection) as ModelSelection;
    const commit = planNoteInputRule(editor, range, input);
    if (!commit) return;
    event.preventDefault(); event.stopPropagation(); void commit();
  };
  const before = (event: InputEvent) => {
    if (event.isComposing) return;
    if (event.inputType === 'insertText' && event.data?.length === 1) apply(event, event.data);
    else if (event.inputType === 'insertParagraph') apply(event, '\n');
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.isComposing && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) apply(event, '\n');
  };
  host.addEventListener('beforeinput', before, true); host.addEventListener('keydown', key, true);
  return () => { host.removeEventListener('beforeinput', before, true); host.removeEventListener('keydown', key, true); };
}
