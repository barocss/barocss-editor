import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NoteEditor } from '@barocss/office-note/view';
import { readNoteSnapshotFile, serializeNoteFile } from '@barocss/office-note/file';
import { noteTreeOf, openNoteTree, type NoteDocument, type NoteSession } from '@barocss/office-note';
import { Button, EditorHeader, StatusIndicator, StatusNotice } from '@barocss/office-ui';
import { pageTemplate } from './workspace-library';
import { ServerLocalNoteCopy } from './server-local-copy';
import { createServerNoteClient, noteSaveAttempt, ServerNoteError,
  type NoteSaveAttempt, type OpenServerNote, type ServerNoteHead } from './server-documents';
import { createServerPendingStore, newPendingNoteDraftId, type PendingNoteBase, type PendingNoteRecord,
  type PendingNoteScope } from './server-pending';

export interface ServerNoteWorkspaceProps {
  tenantId: string;
  workspaceId: string;
  issuer: string;
  subject: string;
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
type DraftState = { owner: object; generation: string; record: PendingNoteRecord };
type RecoveryState = { owner: object; records: PendingNoteRecord[] };
type ProtectionState = { owner: object; generation: string; version: number; protected: boolean; error?: string };

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
  issuer, subject, role, onNavigate, onLeave, onUnsafeChange }: ServerNoteWorkspaceProps) {
  const client = useMemo(() => createServerNoteClient({ tenantId, workspaceId, authorizedFetch }),
    [tenantId, workspaceId, authorizedFetch, issuer, subject]);
  const pendingStore = useMemo(() => createServerPendingStore({ issuer, subject, tenantId, workspaceId } satisfies PendingNoteScope),
    [issuer, subject, tenantId, workspaceId]);
  const workspace = useRef<HTMLDivElement>(null);
  const activeClient = useRef(client);
  activeClient.current = client;
  const navigate = useRef(onNavigate);
  navigate.current = onNavigate;
  const [heads, setHeads] = useState<{ owner: object; rows: ServerNoteHead[] }>();
  const [open, setOpen] = useState<OpenState>();
  const [pending, setPending] = useState<Pending>();
  const [draftState, setDraftState] = useState<DraftState>();
  const [recoveryState, setRecoveryState] = useState<RecoveryState>();
  const [recoveryError, setRecoveryError] = useState<{ owner: object; message: string }>();
  const [protection, setProtection] = useState<ProtectionState>();
  const [problem, setProblem] = useState<Problem>();
  const [conflictCopy, setConflictCopy] = useState<{ generation: string; snapshotText: string }>();
  const [navigationRequest, setNavigationRequest] = useState<{ mode: 'find'; id: number; generation: string }>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<{ owner: object; generation: string; documentId: string | null; editable: boolean; value: NoteSession }>();
  const draftRef = useRef<DraftState | null>(null);
  const versionRef = useRef(0);
  const snapshotRef = useRef('');
  const currentOpen = open?.owner === client ? open : undefined;
  const currentOpenRef = useRef(currentOpen);
  currentOpenRef.current = currentOpen;
  const currentPending = pending?.owner === client ? pending : undefined;
  const currentHeads = heads?.owner === client ? heads.rows : [];
  const currentSession = session?.owner === client && session.generation === currentOpen?.generation && session.documentId === currentOpen?.documentId &&
    session.editable === (role !== 'viewer') ? session.value : undefined;
  const currentProblem = problem?.owner === client ? problem : undefined;
  const currentDraft = draftState?.owner === pendingStore && draftState.generation === currentOpen?.generation ? draftState : undefined;
  const recoveryRecords = recoveryState?.owner === pendingStore ? recoveryState.records : [];
  const currentProtection = protection?.owner === client && protection.generation === currentOpen?.generation ? protection : undefined;
  const canEdit = role !== 'viewer';
  const isDirty = !!currentOpen && currentOpen.version !== currentOpen.confirmedVersion;

  const access = useRef({ client, session: currentSession, open: currentOpen, canEdit, busy, denied: currentProblem?.kind === 'denied' });
  access.current = { client, session: currentSession, open: currentOpen, canEdit, busy, denied: currentProblem?.kind === 'denied' };
  useEffect(() => {
    const find = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f' || event.target !== document.body) return;
      const current = access.current;
      if (activeClient.current !== client || current.client !== client || !current.session || !current.open || current.denied) return;
      const anchor = document.getSelection()?.anchorNode;
      const content = workspace.current?.querySelector('[data-note-editor]');
      if (!anchor || !content?.contains(anchor)) return;
      event.preventDefault();
      setNavigationRequest(previous => ({ mode: 'find', id: (previous?.id ?? 0) + 1, generation: current.open!.generation }));
    };
    document.addEventListener('keydown', find);
    return () => document.removeEventListener('keydown', find);
  }, [client]);
  const savingRequest = useRef<{ client: object; session: NoteSession | undefined; request: symbol } | undefined>(undefined);
  const snapshotDeliveries = useRef(new Set<() => Promise<boolean>>());
  const registerBeforeSnapshot = useCallback((flush: () => Promise<boolean>) => {
    snapshotDeliveries.current.add(flush);
    return () => { snapshotDeliveries.current.delete(flush); };
  }, []);
  const flushSnapshot = async (requireWrite = false) => {
    const captured = access.current;
    const current = () => activeClient.current === captured.client && access.current.client === captured.client &&
      access.current.session === captured.session && access.current.open?.generation === captured.open?.generation &&
      !access.current.denied && (!requireWrite || (access.current.canEdit && !access.current.busy));
    if (!current()) return false;
    for (const flush of [...snapshotDeliveries.current].reverse()) {
      if (!current() || !await flush()) return false;
    }
    return current();
  };
  const draftSnapshot = async () => {
    if (!currentOpen || !await flushSnapshot()) return null;
    currentSession?.flush();
    const tree = currentSession && noteTreeOf({ getNode: id => currentSession.editor.dataStore.getNode(id) as never }, currentSession.rootId);
    return serializeNoteFile(tree ? { ...currentOpen.note, content: tree.content as unknown[] } : currentOpen.note);
  };

  const persistDraft = useCallback((snapshotText: string, base: PendingNoteBase, documentRef: string, generation: string) => {
    const existing = draftRef.current?.owner === pendingStore && draftRef.current.generation === generation
      ? draftRef.current.record : undefined;
    const reuse = existing && existing.status !== 'confirmed' &&
      (!existing.attempt || existing.attempt.snapshotText === snapshotText);
    const record = pendingStore.write({
      draftId: reuse ? existing.draftId : newPendingNoteDraftId(),
      documentRef, base, status: reuse && existing.status === 'pending' ? 'pending' : 'draft', snapshotText,
      ...(reuse && existing.source ? { source: existing.source } : {}),
      ...(reuse && existing.status === 'pending' && existing.attempt ? { attempt: existing.attempt } : {})
    });
    const next = { owner: pendingStore, generation, record };
    draftRef.current = next;
    setDraftState(next);
    snapshotRef.current = snapshotText;
    const version = versionRef.current;
    setProtection({ owner: client, generation, version, protected: true });
    setRecoveryState(previous => previous?.owner === pendingStore
      ? { owner: pendingStore, records: previous.records.filter(item => item.draftId !== record.draftId).concat(record) } : previous);
    return record;
  }, [pendingStore, client]);

  const recordProtectionFailure = useCallback((generation: string, version: number) => {
    setProtection({ owner: client, generation, version, protected: false,
      error: '현재 입력을 복구용 저장소에 보관하지 못했습니다. 입력은 이 화면에만 있으므로 화면을 나갈 수 없습니다.' });
  }, [client]);

  useEffect(() => {
    const protectedCurrent = !!currentOpen && currentProtection?.version === currentOpen.version && currentProtection.protected;
    onUnsafeChange?.(!!currentOpen && (isDirty || !!currentPending || busy) && !protectedCurrent);
  }, [currentOpen, currentProtection, isDirty, currentPending, busy, onUnsafeChange]);

  const showOpened = useCallback((result: OpenServerNote & { mode: 'snapshot' }) => {
    if (activeClient.current !== client) return;
    const generation = crypto.randomUUID();
    draftRef.current = null;
    versionRef.current = 0;
    snapshotRef.current = serializeNoteFile(result.note);
    setDraftState(undefined);
    setPending(undefined);
    setProtection({ owner: client, generation, version: 0, protected: true });
    setOpen({ owner: client, generation, documentId: result.document.documentId, head: result.document,
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
      try {
        setRecoveryState({ owner: pendingStore, records: pendingStore.list() });
        setRecoveryError(undefined);
      } catch {
        setRecoveryError({ owner: pendingStore, message: '저장된 초안 목록을 확인하지 못했습니다. 브라우저 저장소를 확인한 뒤 목록을 다시 여세요.' });
      }
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
  }, [client, initialDocumentId, pendingStore, showOpened]);

  useEffect(() => { void load(); return () => { if (activeClient.current === client) activeClient.current = {} as typeof client; }; }, [client, load]);

  useEffect(() => {
    if (!currentOpen || currentProblem?.kind === 'denied') { setSession(undefined); return; }
    const documentId = currentOpen.documentId;
    let alive = true;
    const persistBlocks = (blocks: unknown[]) => {
      if (!alive || activeClient.current !== client) return;
      const latest = currentOpenRef.current;
      if (!latest || latest.generation !== currentOpen.generation) return;
      if (JSON.stringify(latest.note.content) === JSON.stringify(blocks)) return;
      const nextNote = { ...latest.note, content: blocks } as NoteDocument;
      const snapshotText = serializeNoteFile(nextNote);
      if (snapshotText === snapshotRef.current) return;
      const version = versionRef.current + 1;
      versionRef.current = version;
      try {
        const base: PendingNoteBase = latest.documentId
          ? { operation: 'update', documentId: latest.documentId, expectedRevision: latest.revision! }
          : { operation: 'create', workspaceId };
        persistDraft(snapshotText, base, String(nextNote.attributes.pageId), currentOpen.generation);
      } catch {
        recordProtectionFailure(currentOpen.generation, version);
      }
      snapshotRef.current = snapshotText;
      setOpen(previous => previous?.owner === client && previous.documentId === documentId
        ? { ...previous, note: nextNote, version } : previous);
    };
    const one = openNoteTree(currentOpen.note, { onChange: blocks => {
      persistBlocks(blocks);
    }, after: 150 });
    if (!canEdit) one.editor.setEditable(false);
    const changed = () => {
      if (!alive || activeClient.current !== client) return;
      const tree = noteTreeOf({ getNode: id => one.editor.dataStore.getNode(id) as never }, one.rootId);
      if (!tree) return;
      persistBlocks(tree.content as unknown[]);
    };
    one.editor.on('editor:content.change' as never, changed);
    setSession({ owner: client, generation: currentOpen.generation, documentId, editable: canEdit, value: one });
    return () => { alive = false; one.editor.off('editor:content.change' as never, changed); one.close(); };
  // Recreate the editor only when the opened document changes, not after each keystroke.
  }, [client, currentOpen?.generation, currentOpen?.documentId, canEdit, currentProblem?.kind === 'denied',
    persistDraft, recordProtectionFailure, workspaceId]);



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
    const generation = crypto.randomUUID();
    versionRef.current = 1;
    const snapshotText = serializeNoteFile(note);
    snapshotRef.current = snapshotText;
    setOpen({ owner: client, generation, documentId: null, head: null, note, revision: null, version: 1, confirmedVersion: 0 });
    try {
      persistDraft(snapshotText, { operation: 'create', workspaceId }, String(note.attributes.pageId), generation);
    } catch { recordProtectionFailure(generation, 1); }
    setProblem(undefined);
  };

  const prepareLocalCopy = async (source: { name: string; snapshotText: string }) => {
    if (!canEdit || busy || isDirty || currentPending || currentProblem?.kind === 'denied') return;
    const read = readNoteSnapshotFile(source.snapshotText);
    if ('error' in read) return;
    setBusy(true);
    try {
      await client.list();
      if (activeClient.current !== client) return;
      const draftId = newPendingNoteDraftId();
      const attempt = noteSaveAttempt({ operation: 'create', workspaceId,
        title: read.document.attributes.title, snapshotText: source.snapshotText, idempotencyKey: draftId });
      const record = pendingStore.write({ draftId, documentRef: read.document.attributes.pageId ?? source.name,
        base: { operation: 'create', workspaceId }, status: 'pending', snapshotText: source.snapshotText,
        attempt, source: { kind: 'indexeddb-note', name: source.name } });
      const generation = crypto.randomUUID();
      const nextDraft = { owner: pendingStore, generation, record };
      draftRef.current = nextDraft;
      versionRef.current = 1;
      snapshotRef.current = source.snapshotText;
      setDraftState(nextDraft);
      setRecoveryState(previous => ({ owner: pendingStore,
        records: [...(previous?.owner === pendingStore ? previous.records : []), record] }));
      setPending({ owner: client, attempt, version: 1 });
      setOpen({ owner: client, generation, documentId: null, head: null, note: read.document,
        revision: null, version: 1, confirmedVersion: 0 });
      setProtection({ owner: client, generation, version: 1, protected: true });
      setProblem(undefined);
    } catch (error) {
      if (activeClient.current !== client) return;
      const denied = error instanceof ServerNoteError && [401, 403, 404].includes(error.status ?? 0);
      setProblem({ owner: client, kind: denied ? 'denied' : 'save',
        message: '서버 사본 요청을 준비하지 못했습니다. 서버에 보내지 않았으며 로컬 원본은 그대로 있습니다.' });
    } finally { if (activeClient.current === client) setBusy(false); }
  };

  const recoverRecord = async (record: PendingNoteRecord) => {
    if (busy || !canEdit || currentProblem?.kind === 'denied') return;
    if (isDirty && (!currentProtection?.protected || currentProtection.version !== currentOpen?.version)) {
      if (currentOpen) recordProtectionFailure(currentOpen.generation, currentOpen.version);
      return;
    }
    setBusy(true);
    try {
      if (record.base.operation === 'update') {
        const verified = await client.open(record.base.documentId);
        if (activeClient.current !== client) return;
        if (verified.mode !== 'snapshot') {
          setProblem({ owner: client, kind: 'mode', message: '이 문서는 공동 편집 모드입니다. 저장된 스냅샷 초안을 편집에 연결하지 않았습니다.' });
          return;
        }
      } else {
        await client.list();
        if (activeClient.current !== client) return;
      }
    } catch (error) {
      if (activeClient.current !== client) return;
      const denied = error instanceof ServerNoteError && [401, 403, 404].includes(error.status ?? 0);
      setProblem({ owner: client, kind: denied ? 'denied' : 'load',
        message: '현재 계정의 초안 접근 권한을 확인하지 못했습니다. 복구 레코드는 그대로 보존합니다.' });
      return;
    } finally { if (activeClient.current === client) setBusy(false); }
    const opened = readNoteSnapshotFile(record.snapshotText);
    if ('error' in opened) {
      setProblem({ owner: client, kind: 'load', message: '저장된 초안을 읽지 못했습니다. 원본 레코드는 그대로 보존합니다.' });
      return;
    }
    const generation = crypto.randomUUID();
    const documentId = record.base.operation === 'update' ? record.base.documentId : null;
    versionRef.current = 1;
    snapshotRef.current = record.snapshotText;
    const nextDraft = { owner: pendingStore, generation, record };
    // Editing a recovered unsent source starts an independent history; retrying its attempt keeps the source identity.
    draftRef.current = record.status === 'draft' ? null : nextDraft;
    setDraftState(nextDraft);
    setPending(record.status === 'pending' && record.attempt
      ? { owner: client, attempt: record.attempt, version: 1 } : undefined);
    setOpen({ owner: client, generation, documentId, head: currentHeads.find(row => row.documentId === documentId) ?? null,
      note: opened.document, revision: record.base.operation === 'update' ? record.base.expectedRevision : null,
      version: 1, confirmedVersion: 0 });
    setProtection({ owner: client, generation, version: 1, protected: true });
    setProblem(undefined);
    if (documentId) navigate.current?.(documentId);
  };

  const save = async () => {
    if (!canEdit || !currentOpen || busy || (savingRequest.current?.client === client && savingRequest.current.session === currentSession) || currentProblem?.kind === 'denied' || currentProblem?.kind === 'conflict') return;
    const request = { client, session: currentSession, generation: currentOpen.generation, request: Symbol('note-save') };
    const ownsRequest = () => activeClient.current === client && access.current.client === client &&
      access.current.session === request.session && access.current.open?.generation === request.generation &&
      access.current.canEdit && !access.current.denied;
    savingRequest.current = request;
    try {
    const reusableDraft = currentDraft?.record.status !== 'confirmed' ? currentDraft : undefined;
    const knownAttempt = currentPending?.attempt ?? (reusableDraft?.record.status === 'pending' ? reusableDraft.record.attempt : undefined);
    if (!knownAttempt && !await flushSnapshot(true)) { setProblem({ owner: client, kind: 'save', message: '마지막 입력을 마친 뒤 저장을 다시 시도하세요.' }); return; }
    if (access.current.client !== client || access.current.session !== request.session || access.current.open?.generation !== currentOpen.generation || !access.current.canEdit || access.current.busy || access.current.denied) return;
    if (!knownAttempt) currentSession?.flush();
    const tree = currentSession && noteTreeOf({ getNode: id => currentSession.editor.dataStore.getNode(id) as never }, currentSession.rootId);
    const draftNote = tree ? { ...currentOpen.note, content: tree.content as unknown[] } : currentOpen.note;
    const fixed = { owner: client, version: knownAttempt ? (currentPending?.version ?? currentOpen.version) : versionRef.current, attempt: knownAttempt ?? noteSaveAttempt(currentOpen.documentId === null
      ? { operation: 'create', workspaceId, title: draftNote.attributes.title,
        snapshotText: serializeNoteFile(draftNote), idempotencyKey: reusableDraft?.record.draftId ?? crypto.randomUUID() }
      : { operation: 'update', documentId: currentOpen.documentId,
        expectedRevision: currentOpen.revision!, snapshotText: serializeNoteFile(draftNote),
        idempotencyKey: reusableDraft?.record.draftId ?? crypto.randomUUID() }) };
    const fixedRead = readNoteSnapshotFile(fixed.attempt.snapshotText);
    if ('error' in fixedRead) throw new Error('invalid_fixed_snapshot');
    const draftId = reusableDraft?.record.draftId ?? newPendingNoteDraftId();
    const documentRef = reusableDraft?.record.scope.documentRef ?? String(draftNote.attributes.pageId);
    const base: PendingNoteBase = fixed.attempt.operation === 'create'
      ? { operation: 'create', workspaceId: fixed.attempt.workspaceId }
      : { operation: 'update', documentId: fixed.attempt.documentId, expectedRevision: fixed.attempt.expectedRevision };
    try {
      const record = pendingStore.write({ draftId, documentRef, base, status: 'pending',
        snapshotText: fixed.attempt.snapshotText, attempt: fixed.attempt,
        ...(reusableDraft?.record.source ? { source: reusableDraft.record.source } : {}) });
      const nextDraft = { owner: pendingStore, generation: currentOpen.generation, record };
      draftRef.current = nextDraft;
      setDraftState(nextDraft);
      setProtection({ owner: client, generation: currentOpen.generation, version: currentOpen.version, protected: true });
      setRecoveryState(previous => previous?.owner === pendingStore
        ? { owner: pendingStore, records: previous.records.filter(item => item.draftId !== record.draftId).concat(record) } : previous);
    } catch {
      recordProtectionFailure(currentOpen.generation, currentOpen.version);
      setProblem({ owner: client, kind: 'save', message: '현재 저장 요청을 복구용 저장소에 기록하지 못했습니다. 서버에 보내지 않았습니다. 저장소 공간을 확보한 뒤 다시 시도하세요.' });
      return;
    }
    setPending(fixed);
    setBusy(true);
    setProblem(undefined);
    try {
      let receipt;
      if (knownAttempt) {
        try { receipt = await client.receipt(fixed.attempt.operation, fixed.attempt.idempotencyKey); }
        catch (error) {
          if (!(error instanceof ServerNoteError) || error.status !== 404) throw error;
          receipt = await client.save(fixed.attempt);
        }
      } else receipt = await client.save(fixed.attempt);
      const confirmed = await client.confirm(fixed.attempt, receipt);
      if (activeClient.current !== client) return;
      try {
        const record = pendingStore.write({ draftId, documentRef, base, status: 'confirmed',
          snapshotText: fixed.attempt.snapshotText, attempt: fixed.attempt,
          ...(reusableDraft?.record.source ? { source: reusableDraft.record.source,
            confirmedCopy: { documentId: confirmed.document.documentId, pageId: confirmed.document.pageId,
              revision: confirmed.document.revision, snapshotHash: confirmed.document.snapshotHash } } : {}) });
        if (ownsRequest()) {
          const nextDraft = { owner: pendingStore, generation: request.generation, record };
          draftRef.current = nextDraft;
          setDraftState(nextDraft);
          setRecoveryState(previous => previous?.owner === pendingStore
            ? { owner: pendingStore, records: previous.records.filter(item => item.draftId !== record.draftId).concat(record) } : previous);
        }
      } catch { /* The verified receipt can be checked again from the durable pending record. */ }
      if (!ownsRequest()) return;
      const latest = currentOpenRef.current;
      if (latest && latest.note.attributes.title === fixedRead.document.attributes.title &&
        JSON.stringify(latest.note.content) === JSON.stringify(fixedRead.document.content)) {
        snapshotRef.current = serializeNoteFile(confirmed.note);
      }
      setHeads(previous => previous?.owner === client
        ? { owner: client, rows: [confirmed.document, ...previous.rows.filter(row => row.documentId !== confirmed.document.documentId)] }
        : previous);
      setOpen(previous => previous?.owner === client && previous.generation === request.generation &&
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
      if (!ownsRequest()) return;
      const next = saveProblem(error);
      setProblem({ owner: client, ...next });
      if (next.kind === 'conflict' || next.kind === 'denied') setPending(undefined);
    } finally { if (activeClient.current === client && access.current.open?.generation === request.generation && savingRequest.current === request) setBusy(false); }
    } finally { if (savingRequest.current === request) savingRequest.current = undefined; }
  };

  const copyConflictedDraft = async () => {
    if (currentProblem?.kind !== 'conflict' || !currentOpen) return;
    const snapshotText = await draftSnapshot();
    if (!snapshotText) return;
    try {
      await navigator.clipboard.writeText(snapshotText);
      if (activeClient.current !== client || access.current.session !== currentSession || access.current.open?.generation !== currentOpen.generation) return;
      setConflictCopy({ generation: currentOpen.generation, snapshotText });
    } catch {
      if (activeClient.current !== client || access.current.session !== currentSession || access.current.open?.generation !== currentOpen.generation) return;
      setConflictCopy(undefined);
      setProblem({ owner: client, kind: 'conflict', message: '초안을 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인하세요.' });
    }
  };

  const openLatestAfterConflict = async () => {
    if (currentProblem?.kind !== 'conflict' || !currentOpen?.documentId || busy ||
      conflictCopy?.generation !== currentOpen.generation) return;
    const copied = readNoteSnapshotFile(conflictCopy.snapshotText);
    const currentText = await draftSnapshot();
    const current = currentText ? readNoteSnapshotFile(currentText) : null;
    if ('error' in copied || !current || 'error' in current ||
      JSON.stringify(copied.document) !== JSON.stringify(current.document)) {
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

  const status = currentProblem?.kind === 'denied' ? '접근 거부' : currentProtection?.error ? '복구 저장 실패' : busy ? '저장 중…' :
    currentPending ? '저장 확인 필요' : isDirty ? '저장되지 않음' : currentOpen ? '서버 저장 확인됨' : '문서 선택';
  const availableRecovery = currentProblem?.kind === 'denied' ? [] : recoveryRecords.filter(record => record.status !== 'confirmed' &&
    record.draftId !== currentDraft?.record.draftId && (record.base.operation === 'create' ||
      currentHeads.some(head => record.base.operation === 'update' && head.documentId === record.base.documentId && head.mode === 'snapshot')));
  return <div ref={workspace} className="nw-shell" data-server-note-workspace onKeyDown={event => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f' || !currentSession || !currentOpen || currentProblem?.kind === 'denied') return;
    if (!(event.target instanceof Element) || event.target.closest('[data-note-editor], [data-document-navigation], [role="dialog"]')) return;
    event.preventDefault();
    setNavigationRequest(previous => ({ mode: 'find', id: (previous?.id ?? 0) + 1, generation: currentOpen.generation }));
  }}>
    <EditorHeader product="Note" className="nw-header" title={currentOpen?.note.attributes.title || '서버 노트'} menus={null}
      actions={<><StatusIndicator data-save-status busy={busy} tone={currentProblem ? 'danger' : isDirty || currentPending ? 'warning' : 'success'}>{status}</StatusIndicator>
        {canEdit && <Button disabled={!currentOpen || busy || currentProblem?.kind === 'denied' || currentProblem?.kind === 'conflict' || (!isDirty && !currentPending)}
          onClick={() => void save()}>{currentPending ? '저장 확인·재시도' : '저장'}</Button>}
        {onLeave && <Button tone="quiet" disabled={busy || isDirty || !!currentPending} onClick={onLeave}>나가기</Button>}</>} />
    <div className="nw-workspace">
      <aside className="nw-sidebar" aria-label="서버 노트 목록">
        {canEdit && <Button disabled={loading || busy || isDirty || !!currentPending || currentProblem?.kind === 'denied'} onClick={create}>새 노트</Button>}
        {canEdit && <ServerLocalNoteCopy key={`${issuer}\0${subject}\0${tenantId}\0${workspaceId}`}
          disabled={loading || busy || isDirty || !!currentPending || currentProblem?.kind === 'denied'}
          onSelect={source => { void prepareLocalCopy(source); }} />}
        {recoveryRecords.filter(record => record.source && record.status === 'confirmed').map(record =>
          <p key={record.draftId} data-confirmed-local-copy>로컬 노트 {record.source!.name}의 서버 사본을 확인했습니다.
            원본은 이 기기의 Note 저장소에, 확인된 요청은 이 브라우저의 복구 저장소에 남아 있습니다.
            서버 문서: {record.confirmedCopy?.documentId ?? '저장 요청으로 다시 확인 가능'}.</p>)}
        {!!availableRecovery.length && <section aria-label="저장된 초안 복구">
          <h2>저장된 초안</h2>
          <p>초안은 계정과 자료함에 연결해 이 브라우저에 보관했습니다. 복구할 항목을 직접 선택하세요.</p>
          {availableRecovery.map(record => {
            const parsed = readNoteSnapshotFile(record.snapshotText);
            const title = 'error' in parsed ? '읽을 수 없는 초안' : parsed.document.attributes.title;
            return <div key={record.draftId}>
              <p>{title} · 초안 {record.draftId.slice(0, 8)} · {record.status === 'pending' ? '서버 확인 필요' : '저장 전 초안'} · {new Date(record.savedAt).toLocaleString()}</p>
              <Button aria-label={`초안 복구 ${title} ${record.draftId.slice(0, 8)}`} disabled={busy || !canEdit}
                onClick={() => void recoverRecord(record)}>이 초안 복구</Button>
            </div>;
          })}
        </section>}
        <Button tone="quiet" disabled={busy || isDirty || !!currentPending} onClick={() => void load()}>목록 새로고침</Button>
        <nav aria-label="서버 문서 목록">{currentHeads.map(row =>
          <button type="button" key={row.documentId} aria-current={currentOpen?.documentId === row.documentId ? 'page' : undefined}
            disabled={busy || isDirty || !!currentPending || currentProblem?.kind === 'denied'}
            onClick={() => void openDocument(row.documentId)}>{row.title}</button>)}</nav>
        {!loading && !currentHeads.length && <p>문서가 없습니다.</p>}
      </aside>
      <main className="nw-main" aria-label="서버 노트 편집">
        {recoveryError?.owner === pendingStore && <StatusNotice tone="danger" title="초안 목록을 확인하지 못했습니다">{recoveryError.message}</StatusNotice>}
        {currentProtection?.error && <StatusNotice tone="danger" title="현재 입력을 보관하지 못했습니다">{currentProtection.error}</StatusNotice>}
        {currentDraft?.record.source && <StatusNotice tone="warning" title={currentDraft.record.status === 'confirmed' ? '서버 사본 확인됨' : '로컬 노트 사본 확인 필요'}>
          로컬 원본 {currentDraft.record.source.name}은 이 기기의 Note 저장소에 유지합니다.
          {currentDraft.record.status !== 'confirmed' && ' 저장 확인·재시도를 눌러 서버 사본을 만드세요. 서버 응답과 재조회를 확인하기 전에는 완료가 아닙니다.'}
          다른 페이지의 참조는 자동으로 바꾸지 않습니다.
        </StatusNotice>}
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
          {currentSession && <NoteEditor key={currentSession.session} registerBeforeSnapshot={registerBeforeSnapshot} navigationRequest={navigationRequest?.generation === currentOpen.generation ? navigationRequest : undefined} writeAllowed={canEdit && !busy && !currentPending && !(currentDraft?.record.source && currentDraft.record.status !== 'confirmed')} editor={currentSession.editor} rootId={currentSession.rootId} />}
        </section>}
        {!currentOpen && !loading && !currentProblem && <p>노트를 선택하거나 새로 만드세요.</p>}
      </main>
    </div>
  </div>;
}
