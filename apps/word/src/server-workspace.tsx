import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createStarterDocument, wordFileName, wordTitle } from '@barocss/office-word';
import { Button } from '@barocss/office-ui';
import { registerProductDocumentHost } from '@barocss/shared';
import { App } from './app';
import './style.css';
import { wordStore } from './autosave';
import { assertWordNativeDocument, mountWordRuntime, type WordRuntime } from './runtime';
import { readServerWordFile, serverWordFileText, stableWordSnapshotText, type WordDocument } from './server-file';
import { createServerWordClient, ServerWordError, wordSaveAttempt, type ServerWordHead, type WordSaveAttempt } from './server-documents';
import { createServerPendingStore, newPendingWordDraftId, type PendingWordBase, type PendingWordRecord } from './server-pending';

export interface ServerWordWorkspaceProps {
  tenantId: string; workspaceId: string; issuer: string; subject: string;
  initialDocumentId?: string; authorizedFetch: typeof fetch;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  headerNavigation?: ReactNode;
  onNavigate?: (documentId: string) => void;
  onUnsafeChange?: (unsafe: boolean) => void;
}
type Open = { owner: object; generation: string; documentRef: string; documentId: string | null;
  head: ServerWordHead | null; initial: WordDocument; text: string; confirmed: string | null };
type Problem = { kind: 'load' | 'save' | 'conflict' | 'denied' | 'mode'; message: string };
type Fixed = { attempt: Readonly<WordSaveAttempt>; record: PendingWordRecord };
function failure(error: unknown): Problem {
  if (error instanceof ServerWordError && [401, 403, 404].includes(error.status ?? 0)) return { kind: 'denied', message: '현재 계정의 문서 접근 권한을 확인하지 못했습니다.' };
  if (error instanceof ServerWordError && error.status === 409) return { kind: 'conflict', message: '서버의 최신본이 변경되었습니다. 초안과 고정된 요청을 유지합니다.' };
  return { kind: 'save', message: '연결 또는 저장을 확인하지 못했습니다. 같은 요청으로 확인하거나 다시 시도하세요.' };
}
function documentOf(text: string) {
  const read = readServerWordFile(text);
  if ('error' in read) throw new Error('지원하지 않는 Word 파일입니다. 현재 문서와 원본은 그대로 유지합니다.');
  assertWordNativeDocument(read.document);
  return read.document;
}

/** Full native Word runtime, with authenticated snapshot authority and scoped recovery. */
export function ServerWordWorkspace({ tenantId, workspaceId, issuer, subject, initialDocumentId,
  authorizedFetch, role, onNavigate, onUnsafeChange, headerNavigation }: ServerWordWorkspaceProps) {
  const client = useMemo(() => createServerWordClient({ tenantId, workspaceId, authorizedFetch }), [tenantId, workspaceId, authorizedFetch, issuer, subject]);
  const store = useMemo(() => createServerPendingStore({ tenantId, workspaceId, issuer, subject }), [tenantId, workspaceId, issuer, subject]);
  const active = useRef(client); active.current = client;
  const callbacks = useRef({ onNavigate, onUnsafeChange }); callbacks.current = { onNavigate, onUnsafeChange };
  const [opened, setOpened] = useState<Open>();
  const current = opened?.owner === client ? opened : undefined;
  const currentRef = useRef(current); currentRef.current = current;
  const runtime = useRef<{ generation: string; value: WordRuntime; off: () => void } | undefined>(undefined);
  const draft = useRef<PendingWordRecord | undefined>(undefined);
  const fixed = useRef<Fixed | undefined>(undefined);
  const [records, setRecords] = useState<PendingWordRecord[]>([]);
  const [heads, setHeads] = useState<ServerWordHead[]>([]);
  const [problem, setProblem] = useState<Problem>();
  const problemRef = useRef(problem); problemRef.current = problem;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const savePending = useRef<Promise<void> | undefined>(undefined);
  const [protectedInput, setProtectedInput] = useState(true);
  const protectedRef = useRef(true);
  const [nestedInput, setNestedInput] = useState(false);
  const nestedRef = useRef(false);
  const [, refresh] = useState(0);
  const [sources, setSources] = useState<{ name: string; title?: string }[]>();
  const [sourceError, setSourceError] = useState('');
  const [copied, setCopied] = useState<string>();
  const shell = useRef<HTMLDivElement>(null);
  const canEdit = role !== 'viewer' && problem?.kind !== 'denied';
  const authority = useRef(canEdit); authority.current = canEdit;
  const dirty = !!current && (current.confirmed === null || stableWordSnapshotText(current.text) !== stableWordSnapshotText(current.confirmed));
  const signalProtection = useCallback((safe: boolean) => {
    protectedRef.current = safe; setProtectedInput(safe);
    callbacks.current.onUnsafeChange?.(!safe || nestedRef.current);
  }, []);
  const track = useCallback((record: PendingWordRecord) => {
    setRecords(previous => [record, ...previous.filter(item => item.draftId !== record.draftId)]);
  }, []);
  const baseOf = (one: Open): PendingWordBase => one.documentId
    ? { operation: 'update', documentId: one.documentId, expectedRevision: one.head!.revision }
    : { operation: 'create', workspaceId };
  const protect = useCallback((one: Open, text: string) => {
    const previous = draft.current;
    const reuse = previous?.status === 'draft' && previous.scope.documentRef === one.documentRef;
    const record = store.write({ draftId: reuse ? previous.draftId : newPendingWordDraftId(),
      documentRef: one.documentRef, base: one.documentId
        ? { operation: 'update', documentId: one.documentId, expectedRevision: one.head!.revision }
        : { operation: 'create', workspaceId }, status: 'draft', snapshotText: text });
    draft.current = record; track(record); signalProtection(true); return record;
  }, [store, workspaceId, track, signalProtection]);
  const capture = useCallback(() => {
    const one = currentRef.current;
    const live = runtime.current;
    if (!one || !live || live.generation !== one.generation || active.current !== client) return one?.text;
    try {
      const text = serverWordFileText(live.value.exportNativeDocument(), '');
      if (stableWordSnapshotText(text) === stableWordSnapshotText(one.text)) return one.text;
      const next = { ...one, text };
      currentRef.current = next; setOpened(next); setCopied(undefined);
      try { protect(next, text); } catch { signalProtection(false); }
      return text;
    } catch { signalProtection(false); return undefined; }
  }, [client, protect, signalProtection]);
  const replace = useCallback((one: Open, record?: PendingWordRecord) => {
    // Validate before changing the current model or its mounted lifetime.
    assertWordNativeDocument(one.initial);
    runtime.current?.off(); runtime.current = undefined;
    draft.current = record?.status === 'draft' ? undefined : record;
    fixed.current = record?.status === 'pending' && record.attempt ? { attempt: record.attempt, record } : undefined;
    currentRef.current = one; setOpened(one); setProblem(undefined); setCopied(undefined); signalProtection(true);
    refresh(value => value + 1);
  }, [signalProtection]);
  const safeSwitch = () => {
    capture();
    if (!protectedRef.current || nestedRef.current || busyRef.current) return false;
    const one = currentRef.current;
    return !one || (!fixed.current && one.confirmed !== null && stableWordSnapshotText(one.text) === stableWordSnapshotText(one.confirmed)) ||
      window.confirm('현재 초안과 저장 요청은 복구 저장소에 남습니다. 다른 문서를 여시겠습니까?');
  };
  const openDocument = async (documentId: string) => {
    if (!safeSwitch()) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await client.open(documentId);
      if (active.current !== client) return;
      if (result.mode !== 'snapshot') { setProblem({ kind: 'mode', message: '공동 편집 문서는 스냅샷 편집으로 열 수 없습니다.' }); return; }
      replace({ owner: client, generation: crypto.randomUUID(), documentRef: documentId, documentId,
        head: result.document, initial: documentOf(result.snapshotText), text: result.snapshotText, confirmed: result.snapshotText });
      callbacks.current.onNavigate?.(documentId);
    } catch (error) { if (active.current === client) setProblem(error instanceof ServerWordError ? failure(error) : { kind: 'load', message: error instanceof Error ? error.message : '문서를 열지 못했습니다.' }); }
    finally { if (active.current === client) { busyRef.current = false; setBusy(false); } }
  };
  useEffect(() => {
    let alive = true; active.current = client;
    void (async () => {
      try {
        const rows = await client.list();
        if (!alive || active.current !== client) return;
        setHeads(rows);
        try { setRecords(store.list()); } catch { setSourceError('복구 목록을 읽지 못했습니다. 원본 레코드는 유지됩니다.'); }
        if (initialDocumentId) {
          const result = await client.open(initialDocumentId);
          if (!alive || active.current !== client) return;
          if (result.mode !== 'snapshot') { setProblem({ kind: 'mode', message: '공동 편집 문서는 스냅샷 편집으로 열 수 없습니다.' }); return; }
          replace({ owner: client, generation: crypto.randomUUID(), documentRef: initialDocumentId, documentId: initialDocumentId,
            head: result.document, initial: documentOf(result.snapshotText), text: result.snapshotText, confirmed: result.snapshotText });
        }
      } catch (error) { if (alive && active.current === client) setProblem(error instanceof ServerWordError ? failure(error) : { kind: 'load', message: '문서 목록 또는 Word 원문을 확인하지 못했습니다.' }); }
      finally { if (alive && active.current === client) setLoading(false); }
    })();
    return () => { alive = false; if (active.current === client) active.current = {} as typeof client; runtime.current?.off(); runtime.current = undefined; };
    // A successful create changes the URL without reloading the same live runtime.
  }, [client, store, replace]);
  const mount = useCallback((host: HTMLElement, onFurniture?: (id?: string) => void) => {
    const one = currentRef.current!;
    // Same-account role changes update the live runtime; they must not reload its initial snapshot.
    return mountWordRuntime(host, { initialDocument: one.initial, editable: authority.current }, onFurniture);
  }, [client, current?.generation]);
  const onRuntime = useCallback((value: WordRuntime) => {
    const generation = currentRef.current!.generation;
    const changed = () => { if (active.current === client && runtime.current?.generation === generation) capture(); };
    value.editor.on('editor:content.change', changed);
    runtime.current = { generation, value, off: () => value.editor.off('editor:content.change', changed) };
  }, [client, capture]);
  useEffect(() => {
    runtime.current?.value.editor.setEditable(canEdit && !busy && !(draft.current?.source && draft.current.status !== 'confirmed'));
  }, [canEdit, busy, current?.generation, records]);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const pending = !!shell.current?.querySelector('.w-math-draft');
      nestedRef.current = pending; setNestedInput(pending);
      callbacks.current.onUnsafeChange?.(pending || !protectedRef.current);
    });
    if (shell.current) observer.observe(shell.current, { childList: true, subtree: true });
    const unload = (event: BeforeUnloadEvent) => { capture(); if (!protectedRef.current || nestedRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const hide = () => { capture(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('pagehide', hide);
    return () => { observer.disconnect(); window.removeEventListener('beforeunload', unload); window.removeEventListener('pagehide', hide); };
  }, [capture]);
  const prepare = async (text: string, name?: string, sourceTitle?: string) => {
    if (!authority.current || !safeSwitch()) return;
    let initial: WordDocument;
    try { initial = documentOf(text); } catch (error) { setSourceError(error instanceof Error ? error.message : '파일을 읽지 못했습니다.'); return; }
    busyRef.current = true; setBusy(true);
    try {
      await client.list();
      if (active.current !== client || !authority.current) return;
      const one: Open = { owner: client, generation: crypto.randomUUID(), documentRef: crypto.randomUUID(), documentId: null,
        head: null, initial, text, confirmed: null };
      const draftId = newPendingWordDraftId();
      const attempt = name ? wordSaveAttempt({ operation: 'create', workspaceId, title: sourceTitle || name, snapshotText: text, idempotencyKey: draftId }) : undefined;
      const record = store.write({ draftId, documentRef: one.documentRef, base: { operation: 'create', workspaceId },
        status: attempt ? 'pending' : 'draft', snapshotText: text,
        ...(attempt ? { attempt, source: { kind: 'indexeddb-word' as const, name: name! } } : {}) });
      replace(one, record); draft.current = record; track(record); setSourceError('');
    } catch (error) { if (active.current === client) setProblem(failure(error)); }
    finally { if (active.current === client) { busyRef.current = false; setBusy(false); } }
  };
  const recover = async (record: PendingWordRecord) => {
    if (!authority.current || !safeSwitch()) return;
    busyRef.current = true; setBusy(true);
    try {
      let head: ServerWordHead | null = null;
      if (record.base.operation === 'update') {
        const verified = await client.open(record.base.documentId);
        if (verified.mode !== 'snapshot') throw new ServerWordError(409, 'snapshot_mode_required');
        head = { ...verified.document, revision: record.base.expectedRevision };
      } else await client.list();
      if (active.current !== client || !authority.current) return;
      const initial = documentOf(record.snapshotText);
      replace({ owner: client, generation: crypto.randomUUID(), documentRef: record.scope.documentRef,
        documentId: record.base.operation === 'update' ? record.base.documentId : null, head,
        initial, text: record.snapshotText, confirmed: null }, record);
      track(record);
    } catch (error) { if (active.current === client) setProblem(error instanceof ServerWordError ? failure(error) : { kind: 'load', message: '이 초안을 열 수 없습니다. 원본은 유지됩니다.' }); }
    finally { if (active.current === client) { busyRef.current = false; setBusy(false); } }
  };
  const saveCurrent = async () => {
    if (!authority.current || busyRef.current || nestedRef.current || problemRef.current?.kind === 'conflict') return;
    const text = capture(); const one = currentRef.current;
    if (!text || !one) return;
    let pinned: Fixed;
    try {
      if (!protectedRef.current) protect(one, text);
      if (fixed.current) pinned = fixed.current;
      else {
        const record = draft.current?.status === 'draft' ? draft.current : protect(one, text);
        const attempt = wordSaveAttempt(one.documentId
          ? { operation: 'update', documentId: one.documentId, expectedRevision: one.head!.revision, snapshotText: text, idempotencyKey: record.draftId }
          : { operation: 'create', workspaceId, title: wordTitle(runtime.current!.value.editor.dataStore) || '제목 없는 문서', snapshotText: text, idempotencyKey: record.draftId });
        const pending = store.write({ draftId: record.draftId, documentRef: one.documentRef, base: baseOf(one), status: 'pending', snapshotText: text, attempt });
        pinned = { attempt, record: pending }; fixed.current = pinned; draft.current = pending; track(pending);
      }
    } catch { signalProtection(false); setProblem({ kind: 'save', message: '복구 저장소에 기록하지 못했습니다. 서버에 보내지 않았습니다.' }); return; }
    busyRef.current = true; setBusy(true); setProblem(undefined);
    try {
      // Recheck authority before receipt lookup or retry, including new-document requests.
      await client.list();
      if (active.current !== client || !authority.current) return;
      let receipt;
      try { receipt = await client.receipt(pinned.attempt.operation, pinned.attempt.idempotencyKey); }
      catch (error) { if (!(error instanceof ServerWordError) || error.status !== 404) throw error; if (active.current !== client || !authority.current) return; receipt = await client.save(pinned.attempt); }
      if (active.current !== client || !authority.current) return;
      const confirmed = await client.confirm(pinned.attempt, receipt);
      if (active.current !== client || currentRef.current?.generation !== one.generation) return;
      try {
        const record = store.write({ draftId: pinned.record.draftId, documentRef: pinned.record.scope.documentRef,
          base: pinned.record.base, status: 'confirmed', snapshotText: pinned.attempt.snapshotText, attempt: pinned.attempt,
          ...(pinned.record.source ? { source: pinned.record.source, confirmedCopy: { documentId: confirmed.document.documentId,
            revision: confirmed.document.revision, snapshotHash: confirmed.document.snapshotHash } } : {}) });
        track(record); if (draft.current?.draftId === record.draftId) draft.current = record;
      } catch { /* Durable pending receipt remains available for independent confirmation. */ }
      const latest = currentRef.current!;
      const next = { ...latest, documentId: confirmed.document.documentId, head: confirmed.document, confirmed: confirmed.snapshotText };
      currentRef.current = next; setOpened(next); fixed.current = undefined;
      if (stableWordSnapshotText(next.text) !== stableWordSnapshotText(next.confirmed)) {
        try { protect(next, next.text); } catch { signalProtection(false); }
      }
      setHeads(previous => [confirmed.document, ...previous.filter(item => item.documentId !== confirmed.document.documentId)]);
      callbacks.current.onNavigate?.(confirmed.document.documentId); refresh(value => value + 1);
    } catch (error) { if (active.current === client) setProblem(failure(error)); }
    finally { if (active.current === client) { busyRef.current = false; setBusy(false); } }
  };
  const save = () => {
    if (savePending.current) return savePending.current;
    const pending = saveCurrent().finally(() => { if (savePending.current === pending) savePending.current = undefined; });
    savePending.current = pending;
    return pending;
  };
  const beforeNavigate = useRef<() => Promise<boolean>>(async () => false);
  beforeNavigate.current = async () => {
    const one = currentRef.current, live = runtime.current;
    if (!one?.documentId || !live || live.generation !== one.generation || active.current !== client || nestedRef.current || !protectedRef.current) return false;
    const rootId = live.value.editor.getRootId();
    const epoch = live.value.editor.dataStore.getDocumentEpoch();
    const currentOwner = () => active.current === client && currentRef.current?.generation === one.generation &&
      currentRef.current.documentId === one.documentId && runtime.current === live && live.value.editor.getRootId() === rootId &&
      live.value.editor.dataStore.getDocumentEpoch() === epoch;
    try {
      await live.value.flushCommands();
      if (!currentOwner() || nestedRef.current || !protectedRef.current) return false;
      if (savePending.current) await savePending.current;
      if (!currentOwner() || busyRef.current || problemRef.current?.kind === 'conflict' || problemRef.current?.kind === 'denied') return false;
      const text = capture(), latest = currentRef.current;
      if (!text || !latest) return false;
      if (fixed.current || latest.confirmed === null || stableWordSnapshotText(text) !== stableWordSnapshotText(latest.confirmed)) {
        if (!authority.current) return false;
        await save();
      }
      await live.value.flushCommands();
      if (!currentOwner() || busyRef.current || nestedRef.current || !protectedRef.current || fixed.current || problemRef.current) return false;
      const confirmed = currentRef.current!.confirmed;
      return confirmed !== null && stableWordSnapshotText(serverWordFileText(live.value.exportNativeDocument(), '')) === stableWordSnapshotText(confirmed);
    } catch { return false; }
  };
  useEffect(() => {
    if (!current) return;
    const generation = current.generation;
    return registerProductDocumentHost({ product: 'word',
      id: () => active.current === client && currentRef.current?.generation === generation ? currentRef.current.documentId ?? '' : '',
      beforeNavigate: () => active.current === client && currentRef.current?.generation === generation ? beforeNavigate.current() : Promise.resolve(false)
    });
  }, [client, current?.generation]);
  const exportNative = () => {
    if (shell.current?.querySelector('.w-math-draft')) return;
    const text = capture(); if (!text) return;
    const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.href = url; link.download = wordFileName(runtime.current ? wordTitle(runtime.current.value.editor.dataStore) : '초안'); link.click(); URL.revokeObjectURL(url);
  };
  const status = !protectedInput ? '복구 저장 실패' : nestedInput ? '수식 입력 완료 필요' : busy ? '저장 중…' : fixed.current ? '저장 확인 필요' : dirty ? '저장되지 않음' : current ? '서버 저장 확인됨' : '문서 선택';
  const actions = <><span role="status" data-save-status>{status}</span>{canEdit && <Button disabled={!current || busy || nestedInput || problem?.kind === 'conflict' || (!dirty && !fixed.current)} onClick={() => void save()}>{fixed.current ? '저장 확인·재시도' : '저장'}</Button>}<Button disabled={!current || nestedInput} onClick={exportNative}>Word 파일 내보내기</Button></>;
  const navigation = <aside aria-label="서버 Word 목록">
      {canEdit && <Button disabled={loading || busy || !protectedInput || nestedInput} onClick={() => void prepare(serverWordFileText(createStarterDocument(), ''))}>새 Word</Button>}
      {heads.map(head => <Button key={head.documentId} disabled={busy || !protectedInput || nestedInput} onClick={() => void openDocument(head.documentId)}>{head.title}</Button>)}
      {canEdit && <Button disabled={busy} onClick={() => void wordStore.rows().then(rows => { if (active.current === client) setSources(rows); }).catch(() => setSourceError('로컬 문서 목록을 읽지 못했습니다.'))}>이 기기의 로컬 문서 목록 확인</Button>}
      {canEdit && sources?.map(source => <Button key={source.name} disabled={busy} onClick={() => void wordStore.text(source.name).then(text => { if (active.current === client) { if (text === undefined) throw new Error('missing_local_document'); return prepare(text, source.name, source.title); } }).catch(() => setSourceError('로컬 문서를 읽지 못했습니다. 원본은 유지됩니다.'))}>{source.title || source.name} · 새 서버 사본 준비</Button>)}
      {canEdit && <label>Word 원본 파일로 새 서버 사본 준비<input type="file" accept=".word.json,.json,application/json" disabled={busy || !protectedInput || nestedInput}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void file.text().then(text => { if (active.current === client) return prepare(text); }).catch(() => setSourceError('파일을 읽지 못했습니다. 현재 문서는 유지됩니다.')); }} /></label>}
      {sourceError && <p role="alert">{sourceError}</p>}
      {canEdit && records.filter(record => record.status !== 'confirmed').map(record => <Button key={record.draftId} disabled={busy || !protectedInput || nestedInput} onClick={() => void recover(record)}>저장된 Word 초안 복구 · {record.savedAt}</Button>)}
      {records.filter(record => record.source && record.status === 'confirmed').map(record => <p key={record.draftId} data-confirmed-local-copy>로컬 Word {record.source!.name}의 서버 사본을 확인했습니다. 원본과 확인된 요청은 이 기기에 남아 있습니다. 서버 문서: {record.confirmedCopy?.documentId}.</p>)}
    </aside>;
  return <div ref={shell} data-server-word-workspace>
    {!current && navigation}
    {problem && <p role="alert">{problem.message}</p>}
    {!protectedInput && <p role="alert">현재 입력을 보관하지 못했습니다. 저장소 공간을 확보하고 저장을 다시 시도하세요. 화면을 나갈 수 없습니다.</p>}
    {problem?.kind === 'conflict' && <><Button onClick={() => { const text = capture(); if (text) void navigator.clipboard.writeText(text).then(() => setCopied(text)).catch(() => setCopied(undefined)); }}>충돌 초안 복사</Button><Button disabled={!copied || copied !== current?.text || busy} onClick={() => { if (current?.documentId) void openDocument(current.documentId); }}>서버 최신본 열기</Button></>}
    {loading && <p role="status">Word 자료를 확인하는 중입니다.</p>}
    {current && problem?.kind !== 'denied' && <App key={current.generation} mount={mount} server={{ headerActions: actions, headerNavigation, navigation,
      feedbackDocumentId: () => active.current === client && currentRef.current?.generation === current.generation ? currentRef.current.documentId ?? '' : '',
      canComment: () => active.current === client && currentRef.current?.generation === current.generation && authority.current &&
        !busyRef.current && !nestedRef.current && problemRef.current?.kind !== 'conflict' && protectedRef.current,
      readOnly: !canEdit || busy || !!(draft.current?.source && draft.current.status !== 'confirmed'), onRuntime,
      onFileAction: action => { if (action === 'save') void save(); else if (action === 'new') void prepare(serverWordFileText(createStarterDocument(), '')); else shell.current?.querySelector('aside')?.scrollIntoView(); } }} />}
  </div>;
}
