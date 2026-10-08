import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, Component, type ReactNode } from 'react';
import {
  AuthError, beginLogin, clearSession, confirmOperator, confirmTenant, currentIntent, finishLogin,
  isLogoutEvent, loadIdentity, providerLogout, consumeLogoutReturn, consumeResumeIntent,
  listWorkspaces, listSnapshotDocuments, openVerifiedSnapshot, snapshotIntentFromSearch, projectLocation, authorizedFetch, captureAuthorizedSession,
  type EntryIntent, type Identity, type TenantAccess, type TenantRole, type WorkspaceAccess, type DocumentAccess, type VerifiedNoteContext, type VerifiedSnapshotContext, type SnapshotProduct,
} from './auth-client';
import { Icon, IconButton, ProductLabel, OfficePortalOwner } from '@barocss/office-ui';
import { productDocumentHost, prepareProductNavigation, prepareProductAccountExit, captureProductNavigation, createNativeHostSlot, disposeNativeHostSlot, promoteProductNavigation, type NativeHostSlot, type ProductNavigationGuard } from '@barocss/shared';
import { ProjectFeedback, type FeedbackBeforeLeave } from '@barocss/office-workspace/feedback';
import { AuthenticatedWorkspaceFrame } from './authenticated-frame';
import type { ServerCatalogRow } from './server-catalog';
import { authRouteRequest, resolveAuthenticatedRouteItem, snapshotIntentURL } from './auth-route';
import { formatWorkspaceRoute, readProductDocument } from '@barocss/office-workspace';
import { useOfficeLocale } from '@barocss/office-ui';
import { ConnectedWorkspace } from './connected-workspace';
import { serverProjectRepository } from './project-client';
import './auth-style.css';

type View =
  | { phase: 'checking' }
  | { phase: 'entry'; message?: string }
  | { phase: 'choose'; identity: Identity; intent: EntryIntent }
  | { phase: 'empty' }
  | { phase: 'opened'; intent: EntryIntent; tenant: TenantAccess; role: TenantRole; workspaces?: WorkspaceAccess[]; workspaceCursor?: string | null }
  | { phase: 'library'; tenant: TenantAccess; role: TenantRole; workspace: WorkspaceAccess; product: SnapshotProduct; documents: DocumentAccess[]; cursor: string | null }
  | { phase: 'project'; tenant: TenantAccess; role: TenantRole; workspace: WorkspaceAccess }
  | { phase: 'note'; tenant: TenantAccess; role: TenantRole; workspace: WorkspaceAccess; context: VerifiedSnapshotContext; principal: NativePrincipal }
  | { phase: 'operator-opened' }
  | { phase: 'operator-denied' }
  | { phase: 'denied'; tenant: TenantAccess; role: TenantRole }
  | { phase: 'error'; error: AuthError };

type NativeView = Extract<View, { phase: 'note' }>;
type NativePrincipal = Pick<Identity, 'issuer' | 'subject'> & { currentUserId: string | null };
type NativeSlot = { token: symbol; key: string; session: ReturnType<typeof captureAuthorizedSession>; hostSlot?: NativeHostSlot };
export type NativeEntryBinding = { isAuthorized?: () => boolean; authorityEpoch?: number; subscribeAuthority?: (retire: () => void) => () => void; hostSlot?: NativeHostSlot; onNativeFailure?: (message: string) => void };
class NativeEntryBoundary extends Component<{ children: ReactNode; onFailure: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onFailure(error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

const productName = (product: SnapshotProduct) => ({ note: 'Note', word: 'Word', slides: 'Slides', site: 'Site' } as const)[product];

const curtainId = 'office-auth-curtain';
const nativeHistoryKey = 'wonffice.auth.native-history.v1';
type NativeHistoryEntry = { owner: string; index: number };
function nativeHistoryEntry(state: unknown): NativeHistoryEntry | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const value = (state as Record<string, unknown>)[nativeHistoryKey];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { owner, index } = value as Partial<NativeHistoryEntry>;
  return typeof owner === 'string' && Number.isSafeInteger(index) && typeof index === 'number' && index >= 0 ? { owner, index } : null;
}
function curtain() {
  let element = document.getElementById(curtainId);
  if (!element) {
    element = document.createElement('div');
    element.id = curtainId;
    element.textContent = '현재 계정의 접근 권한 확인 중';
    document.body.append(element);
  }
  return element;
}
function showCurtain() { curtain().hidden = false; }
function hideCurtain() { curtain().hidden = true; }
function roleName(role: TenantRole) {
  return { owner: '소유자', admin: '관리자', editor: '편집자', viewer: '열람자' }[role];
}
function asAuthError(error: unknown) {
  return error instanceof AuthError ? error : new AuthError('unavailable', '접근 권한을 확인하지 못했습니다. 다시 시도해 주세요.');
}

export function AuthApp({ noteRenderer, editorRenderer }: { editorRenderer?: (context: VerifiedSnapshotContext, principal: NativePrincipal,
  onUnsafeChange: (unsafe: boolean) => void, onDocumentNavigate: (documentId: string) => void, headerNavigation: ReactNode, binding?: NativeEntryBinding) => ReactNode; noteRenderer?: (context: VerifiedNoteContext, principal: Pick<Identity, 'issuer' | 'subject'>,
  onUnsafeChange: (unsafe: boolean) => void, onDocumentNavigate: (documentId: string) => void) => ReactNode } = {}) {
  const { t } = useOfficeLocale();
  const [treeBusy, setTreeBusy] = useState(false);
  const [treeError, setTreeError] = useState('');
  const [activeDocument, setActiveDocument] = useState<string | null>(null);
  const nativeSlot = useRef<NativeSlot | null>(null);
  const [stagedNative, setStagedNative] = useState<{ value: NativeView; slot: NativeSlot; fail: (message: string) => void } | null>(null);
  const pendingNative = useRef<{ slot: NativeSlot; cancel: () => void } | null>(null);
  function cancelStagedNative(expected?: NativeSlot) {
    if (expected && pendingNative.current?.slot !== expected) return;
    const pending = pendingNative.current; pendingNative.current = null;
    if (pending) { pending.cancel(); if (pending.slot.hostSlot) disposeNativeHostSlot(pending.slot.hostSlot); }
    setStagedNative(null);
  }
  useEffect(() => () => { pendingNative.current?.cancel(); if (pendingNative.current?.slot.hostSlot) disposeNativeHostSlot(pendingNative.current.slot.hostSlot); }, []);
  const treeOperation = useRef<symbol | null>(null);
  const historyOwner = useRef<NativeHistoryEntry>({ owner: crypto.randomUUID(), index: 0 });
  const historyEpoch = useRef(0);
  const restoringHistory = useRef<{ owner: string; index: number } | null>(null);
  const [view, setView] = useState<View>({ phase: 'checking' });
  const selected = useRef<TenantAccess | null>(null);
  const chosenIntent = useRef<EntryIntent | null>(null);
  const generation = useRef(0);
  const authCompleting = useRef(location.pathname === '/auth/callback');
  const heading = useRef<HTMLHeadingElement>(null);
  const noteIntent = useRef(snapshotIntentFromSearch(location.search));
  const currentView = useRef(view);
  currentView.current = view;
  const noteUnsafe = useRef(false);
  const rememberedNote = useRef<Extract<View, { phase: 'note' }> | null>(null);
  const noteAccount = useRef<string | null>(null);
  const noteAccess = useRef(false);
  const authorityListeners = useRef(new Set<() => void>());
  const subscribeAuthority = useCallback((retire: () => void) => {
    authorityListeners.current.add(retire);
    return () => { authorityListeners.current.delete(retire); };
  }, []);
  const retireNoteAccess = () => {
    noteAccess.current = false;
    for (const retire of authorityListeners.current) retire();
  };
  const rememberedDocumentId = useRef<string | null>(null);
  const verifiedIdentity = useRef<Identity | null>(null);
  const previousWorkspaceScope = useRef<Extract<View, { phase: 'project' | 'library' }> | null>(null);
  const [mountedNote, setMountedNote] = useState<Extract<View, { phase: 'note' }> | null>(null);
  const [leaveBlocked, setLeaveBlocked] = useState(false);
  const feedbackBeforeLeave = useRef<FeedbackBeforeLeave | undefined>(undefined);
  const feedbackRepository = useMemo(() => mountedNote ? serverProjectRepository(mountedNote.context.tenantId, mountedNote.context.workspaceId, mountedNote.role) : null,
    [mountedNote?.context, mountedNote?.role]);
  const forgetNote = () => {
    cancelStagedNative();
    if (nativeSlot.current?.hostSlot) disposeNativeHostSlot(nativeSlot.current.hostSlot);
    nativeSlot.current = null; treeOperation.current = null;
    setTreeBusy(false); setTreeError('');
    setActiveDocument(null);
    rememberedNote.current = null;
    noteAccount.current = null;
    retireNoteAccess();
    rememberedDocumentId.current = null;
    noteUnsafe.current = false;
    setMountedNote(null);
  };
  const rememberNote = (next: Omit<Extract<View, { phase: 'note' }>, 'principal'>, identity: Identity) => {
    const account = `${identity.issuer}\0${identity.subject}`;
    const slot: NativeSlot = { token: Symbol('native mount'), key: crypto.randomUUID(), session: captureAuthorizedSession() };
    nativeSlot.current = slot;
    const guardedContext = { ...next.context, authorizedFetch: ((...args: Parameters<typeof fetch>) => {
      if (nativeSlot.current !== slot || !slot.session.isCurrent() || noteAccount.current !== account) {
        throw new AuthError('forbidden', '현재 계정의 문서 접근 권한이 없습니다.');
      }
      if (!noteAccess.current) {
        const current = currentView.current;
        const denied = current.phase === 'error' && ['forbidden', 'unauthorized'].includes(current.error.kind);
        throw new AuthError(denied ? 'forbidden' : 'unavailable', '현재 문서 접근 권한을 확인하고 있습니다.');
      }
      return slot.session.requestFetch(...args);
    }) as typeof fetch };
    const retained = { ...next, principal: { issuer: identity.issuer, subject: identity.subject,
      currentUserId: identity.currentUserId ?? null }, context: guardedContext };
    verifiedIdentity.current = identity;
    noteAccount.current = account;
    noteAccess.current = true;
    rememberedDocumentId.current = next.context.documentId ?? null;
    setActiveDocument(rememberedDocumentId.current);
    rememberedNote.current = retained;
    setMountedNote(retained);
    setView(retained);
  };
  const canLeaveNote = () => {
    if (noteUnsafe.current) { setLeaveBlocked(true); return false; }
    setLeaveBlocked(false);
    return true;
  };

  useLayoutEffect(() => {
    if (view.phase !== 'checking' && !(view.phase === 'note' && !noteAccess.current)) hideCurtain();
    heading.current?.focus();
  }, [view]);

  async function checkAccess(intent = chosenIntent.current ?? currentIntent(), tenant = selected.current) {
    const run = ++generation.current;
    cancelStagedNative();
    treeOperation.current = null; setTreeBusy(false);
    const retainedNote = rememberedNote.current;
    retireNoteAccess();
    showCurtain();
    curtain().textContent = '현재 계정의 접근 권한 확인 중';
    if (retainedNote) setView({ ...retainedNote });
    else setView({ phase: 'checking' });
    if (!intent) { selected.current = null; chosenIntent.current = null; setView({ phase: 'entry' }); return; }
    try {
      const identity = await loadIdentity();
      if (run !== generation.current) return;
      verifiedIdentity.current = identity;
      if (retainedNote && noteAccount.current !== `${identity.issuer}\0${identity.subject}`) {
        forgetNote();
        throw new AuthError('forbidden', '계정이 바뀌었습니다. 이전 계정의 초안은 이 계정에 표시하지 않습니다.');
      }
      chosenIntent.current = intent;
      let direct = noteIntent.current ?? snapshotIntentFromSearch(location.search);
      let projectLink = projectLocation(location.search);
      const routeRequest = intent === 'user' ? authRouteRequest(location.href) : null;
      if (intent === 'operator') {
        selected.current = null;
        try { await confirmOperator(); }
        catch (error) {
          if (run !== generation.current) return;
          if (error instanceof AuthError && error.kind === 'forbidden') {
            history.replaceState(null, '', '/');
            setView({ phase: 'operator-denied' });
            return;
          }
          throw error;
        }
        if (run !== generation.current) return;
        history.replaceState(null, '', '/operator');
        setView({ phase: 'operator-opened' });
        return;
      }
      if (identity.tenants.length === 0) { selected.current = null; setView({ phase: 'empty' }); return; }
      if (!tenant && intent === 'user') {
        const requestedTenant = routeRequest?.route.tenantId ?? direct?.tenantId ?? projectLink?.tenant;
        if (requestedTenant) tenant = identity.tenants.find(item => item.tenantId === requestedTenant) ?? null;
        else if (routeRequest && identity.tenants.length === 1) tenant = identity.tenants[0];
      }
      if (routeRequest?.route.tenantId && tenant && routeRequest.route.tenantId !== tenant.tenantId) throw new AuthError('forbidden', '선택한 회사와 자료 주소가 다릅니다.');
      if (!tenant) {
        if (direct || routeRequest?.route.tenantId) throw new AuthError('forbidden', '선택한 회사에 접근할 수 없습니다.');
        setView({ phase: 'choose', identity, intent }); return;
      }
      const wantedTenantId = tenant.tenantId;
      const fresh = identity.tenants.find(item => item.tenantId === wantedTenantId);
      if (!fresh) { selected.current = null; setView({ phase: 'error', error: new AuthError('forbidden', '현재 계정에는 이 회사의 접근 권한이 없습니다.') }); return; }
      const role = await confirmTenant(fresh.tenantId);
      if (run !== generation.current) return;
      selected.current = fresh;
      if (intent === 'admin' && role !== 'owner' && role !== 'admin') setView({ phase: 'denied', tenant: fresh, role });
      else {
        const workspacePage = intent === 'user' ? await listWorkspaces(fresh.tenantId) : undefined;
        if (run !== generation.current) return;
        if (routeRequest && intent === 'user') {
          const route = routeRequest.route;
          let page = workspacePage!, workspace = page.items.find(item => item.id === route.workspaceId);
          const seen = new Set<string>();
          while (!workspace && page.nextCursor && !seen.has(page.nextCursor) && seen.size < 100) {
            seen.add(page.nextCursor); page = await listWorkspaces(fresh.tenantId, page.nextCursor);
            if (run !== generation.current) return;
            workspace = page.items.find(item => item.id === route.workspaceId);
          }
          if (!workspace) throw new AuthError('forbidden', '선택한 작업 공간에 접근할 수 없습니다.');
          if (route.kind === 'item') {
            const session = captureAuthorizedSession();
            const item = await resolveAuthenticatedRouteItem(routeRequest, fresh.tenantId, session.requestFetch,
              () => run === generation.current && session.isCurrent());
            if (run !== generation.current || !session.isCurrent()) return;
            if (item.kind === 'project') { direct = null; projectLink = { tenant: fresh.tenantId, workspace: workspace.id, project: item.id }; }
            else {
              direct = { tenantId: fresh.tenantId, workspaceId: workspace.id, documentId: item.id, product: item.product,
                ...(route.projectId ? { projectId: route.projectId } : {}), ...(route.mode ? { mode: route.mode } : {}) };
              projectLink = null;
            }
          } else {
            if (retainedNote) throw new AuthError('forbidden', '현재 원본을 종료한 뒤 작업 공간으로 이동하세요.');
            if (route.view === 'projects') setView({ phase: 'project', tenant: fresh, role, workspace });
            else {
              const documents = await listSnapshotDocuments(fresh.tenantId, workspace.id, 'note');
              if (run !== generation.current) return;
              setView({ phase: 'library', tenant: fresh, role, workspace, product: 'note', documents: documents.items, cursor: documents.nextCursor });
            }
            history.replaceState(history.state, '', formatWorkspaceRoute({ ...route, tenantId: fresh.tenantId })); return;
          }
        }
        if (retainedNote && !rememberedDocumentId.current && !direct && intent === 'user') {
          if (role === 'viewer') throw new AuthError('forbidden', '문서 작성 권한이 취소되었습니다.');
          let page = workspacePage!;
          let exists = page.items.some(item => item.id === retainedNote.context.workspaceId);
          const seen = new Set<string>();
          while (!exists && page.nextCursor && !seen.has(page.nextCursor) && seen.size < 100) {
            seen.add(page.nextCursor);
            page = await listWorkspaces(fresh.tenantId, page.nextCursor);
            if (run !== generation.current) return;
            exists = page.items.some(item => item.id === retainedNote.context.workspaceId);
          }
          if (!exists || retainedNote.context.tenantId !== fresh.tenantId) throw new AuthError('forbidden', '선택한 자료함에 접근할 수 없습니다.');
          noteAccess.current = true;
          setView(retainedNote);
          hideCurtain();
          return;
        }
        if (direct && intent === 'user') {
          const directWorkspace = direct.workspaceId;
          let page = workspacePage!;
          let workspace = page.items.find(item => item.id === directWorkspace);
          const seen = new Set<string>();
          while (!workspace && page.nextCursor && !seen.has(page.nextCursor) && seen.size < 100) {
            seen.add(page.nextCursor);
            page = await listWorkspaces(fresh.tenantId, page.nextCursor);
            if (run !== generation.current) return;
            workspace = page.items.find(item => item.id === directWorkspace);
          }
          if (!workspace) throw new AuthError('forbidden', '선택한 자료함에 접근할 수 없습니다.');
          const context = await openVerifiedSnapshot(fresh.tenantId, workspace.id, direct.documentId, role, direct.product);
          if (run !== generation.current) return;
          // Silent login restores the URL after this component was mounted on the callback.
          // Retain the freshly authorized project intent before native navigation reports its document.
          noteIntent.current = direct;
          const retainNativeRuntime = context.product === 'word' || context.product === 'slides' || context.product === 'site';
          if (retainedNote && (retainNativeRuntime || role !== 'viewer' || retainedNote.context.role === 'viewer') && retainedNote.context.tenantId === context.tenantId &&
            retainedNote.context.workspaceId === context.workspaceId && retainedNote.context.product === context.product && rememberedDocumentId.current === context.documentId) {
            // Preserve native Word/Slides runtimes and protected drafts while applying this fresh role.
            // Keep its guarded fetch identity so role changes do not reload the initial snapshot.
            const retained = retainNativeRuntime
              ? { ...retainedNote, role, context: { ...retainedNote.context, role } }
              : retainedNote;
            rememberedNote.current = retained;
            setMountedNote(retained);
            noteAccess.current = true;
            setView(retained);
            const installed = captureProductNavigation();
            if (installed?.isCurrent() && installed.product === context.product && installed.id === context.documentId) commitNativeLocation(context.documentId!, direct.projectId ?? null);
            hideCurtain();
          } else if (retainedNote) throw new AuthError('forbidden', '이 초안을 다시 편집할 권한이 없습니다.');
          else rememberNote({ phase: 'note', tenant: fresh, role, workspace, context }, identity);
          return;
        }
        if (projectLink && intent === 'user') {
          const projectWorkspace = projectLink.workspace;
          let page = workspacePage!; const seen = new Set<string>();
          let workspace = page.items.find(one => one.id === projectWorkspace);
          while (!workspace && page.nextCursor && !seen.has(page.nextCursor)) {
            seen.add(page.nextCursor); page = await listWorkspaces(fresh.tenantId, page.nextCursor); if (run !== generation.current) return;
            workspace = page.items.find(one => one.id === projectWorkspace);
          }
          if (fresh.tenantId !== projectLink.tenant || !workspace) throw new AuthError('forbidden', '프로젝트의 작업 공간에 접근할 수 없습니다.');
          history.replaceState(history.state, '', formatWorkspaceRoute({ kind: 'item', tenantId: fresh.tenantId, workspaceId: workspace.id, itemId: projectLink.project }));
          setView({ phase: 'project', tenant: fresh, role, workspace }); return;
        }
        history.replaceState(null, '', intent === 'admin' ? '/admin' : '/');
        setView({ phase: 'opened', intent, tenant: fresh, role, workspaces: workspacePage?.items, workspaceCursor: workspacePage?.nextCursor });
      }
    } catch (error) {
      if (run !== generation.current) return;
      if (retainedNote && asAuthError(error).kind === 'unavailable') {
        const overlay = curtain();
        const message = document.createElement('p');
        message.textContent = '서버 연결을 확인하지 못했습니다. 편집 중인 내용은 이 화면에 보존했습니다.';
        const retry = document.createElement('button');
        retry.textContent = '권한 다시 확인';
        retry.onclick = () => void checkAccess();
        overlay.replaceChildren(message, retry);
        return;
      }
      selected.current = null;
      setView({ phase: 'error', error: asAuthError(error) });
    }
  }

  useEffect(() => {
    showCurtain();
    const resumeIntent = location.pathname === '/auth/callback' ? null : consumeResumeIntent();
    if (location.pathname === '/auth/callback') {
      const run = ++generation.current;
      void finishLogin().then(intent => {
        authCompleting.current = false;
        if (run !== generation.current) { clearSession(); return; }
        void checkAccess(intent);
      }).catch(error => {
        authCompleting.current = false;
        if (run === generation.current) setView({ phase: 'error', error: asAuthError(error) });
      });
    } else if (sessionStorage.getItem('wonffice.oidc.logout-return')) {
      setView({ phase: 'entry', message: consumeLogoutReturn() ? '로그아웃했습니다.' : '로그인 화면으로 돌아왔습니다.' });
    } else if (resumeIntent) {
      // A fresh navigation has no in-memory token. Reuse only the provider SSO session.
      void login(resumeIntent, false, true);
    } else {
      setView({ phase: 'entry', message: consumeLogoutReturn() ? '로그아웃했습니다.' : location.pathname === '/operator' ? '서비스 운영 권한을 확인하려면 로그인해 주세요.' : location.pathname === '/admin' ? '회사 관리자 권한을 확인하려면 로그인해 주세요.' : undefined });
    }
    const onPageHide = () => showCurtain();
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted && !authCompleting.current) void checkAccess(); };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') showCurtain();
      else if (!authCompleting.current) void checkAccess();
    };
    const onFocus = () => { if (!authCompleting.current) void checkAccess(); };
    const onStorage = (event: StorageEvent) => {
      if (!isLogoutEvent(event)) return;
      showCurtain();
      ++generation.current;
      clearSession();
      forgetNote();
      verifiedIdentity.current = null;
      selected.current = null;
      chosenIntent.current = null;
      setView({ phase: 'entry', message: '다른 창에서 로그아웃했습니다. 다시 로그인해 주세요.' });
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  async function login(intent: EntryIntent, forceAccountChoice = false, silent = false) {
    const run = ++generation.current;
    showCurtain();
    setView({ phase: 'checking' });
    try { await beginLogin(intent, forceAccountChoice, silent); }
    catch (error) { if (run === generation.current) setView({ phase: 'error', error: asAuthError(error) }); }
  }

  async function open(tenant: TenantAccess, intent: EntryIntent) {
    noteIntent.current = null;
    selected.current = tenant;
    chosenIntent.current = intent;
    await checkAccess(intent, tenant);
  }

  async function logout() {
    const started = generation.current, originalView = currentView.current, account = noteAccount.current, originalNote = rememberedNote.current;
    const ownsLogout = () => started === generation.current && currentView.current === originalView && noteAccount.current === account && rememberedNote.current === originalNote;
    const feedback = feedbackBeforeLeave.current;
    if (feedback && !await feedback()) return;
    if (!ownsLogout()) return;
    if ((rememberedNote.current || productDocumentHost()) && !await prepareProductAccountExit()) { if (ownsLogout()) setLeaveBlocked(true); return; }
    if (!ownsLogout()) return;
    if (feedbackBeforeLeave.current !== feedback || (feedback && !feedback.isPrepared?.())) { setLeaveBlocked(true); return; }
    noteUnsafe.current = false;
    setLeaveBlocked(false);
    forgetNote();
    verifiedIdentity.current = null;
    ++generation.current;
    showCurtain();
    selected.current = null;
    chosenIntent.current = null;
    noteIntent.current = null;
    setView({ phase: 'checking' });
    const logoutGeneration = generation.current;
    const redirected = await providerLogout();
    if (!redirected && generation.current === logoutGeneration) setView({ phase: 'entry', message: '이 브라우저의 로그인 정보는 지웠습니다. 로그인 서버의 세션 종료는 확인하지 못했습니다. 다시 로그인할 때 계정을 입력해야 합니다.' });
  }

  async function switchAccount() {
    await logout();
  }

  async function enterWorkspace(tenant: TenantAccess, role: TenantRole, workspace: WorkspaceAccess, product?: SnapshotProduct) {
    if (!product) {
      setView({ phase: 'project', tenant, role, workspace });
      history.replaceState(history.state, '', formatWorkspaceRoute({ kind: 'workspace', tenantId: tenant.tenantId, workspaceId: workspace.id, view: 'projects' }));
      return;
    }
    const run = ++generation.current;
    showCurtain(); setView({ phase: 'checking' });
    try {
      const page = await listSnapshotDocuments(tenant.tenantId, workspace.id, product);
      if (run !== generation.current) return;
      setView({ phase: 'library', tenant, role, workspace, product, documents: page.items, cursor: page.nextCursor });
      history.replaceState(history.state, '', formatWorkspaceRoute({ kind: 'workspace', tenantId: tenant.tenantId, workspaceId: workspace.id, view: 'library' }));
    } catch (error) { if (run === generation.current) setView({ phase: 'error', error: asAuthError(error) }); }
  }

  async function moreWorkspaces(current: Extract<View, { phase: 'opened' }>) {
    if (!current.workspaceCursor) return;
    const run = generation.current;
    try {
      const page = await listWorkspaces(current.tenant.tenantId, current.workspaceCursor);
      if (run !== generation.current) return;
      if (page.nextCursor === current.workspaceCursor || page.items.some(item => current.workspaces?.some(existing => existing.id === item.id))) {
        throw new AuthError('unavailable', '자료함 목록을 끝까지 불러오지 못했습니다.');
      }
      setView({ ...current, workspaces: [...(current.workspaces ?? []), ...page.items], workspaceCursor: page.nextCursor });
    } catch (error) { if (run === generation.current) setView({ phase: 'error', error: asAuthError(error) }); }
  }

  async function moreDocuments(current: Extract<View, { phase: 'library' }>) {
    if (!current.cursor) return;
    const run = generation.current;
    try {
      const page = await listSnapshotDocuments(current.tenant.tenantId, current.workspace.id, current.product, current.cursor);
      if (run !== generation.current) return;
      if (page.nextCursor === current.cursor || page.items.some(item => current.documents.some(existing => existing.documentId === item.documentId))) {
        throw new AuthError('unavailable', '문서 목록을 끝까지 불러오지 못했습니다.');
      }
      setView({ ...current, documents: [...current.documents, ...page.items], cursor: page.nextCursor });
    } catch (error) { if (run === generation.current) setView({ phase: 'error', error: asAuthError(error) }); }
  }

  async function createSnapshot(current: Extract<View, { phase: 'library' }>) {
    const run = ++generation.current;
    showCurtain(); setView({ phase: 'checking' });
    try {
      const identity = await loadIdentity();
      if (!identity.tenants.some(item => item.tenantId === current.tenant.tenantId)) throw new AuthError('forbidden', '이 회사에 접근할 수 없습니다.');
      const role = await confirmTenant(current.tenant.tenantId);
      if (role === 'viewer') throw new AuthError('forbidden', '문서를 만들 권한이 없습니다.');
      await listSnapshotDocuments(current.tenant.tenantId, current.workspace.id, current.product);
      if (run !== generation.current) return;
      noteIntent.current = null;
      history.replaceState(null, '', '/');
      rememberNote({ phase: 'note', tenant: current.tenant, role, workspace: current.workspace,
        context: { product: current.product, tenantId: current.tenant.tenantId, workspaceId: current.workspace.id, role, authorizedFetch } }, identity);
    } catch (error) { if (run === generation.current) setView({ phase: 'error', error: asAuthError(error) }); }
  }

  async function enterNote(current: Extract<View, { phase: 'library' }>, documentId: string, projectId?: string) {
    const run = ++generation.current;
    showCurtain(); setView({ phase: 'checking' });
    try {
      const identity = await loadIdentity();
      if (!identity.tenants.some(item => item.tenantId === current.tenant.tenantId)) throw new AuthError('forbidden', '이 회사에 접근할 수 없습니다.');
      const role = await confirmTenant(current.tenant.tenantId);
      const context = await openVerifiedSnapshot(current.tenant.tenantId, current.workspace.id, documentId, role, current.product);
      if (run !== generation.current) return;
      noteIntent.current = { tenantId: context.tenantId, workspaceId: context.workspaceId, documentId, product: context.product, ...(projectId ? { projectId, mode: 'read' as const } : {}) };
      if (run !== generation.current) return;
      rememberNote({ phase: 'note', tenant: current.tenant, role, workspace: current.workspace, context }, identity);
    } catch (error) { if (run === generation.current) setView({ phase: 'error', error: asAuthError(error) }); }
  }

  function commitNativeLocation(documentId: string, projectId: string | null | undefined = noteIntent.current?.projectId,
    action: 'replace' | 'push' | 'traverse' = 'replace', traversalIndex?: number) {
    const native = rememberedNote.current;
    if (!native) return;
    rememberedDocumentId.current = documentId; setActiveDocument(documentId);
    const previous = noteIntent.current;
    const sameOriginal = previous?.tenantId === native.context.tenantId && previous.workspaceId === native.context.workspaceId &&
      previous.product === native.context.product && previous.documentId === documentId && previous.projectId === (projectId ?? undefined);
    const mode = sameOriginal ? previous.mode : projectId ? 'read' as const : undefined;
    noteIntent.current = { tenantId: native.context.tenantId, workspaceId: native.context.workspaceId, documentId,
      product: native.context.product, ...(projectId ? { projectId } : {}), ...(mode ? { mode } : {}) };
    const state = history.state && typeof history.state === 'object' && !Array.isArray(history.state) ? history.state as Record<string, unknown> : {};
    const owner = historyOwner.current.owner;
    if (action === 'push') {
      // The currently displayed source must have an owned cursor before a user
      // selection creates the next entry. Background identity reports replace it.
      if (nativeHistoryEntry(state)?.owner !== owner)
        history.replaceState({ ...state, [nativeHistoryKey]: { owner, index: historyOwner.current.index } }, '', location.href);
      historyOwner.current.index++;
      history.pushState({ ...state, [nativeHistoryKey]: { owner, index: historyOwner.current.index } }, '', snapshotIntentURL(noteIntent.current));
    } else {
      if (action === 'traverse' && traversalIndex !== undefined) historyOwner.current.index = traversalIndex;
      history.replaceState({ ...state, [nativeHistoryKey]: { owner, index: historyOwner.current.index } }, '', snapshotIntentURL(noteIntent.current));
    }
  }
  useEffect(() => {
    const publishInstalled = () => {
      const native = rememberedNote.current, slot = nativeSlot.current, guard = captureProductNavigation();
      if (!native || treeOperation.current || !slot?.session.isCurrent() || !noteAccess.current || currentView.current.phase !== 'note' ||
        !guard?.isCurrent() || guard.product !== native.context.product || guard.id !== rememberedDocumentId.current) return;
      commitNativeLocation(guard.id);
    };
    publishInstalled();
    window.addEventListener('wonffice:host-change', publishInstalled);
    return () => window.removeEventListener('wonffice:host-change', publishInstalled);
  }, [mountedNote]);
  async function openTreeOriginal(row: ServerCatalogRow, projectId?: string,
    traversal?: { index: number; epoch: number; url: string }): Promise<boolean> {
    if (treeOperation.current || !row.nativeOpenSupported) return false;
    const scope = rememberedNote.current ?? (currentView.current.phase === 'project' || currentView.current.phase === 'library' ? currentView.current : null);
    if (!scope) return false;
    const run = generation.current, slot = nativeSlot.current, session = captureAuthorizedSession(), token = Symbol('tree open');
    const owns = () => treeOperation.current === token && run === generation.current && nativeSlot.current === slot && session.isCurrent() &&
      (!slot || (noteAccess.current && slot.session.isCurrent())) && (!traversal || (historyEpoch.current === traversal.epoch && location.href === traversal.url));
    treeOperation.current = token; setTreeBusy(true); setTreeError('');
    try {
      const native = rememberedNote.current;
      if (native && row.product === native.context.product && row.documentId === rememberedDocumentId.current) {
        const same = captureProductNavigation();
        if (!owns() || !same?.isCurrent() || same.product !== row.product || same.id !== row.documentId) throw new Error(t('workspace.tree.nativeUnavailable'));
        return true; // A placement alias preserves the current Project, feedback draft and native selection.
      }
      const feedback = feedbackBeforeLeave.current;
      if (feedback && !await feedback()) return false;
      const feedbackInput = feedback?.capturePreparedInput?.();
      if (!owns()) return false;
      if (native) {
        const guard = captureProductNavigation(slot?.hostSlot);
        if (!guard || guard.product !== native.context.product || guard.id !== rememberedDocumentId.current) throw new Error(t('workspace.tree.nativeUnavailable'));
        if (row.product !== native.context.product) {
          if (!await guard.prepare() || !owns()) throw new Error(t('workspace.tree.nativeUnavailable'));
          const identity = await loadIdentity();
          if (!owns()) return false;
          if (`${identity.issuer}\0${identity.subject}` !== noteAccount.current ||
            !identity.tenants.some(item => item.tenantId === scope.tenant.tenantId)) throw new AuthError('forbidden', t('workspace.tree.nativeUnavailable'));
          const role = await confirmTenant(scope.tenant.tenantId);
          if (!owns()) return false;
          if (role !== native.role) throw new AuthError('forbidden', t('workspace.tree.nativeUnavailable'));
          const context = await openVerifiedSnapshot(scope.tenant.tenantId, scope.workspace.id, row.documentId, role, row.product, session.requestFetch);
          if (!owns()) return false;
          await readProductDocument(row.product, context.snapshotText!);
          if (!owns()) return false;
          let ready!: (guard: ProductNavigationGuard | false) => void;
          const installed = new Promise<ProductNavigationGuard | false>(resolve => { ready = resolve; });
          const target: NativeSlot = { token: Symbol('native target'), key: crypto.randomUUID(), session,
            hostSlot: createNativeHostSlot(value => { if (!value) { ready(false); return; } if (value.product === row.product && value.id === row.documentId) ready(value); }) };
          const targetFetch = ((...args: Parameters<typeof fetch>) => {
            if (!session.isCurrent() || !noteAccess.current || noteAccount.current !== `${identity.issuer}\0${identity.subject}` ||
              (nativeSlot.current !== target && !owns())) throw new AuthError('forbidden', t('workspace.tree.nativeUnavailable'));
            return session.requestFetch(...args);
          }) as typeof fetch;
          const targetView: NativeView = { phase: 'note', tenant: scope.tenant, workspace: scope.workspace, role,
            principal: { issuer: identity.issuer, subject: identity.subject, currentUserId: identity.currentUserId ?? null },
            context: { ...context, authorizedFetch: targetFetch } };
          const fail = (message: string) => { if (pendingNative.current?.slot === target) { setTreeError(message); ready(false); } };
          pendingNative.current = { slot: target, cancel: () => ready(false) };
          setStagedNative({ value: targetView, slot: target, fail });
          try {
            const targetGuard = await installed;
            if (!targetGuard || !owns() || !targetGuard.isCurrent()) throw new Error(t('workspace.tree.nativeUnavailable'));
            const currentRole = await confirmTenant(scope.tenant.tenantId);
            if (!owns() || currentRole !== role || !targetGuard.isCurrent()) throw new AuthError('forbidden', t('workspace.tree.nativeUnavailable'));
            const feedback = feedbackBeforeLeave.current;
            if (feedback && !await feedback()) throw new Error(t('workspace.tree.nativeUnavailable'));
            if (!owns() || !targetGuard.isCurrent()) throw new Error(t('workspace.tree.nativeUnavailable'));
            // The source may receive more input while the target loads. Drain it
            // again while its exact host, DOM, history and authority still own it.
            if (!await guard.prepare() || !owns() || !targetGuard.isCurrent() || feedbackBeforeLeave.current !== feedback || (feedback && !feedback.isPrepared?.())) throw new Error(t('workspace.tree.nativeUnavailable'));
            const promoted = promoteProductNavigation(guard, targetGuard);
            if (!promoted || !promoted.isCurrent()) throw new Error(t('workspace.tree.nativeUnavailable'));
            pendingNative.current = null;
            nativeSlot.current = target; rememberedNote.current = targetView; verifiedIdentity.current = identity;
            noteUnsafe.current = false; rememberedDocumentId.current = row.documentId;
            setMountedNote(targetView); setView(targetView); setStagedNative(null);
            // Cross-product history restoration is a separate native contract.
            // Preserve its prior replace behavior until that path is qualified.
            commitNativeLocation(row.documentId, projectId ?? null, traversal ? 'traverse' : 'replace', traversal?.index);
          } finally {
            if (nativeSlot.current !== target) cancelStagedNative(target);
          }
          return true;
        }
        if (!guard.open) throw new Error(t('workspace.tree.nativeUnavailable'));
        let feedbackPrepared = false, targetWitness: ProductNavigationGuard | undefined;
        const openIntentCurrent = () => {
          if (!owns()) return false;
          if (guard.isCurrent()) {
            feedbackPrepared = feedbackBeforeLeave.current === feedback && (!feedback || feedback.isPrepared?.() === true && feedbackInput?.isCurrent() === true);
            return feedbackPrepared;
          }
          // Native installation retires the source feedback owner synchronously.
          // Admit only the first exact target lifetime after a prepared source check.
          if (!feedbackPrepared || guard.id === row.documentId) return false;
          if (!targetWitness) {
            const target = captureProductNavigation(slot?.hostSlot);
            if (target?.isCurrent() && target.product === row.product && target.id === row.documentId) targetWitness = target;
          }
          return targetWitness?.isCurrent() === true && (!feedback || feedbackInput?.isCurrent() === true);
        };
        const installed = await guard.open(row.documentId, openIntentCurrent);
        if (!owns()) return false;
        if (!installed || !installed.isCurrent() || !openIntentCurrent()) throw new Error(t('workspace.tree.nativeUnavailable'));
        commitNativeLocation(row.documentId, projectId ?? null, traversal ? 'traverse' : row.product === 'note' ? 'push' : 'replace', traversal?.index);
        return true;
      }
      const identity = verifiedIdentity.current;
      if (!identity) return false;
      const context = await openVerifiedSnapshot(scope.tenant.tenantId, scope.workspace.id, row.documentId, scope.role, row.product, session.requestFetch);
      if (!owns()) return false;
      await readProductDocument(row.product, context.snapshotText!);
      if (!owns()) return false;
      noteIntent.current = { tenantId: context.tenantId, workspaceId: context.workspaceId, documentId: row.documentId, product: context.product,
        ...(projectId ? { projectId, mode: 'read' as const } : {}) };
      rememberNote({ phase: 'note', tenant: scope.tenant, role: scope.role, workspace: scope.workspace, context }, identity);
      return true;
    } catch (error) { if (owns()) setTreeError(error instanceof Error ? error.message : t('workspace.tree.nativeUnavailable')); }
    finally { if (treeOperation.current === token) { treeOperation.current = null; setTreeBusy(false); } }
    return false;
  }
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const refuseUnownedHistory = () => {
        curtain().textContent = t('workspace.tree.nativeUnavailable');
        showCurtain(); setTreeError(t('workspace.tree.nativeUnavailable'));
      };
      const entry = nativeHistoryEntry(event.state);
      const restoring = restoringHistory.current;
      if (restoring) {
        restoringHistory.current = null;
        if (entry?.owner === restoring.owner && entry.index === restoring.index &&
          location.href === (noteIntent.current ? new URL(snapshotIntentURL(noteIntent.current), location.origin).href : '')) return;
        refuseUnownedHistory();
        return;
      }
      const source = rememberedNote.current;
      if (!source || currentView.current.phase !== 'note' || !noteAccess.current) return;
      const owner = historyOwner.current.owner, sourceIndex = historyOwner.current.index;
      const epoch = ++historyEpoch.current;
      treeOperation.current = null; cancelStagedNative(); setTreeBusy(false);
      // An entry marker is a cursor, never an authority or a cached original.
      if (!entry || entry.owner !== owner || entry.index >= history.length || Math.abs(sourceIndex - entry.index) >= history.length) {
        refuseUnownedHistory();
        return;
      }
      if (entry.index === sourceIndex) {
        if (!noteIntent.current || location.href !== new URL(snapshotIntentURL(noteIntent.current), location.origin).href) refuseUnownedHistory();
        return;
      }
      const url = location.href, account = noteAccount.current, slot = nativeSlot.current;
      const current = () => historyEpoch.current === epoch && location.href === url &&
        rememberedNote.current === source && noteAccount.current === account && nativeSlot.current === slot &&
        noteAccess.current && slot?.session.isCurrent() === true && historyOwner.current.index === sourceIndex;
      const restore = () => {
        if (!current()) return;
        if (nativeHistoryEntry(history.state)?.owner !== owner) {
          refuseUnownedHistory();
          return;
        }
        restoringHistory.current = { owner, index: sourceIndex };
        history.go(sourceIndex - entry.index);
      };
      void (async () => {
        try {
          const request = authRouteRequest(url);
          if (!request || request.route.kind !== 'item' || request.route.workspaceId !== source.workspace.id ||
            (request.route.tenantId && request.route.tenantId !== source.tenant.tenantId)) throw new Error(t('workspace.tree.nativeUnavailable'));
          const session = captureAuthorizedSession();
          if (!session.isCurrent() || !current()) return;
          const identity = await loadIdentity();
          if (!current()) return;
          if (`${identity.issuer}\0${identity.subject}` !== account || !identity.tenants.some(one => one.tenantId === source.tenant.tenantId))
            throw new AuthError('forbidden', t('workspace.tree.nativeUnavailable'));
          const role = await confirmTenant(source.tenant.tenantId);
          if (!current()) return;
          if (role !== source.role) throw new AuthError('forbidden', t('workspace.tree.nativeUnavailable'));
          const item = await resolveAuthenticatedRouteItem(request, source.tenant.tenantId, session.requestFetch, current);
          if (!current()) return;
          if (item.kind !== 'document' || item.product !== source.context.product) throw new Error(t('workspace.tree.nativeUnavailable'));
          const context = await openVerifiedSnapshot(source.tenant.tenantId, source.workspace.id, item.id, role, item.product, session.requestFetch);
          if (!current()) return;
          if (context.product !== item.product || context.documentId !== item.id) throw new Error(t('workspace.tree.nativeUnavailable'));
          const row: ServerCatalogRow = { key: JSON.stringify([source.tenant.tenantId, source.workspace.id, item.product, item.id]),
            title: '', product: item.product, documentId: item.id, mode: 'snapshot', revision: 0, nativeOpenSupported: true };
          if (!await openTreeOriginal(row, request.route.projectId, { index: entry.index, epoch, url })) restore();
        } catch (error) {
          if (current()) { setTreeError(error instanceof Error ? error.message : t('workspace.tree.nativeUnavailable')); restore(); }
        }
      })();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  async function navigateTree(destination: 'projects' | 'library', projectId?: string) {
    if (treeOperation.current) return;
    const scope = rememberedNote.current ?? (currentView.current.phase === 'project' || currentView.current.phase === 'library' ? currentView.current : null);
    if (!scope) return;
    const run = generation.current, slot = nativeSlot.current, session = captureAuthorizedSession(), token = Symbol('tree destination');
    const owns = () => treeOperation.current === token && run === generation.current && nativeSlot.current === slot && session.isCurrent() && (!slot || (noteAccess.current && slot.session.isCurrent()));
    const feedback = feedbackBeforeLeave.current, guard = rememberedNote.current ? captureProductNavigation() : undefined;
    const feedbackPrepared = () => feedbackBeforeLeave.current === feedback && (!feedback || !!feedback.isPrepared?.());
    // Catalog departure protects the latest private draft without publishing it.
    // Keep the captured native owner for both preparations around the list read.
    const prepareDeparture = async () => !!guard && guard.isCurrent() &&
      await (destination === 'library' ? guard.prepareAccountExit?.() ?? false : guard.prepare()) && guard.isCurrent();
    treeOperation.current = token; setTreeBusy(true); setTreeError('');
    try {
      if (feedback && !await feedback()) return;
      if (!owns()) return;
      if (rememberedNote.current) {
        if (!guard || !await prepareDeparture()) { if (owns()) setLeaveBlocked(true); return; }
        if (!owns()) return;
      }
      if (destination === 'library') {
        const page = await listSnapshotDocuments(scope.tenant.tenantId, scope.workspace.id, 'note');
        if (!owns()) return;
        if (!feedbackPrepared()) { setLeaveBlocked(true); return; }
        // Input can change while the catalog read awaits. Prepare the exact
        // native owner again before retiring its still-interactive source.
        if (guard && (!guard.isCurrent() || !await prepareDeparture())) { if (owns()) setLeaveBlocked(true); return; }
        if (!owns()) return;
        if (!feedbackPrepared() || (guard && !guard.isCurrent())) { setLeaveBlocked(true); return; }
        forgetNote(); noteIntent.current = null;
        history.replaceState(null, '', formatWorkspaceRoute({ kind: 'workspace', tenantId: scope.tenant.tenantId, workspaceId: scope.workspace.id, view: 'library' }));
        setView({ phase: 'library', tenant: scope.tenant, role: scope.role, workspace: scope.workspace, product: 'note', documents: page.items, cursor: page.nextCursor });
      } else {
        if (!owns()) return;
        if (!feedbackPrepared() || (guard && !guard.isCurrent())) { setLeaveBlocked(true); return; }
        forgetNote(); noteIntent.current = null;
        history.replaceState(null, '', formatWorkspaceRoute(projectId ? { kind: 'item', tenantId: scope.tenant.tenantId, workspaceId: scope.workspace.id, itemId: projectId } : { kind: 'workspace', tenantId: scope.tenant.tenantId, workspaceId: scope.workspace.id, view: 'projects' }));
        setView({ phase: 'project', tenant: scope.tenant, role: scope.role, workspace: scope.workspace });
      }
    } catch (error) { if (owns()) setTreeError(error instanceof Error ? error.message : t('workspace.tree.nativeUnavailable')); }
    finally { if (treeOperation.current === token) { treeOperation.current = null; setTreeBusy(false); } }
  }

  const compactEditor = view.phase === 'note' && ['note', 'word', 'slides', 'site'].includes(view.context.product) && !!editorRenderer;
  const returnToProject = async () => {
    if (view.phase !== 'note' || !canLeaveNote()) return;
    const started = generation.current, current = view, account = noteAccount.current, originalNote = rememberedNote.current, project = noteIntent.current?.projectId;
    const ownsReturn = () => started === generation.current && currentView.current === current && account === noteAccount.current && rememberedNote.current === originalNote;
    const feedback = feedbackBeforeLeave.current;
    if (feedback && !await feedback()) return;
    if (!ownsReturn()) return;
    if ((rememberedNote.current || productDocumentHost()) && !await prepareProductNavigation()) { if (ownsReturn()) setLeaveBlocked(true); return; }
    if (!ownsReturn()) return;
    if (feedbackBeforeLeave.current !== feedback || (feedback && !feedback.isPrepared?.())) { setLeaveBlocked(true); return; }
    forgetNote(); noteIntent.current = null;
    if (project) {
      history.replaceState(null, '', formatWorkspaceRoute({ kind: 'item', tenantId: current.tenant.tenantId, workspaceId: current.context.workspaceId, itemId: project }));
      setView({ phase: 'project', tenant: current.tenant, role: current.role, workspace: current.workspace });
    } else { history.replaceState(null, '', '/'); await checkAccess('user', current.tenant); }
  };
  const headerNavigation = view.phase === 'note' ? <div className="office-editor-product office-auth-native-navigation">
    {treeBusy && <IconButton label={t('document.library.cancel')} onClick={() => { treeOperation.current = null; cancelStagedNative(); setTreeBusy(false); }}><Icon name="close" /></IconButton>}
    <ProductLabel iconOnly name={productName(view.context.product)} />
    {noteIntent.current?.projectId && activeDocument && feedbackRepository && <ProjectFeedback key={`${noteAccount.current}:${noteIntent.current.projectId}:${activeDocument}`} repository={feedbackRepository} projectId={noteIntent.current.projectId} beforeLeave={feedbackBeforeLeave}
      presentation={view.context.product === 'note' ? 'task' : 'feedback'} document={{ product: view.context.product, id: activeDocument }} />}
  </div> : null;
  const renderedSlot = nativeSlot.current, renderedAuthority = generation.current;
  const content = <main className="office-auth" data-editor-open={compactEditor || undefined}>
    {!compactEditor && view.phase !== 'project' && <header className="office-auth-brand"><span>wonffice</span><small>서비스 로그인 후보 · 서버 권한 확인</small></header>}
    {mountedNote && leaveBlocked && <p role="alert">현재 입력을 복구 가능한 저장소에 보관하지 못했습니다. 저장 상태를 확인한 뒤 다시 시도하세요. 이 화면은 그대로 유지합니다.</p>}
    {view.phase === 'checking' && <section className="office-auth-panel"><h1 tabIndex={-1} ref={heading}>접근 권한 확인 중</h1><p>현재 계정과 회사 권한을 서버에서 확인하고 있습니다.</p></section>}
    {view.phase === 'entry' && <section className="office-auth-panel"><h1 tabIndex={-1} ref={heading}>Wonffice에 들어가기</h1><p>로그인 뒤 현재 계정의 권한을 확인합니다.</p>{view.message && <p role="status">{view.message}</p>}
      <div className="office-auth-actions"><button onClick={() => void login('user')}>일반 사용자로 들어가기</button><button onClick={() => void login('admin')}>회사 관리자로 들어가기</button><button onClick={() => void login('operator')}>Wonffice 전체 서비스 운영자로 들어가기</button></div>
      <p className="office-auth-note">진입 선택은 권한을 부여하지 않습니다. 회사 관리자와 서비스 운영자 권한은 각각 서버에서 확인합니다.</p>
    </section>}
    {view.phase === 'empty' && <section className="office-auth-panel"><h1 tabIndex={-1} ref={heading}>접근할 수 있는 회사가 없습니다</h1><p>로그인은 완료됐지만 현재 계정에 활성 회사가 없습니다.</p>
      <div className="office-auth-actions">{mountedNote && <button onClick={() => void checkAccess('user', mountedNote.tenant)}>권한 다시 확인</button>}<button onClick={() => void switchAccount()}>다른 계정으로 로그인</button><button onClick={() => void logout()}>로그아웃</button></div>
    </section>}
    {view.phase === 'choose' && <section className="office-auth-panel"><h1 tabIndex={-1} ref={heading}>회사를 선택하세요</h1><p>{view.intent === 'admin' ? '관리자로 들어갈 회사의 현재 권한을 확인합니다.' : '사용할 회사의 현재 권한을 확인합니다.'}</p>
      <ul className="office-auth-tenants">{view.identity.tenants.map(tenant => <li key={tenant.tenantId}><button onClick={() => void open(tenant, view.intent)}><strong>{tenant.name}</strong><span>{roleName(tenant.role)}</span></button></li>)}</ul>
      <div className="office-auth-actions"><button onClick={() => void switchAccount()}>다른 계정으로 로그인</button><button onClick={() => void logout()}>로그아웃</button></div>
    </section>}
    {view.phase === 'opened' && <section className="office-auth-panel"><h1 tabIndex={-1} ref={heading}>{view.intent === 'admin' ? `${view.tenant.name} · 회사 관리자` : `${view.tenant.name} · 사용자`}</h1>
      <p>서버가 확인한 현재 역할: {roleName(view.role)}</p>
      {view.intent === 'admin' ? <p className="office-auth-note">관리 업무 화면은 아직 연결되지 않았습니다. 서비스 운영자 권한은 회사 관리자 권한과 별도로 정합니다.</p> :
        <>
          <h2>자료함</h2>
          {view.workspaces?.length === 0 && <p>이 회사에는 자료함이 없습니다. 관리자가 자료함을 준비해야 합니다.</p>}
          <ul className="office-auth-tenants">{view.workspaces?.map(workspace => <li key={workspace.id}><button onClick={() => void enterWorkspace(view.tenant, view.role, workspace)}>{workspace.name}</button></li>)}</ul>
          {view.workspaceCursor && <button onClick={() => void moreWorkspaces(view)}>자료함 더 보기</button>}
        </>}
      <div className="office-auth-actions"><button onClick={() => void checkAccess()}>권한 다시 확인</button><button onClick={() => { selected.current = null; void checkAccess(); }}>회사 바꾸기</button>
        {view.intent === 'admin' && <button onClick={() => void open(view.tenant, 'user')}>사용자 화면 보기</button>}
        <button onClick={() => void switchAccount()}>계정 전환</button><button onClick={() => void logout()}>로그아웃</button></div>
    </section>}
    {view.phase === 'project' && <ConnectedWorkspace tenant={view.tenant.tenantId} workspace={view.workspace.id} role={view.role} onLibrary={() => void enterWorkspace(view.tenant, view.role, view.workspace, 'note')} onOpen={async (project, doc) => {
      await enterNote({ phase: 'library', tenant: view.tenant, role: view.role, workspace: view.workspace, product: doc.product, documents: [], cursor: null }, doc.id, project);
    }} />}
    {view.phase === 'library' && <section className="office-auth-panel"><h1 tabIndex={-1} ref={heading}>{view.workspace.name} · {productName(view.product)} 자료</h1>
      <button onClick={() => void enterWorkspace(view.tenant, view.role, view.workspace)}>프로젝트</button>
      <div className="office-auth-actions">{(['note', 'word', 'slides', 'site'] as const).map(product => <button key={product} aria-pressed={view.product === product} onClick={() => void enterWorkspace(view.tenant, view.role, view.workspace, product)}>{`${productName(product)} 자료`}</button>)}</div>
      {view.documents.length === 0 && <p>이 자료함에는 저장된 {productName(view.product)} 문서가 없습니다.</p>}
      <ul className="office-auth-tenants">{view.documents.map(item => <li key={item.documentId}><button onClick={() => void enterNote(view, item.documentId)}>{item.title}</button></li>)}</ul>
      {view.cursor && <button onClick={() => void moreDocuments(view)}>문서 더 보기</button>}
      {view.role !== 'viewer' && <button onClick={() => void createSnapshot(view)}>새 {productName(view.product)} 만들기</button>}
      <div className="office-auth-actions"><button onClick={() => void checkAccess('user', view.tenant)}>자료함 목록</button><button onClick={() => void logout()}>로그아웃</button></div>
    </section>}
    {[(mountedNote && renderedSlot ? { value: mountedNote, slot: renderedSlot, staged: false, fail: undefined } : null),
      (stagedNative ? { ...stagedNative, staged: true } : null)].map(entry => entry && <section key={entry.slot.key}
      className="office-auth-note-host" data-native-entry={entry.staged ? 'preparing' : 'active'}
      hidden={!entry.staged && view.phase !== 'note'} aria-hidden={entry.staged || view.phase !== 'note' || !noteAccess.current} inert={entry.staged || view.phase !== 'note' || !noteAccess.current}
      style={entry.staged ? { position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none' } : undefined}>
      <NativeEntryBoundary onFailure={message => { if (entry.staged) entry.fail?.(message); else setTreeError(message); }}>
      <OfficePortalOwner className="office-auth-editor">{(editorRenderer ?? (entry.value.context.product === 'note' ? noteRenderer : undefined)) ?
        (editorRenderer ?? noteRenderer)!(entry.value.context, entry.value.principal, unsafe => {
          if (!entry.staged && nativeSlot.current === entry.slot && entry.slot.session.isCurrent() &&
            noteAccess.current && renderedAuthority === generation.current) noteUnsafe.current = unsafe;
        }, documentId => {
          if (entry.staged || treeOperation.current || nativeSlot.current !== entry.slot || !entry.slot.session.isCurrent() || !noteAccess.current || renderedAuthority !== generation.current) return;
          const native = captureProductNavigation(entry.slot.hostSlot);
          if (!native?.isCurrent() || native.product !== entry.value.context.product || native.id !== documentId) return;
          commitNativeLocation(documentId);
        }, entry.staged ? null : headerNavigation, { hostSlot: entry.slot.hostSlot, onNativeFailure: entry.fail, authorityEpoch: renderedAuthority, subscribeAuthority,
          isAuthorized: () => renderedAuthority === generation.current && noteAccess.current && entry.slot.session.isCurrent() &&
            (nativeSlot.current === entry.slot || pendingNative.current?.slot === entry.slot) }) :
        <p role="status">{productName(entry.value.context.product)} 편집 화면 연결을 기다리고 있습니다.</p>}</OfficePortalOwner>
      </NativeEntryBoundary>
    </section>)}
    {view.phase === 'operator-opened' && <section className="office-auth-panel"><h1 tabIndex={-1} ref={heading}>Wonffice 전체 서비스 운영자</h1>
      <p>서버에서 현재 서비스 운영 권한을 확인했습니다.</p>
      <p className="office-auth-note">운영 업무 화면은 아직 연결되지 않았습니다. 이 권한으로 회사 문서를 열 수 없습니다.</p>
      <div className="office-auth-actions"><button onClick={() => void checkAccess()}>권한 다시 확인</button><button onClick={() => void switchAccount()}>계정 전환</button><button onClick={() => void logout()}>로그아웃</button></div>
    </section>}
    {view.phase === 'operator-denied' && <section className="office-auth-panel"><h1 tabIndex={-1} ref={heading}>서비스 운영 권한이 없습니다</h1><p role="alert">현재 계정에는 Wonffice 전체 서비스 운영 권한이 없습니다. 이 선택만으로 운영 권한이 생기지 않습니다.</p>
      <div className="office-auth-actions"><button onClick={() => void checkAccess('user', null)}>일반 사용자로 들어가기</button><button onClick={() => void checkAccess('admin', null)}>회사 관리자로 들어가기</button><button onClick={() => void switchAccount()}>계정 전환</button></div>
    </section>}
    {view.phase === 'denied' && <section className="office-auth-panel"><h1 tabIndex={-1} ref={heading}>관리자 권한이 없습니다</h1><p role="alert">{view.tenant.name}의 현재 역할은 {roleName(view.role)}입니다. 이 선택만으로 관리자 권한이 생기지 않습니다.</p>
      <div className="office-auth-actions"><button onClick={() => void open(view.tenant, 'user')}>사용자 화면 보기</button><button onClick={() => { selected.current = null; void checkAccess(); }}>다른 회사 선택</button><button onClick={() => void switchAccount()}>계정 전환</button></div>
    </section>}
    {view.phase === 'error' && <section className="office-auth-panel" data-retained-native-recovery={mountedNote ? '' : undefined}><h1 tabIndex={-1} ref={heading}>{view.error.kind === 'unauthorized' || view.error.kind === 'cancelled' || view.error.kind === 'login' ? '로그인이 필요합니다' : view.error.kind === 'forbidden' ? '접근 권한이 없습니다' : view.error.kind === 'collaboration_unavailable' ? '공동 편집을 열 수 없습니다' : '접근 권한을 확인하지 못했습니다'}</h1><p role="alert">{view.error.message}</p>
      <div className="office-auth-actions">{mountedNote && <button onClick={() => void checkAccess('user', mountedNote.tenant)}>초안 권한 다시 확인</button>}{(view.error.kind === 'unavailable' || view.error.kind === 'collaboration_unavailable') && currentIntent() && <button onClick={() => void checkAccess()}>다시 확인</button>}
        {view.error.kind === 'forbidden' && currentIntent() && <button onClick={() => { selected.current = null; void checkAccess(); }}>다른 회사 선택</button>}
        <button onClick={() => void login(chosenIntent.current ?? currentIntent() ?? 'user')}>다시 로그인</button><button onClick={() => {
          if (rememberedNote.current && !canLeaveNote()) return;
          ++generation.current; clearSession(); forgetNote(); verifiedIdentity.current = null;
          selected.current = null; chosenIntent.current = null; setView({ phase: 'entry' });
        }}>진입 선택</button></div>
    </section>}
  </main>;
  const workspaceScope = view.phase === 'project' || view.phase === 'library' ? view : null;
  if (workspaceScope) previousWorkspaceScope.current = workspaceScope;
  else if (view.phase !== 'checking') previousWorkspaceScope.current = null;
  // Keep presentation state during verification. Authority below stays false,
  // so the previous catalog is hidden and its actions cannot open an original.
  const scope = mountedNote ?? workspaceScope ?? (view.phase === 'checking' ? previousWorkspaceScope.current : null);
  if (!scope) return content;
  return <AuthenticatedWorkspaceFrame tenantId={scope.tenant.tenantId} workspaceId={scope.workspace.id} workspaceName={scope.workspace.name}
    currentUserId={verifiedIdentity.current?.currentUserId ?? null}
    role={scope.role} authorityEpoch={generation.current} authorized={view.phase === 'project' || view.phase === 'library' || (view.phase === 'note' && noteAccess.current)}
    active={activeDocument && mountedNote ? JSON.stringify([scope.tenant.tenantId, scope.workspace.id, mountedNote.context.product, activeDocument]) : ''}
    projectId={noteIntent.current?.projectId} busy={treeBusy} error={treeError}
    railFooter={<>
      {view.phase === 'note' && <IconButton disabled={treeBusy || !noteAccess.current} label={t(noteIntent.current?.projectId ? 'workspace.rail.returnProject' : 'workspace.rail.returnLibrary')}
        onClick={() => void returnToProject()}><Icon name="back" /></IconButton>}
      <IconButton disabled={treeBusy || !['note', 'project', 'library'].includes(view.phase)} label={t('workspace.rail.logout')}
        onClick={() => void logout()}><Icon name="logout" /></IconButton>
    </>}
    onOpen={(row, project) => void openTreeOriginal(row, project)} onNavigate={(destination, project) => void navigateTree(destination, project)}
    onAccessFailure={error => { retireNoteAccess(); ++generation.current; setView({ phase: 'error', error }); }}>
    {content}
  </AuthenticatedWorkspaceFrame>;

}
