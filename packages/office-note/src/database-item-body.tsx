import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@barocss/editor-core';
import { getNoteDatabase, getNoteDatabaseItemBody, getNoteDatabaseItemId } from './database';
import { openNoteTree, noteTreeOf, type NoteSession } from './session';
import './database-item-body.css';

/** Each item has an independent writing session, but saves into the parent document's resources. */
export function DatabaseItemBody({ editor, nodeId, row, renderEditor, registerBeforeNavigate }: {
  editor: Editor; nodeId: string; row: number;
  registerBeforeNavigate?: (flush: () => Promise<boolean>) => () => void;
  renderEditor: (editor: Editor, rootId: string, beforeNavigate: () => Promise<boolean>) => ReactNode;
}) {
  const [held, setHeld] = useState<NoteSession>();
  const [problem, setProblem] = useState('');
  const [empty, setEmpty] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const flush = useRef<() => Promise<boolean>>(async () => false);
  useEffect(() => {
    let canceled = false;
    let session: NoteSession | undefined;
    let removeListeners: (() => void) | undefined;
    setHeld(undefined); setProblem('');
    const start = async () => {
      if (!getNoteDatabaseItemId(editor, nodeId, row) && editor.isEditable) {
        await editor.executeCommand('ensureNoteDatabaseItem', { nodeId, row });
      }
      if (canceled) return;
      const itemId = getNoteDatabaseItemId(editor, nodeId, row);
      if (!itemId && editor.isEditable) { setProblem('이 항목의 본문을 열 수 없습니다.'); return; }
      const original = getNoteDatabaseItemBody(editor, nodeId, row);
      let stored = JSON.stringify(original);
      let remoteStored = stored;
      let pending = '';
      let writes: Promise<void> = Promise.resolve();
      let lastWrite: Promise<boolean> = Promise.resolve(true);
      const write = (blocks: unknown[]): Promise<boolean> => {
        const value = JSON.stringify(blocks);
        if (!editor.isEditable) return Promise.resolve(true);
        if (value === pending) return lastWrite;
        if (value === stored && !pending) return writes.then(() => true);
        pending = value;
        lastWrite = writes.then(async () => {
          let ok = false;
          try { ok = !!await editor.executeCommand('setNoteDatabaseItemBody', { nodeId, itemId, blocks }); }
          catch { ok = false; }
          if (ok) {
            stored = value;
            const index = getNoteDatabase(editor, nodeId)?.rowIds.indexOf(itemId ?? '') ?? -1;
            if (index >= 0) remoteStored = JSON.stringify(getNoteDatabaseItemBody(editor, nodeId, index));
          }
          if (pending === value) pending = '';
          if (!canceled) setProblem(ok ? '' : '본문을 저장하지 못했습니다. 내용을 유지한 채 다시 시도하세요.');
          return ok;
        });
        writes = lastWrite.then(() => {});
        return lastWrite;
      };
      session = openNoteTree({ stype: 'note', content: original }, { after: 150, onChange: write });
      if (!editor.isEditable) session.editor.setEditable(false);
      const current = session;
      const snapshot = () => (noteTreeOf(current.editor.dataStore, current.editor.getRootId() ?? current.rootId)?.content ?? []) as unknown[];
      stored = JSON.stringify(snapshot());
      flush.current = () => write(snapshot());
      const unregisterNavigation = registerBeforeNavigate?.(() => flush.current());
      const inspect = () => {
        const blocks = snapshot() as { stype?: string; content?: { text?: string }[] }[];
        if (!canceled) setEmpty(blocks.length === 1 && blocks[0]?.stype === 'paragraph' && (blocks[0].content ?? []).every(run => !run.text));
      };
      // Capture a final body snapshot before an outside click can switch pages or delete the view.
      const leave = (event: Event) => {
        if (event.target instanceof Node && host.current?.contains(event.target)) return;
        write(snapshot());
      };
      // Browser navigation does not run React cleanup. Protect typing that has not reached the host.
      const unload = (event: BeforeUnloadEvent) => {
        const blocks = snapshot();
        if (!editor.isEditable || (!pending && JSON.stringify(blocks) === stored)) return;
        write(blocks);
        event.preventDefault();
        event.returnValue = '';
      };
      const sync = () => {
        const database = getNoteDatabase(editor, nodeId);
        const index = itemId ? database?.rowIds.indexOf(itemId) ?? -1 : -1;
        if (index < 0 || pending) return;
        const blocks = getNoteDatabaseItemBody(editor, nodeId, index);
        const value = JSON.stringify(blocks);
        if (value === remoteStored) return;
        // Parent history can restore an earlier body. Do not replace locally unflushed typing.
        if (JSON.stringify(snapshot()) !== stored) return;
        remoteStored = value;
        current.editor.loadDocument({ stype: 'note', content: blocks }, current.session);
        current.editor.clearHistory();
        stored = JSON.stringify(snapshot());
        inspect();
        setHeld({ ...current, rootId: current.editor.getRootId()! });
      };
      current.editor.on('editor:content.change', inspect);
      editor.on('editor:content.change', sync);
      document.addEventListener('pointerdown', leave, true);
      document.addEventListener('focusin', leave, true);
      window.addEventListener('beforeunload', unload);
      removeListeners = () => {
        unregisterNavigation?.();
        current.editor.off('editor:content.change', inspect); editor.off('editor:content.change', sync);
        document.removeEventListener('pointerdown', leave, true); document.removeEventListener('focusin', leave, true);
        window.removeEventListener('beforeunload', unload);
      };
      inspect(); setHeld(current);
    };
    void start().catch(() => { if (!canceled) setProblem('본문을 열지 못했습니다.'); });
    return () => { canceled = true; removeListeners?.(); session?.close(); };
  }, [editor, nodeId, row, registerBeforeNavigate]);
  return <div ref={host} className="ondb-item-body" data-db-item-body data-empty={empty || undefined}>
    {problem && <p role="alert" className="ondb-error">{problem}</p>}
    {held ? <>{empty && <div className="ondb-body-hint" aria-hidden="true">내용을 입력하거나 / 로 블록을 추가하세요</div>}{renderEditor(held.editor, held.rootId, () => flush.current())}</> : !problem && <p className="ondb-body-loading">본문을 여는 중…</p>}
  </div>;
}
