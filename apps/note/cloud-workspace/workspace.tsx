import { useCallback, useEffect, useRef, useState } from 'react';
import { openNoteTree, noteTreeOf, type NoteDocument } from '@barocss/office-note';
import { NoteEditor, type NoteInputDelivery } from '@barocss/office-note/view';
import { readNoteV1SnapshotFile, serializeNoteFile } from '@barocss/office-note/file';
import { createWorkspaceClient, getWorkspaceSession, WorkspaceError, type WorkspaceClient, type WorkspaceSession } from './client';
import { type DocumentHead, type SavedDocument, type SaveAttempt } from './shared';

function Symbol({ name }: { name: 'file' | 'plus' | 'undo' | 'redo' | 'spark' | 'lock' | 'search' | 'arrow' }) {
  const paths = {
    file: 'M7 3h7l4 4v14H6V3h1m7 0v5h5M9 12h6m-6 4h6', plus: 'M12 5v14M5 12h14',
    undo: 'M9 5 4 10l5 5M4 10h9a6 6 0 0 1 6 6v3', redo: 'm15 5 5 5-5 5m5-5h-9a6 6 0 0 0-6 6v3',
    spark: 'm12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3',
    lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10m7 5v2',
    search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6', arrow: 'M4 12h16m-6-6 6 6-6 6'
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
interface OpenDocument { saved: SavedDocument | null; document: NoteDocument; id: string; generation: string; authoredSavedAt?: string }
function decode(saved: SavedDocument): OpenDocument {
  const read = readNoteV1SnapshotFile(saved.snapshotText);
  if ('error' in read || read.document.attributes.pageId !== saved.pageId) throw new WorkspaceError('unsupported_note');
  return { saved, document: read.document, id: saved.documentId, generation: crypto.randomUUID(), authoredSavedAt: read.savedAt };
}
const errorMessage = (error: unknown) => {
  if (!(error instanceof WorkspaceError)) return '저장을 확인하지 못했습니다. 초안은 이 화면에 유지됩니다.';
  if (error.status === 409) return '다른 곳에서 이 문서를 저장했습니다. 현재 초안은 유지되며, 자동으로 덮어쓰지 않습니다.';
  if (error.code === 'document_too_large') return '문서가 저장 한도 256 KB를 넘었습니다. 초안을 내려받아 보관할 수 있습니다.';
  if (error.status === 422) return '지원하지 않는 문서 구조입니다. 초안을 내려받아 보관하세요.';
  return '서버 저장을 확인하지 못했습니다. 같은 요청을 다시 확인하거나 초안을 내려받으세요.';
};

export function Workspace() {
  const [session, setSession] = useState<WorkspaceSession>();
  const [client, setClient] = useState<WorkspaceClient>();
  const [documents, setDocuments] = useState<DocumentHead[]>([]);
  const [open, setOpen] = useState<OpenDocument>();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const guard = useRef<() => Promise<boolean>>(async () => true);
  const loading = useRef(false);
  const retired = useRef(false);
  const retire = useCallback(() => {
    retired.current = true; setDenied(true); setOpen(undefined); setDocuments([]); setClient(undefined);
  }, []);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const identity = await getWorkspaceSession();
        if (!live) return;
        const api = createWorkspaceClient(identity.userScope);
        setSession(identity); setClient(api);
        if (!identity.storageAvailable) { setError('서버 저장소가 아직 연결되지 않았습니다.'); return; }
        const rows = await api.list();
        if (live) setDocuments(rows);
        const id = new URL(location.href).searchParams.get('document');
        if (id) {
          const saved = await api.open(id);
          if (live) setOpen(decode(saved));
        }
      } catch (problem) {
        if (!live) return;
        if (problem instanceof WorkspaceError && (problem.status === 401 || problem.status === 403)) retire();
        else setError('문서 목록을 불러오지 못했습니다. 페이지를 다시 열어주세요.');
      } finally { if (live) setBusy(false); }
    })();
    return () => { live = false; };
  }, [retire]);
  const refresh = async (api: WorkspaceClient) => {
    const rows = await api.list();
    if (!retired.current) setDocuments(rows);
  };
  const change = async (id?: string) => {
    if (!client || loading.current || retired.current || !session?.storageAvailable) return;
    if (id && id === open?.id) return;
    loading.current = true;
    try {
      const openingGuard = guard.current;
      if (!await openingGuard()) { setError('현재 문서에 저장되지 않은 변경이 있습니다. 저장한 뒤 이동하세요.'); return; }
      setError(''); setBusy(true);
      if (id) {
        const saved = await client.open(id);
        if (retired.current || guard.current !== openingGuard) return;
        if (!await openingGuard()) { setError('문서를 여는 동안 새 입력이 생겼습니다. 현재 초안을 저장한 뒤 이동하세요.'); return; }
        setOpen(decode(saved));
      } else {
        const documentId = crypto.randomUUID();
        setOpen({ id: documentId, generation: crypto.randomUUID(), saved: null, document: { stype: 'note',
          attributes: { title: '제목 없는 문서', pageId: `note-${crypto.randomUUID()}` },
          content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }] } });
      }
      const url = new URL(location.href);
      if (id) url.searchParams.set('document', id); else url.searchParams.delete('document');
      history.replaceState(null, '', url);
    } catch (problem) {
      if (problem instanceof WorkspaceError && problem.status === 401) retire();
      else setError('문서를 열지 못했습니다. 현재 문서는 유지됩니다.');
    } finally { loading.current = false; setBusy(false); }
  };
  const onSaved = async (saved: SavedDocument) => {
    if (!client || retired.current) return;
    const url = new URL(location.href); url.searchParams.set('document', saved.documentId);
    history.replaceState(null, '', url);
    setDocuments(rows => [saved, ...rows.filter(row => row.documentId !== saved.documentId)]);
    // Saving is already confirmed. A later discovery failure must not turn it into a failed save.
    try { await refresh(client); } catch (problem) {
      if (problem instanceof WorkspaceError && problem.status === 401) retire();
      else setError('문서는 저장됐습니다. 목록 새로고침은 다음에 다시 시도하세요.');
    }
  };
  if (denied) return <main className="cw-access"><span className="cw-mark">w</span><h1>비공개 작업공간입니다</h1><p>로그인 상태가 변경되었거나 접근 권한이 없습니다.</p><a className="cw-primary" href="/signin-with-chatgpt?return_to=%2F" target="_top">ChatGPT로 로그인</a></main>;
  return <div className="cw-app">
    <aside className="cw-sidebar" aria-label="문서 탐색">
      <a href="/" className="cw-brand" onClick={event => { event.preventDefault(); }}><span className="cw-mark">w</span><span>wonffice<span className="cw-brand-sub">생각이 작업이 되는 곳</span></span></a>
      <div className="cw-space"><span className="cw-avatar">내</span><div><strong>내 작업공간</strong><small><Symbol name="lock" /> 소유자 전용 · 테스트</small></div></div>
      <button className="cw-primary cw-new" onClick={() => void change()} disabled={busy || !session?.storageAvailable}><Symbol name="plus" /> 새 문서</button>
      <label className="cw-search"><Symbol name="search" /><input aria-label="문서 검색" placeholder="문서 찾기" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="cw-list-label">내 문서 <span>{documents.length}</span></div>
      <nav className="cw-document-list" aria-label="내 문서">
        {open && !open.saved && !documents.some(row => row.documentId === open.id) && <button className="cw-document selected" aria-current="page"><Symbol name="file" /><span>새 문서<small>저장 전 초안</small></span><i /></button>}
        {documents.filter(row => row.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(row => <button key={row.documentId} className={`cw-document ${open?.id === row.documentId ? 'selected' : ''}`} aria-current={open?.id === row.documentId ? 'page' : undefined} onClick={() => void change(row.documentId)} disabled={busy}><Symbol name="file" /><span>{row.title}<small>문서 revision {row.revision}</small></span></button>)}
        {!busy && !documents.length && <p className="cw-list-empty">새 문서를 만들어<br />첫 생각을 적어보세요.</p>}
        {!!documents.length && !documents.some(row => row.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p className="cw-list-empty">일치하는 문서가 없습니다.</p>}
      </nav>
      <div className="cw-sidebar-foot"><span className="cw-online" /> 클라우드 작업공간<small>문서는 저장 버튼으로 서버에 보관됩니다.</small></div>
    </aside>
    <div className="cw-work">
      <header className="cw-top"><span>내 작업공간 <b>/</b> 문서</span><span className="cw-private"><Symbol name="lock" /> 비공개</span></header>
      {error && <div className="cw-notice" role="alert">{error}<button aria-label="안내 닫기" onClick={() => setError('')}>×</button></div>}
      {busy && !open ? <div className="cw-loading" role="status">작업공간을 여는 중…</div> : open && client ? <DocumentEditor key={open.generation} opened={open} client={client} guard={guard} onSaved={onSaved} onDenied={retire} onReopen={async stillCurrent => {
        if (!open.saved && !documents.some(row => row.documentId === open.id)) return;
        if (!window.confirm('현재 화면의 저장되지 않은 초안을 버리고 서버의 최신본을 여시겠습니까? 필요한 초안은 먼저 내려받으세요.')) return;
        try {
          const latest = await client.open(open.id);
          if (retired.current) return;
          if (!stillCurrent()) { setError('최신본을 여는 동안 새 입력이 생겼습니다. 현재 초안을 유지합니다.'); return; }
          setOpen(decode(latest));
        }
        catch (problem) { if (problem instanceof WorkspaceError && problem.status === 401) retire(); else setError('최신본을 열지 못했습니다. 초안을 유지합니다.'); }
      }} /> : <main className="cw-welcome"><div className="cw-welcome-icon"><Symbol name="file" /></div><span className="cw-eyebrow">YOUR NEXT IDEA STARTS HERE</span><h1>생각을 적고,<br />작업을 이어가세요.</h1><p>문서를 직접 편집하고 서버에 저장하세요.<br />다시 열어도 같은 문서에서 이어갈 수 있습니다.</p><button className="cw-primary" disabled={!session?.storageAvailable} onClick={() => void change()}>첫 문서 만들기 <Symbol name="arrow" /></button><div className="cw-welcome-detail"><Symbol name="lock" /> 나만 볼 수 있는 비공개 테스트 공간</div><div className="cw-step-row"><div><b>01</b><strong>직접 편집</strong><span>기존 Note 편집기로 자유롭게</span></div><div><b>02</b><strong>서버 저장</strong><span>문서 revision으로 변경 보관</span></div><div><b>03</b><strong>AI 제안 검토</strong><span>런타임 연결 후 사용 가능</span></div></div></main>}
    </div>
  </div>;
}

function DocumentEditor({ opened, client, guard, onSaved, onDenied, onReopen }: {
  opened: OpenDocument; client: WorkspaceClient; guard: React.MutableRefObject<() => Promise<boolean>>;
  onSaved(saved: SavedDocument): Promise<void>; onDenied(): void; onReopen(stillCurrent: () => boolean): Promise<void>;
}) {
  const [native] = useState(() => openNoteTree(opened.document));
  const [title, setTitle] = useState(opened.document.attributes.title);
  const titleRef = useRef(title); titleRef.current = title;
  const [confirmed, setConfirmed] = useState(opened.saved);
  const confirmedRef = useRef(confirmed); confirmedRef.current = confirmed;
  const [dirty, setDirty] = useState(!opened.saved);
  const [saving, setSaving] = useState(false);
  const [historyState, setHistoryState] = useState({ undo: false, redo: false });
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(false);
  const pending = useRef<Readonly<SaveAttempt> | null>(null);
  const savingRef = useRef(false), live = useRef(true);
  const editEpoch = useRef(0);
  const deliveries = useRef(new Set<NoteInputDelivery>());
  const register = useCallback((flush: NoteInputDelivery) => {
    deliveries.current.add(flush); return () => { deliveries.current.delete(flush); };
  }, []);
  const snapshot = useCallback(() => {
    const tree = noteTreeOf(native.editor.dataStore, native.rootId);
    if (!tree) throw new Error('The native editor is no longer available');
    return serializeNoteFile({ ...opened.document, attributes: { ...opened.document.attributes, title: titleRef.current }, content: tree.content as unknown[] },
      opened.authoredSavedAt === undefined ? undefined : { savedAt: opened.authoredSavedAt });
  }, [native, opened.document, opened.authoredSavedAt]);
  const flush = useCallback(async () => {
    if (!live.current || !deliveries.current.size) return false;
    for (const delivery of [...deliveries.current].reverse()) if (!await delivery()) return false;
    return live.current;
  }, []);
  useEffect(() => {
    live.current = true;
    const changed = () => {
      if (!live.current) return;
      editEpoch.current++;
      setDirty(snapshot() !== confirmedRef.current?.snapshotText);
      setHistoryState({ undo: native.editor.canUndo(), redo: native.editor.canRedo() });
    };
    native.editor.on('editor:content.change', changed);
    return () => { live.current = false; native.editor.off('editor:content.change', changed); native.close(); };
  }, [native, snapshot]);
  useEffect(() => {
    const ownGuard = async () => !savingRef.current && !pending.current && await flush() && snapshot() === confirmedRef.current?.snapshotText;
    guard.current = ownGuard;
    return () => { if (guard.current === ownGuard) guard.current = async () => true; };
  }, [guard, flush, snapshot]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty || pending.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  const save = async () => {
    if (savingRef.current || conflict || !live.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      if (!await flush()) { setError('입력 중인 글자를 마무리한 뒤 다시 저장하세요.'); return; }
      if (!pending.current) {
        if (!titleRef.current.trim()) { setError('문서 제목을 입력하세요.'); return; }
        pending.current = Object.freeze({ documentId: opened.id, baseRevision: confirmedRef.current?.revision ?? 0,
          requestId: crypto.randomUUID(), snapshotText: snapshot() });
      }
      const saved = await client.save(pending.current);
      if (!live.current) return;
      pending.current = null; setPendingRequest(false); confirmedRef.current = saved; setConfirmed(saved);
      // Editing can continue during a save. A later draft never becomes the confirmed snapshot.
      setDirty(snapshot() !== saved.snapshotText);
      await onSaved(saved);
    } catch (problem) {
      if (!live.current) return;
      if (problem instanceof WorkspaceError && problem.status === 401) { native.editor.setEditable(false); onDenied(); return; }
      // These definite validation refusals wrote no revision. A corrected draft can start a new
      // explicit attempt; uncertain/network failures must retain the original frozen attempt.
      if (problem instanceof WorkspaceError && [400, 413, 422].includes(problem.status ?? 0)) pending.current = null;
      setPendingRequest(!!pending.current); setConflict(problem instanceof WorkspaceError && problem.status === 409);
      setError(errorMessage(problem));
    } finally { savingRef.current = false; if (live.current) setSaving(false); }
  };
  const historyAction = async (direction: 'undo' | 'redo') => {
    if (!await flush()) return;
    await native.editor[direction]();
    setHistoryState({ undo: native.editor.canUndo(), redo: native.editor.canRedo() });
    setDirty(snapshot() !== confirmedRef.current?.snapshotText);
  };
  const download = async () => {
    if (!await flush()) { setError('입력 중인 글자를 마무리한 뒤 초안을 내려받으세요.'); return; }
    const url = URL.createObjectURL(new Blob([snapshot()], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'workspace-draft.note.json'; link.click();
    URL.revokeObjectURL(url);
  };
  const reopen = async () => {
    if (!await flush()) { setError('입력 중인 글자를 마무리한 뒤 최신본을 여세요.'); return; }
    const epoch = editEpoch.current, before = snapshot();
    await onReopen(() => live.current && editEpoch.current === epoch && snapshot() === before &&
      ![...deliveries.current].some(delivery => delivery.hasPendingInput?.()));
  };
  const pointer = (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault();
  return <div className="cw-editor-layout">
    <section className="cw-editor-column" aria-label="문서 편집">
      <div className="cw-editor-toolbar"><span className={`cw-status ${dirty ? 'unsaved' : ''}`} role="status" data-save-state={saving ? 'saving' : pendingRequest ? 'unconfirmed' : dirty ? 'dirty' : 'saved'}><i />{saving ? '서버 저장 확인 중…' : pendingRequest ? '저장 확인 필요' : dirty ? '저장되지 않은 변경' : '서버에 저장됨'}</span><div className="cw-actions"><button aria-label="실행 취소" title="실행 취소" onMouseDown={pointer} onClick={() => void historyAction('undo')} disabled={!historyState.undo}><Symbol name="undo" /></button><button aria-label="다시 실행" title="다시 실행" onMouseDown={pointer} onClick={() => void historyAction('redo')} disabled={!historyState.redo}><Symbol name="redo" /></button><span className="cw-toolbar-divider" /><button className="cw-primary" disabled={saving || conflict || (!dirty && !pendingRequest)} onMouseDown={pointer} onClick={() => void save()}>{saving ? '저장 확인 중' : pendingRequest ? '저장 확인·재시도' : '서버에 저장'}</button></div></div>
      {error && <div className="cw-save-problem" role="alert"><strong>{conflict ? '새로운 서버 변경이 있습니다' : '초안을 유지하고 있습니다'}</strong><p>{error}</p><div><button onClick={() => void download()}>초안 내려받기</button>{confirmed && <button onClick={() => void reopen()}>최신본 열기</button>}</div></div>}
      <main className="cw-paper"><div className="cw-document-kicker"><Symbol name="file" /> NOTE <span>{confirmed ? `문서 revision ${confirmed.revision}` : '새 문서 · 저장 전'}</span></div><input className="cw-title" aria-label="문서 제목" value={title} maxLength={120} placeholder="문서 제목" onChange={event => { editEpoch.current++; setTitle(event.target.value); titleRef.current = event.target.value; setDirty(snapshot() !== confirmedRef.current?.snapshotText); }} /><div className="cw-paper-rule" /><div className="cw-native" onInputCapture={() => { editEpoch.current++; setDirty(true); }}><NoteEditor editor={native.editor} rootId={native.rootId} writeAllowed registerBeforeSnapshot={register} /></div><div className="cw-paper-foot">자유롭게 편집하세요. 변경은 저장 버튼을 누른 뒤 서버에 보관됩니다.</div></main>
      <footer className="cw-editor-footer"><span>Note 기본 편집기 · 실행 취소 / 다시 실행</span><span>{confirmed ? `문서 revision ${confirmed.revision}` : '아직 서버 저장 전'}</span></footer>
    </section>
    <aside className="cw-ai" aria-label="AI 제안"><div className="cw-ai-heading"><span><Symbol name="spark" /></span><h2>함께 다듬는 문서</h2></div><span className="cw-ai-badge">AI 연결 안 됨</span><p className="cw-ai-intro">작성은 지금 시작하세요.<br />AI는 연결되면 제안으로 참여합니다.</p><div className="cw-ai-flow"><div><b>1</b><span><strong>변경 요청</strong><small>고칠 부분과 원하는 방향을 전달</small></span></div><div><b>2</b><span><strong>제안 검토</strong><small>원문과 변경 내용을 비교</small></span></div><div><b>3</b><span><strong>직접 적용</strong><small>승인한 내용만 편집기에 반영</small></span></div></div><div className="cw-ai-disabled"><Symbol name="lock" /><strong>연결 가능한 런타임이 필요합니다</strong><p>이 테스트에는 AI 실행 서비스가 연결되어 있지 않습니다. 문서 전송과 모델 호출은 수행되지 않습니다.</p><button disabled>AI 제안 요청</button></div><p className="cw-ai-note">제안 적용과 서버 저장은 별도 단계입니다. 적용 후에도 직접 저장해야 합니다.</p></aside>
  </div>;
}
