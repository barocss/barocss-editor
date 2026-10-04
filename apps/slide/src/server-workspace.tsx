import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createStarterDeck, deckFileName, deckTitle } from '@barocss/office-slides';
import { slideDocuments } from '../../../packages/office-slides/src/deck-autosave';
import { Button, useOfficeLocale } from '@barocss/office-ui';
import { captureProductNavigation, productDocumentHost, registerProductDocumentHost, isNativeHostSlotActive, type NativeHostSlot, type ProductDocumentHost, type ProductNavigationGuard } from '@barocss/shared';
import { App } from './app';
import './style.css';
import { assertSlidesNativeDocument, mountSlidesRuntime, type SlidesRuntime } from './runtime';
import { readServerSlidesFile, serverSlidesFileText, stableSlidesSnapshotText, type SlidesDocument } from './server-file';
import { createServerSlidesClient, ServerSlidesError, slidesSaveAttempt, type ServerSlidesHead, type SlidesSaveAttempt } from './server-documents';
import { createServerPendingStore, newPendingSlidesDraftId, type PendingSlidesBase, type PendingSlidesRecord } from './server-pending';

export interface ServerSlidesWorkspaceProps {
  tenantId: string; workspaceId: string; issuer: string; subject: string;
  initialDocumentId?: string; authorizedFetch: typeof fetch;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  onNavigate?: (documentId: string) => void;
  onUnsafeChange?: (unsafe: boolean) => void;
  headerNavigation?: ReactNode;
  hostSlot?: NativeHostSlot;
  onNativeFailure?: (message: string) => void;
}
type Open = { owner: object; generation: string; documentRef: string; documentId: string | null;
  head: ServerSlidesHead | null; initial: SlidesDocument; text: string; confirmed: string | null };
type Problem = { kind: 'load' | 'save' | 'conflict' | 'denied' | 'mode'; message: string };
type Fixed = { attempt: Readonly<SlidesSaveAttempt>; record: PendingSlidesRecord };
function failure(error: unknown): Problem {
  if (error instanceof ServerSlidesError && [401, 403, 404].includes(error.status ?? 0)) return { kind: 'denied', message: '현재 계정의 문서 접근 권한을 확인하지 못했습니다.' };
  if (error instanceof ServerSlidesError && error.status === 409) return { kind: 'conflict', message: '서버의 최신본이 변경되었습니다. 초안과 고정된 요청을 유지합니다.' };
  return { kind: 'save', message: '연결 또는 저장을 확인하지 못했습니다. 같은 요청으로 확인하거나 다시 시도하세요.' };
}
function documentOf(text: string) {
  const read = readServerSlidesFile(text);
  if ('error' in read) throw new Error('지원하지 않는 Slides 파일입니다. 현재 문서와 원본은 그대로 유지합니다.');
  assertSlidesNativeDocument(read.document);
  return read.document;
}

/** Full native Slides runtime, with authenticated snapshot authority and scoped recovery. */
export function ServerSlidesWorkspace({ tenantId, workspaceId, issuer, subject, initialDocumentId,
  authorizedFetch, role, onNavigate, onUnsafeChange, headerNavigation, hostSlot, onNativeFailure }: ServerSlidesWorkspaceProps) {
  const client = useMemo(() => createServerSlidesClient({ tenantId, workspaceId, authorizedFetch }), [tenantId, workspaceId, authorizedFetch, issuer, subject]);
  const store = useMemo(() => createServerPendingStore({ tenantId, workspaceId, issuer, subject }), [tenantId, workspaceId, issuer, subject]);
  const active = useRef(client); active.current = client;
  const { t } = useOfficeLocale();
  const callbacks = useRef({ onNavigate, onUnsafeChange }); callbacks.current = { onNavigate, onUnsafeChange };
  const [opened, setOpened] = useState<Open>();
  const current = opened?.owner === client ? opened : undefined;
  const currentRef = useRef(current); currentRef.current = current;
  const runtime = useRef<{ owner: object; generation: string; value: SlidesRuntime; off: () => void } | undefined>(undefined);
  const inputDelivery = useRef<{ value: SlidesRuntime; deliver: (isCurrent: () => boolean) => Promise<boolean> } | undefined>(undefined);
  const [readyGeneration, setReadyGeneration] = useState('');
  const nativeHost = useRef<ProductDocumentHost | undefined>(undefined);
  const nativeEpoch = useRef(0);
  const roleOwner = useRef({ role, epoch: 0 });
  if (roleOwner.current.role !== role) roleOwner.current = { role, epoch: roleOwner.current.epoch + 1 };
  const opening = useRef<{ owner: object; generation: string; role: object; documentId: string; parentCurrent: () => boolean;
    resolve: (guard: ProductNavigationGuard | false) => void } | undefined>(undefined);
  const openPending = useRef<{ isCurrent: () => boolean } | undefined>(undefined);
  const transition = useRef<{ owns: () => boolean } | undefined>(undefined);
  const requestOpen = useRef<(id: string, isCurrent?: () => boolean, parentCurrent?: () => boolean) => Promise<ProductNavigationGuard | false>>(async () => false);
  const beforeNavigate = useRef<(isCurrent?: () => boolean) => Promise<boolean>>(async () => false);
  const savePending = useRef<Promise<void> | undefined>(undefined);
  const draft = useRef<PendingSlidesRecord | undefined>(undefined);
  const fixed = useRef<Fixed | undefined>(undefined);
  const [records, setRecords] = useState<PendingSlidesRecord[]>([]);
  const [heads, setHeads] = useState<ServerSlidesHead[]>([]);
  const [problem, setProblem] = useState<Problem>();
  const problemRef = useRef(problem); problemRef.current = problem;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const busyOwner = useRef<{ client: object; role: object; token: object } | undefined>(undefined);
  const startBusy = (token: object) => {
    busyOwner.current = { client, role: roleOwner.current, token };
    busyRef.current = true; setBusy(true);
  };
  const endBusy = (token: object) => {
    if (busyOwner.current?.token !== token) return;
    busyOwner.current = undefined; busyRef.current = false; setBusy(false);
  };
  useEffect(() => {
    const owner = busyOwner.current;
    if (owner && (owner.client !== client || owner.role !== roleOwner.current)) endBusy(owner.token);
    savePending.current = undefined;
  }, [client, role]);
  const [protectedInput, setProtectedInput] = useState(true);
  const protectedRef = useRef(true);
  const [nestedInput, setNestedInput] = useState(false);
  const nestedRef = useRef(false);
  const [, refresh] = useState(0);
  const [sources, setSources] = useState<{ name: string; title?: string }[]>();
  useEffect(() => {
    if (hostSlot && !isNativeHostSlotActive(hostSlot) && problem) onNativeFailure?.(problem.message);
  }, [hostSlot, problem, onNativeFailure]);
  const [sourceError, setSourceError] = useState('');
  const [copied, setCopied] = useState<string>();
  const shell = useRef<HTMLDivElement>(null);
  const canEdit = role !== 'viewer' && problem?.kind !== 'denied';
  const authority = useRef(canEdit); authority.current = canEdit;
  const dirty = !!current && (current.confirmed === null || stableSlidesSnapshotText(current.text) !== stableSlidesSnapshotText(current.confirmed));
  const signalProtection = useCallback((safe: boolean) => {
    protectedRef.current = safe; setProtectedInput(safe);
    callbacks.current.onUnsafeChange?.(!safe || nestedRef.current);
  }, []);
  const track = useCallback((record: PendingSlidesRecord) => {
    setRecords(previous => [record, ...previous.filter(item => item.draftId !== record.draftId)]);
  }, []);
  const baseOf = (one: Open): PendingSlidesBase => one.documentId
    ? { operation: 'update', documentId: one.documentId, expectedRevision: one.head!.revision }
    : { operation: 'create', workspaceId };
  const protect = useCallback((one: Open, text: string) => {
    const previous = draft.current;
    const reuse = previous?.status === 'draft' && previous.scope.documentRef === one.documentRef;
    const record = store.write({ draftId: reuse ? previous.draftId : newPendingSlidesDraftId(),
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
      const text = serverSlidesFileText(live.value.exportNativeDocument(), '');
      if (stableSlidesSnapshotText(text) === stableSlidesSnapshotText(one.text)) return one.text;
      const next = { ...one, text };
      currentRef.current = next; setOpened(next); setCopied(undefined);
      try { protect(next, text); } catch { signalProtection(false); }
      return text;
    } catch { signalProtection(false); return undefined; }
  }, [client, protect, signalProtection]);
  const replace = useCallback((one: Open, record?: PendingSlidesRecord) => {
    // Validate before changing the current model or its mounted lifetime.
    assertSlidesNativeDocument(one.initial);
    nativeEpoch.current++; inputDelivery.current = undefined; setReadyGeneration('');
    runtime.current?.off(); runtime.current = undefined;
    draft.current = record?.status === 'draft' ? undefined : record;
    fixed.current = record?.status === 'pending' && record.attempt ? { attempt: record.attempt, record } : undefined;
    currentRef.current = one; setOpened(one); setProblem(undefined); setCopied(undefined); signalProtection(true);
    refresh(value => value + 1);
  }, [signalProtection]);
  const beginTransition = (preservePending = false) => {
    if (busyRef.current || transition.current?.owns() || openPending.current?.isCurrent()) return;
    const one = currentRef.current, live = runtime.current, capturedRole = roleOwner.current, pending = fixed.current;
    const root = live?.value.editor.getRootId(), epoch = live?.value.editor.dataStore.getDocumentEpoch();
    let preparedText: string | undefined;
    const lease = { owns: () => active.current === client && transition.current === lease && roleOwner.current === capturedRole &&
      currentRef.current?.generation === one?.generation && runtime.current === live &&
      (!live || (live.value.editor.getRootId() === root && live.value.editor.dataStore.getDocumentEpoch() === epoch)) &&
      (!preparedText || (!nestedRef.current && protectedRef.current && (preservePending ? fixed.current === pending : !fixed.current) &&
        stableSlidesSnapshotText(serverSlidesFileText(live!.value.exportNativeDocument(), '')) === preparedText)),
      freeze: () => { if (live) preparedText = stableSlidesSnapshotText(serverSlidesFileText(live.value.exportNativeDocument(), '')); } };
    transition.current = lease; return lease;
  };
  const safeSwitch = async (owns: () => boolean = () => true) => !currentRef.current ? owns() : await beforeNavigate.current(owns);
  const openDocument = async (documentId: string) => {
    if (currentRef.current?.documentId === documentId) return;
    await requestOpen.current(documentId);
  };
  useEffect(() => {
    let alive = true; active.current = client; setLoading(true); setHeads([]); setRecords([]); setSources(undefined); setProblem(undefined);
    void (async () => {
      try {
        const loadHeads = async () => {
          try {
            const rows = await client.list();
            if (alive && active.current === client) setHeads(rows);
          } catch (error) {
            if (!initialDocumentId) throw error;
            if (alive && active.current === client) setSourceError(t('workspace.route.listUnavailable'));
          }
        };
        if (initialDocumentId) void loadHeads(); else await loadHeads();
        if (!alive || active.current !== client) return;
        try { setRecords(store.list()); } catch { setSourceError('복구 목록을 읽지 못했습니다. 원본 레코드는 유지됩니다.'); }
        if (initialDocumentId) {
          const result = await client.open(initialDocumentId);
          if (!alive || active.current !== client) return;
          if (result.mode !== 'snapshot') { setProblem({ kind: 'mode', message: '공동 편집 문서는 스냅샷 편집으로 열 수 없습니다.' }); return; }
          replace({ owner: client, generation: crypto.randomUUID(), documentRef: initialDocumentId, documentId: initialDocumentId,
            head: result.document, initial: documentOf(result.snapshotText), text: result.snapshotText, confirmed: result.snapshotText });
        }
      } catch (error) { if (alive && active.current === client) setProblem(error instanceof ServerSlidesError ? failure(error) : { kind: 'load', message: '문서 목록 또는 Slides 원문을 확인하지 못했습니다.' }); }
      finally { if (alive && active.current === client) setLoading(false); }
    })();
    return () => {
      alive = false;
      if (active.current === client) active.current = {} as typeof client;
      const owner = busyOwner.current;
      if (owner?.client === client) endBusy(owner.token);
      const live = runtime.current;
      if (live?.owner === client) { live?.off(); if (runtime.current === live) runtime.current = undefined; }
    };
    // A successful create changes the URL without reloading the same live runtime.
  }, [client, store, replace]);
  const mount = useCallback((host: HTMLElement) => {
    const one = currentRef.current!;
    // Current role updates the live editor without reloading its protected native draft.
    return mountSlidesRuntime(host, { initialDocument: one.initial, editable: authority.current });
  }, [client, current?.generation]);
  const onRuntime = useCallback((value: SlidesRuntime) => {
    const generation = currentRef.current!.generation;
    const changed = () => { if (active.current === client && runtime.current?.generation === generation) capture(); };
    value.editor.on('editor:content.change', changed);
    runtime.current = { owner: client, generation, value, off: () => value.editor.off('editor:content.change', changed) };
  }, [client, capture]);
  useEffect(() => {
    const editor = runtime.current?.value.editor;
    const editable = canEdit && !busy && !(draft.current?.source && draft.current.status !== 'confirmed');
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [canEdit, busy, current?.generation, records]);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const pending = !!shell.current?.querySelector('.w-math-draft');
      nestedRef.current = pending; setNestedInput(pending);
      callbacks.current.onUnsafeChange?.(pending || !protectedRef.current);
    });
    if (shell.current) observer.observe(shell.current, { childList: true, subtree: true });
    const unload = (event: BeforeUnloadEvent) => { if (hostSlot && !isNativeHostSlotActive(hostSlot)) return; capture(); if (!protectedRef.current || nestedRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const hide = () => { if (!hostSlot || isNativeHostSlotActive(hostSlot)) capture(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('pagehide', hide);
    return () => { observer.disconnect(); window.removeEventListener('beforeunload', unload); window.removeEventListener('pagehide', hide); };
  }, [capture]);
  const prepare = async (text: string, name?: string, sourceTitle?: string) => {
    if (!authority.current) return;
    const lease = beginTransition(); if (!lease) return;
    if (!await safeSwitch(lease.owns) || !lease.owns()) { if (transition.current === lease) transition.current = undefined; return; }
    let initial: SlidesDocument;
    try { lease.freeze(); initial = documentOf(text); } catch (error) { if (transition.current === lease) transition.current = undefined; setSourceError(error instanceof Error ? error.message : '파일을 읽지 못했습니다.'); return; }
    startBusy(lease);
    try {
      await client.list();
      if (!lease.owns() || !authority.current) return;
      const one: Open = { owner: client, generation: crypto.randomUUID(), documentRef: crypto.randomUUID(), documentId: null,
        head: null, initial, text, confirmed: null };
      const draftId = newPendingSlidesDraftId();
      const attempt = name ? slidesSaveAttempt({ operation: 'create', workspaceId, title: sourceTitle || name, snapshotText: text, idempotencyKey: draftId }) : undefined;
      const record = store.write({ draftId, documentRef: one.documentRef, base: { operation: 'create', workspaceId },
        status: attempt ? 'pending' : 'draft', snapshotText: text,
        ...(attempt ? { attempt, source: { kind: 'indexeddb-slides' as const, name: name! } } : {}) });
      replace(one, record); draft.current = record; track(record); setSourceError('');
    } catch (error) { if (active.current === client) setProblem(failure(error)); }
    finally { if (transition.current === lease) transition.current = undefined; endBusy(lease); }
  };
  const recover = async (record: PendingSlidesRecord) => {
    if (!authority.current) return;
    const lease = beginTransition(); if (!lease) return;
    if (!await safeSwitch(lease.owns) || !lease.owns()) { if (transition.current === lease) transition.current = undefined; return; }
    startBusy(lease);
    try {
      lease.freeze();
      let head: ServerSlidesHead | null = null;
      if (record.base.operation === 'update') {
        const verified = await client.open(record.base.documentId);
        if (verified.mode !== 'snapshot') throw new ServerSlidesError(409, 'snapshot_mode_required');
        head = { ...verified.document, revision: record.base.expectedRevision };
      } else await client.list();
      if (!lease.owns() || !authority.current) return;
      const initial = documentOf(record.snapshotText);
      replace({ owner: client, generation: crypto.randomUUID(), documentRef: record.scope.documentRef,
        documentId: record.base.operation === 'update' ? record.base.documentId : null, head,
        initial, text: record.snapshotText, confirmed: null }, record);
      track(record);
    } catch (error) { if (active.current === client) setProblem(error instanceof ServerSlidesError ? failure(error) : { kind: 'load', message: '이 초안을 열 수 없습니다. 원본은 유지됩니다.' }); }
    finally { if (transition.current === lease) transition.current = undefined; endBusy(lease); }
  };
  const saveCurrent = async () => {
    if (!authority.current || busyRef.current || nestedRef.current || problemRef.current?.kind === 'conflict') return;
    const source = currentRef.current, live = runtime.current, delivery = inputDelivery.current, capturedRole = roleOwner.current;
    const owns = () => active.current === client && currentRef.current?.generation === source?.generation && runtime.current === live &&
      inputDelivery.current === delivery && roleOwner.current === capturedRole && authority.current;
    if (!source || !live || !delivery || delivery.value !== live.value || !owns() || !await delivery.deliver(owns) || !owns()) {
      if (owns()) setProblem({ kind: 'save', message: '마지막 입력을 반영하지 못했습니다. 입력을 완료한 뒤 다시 저장하세요.' });
      return;
    }
    const text = capture(); const one = currentRef.current;
    if (!text || !one || !owns()) return;
    let pinned: Fixed;
    try {
      if (!protectedRef.current) protect(one, text);
      if (fixed.current) pinned = fixed.current;
      else {
        const record = draft.current?.status === 'draft' ? draft.current : protect(one, text);
        const attempt = slidesSaveAttempt(one.documentId
          ? { operation: 'update', documentId: one.documentId, expectedRevision: one.head!.revision, snapshotText: text, idempotencyKey: record.draftId }
          : { operation: 'create', workspaceId, title: deckTitle({ rootId: runtime.current!.value.editor.getRootId()!, getNode: id => runtime.current!.value.editor.dataStore.getNode(id) }) || '제목 없는 문서', snapshotText: text, idempotencyKey: record.draftId });
        const pending = store.write({ draftId: record.draftId, documentRef: one.documentRef, base: baseOf(one), status: 'pending', snapshotText: text, attempt });
        pinned = { attempt, record: pending }; fixed.current = pinned; draft.current = pending; track(pending);
      }
    } catch { signalProtection(false); setProblem({ kind: 'save', message: '복구 저장소에 기록하지 못했습니다. 서버에 보내지 않았습니다.' }); return; }
    const busyToken = {}; startBusy(busyToken); setProblem(undefined);
    try {
      // Recheck authority before receipt lookup or retry, including new-document requests.
      await client.list();
      if (!owns()) return;
      let receipt;
      try { receipt = await client.receipt(pinned.attempt.operation, pinned.attempt.idempotencyKey); }
      catch (error) { if (!(error instanceof ServerSlidesError) || error.status !== 404) throw error; if (!owns()) return; receipt = await client.save(pinned.attempt); }
      if (!owns()) return;
      const confirmed = await client.confirm(pinned.attempt, receipt);
      if (!owns() || currentRef.current?.generation !== one.generation) return;
      try {
        const record = store.write({ draftId: pinned.record.draftId, documentRef: pinned.record.scope.documentRef,
          base: pinned.record.base, status: 'confirmed', snapshotText: pinned.attempt.snapshotText, attempt: pinned.attempt,
          ...(pinned.record.source ? { source: pinned.record.source, confirmedCopy: { documentId: confirmed.document.documentId,
            revision: confirmed.document.revision, snapshotHash: confirmed.document.snapshotHash } } : {}) });
        track(record); if (draft.current?.draftId === record.draftId) draft.current = record;
      } catch { /* Durable pending receipt remains available for independent confirmation. */ }
      const latest = currentRef.current!;
      const next = { ...latest, documentRef: confirmed.document.documentId, documentId: confirmed.document.documentId, head: confirmed.document, confirmed: confirmed.snapshotText };
      currentRef.current = next; setOpened(next); fixed.current = undefined;
      if (stableSlidesSnapshotText(next.text) !== stableSlidesSnapshotText(next.confirmed)) {
        try { protect(next, next.text); } catch { signalProtection(false); }
      }
      setHeads(previous => [confirmed.document, ...previous.filter(item => item.documentId !== confirmed.document.documentId)]);
      callbacks.current.onNavigate?.(confirmed.document.documentId); refresh(value => value + 1);
    } catch (error) { if (active.current === client) setProblem(failure(error)); }
    finally { endBusy(busyToken); }
  };
  const save = () => {
    if (savePending.current) return savePending.current;
    const pending = saveCurrent().finally(() => { if (savePending.current === pending) savePending.current = undefined; });
    savePending.current = pending; return pending;
  };
  beforeNavigate.current = async (intentCurrent = () => true) => {
    const one = currentRef.current, live = runtime.current, delivery = inputDelivery.current, capturedRole = roleOwner.current;
    if (!one?.documentId || !live || !delivery || delivery.value !== live.value || live.generation !== one.generation || !protectedRef.current || nestedRef.current) return false;
    const root = live.value.editor.getRootId(), epoch = live.value.editor.dataStore.getDocumentEpoch();
    const owns = () => intentCurrent() && active.current === client && currentRef.current?.generation === one.generation &&
      currentRef.current.documentId === one.documentId && runtime.current === live && inputDelivery.current === delivery &&
      roleOwner.current === capturedRole && live.value.editor.getRootId() === root && live.value.editor.dataStore.getDocumentEpoch() === epoch;
    try {
      if (!owns() || !await delivery.deliver(owns) || !owns()) return false;
      if (savePending.current) await savePending.current;
      if (!owns() || busyRef.current || problemRef.current?.kind === 'conflict' || problemRef.current?.kind === 'denied') return false;
      const text = capture(), latest = currentRef.current;
      if (!text || !latest || !protectedRef.current) return false;
      if (fixed.current || latest.confirmed === null || stableSlidesSnapshotText(text) !== stableSlidesSnapshotText(latest.confirmed)) {
        if (!authority.current) return false;
        await save(); if (!owns()) return false;
      }
      if (!await delivery.deliver(owns) || !owns() || busyRef.current || nestedRef.current || !protectedRef.current || fixed.current || problemRef.current) return false;
      const confirmed = currentRef.current!.confirmed;
      return confirmed !== null && stableSlidesSnapshotText(serverSlidesFileText(live.value.exportNativeDocument(), '')) === stableSlidesSnapshotText(confirmed);
    } catch { return false; }
  };
  const beforeAccountExit = useRef<(isCurrent?: () => boolean) => Promise<boolean>>(async () => false);
  beforeAccountExit.current = async (intentCurrent = () => true) => {
    const one = currentRef.current, live = runtime.current, registered = nativeHost.current;
    const delivery = inputDelivery.current, capturedRole = roleOwner.current;
    const sourceEpoch = nativeEpoch.current;
    const inFlight = savePending.current, retainedFixed = fixed.current;
    if (!one || one.owner !== client || !live || !registered || live.generation !== one.generation ||
      nestedRef.current || !protectedRef.current || problemRef.current?.kind === 'denied' || (busyRef.current && !inFlight)) return false;
    if (!delivery || delivery.value !== live.value) return false;
    const root = live.value.editor.getRootId(), epoch = live.value.editor.dataStore.getDocumentEpoch();
    const owns = () => intentCurrent() && active.current === client && productDocumentHost(hostSlot) === registered &&
      currentRef.current?.generation === one.generation && currentRef.current.documentRef === one.documentRef &&
      currentRef.current.documentId === one.documentId && runtime.current === live &&
      nativeEpoch.current === sourceEpoch && roleOwner.current === capturedRole && inputDelivery.current === delivery &&
      live.value.editor.getRootId() === root && live.value.editor.dataStore.getDocumentEpoch() === epoch &&
      problemRef.current?.kind !== 'denied';
    try {
      if (!owns() || !await delivery.deliver(owns) || !owns()) return false;
      if (!owns() || nestedRef.current || !protectedRef.current) return false;
      // Account exit may settle an entered request. It must not retry or publish one.
      if (inFlight) await inFlight;
      if (!owns() || busyRef.current || (savePending.current && savePending.current !== inFlight)) return false;
      if (!await delivery.deliver(owns) || !owns()) return false;
      if (!owns() || nestedRef.current || !protectedRef.current) return false;
      const text = capture(), latest = currentRef.current;
      if (!text || !latest || !owns() || !protectedRef.current) return false;
      const durable = store.list();
      const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
      const fixedRecord = (value: Fixed) => durable.some(record => record.draftId === value.record.draftId &&
        record.scope.documentRef === value.record.scope.documentRef && record.status !== 'draft' &&
        record.snapshotText === value.attempt.snapshotText && same(record.attempt, value.attempt) &&
        same(record.base, value.record.base) && same(record.source, value.record.source));
      // A confirmed in-flight request keeps its original lineage; later edits need their own draft.
      if ((retainedFixed && !fixedRecord(retainedFixed)) || (fixed.current && !fixedRecord(fixed.current))) return false;
      const confirmed = latest.confirmed !== null && stableSlidesSnapshotText(text) === stableSlidesSnapshotText(latest.confirmed);
      const protectedLatest = durable.some(record => record.scope.documentRef === latest.documentRef &&
        record.snapshotText === text && same(record.base, baseOf(latest)) &&
        (record.status === 'draft' || !!fixed.current && record.draftId === fixed.current.record.draftId));
      return owns() && !nestedRef.current && protectedRef.current && (confirmed || protectedLatest) &&
        stableSlidesSnapshotText(serverSlidesFileText(live.value.exportNativeDocument(), '')) === stableSlidesSnapshotText(text);
    } catch { return false; }
  };
  requestOpen.current = async (documentId, intentCurrent = () => true, parentCurrent = () => true) => {
    const one = currentRef.current, live = runtime.current, delivery = inputDelivery.current, registered = nativeHost.current, capturedRole = roleOwner.current;
    if (one && (!one.documentId || !live || !delivery || !registered || live.generation !== one.generation)) return false;
    const root = live?.value.editor.getRootId(), epoch = live?.value.editor.dataStore.getDocumentEpoch(), sourceEpoch = nativeEpoch.current;
    let preparedText: string | undefined;
    const owns = () => { try { return intentCurrent() && parentCurrent() && active.current === client && (!registered || productDocumentHost(hostSlot) === registered) && nativeEpoch.current === sourceEpoch &&
      currentRef.current?.generation === one?.generation && runtime.current === live && inputDelivery.current === delivery && roleOwner.current === capturedRole &&
      (!live || (live.value.editor.getRootId() === root && live.value.editor.dataStore.getDocumentEpoch() === epoch)) && problemRef.current?.kind !== 'denied' &&
      (!preparedText || (!nestedRef.current && protectedRef.current && !fixed.current &&
        stableSlidesSnapshotText(serverSlidesFileText(live!.value.exportNativeDocument(), '')) === preparedText)); } catch { return false; } };
    if (!owns()) return false;
    if (documentId === one?.documentId) { const guard = captureProductNavigation(hostSlot); return guard?.isCurrent() ? guard : false; }
    if (openPending.current?.isCurrent() || transition.current?.owns() || busyRef.current) return false;
    const lease = { isCurrent: owns }; openPending.current = lease;
    try {
      if ((one && !await beforeNavigate.current(owns)) || !owns()) return false;
      if (one) preparedText = stableSlidesSnapshotText(currentRef.current!.confirmed!);
      startBusy(lease);
      const result = await client.open(documentId);
      if (!owns() || openPending.current !== lease || (delivery && !await delivery.deliver(owns)) || !owns()) return false;
      if (result.mode !== 'snapshot') { setSourceError('공동 편집 문서는 스냅샷 편집으로 열 수 없습니다.'); return false; }
      const initial = documentOf(result.snapshotText);
      if (!owns()) return false;
      const generation = crypto.randomUUID();
      const completion = new Promise<ProductNavigationGuard | false>(resolve => {
        opening.current = { owner: client, generation, role: capturedRole, documentId, parentCurrent, resolve };
      });
      replace({ owner: client, generation, documentRef: documentId, documentId, head: result.document, initial,
        text: result.snapshotText, confirmed: result.snapshotText });
      return await completion;
    } catch (error) { if (owns()) setSourceError(error instanceof Error ? error.message : '문서를 열지 못했습니다.'); return false; }
    finally { if (openPending.current === lease) openPending.current = undefined; endBusy(lease); }
  };
  const onInputDeliveryReady = useCallback((value: SlidesRuntime, deliver: ((isCurrent: () => boolean) => Promise<boolean>) | null) => {
    if (active.current !== client || runtime.current?.value !== value) return;
    inputDelivery.current = deliver ? { value, deliver } : undefined;
    setReadyGeneration(deliver ? runtime.current.generation : '');
  }, [client]);
  useEffect(() => {
    const one = currentRef.current, live = runtime.current, delivery = inputDelivery.current;
    if (!one || !live || !delivery || live.generation !== readyGeneration || delivery.value !== live.value) return;
    const host: ProductDocumentHost = { product: 'slides', id: () => active.current === client ? currentRef.current?.documentId ?? '' : '',
      identityEpoch: () => nativeEpoch.current + roleOwner.current.epoch,
      beforeNavigate: () => beforeNavigate.current(),
      beforeAccountExit: () => active.current === client ? beforeAccountExit.current() : Promise.resolve(false), requestOpen: (id, isCurrent, parentCurrent) => requestOpen.current(id, isCurrent, parentCurrent) };
    nativeHost.current = host;
    const unregister = registerProductDocumentHost(host, hostSlot);
    const installed = opening.current;
    if (installed?.owner === client && installed.generation === one.generation) {
      opening.current = undefined;
      const guard = captureProductNavigation(hostSlot);
      if (installed.role === roleOwner.current && installed.parentCurrent() && guard?.id === installed.documentId && guard.isCurrent()) {
        callbacks.current.onNavigate?.(installed.documentId); installed.resolve(guard);
      } else installed.resolve(false);
    }
    return () => { unregister(); if (nativeHost.current === host) nativeHost.current = undefined; };
  }, [client, readyGeneration, hostSlot]);
  useEffect(() => {
    const capturedRole = roleOwner.current;
    return () => { const pending = opening.current;
      if (pending?.owner === client && pending.role === capturedRole) { opening.current = undefined; pending.resolve(false); }
    };
  }, [client, role]);
  const exportNative = async () => {
    const live = runtime.current, delivery = inputDelivery.current, one = currentRef.current, capturedRole = roleOwner.current;
    const owns = () => active.current === client && runtime.current === live && currentRef.current?.generation === one?.generation && inputDelivery.current === delivery && roleOwner.current === capturedRole;
    if (!live || !delivery || delivery.value !== live.value || !await delivery.deliver(owns) || !owns()) return;
    if (shell.current?.querySelector('.w-math-draft')) return;
    const text = capture(); if (!text) return;
    const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.href = url; link.download = deckFileName(runtime.current ? deckTitle({ rootId: runtime.current.value.editor.getRootId()!, getNode: id => runtime.current!.value.editor.dataStore.getNode(id) }) : '초안'); link.click(); URL.revokeObjectURL(url);
  };
  const openLatest = async () => {
    const one = currentRef.current, live = runtime.current, delivery = inputDelivery.current;
    if (!one?.documentId || !live || !delivery || !copied || copied !== one.text) return;
    const lease = beginTransition(true); if (!lease) return;
    const owns = () => lease.owns() && inputDelivery.current === delivery && protectedRef.current && !nestedRef.current;
    try {
      if (!owns() || !await delivery.deliver(owns) || !owns() || capture() !== copied) return;
      lease.freeze(); startBusy(lease);
      const result = await client.open(one.documentId);
      if (!owns() || !await delivery.deliver(owns) || !owns() || capture() !== copied) return;
      if (result.mode !== 'snapshot') throw new Error('공동 편집 문서는 스냅샷 편집으로 열 수 없습니다.');
      const initial = documentOf(result.snapshotText);
      if (!owns()) return;
      replace({ owner: client, generation: crypto.randomUUID(), documentRef: one.documentId, documentId: one.documentId,
        head: result.document, initial, text: result.snapshotText, confirmed: result.snapshotText });
    } catch (error) { if (owns()) setSourceError(error instanceof Error ? error.message : '최신본을 열지 못했습니다.'); }
    finally { if (transition.current === lease) transition.current = undefined; endBusy(lease); }
  };
  const status = !protectedInput ? '복구 저장 실패' : nestedInput ? '수식 입력 완료 필요' : busy ? '저장 중…' : fixed.current ? '저장 확인 필요' : dirty ? '저장되지 않음' : current ? '서버 저장 확인됨' : '문서 선택';
  const actions = <><span role="status" data-save-status>{status}</span>{canEdit && <Button disabled={!current || busy || nestedInput || problem?.kind === 'conflict' || (!dirty && !fixed.current)} onClick={() => void save()}>{fixed.current ? '저장 확인·재시도' : '저장'}</Button>}</>;
  const navigation = <aside aria-label="서버 Slides 목록">
      {canEdit && <Button disabled={loading || busy || !protectedInput || nestedInput} onClick={() => void prepare(serverSlidesFileText(createStarterDeck(), ''))}>새 Slides</Button>}
      {heads.map(head => <Button key={head.documentId} disabled={busy || !protectedInput || nestedInput} onClick={() => void openDocument(head.documentId)}>{head.title}</Button>)}
      {canEdit && <Button disabled={busy} onClick={() => void slideDocuments.rows().then(rows => { if (active.current === client) setSources(rows); }).catch(() => setSourceError('로컬 문서 목록을 읽지 못했습니다.'))}>이 기기의 로컬 문서 목록 확인</Button>}
      {canEdit && sources?.map(source => <Button key={source.name} disabled={busy} onClick={() => void slideDocuments.text(source.name).then(text => { if (active.current === client) { if (text === undefined) throw new Error('missing_local_document'); return prepare(text, source.name, source.title); } }).catch(() => setSourceError('로컬 문서를 읽지 못했습니다. 원본은 유지됩니다.'))}>{source.title || source.name} · 새 서버 사본 준비</Button>)}
      {canEdit && <label>Slides 원본 파일로 새 서버 사본 준비<input type="file" accept=".slides.json,.json,application/json" disabled={busy || !protectedInput || nestedInput}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void file.text().then(text => { if (active.current === client) return prepare(text); }).catch(() => setSourceError('파일을 읽지 못했습니다. 현재 문서는 유지됩니다.')); }} /></label>}
      {sourceError && <p role="alert">{sourceError}</p>}
      {canEdit && records.filter(record => record.status !== 'confirmed').map(record => <Button key={record.draftId} disabled={busy || !protectedInput || nestedInput} onClick={() => void recover(record)}>저장된 Slides 초안 복구 · {record.savedAt}</Button>)}
      {records.filter(record => record.source && record.status === 'confirmed').map(record => <p key={record.draftId} data-confirmed-local-copy>로컬 Slides {record.source!.name}의 서버 사본을 확인했습니다. 원본과 확인된 요청은 이 기기에 남아 있습니다. 서버 문서: {record.confirmedCopy?.documentId}.</p>)}
    </aside>;
  return <div ref={shell} data-server-slides-workspace>
    {!current && navigation}
    {problem && <p role="alert">{problem.message}</p>}
    {!protectedInput && <p role="alert">현재 입력을 보관하지 못했습니다. 저장소 공간을 확보하고 저장을 다시 시도하세요. 화면을 나갈 수 없습니다.</p>}
    {problem?.kind === 'conflict' && <><Button onClick={() => { const text = capture(); if (text) void navigator.clipboard.writeText(text).then(() => setCopied(text)).catch(() => setCopied(undefined)); }}>충돌 초안 복사</Button><Button disabled={!copied || copied !== current?.text || busy} onClick={() => void openLatest()}>서버 최신본 열기</Button></>}
    {loading && <p role="status">Slides 자료를 확인하는 중입니다.</p>}
    {current && problem?.kind !== 'denied' && <App key={current.generation} mount={mount} localPersistence={false} server={{ headerActions: actions, headerNavigation, active: !hostSlot || isNativeHostSlotActive(hostSlot), isActive: () => !hostSlot || isNativeHostSlotActive(hostSlot), navigation,
      readOnly: !canEdit || busy || !!(draft.current?.source && draft.current.status !== 'confirmed'), onRuntime, onInputDeliveryReady,
      nativeExport: { available: !!current && !nestedInput, run: () => void exportNative() },
      onFileAction: action => { if (action === 'save') void save(); else if (action === 'new') void prepare(serverSlidesFileText(createStarterDeck(), '')); else shell.current?.querySelector('aside')?.scrollIntoView(); } }} />}
  </div>;
}
