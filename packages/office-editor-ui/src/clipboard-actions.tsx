import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { getClipboardText } from '@barocss/extensions';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { Dialog, DialogButton, TextAreaField } from '@barocss/office-ui';
import { captureTextSelection } from './capture-text-selection';

export const CLIPBOARD_ACTIONS = {
  copy: { label: '복사', icon: 'copy' },
  cut: { label: '잘라내기', icon: 'cut' },
  paste: { label: '붙여넣기', icon: 'paste' }
} as const;
export type ClipboardAction = keyof typeof CLIPBOARD_ACTIONS;
export function clipboardAction(view: string): ClipboardAction | undefined {
  const action = view.replace(/^clipboard\./, '');
  return view.startsWith('clipboard.') && Object.hasOwn(CLIPBOARD_ACTIONS, action) ? action as ClipboardAction : undefined;
}
export function canUseClipboard(editor: Editor | null, action: ClipboardAction): boolean {
  const at = editor?.selection;
  return !!editor && at?.type === 'range' &&
    (action === 'paste' || at.startNodeId !== at.endNodeId || at.startOffset !== at.endOffset) &&
    editor.canRun(action, { selection: at });
}

type Failure = { action: ClipboardAction; selection: ModelSelection; rootId: string | null | undefined; revision: number; text: string };

/** Browser clipboard feedback belongs to the host; document changes remain commands. */
export function useClipboardActions(editor: Editor | null, view: EditorViewDOM | null) {
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const revision = useRef(0);
  const [failure, setFailure] = useState<Failure>();
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!editor) return;
    const changed = () => { revision.current++; };
    editor.on('editor:content.change', changed);
    return () => { editor.off('editor:content.change', changed); };
  }, [editor]);

  const run = useCallback(async (action: ClipboardAction) => {
    if (!editor || !view || locked.current) return;
    const native = captureTextSelection(editor, view);
    if (native) editor.updateSelection({ selection: native, applySelectionToView: false });
    if (!canUseClipboard(editor, action) || !editor.selection) return;
    const selection = structuredClone(editor.selection);
    // Plain text is an explicit fallback. The regular command copies HTML too.
    const source = action === 'paste' ? '' : editor.dataStore.serializeRange(selection);
    const session: Failure = { action, selection, rootId: editor.getRootId(), revision: revision.current,
      text: typeof source === 'string' ? source : getClipboardText(source, editor) };
    locked.current = true; setBusy(true); setMessage(''); setFailure(undefined);
    try {
      if (await editor.run(action, { selection })) {
        setMessage(action === 'copy' ? '복사했습니다.' : action === 'cut' ? '잘라냈습니다.' : '붙여넣었습니다.');
      } else {
        setText(session.text); setFailure(session);
      }
    } finally { locked.current = false; setBusy(false); }
  }, [editor, view]);

  const pasteText = async () => {
    if (!editor || !failure || locked.current || !text) return;
    if (failure.rootId !== editor.getRootId() || failure.revision !== revision.current) {
      setMessage('문서가 변경되었습니다. 창을 닫고 붙여넣을 위치를 다시 선택하세요.'); return;
    }
    locked.current = true; setBusy(true);
    try {
      // Literal text: do not interpret Markdown in the plain-text fallback.
      const nodes = text.replace(/\r\n?/g, '\n').split('\n').map(line => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text: line }] }));
      editor.historyManager.closeGroup();
      editor.updateSelection({ selection: failure.selection, applySelectionToView: false });
      if (await editor.run('paste', { selection: failure.selection, nodes, clipboardText: text })) {
        setFailure(undefined); setMessage('텍스트를 붙여넣었습니다.');
      } else setMessage('붙여넣지 못했습니다. 창을 닫고 위치를 다시 선택하세요.');
    } finally { locked.current = false; setBusy(false); }
  };

  const feedback = <>
    <span role="status" className="sr-only">{message}</span>
    <Dialog open={!!failure} onOpenChange={open => { if (!open && !busy) setFailure(undefined); }}
      title={`${failure ? CLIPBOARD_ACTIONS[failure.action].label : '클립보드'} 도움말`}
      description={failure?.action === 'paste'
        ? '클립보드 내용을 읽지 못했습니다. 아래 입력란에 붙여넣으세요. 텍스트만 문서에 추가합니다.'
        : '클립보드에 복사하지 못했습니다. 원문은 유지했습니다. 아래 텍스트를 선택한 후 키보드로 복사하세요.'}
      footer={<>
        <DialogButton disabled={busy} onClick={() => setFailure(undefined)}>닫기</DialogButton>
        {failure?.action === 'paste' && <DialogButton variant="primary" disabled={busy || !text} onClick={() => void pasteText()}>텍스트 붙여넣기</DialogButton>}
      </>}>
      <TextAreaField ariaLabel={failure?.action === 'paste' ? '붙여넣을 텍스트' : '복사할 텍스트'} value={text} onChange={setText} rows={6} />
      {message && <p role="alert">{message}</p>}
    </Dialog>
  </>;
  return { run, busy, feedback };
}
