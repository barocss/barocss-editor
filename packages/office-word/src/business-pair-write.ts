import { transaction } from '@barocss/model';
import { readWordFile, wordFileText } from './word-file';
import { readBusinessPair, type BusinessPairPayload } from './business-pair';
import type { Editor } from '@barocss/editor-core';
interface BusinessPairRuntime { editor: Editor; exportNativeDocument(): unknown; captureInputIntent(): (() => boolean) | null }

/** Freeze the native basis before an awaited command acquires the existing lock. */
export function prepareBusinessPairWrite(runtime: BusinessPairRuntime, payload: BusinessPairPayload, authority: () => boolean, selectionIntent: () => boolean = () => true) {
  const editor = runtime.editor, rootId = editor.getRootId();
  const input = runtime.captureInputIntent();
  if (!rootId || !input || !editor.isEditable || !authority() || !selectionIntent()) return null;
  const native = () => wordFileText(runtime.exportNativeDocument(), '');
  const before = native(), parsed = readWordFile(before);
  if ('error' in parsed) return null;
  const expected = structuredClone(parsed.document) as { metadata?: Record<string, unknown> };
  expected.metadata = { ...expected.metadata, wonfficeBusinessPair: structuredClone(payload) };
  if (readBusinessPair(expected).status !== 'valid') return null;
  const after = wordFileText(expected, '');
  const root = editor.dataStore.getNode(rootId);
  if (!root) return null;
  // Keep the runtime's own loader metadata. Only the optional pair is authored.
  const metadata = { ...root.metadata, wonfficeBusinessPair: structuredClone(payload) };
  const selection = JSON.stringify(editor.selection);
  let retired = false;
  const retire = () => { retired = true; };
  const selectionChanged = () => { if (JSON.stringify(editor.selection) !== selection) retire(); };
  editor.on('editor:content.change', retire);
  editor.on('editor:editable.change', retire);
  editor.on('editor:selection.model', selectionChanged);
  editor.on('editor:selection.change', selectionChanged);
  const current = () => !retired && selectionIntent() && input() && authority() && editor.isEditable &&
    editor.getRootId() === rootId && native() === before;
  const dispose = () => {
    retired = true;
    editor.off('editor:content.change', retire);
    editor.off('editor:editable.change', retire);
    editor.off('editor:selection.model', selectionChanged);
    editor.off('editor:selection.change', selectionChanged);
  };
  return {
    current, dispose,
    async apply() {
      if (!current()) return false;
      editor.historyManager.closeGroup();
      try {
        const result = await transaction(editor, [{ type: 'update', payload: { nodeId: rootId, data: { metadata } } }], {
          validateIntent: () => !retired && selectionIntent() && input() && authority() && editor.isEditable &&
            editor.getRootId() === rootId && [before, after].includes(native()) ? undefined : 'The business item source or authority changed.'
        }).commit();
        return result.success && result.committed === true && authority() && native() === after;
      } finally { editor.historyManager.closeGroup(); dispose(); }
    }
  };
}
