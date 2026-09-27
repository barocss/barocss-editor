import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NoteEditor } from '@barocss/office-note/view';
import { readNoteSnapshotFile } from '@barocss/office-note/file';
import { noteFileText, noteTreeOf, openNoteTree, type NoteDocument, type NoteSession } from '@barocss/office-note';
import { Button, EditorHeader, StatusIndicator, StatusNotice } from '@barocss/office-ui';
import { pageTemplate } from './workspace-library';
import { createServerNoteClient, noteSaveAttempt, ServerNoteError,
  type NoteSaveAttempt, type OpenServerNote, type ServerNoteHead } from './server-documents';

export interface ServerNoteWorkspaceProps {
  tenantId: string;
  workspaceId: string;
  initialDocumentId?: string;
  authorizedFetch: typeof fetch;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  onNavigate?: (documentId: string) => void;
  onLeave?: () => void;
  onUnsafeChange?: (unsafe: boolean) => void;
}

type OpenState = { owner: object; generation: string; documentId: string | null; head: ServerNoteHead | null;
  note: NoteDocument; revision: number | null; version: number; confirmedVersion: number };
type Pending = { owner: object; attempt: Readonly<NoteSaveAttempt>; version: number };
type Problem = { owner: object; kind: 'load' | 'save' | 'conflict' | 'denied' | 'mode'; message: string };

function saveProblem(error: unknown): Omit<Problem, 'owner'> {
  if (error instanceof ServerNoteError) {
    if (error.status === 403 || error.status === 401) return { kind: 'denied', message: '이 작업 공간에 접근할 수 없습니다.' };
    if (error.status === 409) return { kind: 'conflict', message: '서버의 최신본이 변경되었습니다. 이 초안을 유지합니다.' };
    if (error.status === null || error.status === 503) return { kind: 'save', message: '연결 또는 저장에 실패했습니다. 같은 요청으로 확인하거나 다시 시도하세요.' };
  }
  return { kind: 'save', message: '저장을 확인하지 못했습니다. 초안을 유지합니다.' };
}

/** Office supplies an authorized fetch only after it has verified the protected workspace context. */
export function ServerNoteWorkspace({ tenantId, workspaceId, initialDocumentId, authorizedFetch,
  role, onNavigate, onLeave, onUnsafeChange }: ServerNoteWorkspaceProps) {
  const client = useMemo(() => createServerNoteClient({ tenantId, workspaceId, authorizedFetch }),
    [tenantId, workspaceId, authorizedFetch]);
  const activeClient = useRef(client);
  activeClient.current = client;
  const navigate = useRef(onNavigate);
  navigate.current = onNavigate;
  const [heads, setHeads] = useState<{ owner: object; rows: ServerNoteHead[] }>();
  const [open, setOpen] = useState<OpenState>();
  const [pending, setPending] = useState<Pending>();
  const [problem, setProblem] = useState<Problem>();
  const [conflictCopy, setConflictCopy] = useState<{ generation: string; snapshotText: string }>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<{ owner: object; generation: string; documentId: string | null; editable: boolean; value: NoteSession }>();
  const currentOpen = open?.owner === client ? open : undefined;
  const currentPending = pending?.owner === client ? pending : undefined;
  const currentHeads = heads?.owner === client ? heads.rows : [];
  const currentSession = session?.owner === client && session.generation === currentOpen?.generation && session.documentId === currentOpen?.documentId &&
    session.editable === (role !== 'viewer') ? session.value : undefined;
  const currentProblem = problem?.owner === client ? problem : undefined;
  const canEdit = role !== 'viewer';
  const isDirty = !!currentOpen && currentOpen.version !== currentOpen.confirmedVersion;

  const draftSnapshot = () => {
    if (!currentOpen) return null;
    currentSession?.flush();
    const tree = currentSession && noteTreeOf({ getNode: id => currentSession.editor.dataStore.getNode(id) as never }, currentSession.rootId);
    return noteFileText(tree ? { ...currentOpen.note, content: tree.content as unknown[] } : currentOpen.note);
  };

  useEffect(() => {
    onUnsafeChange?.(isDirty || !!currentPending || busy);
  }, [isDirty, currentPending, busy, onUnsafeChange]);

  const showOpened = useCallback((result: OpenServerNote & { mode: 'snapshot' }) => {
    if (activeClient.current !== client) return;
    setOpen({ owner: client, generation: crypto.randomUUID(), documentId: result.document.documentId, head: result.document,
      note: result.note, revision: result.document.revision, version: 0, confirmedVersion: 0 });
    setProblem(undefined);
    setConflictCopy(undefined);
    navigate.current?.(result.document.documentId);
  }, [client]);

  const load = useCallback(async () => {
    setLoading(true);
    setBusy(false);
    setProblem(undefined);
    try {
      const rows = await client.list();
      if (activeClient.current !== client) return;
      setHeads({ owner: client, rows });
      setOpen(previous => previous?.owner === client && previous.documentId &&
        !rows.some(row => row.documentId === previous.documentId) ? undefined : previous);
      if (initialDocumentId) {
        if (!rows.some(row => row.documentId === initialDocumentId)) throw new ServerNoteError(404, 'document_not_found');
        const result = await client.open(initialDocumentId);
        if (activeClient.current !== client) return;
        if (result.mode === 'snapshot') showOpened(result);
        else setProblem({ owner: client, kind: 'mode', message: '이 문서는 공동 편집 모드입니다. 스냅샷 편집을 열지 않았습니다.' });
      }
    } catch (error) {
      if (activeClient.current !== client) return;
      setProblem(error instanceof ServerNoteError && (error.status === 401 || error.status === 403)
        ? { owner: client, kind: 'denied', message: '이 작업 공간에 접근할 수 없습니다.' }
        : { owner: client, kind: 'load', message: '서버 문서 목록을 열지 못했습니다. 다시 시도하세요.' });
      setOpen(undefined);
    } finally {
      if (activeClient.current === client) setLoading(false);
    }
  }, [client, initialDocumentId, showOpened]);

  useEffect(() => { void load(); return () => { if (activeClient.current === client) activeClient.current = {} as typeof client; }; }, [client, load]);

  useEffect(() => {
    if (!currentOpen || currentProblem?.kind === 'denied') { setSession(undefined); return; }
    const documentId = currentOpen.documentId;
    let alive = true;
    const one = openNoteTree(currentOpen.note, { onChange: blocks => {
      if (!alive || activeClient.current !== client) return;
      setOpen(previous => previous?.owner === client && previous.documentId === documentId
        ? JSON.stringify(previous.note.content) === JSON.stringify(blocks) ? previous
          : { ...previous, note: { ...previous.note, content: blocks }, version: previous.version + 1 } : previous);
    }, after: 150 });
    if (!canEdit) one.editor.setEditable(false);
    const changed = () => {
      if (!alive || activeClient.current !== client) return;
      const tree = noteTreeOf({ getNode: id => one.editor.dataStore.getNode(id) as never }, one.rootId);
      if (!tree) return;
      setOpen(previous => previous?.owner === client && previous.documentId === documentId
        ? { ...previous, note: { ...previous.note, content: tree.content as unknown[] }, version: previous.version + 1 } : previous);
    };
    one.editor.on('editor:content.change' as never, changed);
    setSession({ owner: client, generation: currentOpen.generation, documentId, editable: canEdit, value: one });
    return () => { alive = false; one.editor.off('editor:content.change' as never, changed); one.close(); };
  // Recreate the editor only when the opened document changes, not after each keystroke.
  }, [client, currentOpen?.generation, currentOpen?.documentId, canEdit, currentProblem?.kind === 'denied']);

  useEffect(() => { currentSession?.editor.setEditable(canEdit && !busy && !currentPending); },
    [currentSession, canEdit, busy, currentPending]);

  const openDocument = async (documentId: string) => {
    if (busy || isDirty || currentPending) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const result = await client.open(documentId);
      if (activeClient.current !== client) return;
      if (result.mode === 'snapshot') showOpened(result);
      else setProblem({ owner: client, kind: 'mode', message: '이 문서는 공동 편집 모드입니다. 스냅샷 편집을 열지 않았습니다.' });
    } catch (error) {
      if (activeClient.current !== client) return;
      setProblem(error instanceof ServerNoteError && (error.status === 401 || error.status === 403)
        ? { owner: client, kind: 'denied', message: '이 작업 공간에 접근할 수 없습니다.' }
        : { owner: client, kind: 'load', message: '문서를 열지 못했습니다. 다시 시도하세요.' });
    } finally { if (activeClient.current === client) setBusy(false); }
  };

  const create = () => {
    if (!canEdit || busy || isDirty || currentPending) return;
    const note = pageTemplate('blank');
    note.attributes.pageId = crypto.randomUUID();
    setOpen({ owner: client, generation: crypto.randomUUID(), documentId: null, head: null, note, revision: null,
      version: 1, confirmedVersion: 0 });
    setProblem(undefined);
  };

  const save = async () => {
    if (!canEdit || !currentOpen || busy || currentProblem?.kind === 'denied' || currentProblem?.kind === 'conflict') return;
    currentSession?.flush();
    const tree = currentSession && noteTreeOf({ getNode: id => currentSession.editor.dataStore.getNode(id) as never }, currentSession.rootId);
    const draftNote = tree ? { ...currentOpen.note, content: tree.content as unknown[] } : currentOpen.note;
    const fixed = currentPending ?? { owner: client, version: currentOpen.version,
      attempt: noteSaveAttempt(currentOpen.documentId === null
        ? { operation: 'create', workspaceId, title: draftNote.attributes.title,
          snapshotText: noteFileText(draftNote), idempotencyKey: crypto.randomUUID() }
        : { operation: 'update', documentId: currentOpen.documentId,
          expectedRevision: currentOpen.revision!, snapshotText: noteFileText(draftNote),
          idempotencyKey: crypto.randomUUID() }) };
    const fixedRead = readNoteSnapshotFile(fixed.attempt.snapshotText);
    if ('error' in fixedRead) throw new Error('invalid_fixed_snapshot');
    setPending(fixed);
    setBusy(true);
    setProblem(undefined);
    try {
      let receipt;
      if (currentPending) {
        try { receipt = await client.receipt(fixed.attempt.operation, fixed.attempt.idempotencyKey); }
        catch (error) {
          if (!(error instanceof ServerNoteError) || error.status !== 404) throw error;
          receipt = await client.save(fixed.attempt);
        }
      } else receipt = await client.save(fixed.attempt);
      const confirmed = await client.confirm(fixed.attempt, receipt);
      if (activeClient.current !== client) return;
      setHeads(previous => previous?.owner === client
        ? { owner: client, rows: [confirmed.document, ...previous.rows.filter(row => row.documentId !== confirmed.document.documentId)] }
        : previous);
      setOpen(previous => previous?.owner === client &&
        (previous.documentId === null || previous.documentId === confirmed.document.documentId)
        ? (() => {
          const matchesFixed = previous.note.attributes.title === fixedRead.document.attributes.title &&
            JSON.stringify(previous.note.content) === JSON.stringify(fixedRead.document.content);
          return { ...previous, documentId: confirmed.document.documentId, head: confirmed.document,
            revision: confirmed.document.revision, note: matchesFixed ? confirmed.note : previous.note,
            confirmedVersion: matchesFixed ? previous.version : fixed.version };
        })() : previous);
      setPending(undefined);
      navigate.current?.(confirmed.document.documentId);
    } catch (error) {
      if (activeClient.current !== client) return;
      const next = saveProblem(error);
      setProblem({ owner: client, ...next });
      if (next.kind === 'conflict' || next.kind === 'denied') setPending(undefined);
    } finally { if (activeClient.current === client) setBusy(false); }
  };

  const copyConflictedDraft = async () => {
    if (currentProblem?.kind !== 'conflict' || !currentOpen) return;
    const snapshotText = draftSnapshot();
    if (!snapshotText) return;
    try {
      await navigator.clipboard.writeText(snapshotText);
      setConflictCopy({ generation: currentOpen.generation, snapshotText });
    } catch {
      setConflictCopy(undefined);
      setProblem({ owner: client, kind: 'conflict', message: '초안을 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인하세요.' });
    }
  };

  const openLatestAfterConflict = async () => {
    if (currentProblem?.kind !== 'conflict' || !currentOpen?.documentId || busy ||
      conflictCopy?.generation !== currentOpen.generation) return;
    if (conflictCopy.snapshotText !== draftSnapshot()) {
      setConflictCopy(undefined);
      setProblem({ owner: client, kind: 'conflict', message: '복사한 뒤 초안이 바뀌었습니다. 변경된 초안을 다시 복사하세요.' });
      return;
    }
    if (!window.confirm('복사한 초안을 별도로 보관했나요? 서버 최신본을 열면 현재 편집 화면이 교체됩니다.')) return;
    setBusy(true);
    try {
      const result = await client.open(currentOpen.documentId);
      if (activeClient.current !== client) return;
      if (result.mode === 'snapshot') showOpened(result);
      else setProblem({ owner: client, kind: 'mode', message: '이 문서는 공동 편집 모드입니다. 스냅샷 편집을 열지 않았습니다.' });
    } catch (error) {
      if (activeClient.current !== client) return;
      setProblem(error instanceof ServerNoteError && (error.status === 401 || error.status === 403)
        ? { owner: client, kind: 'denied', message: '이 작업 공간에 접근할 수 없습니다.' }
        : { owner: client, kind: 'conflict', message: '서버 최신본을 열지 못했습니다. 복사한 초안은 유지됩니다.' });
    } finally { if (activeClient.current === client) setBusy(false); }
  };

  const status = currentProblem?.kind === 'denied' ? '접근 거부' : busy ? '저장 중…' :
    currentPending ? '저장 확인 필요' : isDirty ? '저장되지 않음' : currentOpen ? '서버 저장 확인됨' : '문서 선택';
  return <div className="nw-shell" data-server-note-workspace>
    <EditorHeader product="Note" className="nw-header" title={currentOpen?.note.attributes.title || '서버 노트'} menus={null}
      actions={<><StatusIndicator data-save-status busy={busy} tone={currentProblem ? 'danger' : isDirty || currentPending ? 'warning' : 'success'}>{status}</StatusIndicator>
        {canEdit && <Button disabled={!currentOpen || busy || currentProblem?.kind === 'denied' || currentProblem?.kind === 'conflict' || (!isDirty && !currentPending)}
          onClick={() => void save()}>{currentPending ? '저장 확인·재시도' : '저장'}</Button>}
        {onLeave && <Button tone="quiet" disabled={busy || isDirty || !!currentPending} onClick={onLeave}>나가기</Button>}</>} />
    <div className="nw-workspace">
      <aside className="nw-sidebar" aria-label="서버 노트 목록">
        {canEdit && <Button disabled={loading || busy || isDirty || !!currentPending || currentProblem?.kind === 'denied'} onClick={create}>새 노트</Button>}
        <Button tone="quiet" disabled={busy || isDirty || !!currentPending} onClick={() => void load()}>목록 새로고침</Button>
        <nav aria-label="서버 문서 목록">{currentHeads.map(row =>
          <button type="button" key={row.documentId} aria-current={currentOpen?.documentId === row.documentId ? 'page' : undefined}
            disabled={busy || isDirty || !!currentPending || currentProblem?.kind === 'denied'}
            onClick={() => void openDocument(row.documentId)}>{row.title}</button>)}</nav>
        {!loading && !currentHeads.length && <p>문서가 없습니다.</p>}
      </aside>
      <main className="nw-main" aria-label="서버 노트 편집">
        {currentProblem && <StatusNotice tone="danger" title="작업을 완료하지 못했습니다">
          {currentProblem.message}{currentProblem.kind === 'load' && <Button onClick={() => void load()}>다시 시도</Button>}
          {currentProblem.kind === 'conflict' && <>
            <p>내 초안을 JSON으로 복사한 뒤 서버 최신본을 열어 차이를 확인하세요. 서버의 다른 변경은 자동으로 덮어쓰지 않습니다.</p>
            <Button disabled={busy} onClick={() => void copyConflictedDraft()}>초안 복사</Button>
            <Button disabled={busy || !conflictCopy || conflictCopy.generation !== currentOpen?.generation}
              onClick={() => void openLatestAfterConflict()}>서버 최신본 열기</Button>
          </>}
        </StatusNotice>}
        {currentProblem?.kind !== 'denied' && currentOpen && <section className="nw-document" aria-label="노트 편집">
          <h1>{currentOpen.note.attributes.title}</h1>
          {currentSession && <NoteEditor editor={currentSession.editor} rootId={currentSession.rootId} />}
        </section>}
        {!currentOpen && !loading && !currentProblem && <p>노트를 선택하거나 새로 만드세요.</p>}
      </main>
    </div>
  </div>;
}
