import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createStarterSite, siteFileName, siteTitle, siteDocuments } from '@barocss/office-site';
import { captureProductNavigation, productDocumentHost, registerProductDocumentHost, isNativeHostSlotActive, type NativeHostSlot, type ProductDocumentHost, type ProductNavigationGuard } from '@barocss/shared';
import { Button, useOfficeLocale } from '@barocss/office-ui';
import type { Translator } from '@barocss/shared';
import { App, type SiteAppLifecycle } from './app';
import './style.css';
import { assertSiteNativeDocument, mountSiteRuntime, type SiteRuntime } from './runtime';
import { readServerSiteFile, serverSiteFileText, stableSiteSnapshotText, type SiteDocument } from './server-file';
import { createServerSiteClient, ServerSiteError, siteSaveAttempt, type ServerSiteHead, type SiteSaveAttempt } from './server-documents';
import { createServerPendingStore, newPendingSiteDraftId, type PendingSiteBase, type PendingSiteRecord } from './server-pending';

export interface ServerSiteWorkspaceProps {
  tenantId: string; workspaceId: string; issuer: string; subject: string;
  initialDocumentId?: string; authorizedFetch: typeof fetch;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  headerNavigation?: ReactNode;
  hostSlot?: NativeHostSlot;
  isAuthorized?: () => boolean;
  authorityEpoch?: number;
  subscribeAuthority?: (retire: () => void) => () => void;
  onNativeFailure?: (message: string) => void;
  workspaceNavigation?: boolean;
  onNavigate?: (documentId: string) => void;
  onUnsafeChange?: (unsafe: boolean) => void;
}
type Open = { owner: object; generation: string; documentRef: string; documentId: string | null;
  head: ServerSiteHead | null; initial: SiteDocument; text: string; confirmed: string | null };
type Problem = { kind: 'load' | 'save' | 'conflict' | 'denied' | 'mode'; message: string };
type OwnedWork<T> = { owner: object; generation: string; permission: object; access: object; promise: Promise<T> };
type Fixed = { attempt: Readonly<SiteSaveAttempt>; record: PendingSiteRecord };
function failure(error: unknown, t: Translator): Problem {
  if (error instanceof ServerSiteError && [401, 403, 404].includes(error.status ?? 0)) return { kind: 'denied', message: t('site.server.denied') };
  if (error instanceof ServerSiteError && error.status === 409) return { kind: 'conflict', message: t('site.server.conflict') };
  return { kind: 'save', message: t('site.server.saveFailure') };
}
function documentOf(text: string, t: Translator) {
  const read = readServerSiteFile(text);
  if ('error' in read) throw new Error(t('site.server.invalidFile'));
  assertSiteNativeDocument(read.document);
  return read.document;
}

/** Full native Site runtime, with authenticated snapshot authority and scoped recovery. */
export function ServerSiteWorkspace({ tenantId, workspaceId, issuer, subject, initialDocumentId,
  authorizedFetch, role, onNavigate, onUnsafeChange, headerNavigation, hostSlot, onNativeFailure, isAuthorized, authorityEpoch, subscribeAuthority }: ServerSiteWorkspaceProps) {
  const { t } = useOfficeLocale();
  const outerAuthority = useRef({ isAuthorized, authorityEpoch });
  outerAuthority.current = { isAuthorized, authorityEpoch };
  const authorized = useCallback(() => outerAuthority.current.isAuthorized?.() ?? true, []);
  const client = useMemo(() => createServerSiteClient({ tenantId, workspaceId, authorizedFetch }), [tenantId, workspaceId, authorizedFetch, issuer, subject]);
  const store = useMemo(() => createServerPendingStore({ tenantId, workspaceId, issuer, subject }), [tenantId, workspaceId, issuer, subject]);
  const active = useRef(client); active.current = client;
  const callbacks = useRef({ onNavigate, onUnsafeChange }); callbacks.current = { onNavigate, onUnsafeChange };
  const [opened, setOpened] = useState<Open>();
  const current = opened?.owner === client ? opened : undefined;
  const currentRef = useRef(current); currentRef.current = current;
  const nativeIdentityEpoch = useRef(0);
  const nativeHost = useRef<ProductDocumentHost | undefined>(undefined);
  const permission = useRef({ role, epoch: 0 });
  if (permission.current.role !== role) permission.current = { role, epoch: permission.current.epoch + 1 };
  const [readyGeneration, setReadyGeneration] = useState('');
  const opening = useRef<{ token: object; owner: object } | undefined>(undefined);
  const openingCompletion = useRef<{ generation: string; current: () => boolean; resolve: (guard: ProductNavigationGuard | false) => void } | undefined>(undefined);
  const requestOpen = useRef<(id: string, isCurrent?: () => boolean, parentCurrent?: () => boolean, reload?: boolean) => Promise<ProductNavigationGuard | false>>(async () => false);
  const savePending = useRef<OwnedWork<void> | undefined>(undefined);
  const runtime = useRef<{ generation: string; value: SiteRuntime; lifecycle: SiteAppLifecycle; off: () => void } | undefined>(undefined);
  const draft = useRef<PendingSiteRecord | undefined>(undefined);
  const fixed = useRef<Fixed | undefined>(undefined);
  const [records, setRecords] = useState<PendingSiteRecord[]>([]);
  const [heads, setHeads] = useState<ServerSiteHead[]>([]);
  const [problem, setProblem] = useState<Problem>();
  const problemRef = useRef(problem); problemRef.current = problem;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const busyLease = useRef<{ owner: object; permission: object } | undefined>(undefined);
  const beginBusy = () => { const lease = { owner: client, permission: permission.current }; busyLease.current = lease; busyRef.current = true; setBusy(true); return lease; };
  const finishBusy = (lease: typeof busyLease.current) => { if (busyLease.current === lease) { busyLease.current = undefined; busyRef.current = false; setBusy(false); } };
  useEffect(() => {
    if (busyLease.current && (busyLease.current.owner !== client || busyLease.current.permission !== permission.current)) finishBusy(busyLease.current);
  }, [client, role]);
  const flushLock = useRef<OwnedWork<string | undefined> | null>(null);
  const [protectedInput, setProtectedInput] = useState(true);
  const protectedRef = useRef(true);
  const [nestedInput, setNestedInput] = useState(false);
  const nestedRef = useRef(false);
  const [, refresh] = useState(0);
  const [sources, setSources] = useState<{ name: string; title?: string }[]>();
  const [sourceError, setSourceError] = useState('');
  const [copied, setCopied] = useState<string>();
  const shell = useRef<HTMLDivElement>(null);
  const canEdit = authorized() && role !== 'viewer' && problem?.kind !== 'denied';
  const authority = useRef(canEdit); authority.current = canEdit;
  const access = useRef({ canEdit, authorityEpoch, epoch: 0 });
  if (access.current.canEdit !== canEdit || access.current.authorityEpoch !== authorityEpoch) access.current = { canEdit, authorityEpoch, epoch: access.current.epoch + 1 };
  const dirty = !!current && (current.confirmed === null || stableSiteSnapshotText(current.text) !== stableSiteSnapshotText(current.confirmed));
  const signalProtection = useCallback((safe: boolean) => {
    protectedRef.current = safe; setProtectedInput(safe);
    callbacks.current.onUnsafeChange?.(!safe || nestedRef.current);
  }, []);
  const track = useCallback((record: PendingSiteRecord) => {
    setRecords(previous => [record, ...previous.filter(item => item.draftId !== record.draftId)]);
  }, []);
  const baseOf = (one: Open): PendingSiteBase => one.documentId
    ? { operation: 'update', documentId: one.documentId, expectedRevision: one.head!.revision }
    : { operation: 'create', workspaceId };
  const protect = useCallback((one: Open, text: string) => {
    if (!authorized()) throw new Error('The Site host authority changed.');
    const previous = draft.current;
    const reuse = previous?.status === 'draft' && previous.scope.documentRef === one.documentRef;
    const record = store.write({ draftId: reuse ? previous.draftId : newPendingSiteDraftId(),
      documentRef: one.documentRef, base: one.documentId
        ? { operation: 'update', documentId: one.documentId, expectedRevision: one.head!.revision }
        : { operation: 'create', workspaceId }, status: 'draft', snapshotText: text });
    draft.current = record; track(record); signalProtection(true); return record;
  }, [store, workspaceId, track, signalProtection]);
  const capture = useCallback(() => {
    const one = currentRef.current;
    const live = runtime.current;
    if (!authorized() || !one || !live || live.generation !== one.generation || active.current !== client) return one?.text;
    try {
      const text = serverSiteFileText(live.value.exportNativeDocument(), '');
      if (stableSiteSnapshotText(text) === stableSiteSnapshotText(one.text)) return one.text;
      const next = { ...one, text };
      currentRef.current = next; setOpened(next); setCopied(undefined);
      try { protect(next, text); } catch { signalProtection(false); }
      return text;
    } catch { signalProtection(false); return undefined; }
  }, [client, protect, signalProtection]);
  const replace = useCallback((one: Open, record?: PendingSiteRecord) => {
    // Validate before changing the current model or its mounted lifetime.
    assertSiteNativeDocument(one.initial);
    nativeIdentityEpoch.current++;
    runtime.current?.off(); runtime.current = undefined;
    nestedRef.current = false; setNestedInput(false);
    draft.current = record?.status === 'draft' ? undefined : record;
    fixed.current = record?.status === 'pending' && record.attempt ? { attempt: record.attempt, record } : undefined;
    currentRef.current = one; setOpened(one); setProblem(undefined); setCopied(undefined); signalProtection(true);
    refresh(value => value + 1);
  }, [signalProtection]);
  const flushAndCapture = useCallback(async (isCurrent: () => boolean = () => true) => {
    if (!authorized() || !isCurrent()) return undefined;
    const one = currentRef.current, live = runtime.current;
    const entered = flushLock.current;
    if (one && entered?.owner === client && entered.generation === one.generation &&
      entered.permission === permission.current && entered.access === access.current) return entered.promise;
    if (!one || !live || active.current !== client || live.generation !== one.generation) return undefined;
    const capturedPermission = permission.current, capturedAccess = access.current;
    const root = live.value.editor.getRootId(), epoch = live.value.editor.dataStore.getDocumentEpoch();
    const currentOwner = () => authorized() && isCurrent() && permission.current === capturedPermission && access.current === capturedAccess && active.current === client &&
      currentRef.current?.generation === one.generation && runtime.current === live &&
      live.value.editor.getRootId() === root && live.value.editor.dataStore.getDocumentEpoch() === epoch;
    const task = (async () => {
      try {
        if (!currentOwner() || !await live.value.flushPendingInput(currentOwner)) return undefined;
        await live.lifecycle.beforeSnapshot();
        if (!currentOwner()) return undefined;
        if (live.lifecycle.hasPendingInput()) throw new Error('pending_site_input');
        const text = capture();
        // Quota failures can recover even when the visible native text did not change.
        if (text && !protectedRef.current) protect(currentRef.current!, text);
        nestedRef.current = false; setNestedInput(false); signalProtection(protectedRef.current);
        return text;
      } catch {
        if (currentOwner()) {
          nestedRef.current = true; setNestedInput(true);
          callbacks.current.onUnsafeChange?.(true);
          setProblem({ kind: 'save', message: t('site.server.inputFailure') });
        }
        return undefined;
      }
    })();
    const work = { owner: client, generation: one.generation, permission: capturedPermission, access: capturedAccess, promise: task };
    flushLock.current = work;
    try { return await task; } finally { if (flushLock.current === work) flushLock.current = null; }
  }, [client, capture, protect, signalProtection]);
  const onPendingInput = useCallback((pending: boolean) => {
    if (active.current !== client || !current || currentRef.current?.generation !== current.generation) return;
    nestedRef.current = pending; setNestedInput(pending);
    callbacks.current.onUnsafeChange?.(pending || !protectedRef.current);
  }, [client, current?.generation]);
  const safeSwitch = async () => {
    if (busyRef.current) return false;
    if (currentRef.current && !await flushAndCapture()) return false;
    if (!protectedRef.current || nestedRef.current || busyRef.current) return false;
    const one = currentRef.current;
    return !one || (!fixed.current && one.confirmed !== null && stableSiteSnapshotText(one.text) === stableSiteSnapshotText(one.confirmed)) ||
      window.confirm(t('site.server.switchConfirmation'));
  };
  const openInitialDocument = async (documentId: string) => {
    const selectedPermission = permission.current, selectedAccess = access.current;
    const stillSelected = () => authorized() && active.current === client && permission.current === selectedPermission &&
      access.current === selectedAccess && !currentRef.current;
    if (!stillSelected() || !await safeSwitch() || !stillSelected()) return;
    const busyToken = beginBusy();
    try {
      const result = await client.open(documentId);
      if (!stillSelected()) return;
      if (result.mode !== 'snapshot') { setProblem({ kind: 'mode', message: t('site.server.modeFailure') }); return; }
      const initial = documentOf(result.snapshotText, t);
      if (!stillSelected()) return;
      replace({ owner: client, generation: crypto.randomUUID(), documentRef: documentId, documentId,
        head: result.document, initial, text: result.snapshotText, confirmed: result.snapshotText });
      callbacks.current.onNavigate?.(documentId);
    } catch (error) { if (stillSelected()) setProblem(error instanceof ServerSiteError ? failure(error, t) : { kind: 'load', message: error instanceof Error ? error.message : t('site.server.openFailure') }); }
    finally { finishBusy(busyToken); }
  };
  useEffect(() => {
    let alive = true; active.current = client;
    const enteredAccess = access.current;
    const owns = () => alive && authorized() && active.current === client && access.current === enteredAccess;
    void (async () => {
      try {
        const rows = await client.list();
        if (!owns()) return;
        setHeads(rows);
        try { setRecords(store.list()); } catch { setSourceError(t('site.server.recoveryListFailure')); }
        if (initialDocumentId) {
          const result = await client.open(initialDocumentId);
          if (!owns()) return;
          if (result.mode !== 'snapshot') { setProblem({ kind: 'mode', message: t('site.server.modeFailure') }); return; }
          replace({ owner: client, generation: crypto.randomUUID(), documentRef: initialDocumentId, documentId: initialDocumentId,
            head: result.document, initial: documentOf(result.snapshotText, t), text: result.snapshotText, confirmed: result.snapshotText });
        }
      } catch (error) { if (owns()) setProblem(error instanceof ServerSiteError ? failure(error, t) : { kind: 'load', message: t('site.server.loadFailure') }); }
      finally { if (alive && active.current === client) setLoading(false); }
    })();
    return () => {
      alive = false;
      if (active.current === client) active.current = {} as typeof client;
      const completion = openingCompletion.current;
      if (completion) { openingCompletion.current = undefined; completion.resolve(false); }
      runtime.current?.off(); runtime.current = undefined;
    };
    // A successful create changes the URL without reloading the same live runtime.
  }, [client, store, replace]);
  const mount = useCallback((host: HTMLElement) => {
    const one = currentRef.current!;
    // Same-account role changes update the live runtime; they must not reload its initial snapshot.
    return mountSiteRuntime(host, { initialDocument: one.initial, editable: authorized() && authority.current && !(draft.current?.source && draft.current.status !== 'confirmed'),
      getAuthorityEpoch: () => outerAuthority.current.authorityEpoch ?? 0, isAuthorized: authorized,
      isActive: () => authorized() && active.current === client && currentRef.current?.generation === one.generation && (!hostSlot || isNativeHostSlotActive(hostSlot)) });
  }, [client, current?.generation, hostSlot]);
  const onRuntime = useCallback((value: SiteRuntime, lifecycle: SiteAppLifecycle) => {
    const generation = currentRef.current!.generation;
    const changed = () => { if (active.current === client && runtime.current?.generation === generation) capture(); };
    value.editor.on('editor:content.change', changed);
    runtime.current = { generation, value, lifecycle, off: () => value.editor.off('editor:content.change', changed) };
    setReadyGeneration(generation);
  }, [client, capture]);
  useLayoutEffect(() => subscribeAuthority?.(() => {
    // Retire nested input intent synchronously, before the host awaits fresh identity.
    const editor = runtime.current?.value.editor;
    if (editor?.isEditable) editor.setEditable(false);
  }), [subscribeAuthority]);
  useLayoutEffect(() => {
    const editor = runtime.current?.value.editor;
    const editable = canEdit && !(draft.current?.source && draft.current.status !== 'confirmed');
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [canEdit, busy, current?.generation, records, readyGeneration]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (hostSlot && !isNativeHostSlotActive(hostSlot)) return; capture(); if (!protectedRef.current || nestedRef.current || runtime.current?.lifecycle.hasPendingInput()) { event.preventDefault(); event.returnValue = ''; } };
    const hide = () => { if (!hostSlot || isNativeHostSlotActive(hostSlot)) capture(); };
    window.addEventListener('beforeunload', unload); window.addEventListener('pagehide', hide);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('pagehide', hide); };
  }, [capture]);
  useEffect(() => {
    if (!nestedInput || busy || !canEdit) return;
    const timer = setTimeout(() => { void flushAndCapture(); }, 500);
    return () => clearTimeout(timer);
  }, [nestedInput, busy, canEdit, flushAndCapture]);
  const replacementWitness = () => {
    try {
    const one = currentRef.current, live = runtime.current;
    if (!one) return () => !currentRef.current && active.current === client;
    if (!live || live.generation !== one.generation) return () => false;
    const input = live.lifecycle.captureInputIntent(), text = serverSiteFileText(live.value.exportNativeDocument(), '');
    return () => active.current === client && currentRef.current?.generation === one.generation && runtime.current === live &&
      input() && serverSiteFileText(live.value.exportNativeDocument(), '') === text;
    } catch { return () => false; }
  };
  const captureSourceSelection = () => {
    const selectedPermission = permission.current, selectedAccess = access.current;
    const generation = currentRef.current?.generation, identity = nativeIdentityEpoch.current;
    return () => active.current === client && permission.current === selectedPermission && access.current === selectedAccess &&
      authorized() && authority.current && currentRef.current?.generation === generation && nativeIdentityEpoch.current === identity;
  };
  const prepare = async (text: string, name?: string, sourceTitle?: string, selectionCurrent: () => boolean = () => true) => {
    const selectedPermission = permission.current, selectedAccess = access.current;
    const stillSelected = () => authorized() && selectionCurrent() && active.current === client && permission.current === selectedPermission && access.current === selectedAccess && authority.current;
    if (!stillSelected() || !await safeSwitch() || !stillSelected()) return;
    const sourceCurrent = replacementWitness();
    let initial: SiteDocument;
    try { initial = documentOf(text, t); } catch (error) { setSourceError(error instanceof Error ? error.message : t('site.server.readFailure')); return; }
    const busyToken = beginBusy();
    try {
      await client.list();
      if (!stillSelected() || !sourceCurrent()) return;
      const one: Open = { owner: client, generation: crypto.randomUUID(), documentRef: crypto.randomUUID(), documentId: null,
        head: null, initial, text, confirmed: null };
      const draftId = newPendingSiteDraftId();
      const attempt = name ? siteSaveAttempt({ operation: 'create', workspaceId, title: sourceTitle || name, snapshotText: text, idempotencyKey: draftId }) : undefined;
      const record = store.write({ draftId, documentRef: one.documentRef, base: { operation: 'create', workspaceId },
        status: attempt ? 'pending' : 'draft', snapshotText: text,
        ...(attempt ? { attempt, source: { kind: 'indexeddb-site' as const, name: name! } } : {}) });
      replace(one, record); draft.current = record; track(record); setSourceError('');
    } catch (error) { if (stillSelected()) setProblem(failure(error, t)); }
    finally { finishBusy(busyToken); }
  };
  const prepareLocalSource = async (source: { name: string; title?: string }) => {
    const owns = captureSourceSelection();
    try {
      const text = await siteDocuments.text(source.name);
      if (!owns()) return;
      if (text === undefined) throw new Error('missing_local_document');
      await prepare(text, source.name, source.title, owns);
    } catch { if (owns()) setSourceError(t('site.server.localReadFailure')); }
  };
  const prepareFileSource = async (file: File) => {
    const owns = captureSourceSelection();
    try { const text = await file.text(); if (owns()) await prepare(text, undefined, undefined, owns); }
    catch { if (owns()) setSourceError(t('site.server.fileReadFailure')); }
  };
  const recover = async (record: PendingSiteRecord) => {
    const selectedPermission = permission.current, selectedAccess = access.current;
    const stillSelected = () => authorized() && active.current === client && permission.current === selectedPermission && access.current === selectedAccess && authority.current;
    if (!stillSelected() || !await safeSwitch() || !stillSelected()) return;
    const sourceCurrent = replacementWitness();
    const busyToken = beginBusy();
    try {
      let head: ServerSiteHead | null = null;
      if (record.base.operation === 'update') {
        const verified = await client.open(record.base.documentId);
        if (verified.mode !== 'snapshot') throw new ServerSiteError(409, 'snapshot_mode_required');
        head = { ...verified.document, revision: record.base.expectedRevision };
      } else await client.list();
      if (!stillSelected() || !sourceCurrent()) return;
      const initial = documentOf(record.snapshotText, t);
      replace({ owner: client, generation: crypto.randomUUID(), documentRef: record.scope.documentRef,
        documentId: record.base.operation === 'update' ? record.base.documentId : null, head,
        initial, text: record.snapshotText, confirmed: null }, record);
      track(record);
    } catch (error) { if (stillSelected()) setProblem(error instanceof ServerSiteError ? failure(error, t) : { kind: 'load', message: t('site.server.recoveryOpenFailure') }); }
    finally { finishBusy(busyToken); }
  };
  const saveCurrent = async () => {
    if (!authorized() || !authority.current || busyRef.current || problemRef.current?.kind === 'conflict') return;
    const enteredPermission = permission.current, enteredAccess = access.current;
    const text = await flushAndCapture(() => permission.current === enteredPermission && access.current === enteredAccess); const one = currentRef.current;
    if (!authorized() || !authority.current || active.current !== client || permission.current !== enteredPermission || access.current !== enteredAccess || busyRef.current) return;
    if (!text || !one) return;
    let pinned: Fixed;
    try {
      if (!protectedRef.current) protect(one, text);
      if (fixed.current) pinned = fixed.current;
      else {
        const record = draft.current?.status === 'draft' ? draft.current : protect(one, text);
        const attempt = siteSaveAttempt(one.documentId
          ? { operation: 'update', documentId: one.documentId, expectedRevision: one.head!.revision, snapshotText: text, idempotencyKey: record.draftId }
          : { operation: 'create', workspaceId, title: siteTitle(runtime.current!.value.editor.dataStore) || t('site.server.untitled'), snapshotText: text, idempotencyKey: record.draftId });
        const pending = store.write({ draftId: record.draftId, documentRef: one.documentRef, base: baseOf(one), status: 'pending', snapshotText: text, attempt });
        pinned = { attempt, record: pending }; fixed.current = pinned; draft.current = pending; track(pending);
      }
    } catch { signalProtection(false); setProblem({ kind: 'save', message: t('site.server.durableFailure') }); return; }
    const sourceGeneration = one.generation;
    const ownsAttempt = () => active.current === client && permission.current === enteredPermission && access.current === enteredAccess &&
      authorized() && authority.current && currentRef.current?.generation === sourceGeneration && fixed.current === pinned;
    const busyToken = beginBusy(); setProblem(undefined);
    try {
      // Recheck authority before receipt lookup or retry, including new-document requests.
      await client.list();
      if (!ownsAttempt()) return;
      let receipt;
      try { receipt = await client.receipt(pinned.attempt.operation, pinned.attempt.idempotencyKey); }
      catch (error) { if (!(error instanceof ServerSiteError) || error.status !== 404) throw error; if (!ownsAttempt()) return; receipt = await client.save(pinned.attempt); }
      if (!ownsAttempt()) return;
      const confirmed = await client.confirm(pinned.attempt, receipt);
      if (!ownsAttempt()) return;
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
      if (stableSiteSnapshotText(next.text) !== stableSiteSnapshotText(next.confirmed)) {
        try { protect(next, next.text); } catch { signalProtection(false); }
      }
      setHeads(previous => [confirmed.document, ...previous.filter(item => item.documentId !== confirmed.document.documentId)]);
      callbacks.current.onNavigate?.(confirmed.document.documentId); refresh(value => value + 1);
    } catch (error) { if (ownsAttempt()) setProblem(failure(error, t)); }
    finally { finishBusy(busyToken); }
  };
  const save = () => {
    const one = currentRef.current, entered = savePending.current;
    if (!one) return Promise.resolve();
    if (entered?.owner === client && entered.generation === one.generation &&
      entered.permission === permission.current && entered.access === access.current) return entered.promise;
    const work: OwnedWork<void> = { owner: client, generation: one.generation, permission: permission.current, access: access.current,
      promise: Promise.resolve() };
    work.promise = saveCurrent().finally(() => { if (savePending.current === work) savePending.current = undefined; });
    savePending.current = work; return work.promise;
  };
  const beforeNavigate = useRef<(isCurrent?: () => boolean) => Promise<boolean>>(async () => false);
  const beforeAccountExit = useRef<(isCurrent?: () => boolean) => Promise<boolean>>(async () => false);
  beforeAccountExit.current = async (intentCurrent = () => true) => {
    const one = currentRef.current, live = runtime.current, registered = nativeHost.current;
    if (!one || !live || !registered || live.generation !== one.generation || problemRef.current?.kind === 'denied') return false;
    const capturedPermission = permission.current, capturedAccess = access.current, sourceEpoch = nativeIdentityEpoch.current;
    const enteredSave = savePending.current, enteredFixed = fixed.current;
    const owns = () => authorized() && intentCurrent() && active.current === client && permission.current === capturedPermission && access.current === capturedAccess &&
      nativeIdentityEpoch.current === sourceEpoch && currentRef.current?.generation === one.generation && runtime.current === live &&
      productDocumentHost(hostSlot) === registered;
    try {
      if (enteredSave?.owner === client && enteredSave.generation === one.generation && enteredSave.permission === capturedPermission && enteredSave.access === capturedAccess) await enteredSave.promise;
      if (!owns() || busyRef.current || savePending.current && savePending.current !== enteredSave) return false;
      const text = await flushAndCapture(owns); if (!text || !owns() || !protectedRef.current) return false;
      const durable = store.list(), same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      const retained = (value: Fixed) => durable.some(record => record.draftId === value.record.draftId &&
        record.scope.documentRef === value.record.scope.documentRef && record.status !== 'draft' &&
        record.snapshotText === value.attempt.snapshotText && same(record.attempt, value.attempt) &&
        same(record.base, value.record.base) && same(record.source, value.record.source));
      if (enteredFixed && !retained(enteredFixed) || fixed.current && !retained(fixed.current)) return false;
      const latest = currentRef.current!;
      const confirmed = latest.confirmed !== null && stableSiteSnapshotText(text) === stableSiteSnapshotText(latest.confirmed);
      const protectedLatest = durable.some(record => record.scope.documentRef === latest.documentRef &&
        record.snapshotText === text && same(record.base, baseOf(latest)) &&
        (record.status === 'draft' || !!fixed.current && record.draftId === fixed.current.record.draftId));
      const input = live.lifecycle.captureInputIntent();
      return owns() && input() && !nestedRef.current && protectedRef.current && (confirmed || protectedLatest);
    } catch { return false; }
  };
  beforeNavigate.current = intentCurrent => beforeAccountExit.current(intentCurrent);
  requestOpen.current = async (documentId, intentCurrent = () => true, parentCurrent = () => true, reload = false) => {
    const one = currentRef.current, live = runtime.current, registered = nativeHost.current;
    if (!one?.documentId || !live || !registered || opening.current || live.generation !== one.generation) return false;
    if (documentId === one.documentId && !reload) return captureProductNavigation(hostSlot) ?? false;
    if (reload && (!copied || copied !== one.text)) return false;
    const capturedPermission = permission.current, capturedAccess = access.current, sourceEpoch = nativeIdentityEpoch.current;
    const owns = () => authorized() && intentCurrent() && parentCurrent() && active.current === client && permission.current === capturedPermission && access.current === capturedAccess &&
      nativeIdentityEpoch.current === sourceEpoch && currentRef.current?.generation === one.generation && runtime.current === live &&
      productDocumentHost(hostSlot) === registered;
    const token = {}, load = { token, owner: client }; opening.current = load;
    try {
      if (reload ? !await flushAndCapture(owns) || !owns() || copied !== currentRef.current?.text : !await beforeNavigate.current(owns) || !owns()) return false;
      const input = live.lifecycle.captureInputIntent(), native = stableSiteSnapshotText(serverSiteFileText(live.value.exportNativeDocument(), ''));
      const prepared = () => owns() && input() && !nestedRef.current && protectedRef.current && (reload || !fixed.current) &&
        stableSiteSnapshotText(serverSiteFileText(live.value.exportNativeDocument(), '')) === native;
      const result = await client.open(documentId);
      if (!prepared() || result.mode !== 'snapshot') return false;
      const initial = documentOf(result.snapshotText, t);
      if (!prepared()) return false;
      const generation = crypto.randomUUID();
      return await new Promise<ProductNavigationGuard | false>(resolve => {
        openingCompletion.current = { generation, current: () => authorized() && parentCurrent() && active.current === client && permission.current === capturedPermission && access.current === capturedAccess,
          resolve: guard => { if (guard) callbacks.current.onNavigate?.(documentId); resolve(guard); } };
        replace({ owner: client, generation, documentRef: documentId, documentId, head: result.document,
          initial, text: result.snapshotText, confirmed: result.snapshotText });
      });
    } catch (error) { if (owns()) setProblem(failure(error, t)); return false; }
    finally { if (opening.current === load) opening.current = undefined; }
  };
  const openDocument = async (documentId: string) => {
    if (!currentRef.current) return openInitialDocument(documentId);
    if (problemRef.current?.kind === 'conflict' && documentId === currentRef.current.documentId) {
      await requestOpen.current(documentId, () => true, () => true, true); return;
    }
    const guard = captureProductNavigation(hostSlot);
    if (guard?.open) await guard.open(documentId);
  };
  useEffect(() => {
    if (!current || !readyGeneration || runtime.current?.generation !== current.generation) return;
    const host: ProductDocumentHost = { product: 'site',
      id: () => active.current === client ? currentRef.current?.documentId ?? '' : '',
      identityEpoch: () => nativeIdentityEpoch.current + permission.current.epoch + access.current.epoch,
      beforeNavigate: () => active.current === client ? beforeNavigate.current() : Promise.resolve(false),
      beforeAccountExit: () => active.current === client ? beforeAccountExit.current() : Promise.resolve(false),
      requestOpen: (id, owner, parent) => active.current === client ? requestOpen.current(id, owner, parent) : Promise.resolve(false)
    };
    nativeHost.current = host; const unregister = registerProductDocumentHost(host, hostSlot);
    return () => { unregister(); if (nativeHost.current === host) nativeHost.current = undefined; };
  }, [client, !!current, !!readyGeneration, hostSlot]);
  useEffect(() => {
    const completion = openingCompletion.current, live = runtime.current;
    if (!completion || !live || live.generation !== completion.generation) return;
    const guard = captureProductNavigation(hostSlot);
    openingCompletion.current = undefined;
    completion.resolve(completion.current() && guard?.isCurrent() && guard.product === 'site' && guard.id === currentRef.current?.documentId ? guard : false);
  }, [readyGeneration, client, current?.generation, hostSlot]);
  useEffect(() => {
    if (hostSlot && !isNativeHostSlotActive(hostSlot) && problem) onNativeFailure?.(problem.message);
  }, [hostSlot, problem, onNativeFailure]);
  const exportNative = async () => {
    const enteredAccess = access.current, generation = currentRef.current?.generation;
    const owns = () => authorized() && active.current === client && access.current === enteredAccess && currentRef.current?.generation === generation;
    const text = await flushAndCapture(owns); if (!text || !owns()) return;
    const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.href = url; link.download = siteFileName(runtime.current ? siteTitle(runtime.current.value.editor.dataStore) : t('site.server.draft')); link.click(); URL.revokeObjectURL(url);
  };
  const status = !protectedInput ? t('site.server.status.recoveryFailure') : nestedInput ? t('site.server.status.inputPending') : busy ? t('site.server.status.saving') : fixed.current ? t('site.server.status.confirmationPending') : dirty ? t('site.server.status.unsaved') : current ? t('site.server.status.confirmed') : t('site.server.status.choose');
  const actions = <><span role="status" data-save-status>{status}</span>{canEdit && <Button disabled={!current || busy || problem?.kind === 'conflict' || (!dirty && !fixed.current && !nestedInput && protectedInput)} onClick={() => void save()}>{fixed.current ? t('site.server.retry') : t('site.server.save')}</Button>}<Button disabled={!current || busy} onClick={() => void exportNative()}>{t('site.server.export')}</Button></>;
  const navigation = <aside aria-label={t('site.server.list')}>
      {canEdit && <Button disabled={loading || busy} onClick={() => void prepare(serverSiteFileText(createStarterSite(), ''))}>{t('site.server.new')}</Button>}
      {heads.map(head => <Button key={head.documentId} disabled={busy} onClick={() => void openDocument(head.documentId)}>{head.title}</Button>)}
      {canEdit && <Button disabled={busy} onClick={() => void siteDocuments.rows().then(rows => { if (active.current === client) setSources(rows); }).catch(() => setSourceError(t('site.server.localListFailure')))}>{t('site.server.localList')}</Button>}
      {canEdit && sources?.map(source => <Button key={source.name} disabled={busy} onClick={() => void prepareLocalSource(source)}>{source.title || source.name} · {t('site.server.prepareCopy')}</Button>)}
      {canEdit && <label>{t('site.server.import')}<input type="file" accept=".site.json,.json,application/json" disabled={busy}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void prepareFileSource(file); }} /></label>}
      {sourceError && <p role="alert">{sourceError}</p>}
      {canEdit && records.filter(record => record.status !== 'confirmed').map(record => <Button key={record.draftId} disabled={busy} onClick={() => void recover(record)}>{t('site.server.recover')} · {record.savedAt}</Button>)}
      {records.filter(record => record.source && record.status === 'confirmed').map(record => <p key={record.draftId} data-confirmed-local-copy>{t('site.server.localSite')} {record.source!.name} · {t('site.server.copyConfirmed')} {t('site.server.copyOriginalRetained')} {t('site.server.serverDocument')}: {record.confirmedCopy?.documentId}.</p>)}
    </aside>;
  return <div ref={shell} data-server-site-workspace>
    {!current && navigation}
    {problem && <p role="alert">{problem.message}</p>}
    {!protectedInput && <p role="alert">{t('site.server.unsafeExit')}</p>}
    {problem?.kind === 'conflict' && <><Button onClick={() => { void flushAndCapture().then(text => { if (text) return navigator.clipboard.writeText(text).then(() => setCopied(text)); }).catch(() => setCopied(undefined)); }}>{t('site.server.copyConflict')}</Button><Button disabled={!copied || copied !== current?.text || busy} onClick={() => { if (current?.documentId) void openDocument(current.documentId); }}>{t('site.server.openLatest')}</Button></>}
    {loading && <p role="status">{t('site.server.loading')}</p>}
    {current && <div className="server-site-native" hidden={problem?.kind === 'denied'} inert={problem?.kind === 'denied'}><App key={current.generation} mount={mount} server={{ headerActions: actions, headerNavigation, navigation,
      readOnly: !canEdit || !!(draft.current?.source && draft.current.status !== 'confirmed'), onRuntime, onPendingInput,
      onFileAction: action => { if (action === 'export') void exportNative(); else if (action === 'save') void save(); else if (action === 'new') void prepare(serverSiteFileText(createStarterSite(), ''));  } }} /></div>}
  </div>;
}
