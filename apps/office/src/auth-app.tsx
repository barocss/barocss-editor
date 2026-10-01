import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  AuthError, beginLogin, clearSession, confirmOperator, confirmTenant, currentIntent, finishLogin,
  isLogoutEvent, loadIdentity, providerLogout, consumeLogoutReturn, consumeResumeIntent,
  listWorkspaces, listSnapshotDocuments, openVerifiedSnapshot, snapshotIntentFromSearch, snapshotIntentSearch, authorizedFetch,
  type EntryIntent, type Identity, type TenantAccess, type TenantRole, type WorkspaceAccess, type DocumentAccess, type VerifiedNoteContext, type VerifiedSnapshotContext, type SnapshotProduct,
} from './auth-client';
import './auth-style.css';

type View =
  | { phase: 'checking' }
  | { phase: 'entry'; message?: string }
  | { phase: 'choose'; identity: Identity; intent: EntryIntent }
  | { phase: 'empty' }
  | { phase: 'opened'; intent: EntryIntent; tenant: TenantAccess; role: TenantRole; workspaces?: WorkspaceAccess[]; workspaceCursor?: string | null }
  | { phase: 'library'; tenant: TenantAccess; role: TenantRole; workspace: WorkspaceAccess; product: SnapshotProduct; documents: DocumentAccess[]; cursor: string | null }
  | { phase: 'note'; tenant: TenantAccess; role: TenantRole; context: VerifiedSnapshotContext; principal: Pick<Identity, 'issuer' | 'subject'> }
  | { phase: 'operator-opened' }
  | { phase: 'operator-denied' }
  | { phase: 'denied'; tenant: TenantAccess; role: TenantRole }
  | { phase: 'error'; error: AuthError };

const productName = (product: SnapshotProduct) => ({ note: 'Note', word: 'Word', slides: 'Slides' })[product];

const curtainId = 'office-auth-curtain';
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

export function AuthApp({ noteRenderer, editorRenderer }: { editorRenderer?: (context: VerifiedSnapshotContext, principal: Pick<Identity, 'issuer' | 'subject'>,
  onUnsafeChange: (unsafe: boolean) => void, onDocumentNavigate: (documentId: string) => void) => ReactNode; noteRenderer?: (context: VerifiedNoteContext, principal: Pick<Identity, 'issuer' | 'subject'>,
  onUnsafeChange: (unsafe: boolean) => void, onDocumentNavigate: (documentId: string) => void) => ReactNode } = {}) {
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
  const rememberedDocumentId = useRef<string | null>(null);
  const verifiedIdentity = useRef<Identity | null>(null);
  const [mountedNote, setMountedNote] = useState<Extract<View, { phase: 'note' }> | null>(null);
  const [leaveBlocked, setLeaveBlocked] = useState(false);
  const forgetNote = () => {
    rememberedNote.current = null;
    noteAccount.current = null;
    noteAccess.current = false;
    rememberedDocumentId.current = null;
    noteUnsafe.current = false;
    setMountedNote(null);
  };
  const rememberNote = (next: Omit<Extract<View, { phase: 'note' }>, 'principal'>, identity: Identity) => {
    const account = `${identity.issuer}\0${identity.subject}`;
    const guardedContext = { ...next.context, authorizedFetch: ((...args: Parameters<typeof fetch>) => {
      if (noteAccount.current !== account) {
        throw new AuthError('forbidden', '현재 계정의 문서 접근 권한이 없습니다.');
      }
      if (!noteAccess.current) {
        const current = currentView.current;
        const denied = current.phase === 'error' && ['forbidden', 'unauthorized'].includes(current.error.kind);
        throw new AuthError(denied ? 'forbidden' : 'unavailable', '현재 문서 접근 권한을 확인하고 있습니다.');
      }
      return next.context.authorizedFetch(...args);
    }) as typeof fetch };
    const retained = { ...next, principal: { issuer: identity.issuer, subject: identity.subject }, context: guardedContext };
    noteAccount.current = account;
    noteAccess.current = true;
    rememberedDocumentId.current = next.context.documentId ?? null;
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
    if (view.phase !== 'checking') hideCurtain();
    heading.current?.focus();
  }, [view]);

  async function checkAccess(intent = chosenIntent.current ?? currentIntent(), tenant = selected.current) {
    const run = ++generation.current;
    const retainedNote = rememberedNote.current;
    noteAccess.current = false;
    showCurtain();
    curtain().textContent = '현재 계정의 접근 권한 확인 중';
    if (!retainedNote) setView({ phase: 'checking' });
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
      const direct = noteIntent.current ?? snapshotIntentFromSearch(location.search);
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
      if (!tenant && direct && intent === 'user') tenant = identity.tenants.find(item => item.tenantId === direct.tenantId) ?? null;
      if (!tenant) {
        if (direct) throw new AuthError('forbidden', '선택한 회사에 접근할 수 없습니다.');
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
          let page = workspacePage!;
          let workspace = page.items.find(item => item.id === direct.workspaceId);
          const seen = new Set<string>();
          while (!workspace && page.nextCursor && !seen.has(page.nextCursor) && seen.size < 100) {
            seen.add(page.nextCursor);
            page = await listWorkspaces(fresh.tenantId, page.nextCursor);
            if (run !== generation.current) return;
            workspace = page.items.find(item => item.id === direct.workspaceId);
          }
          if (!workspace) throw new AuthError('forbidden', '선택한 자료함에 접근할 수 없습니다.');
          const context = await openVerifiedSnapshot(fresh.tenantId, workspace.id, direct.documentId, role, direct.product);
          if (run !== generation.current) return;
          history.replaceState(null, '', `/?${snapshotIntentSearch(direct)}`);
          const retainNativeRuntime = context.product === 'word' || context.product === 'slides';
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
            hideCurtain();
          } else if (retainedNote) throw new AuthError('forbidden', '이 초안을 다시 편집할 권한이 없습니다.');
          else rememberNote({ phase: 'note', tenant: fresh, role, context }, identity);
          return;
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
    if (rememberedNote.current && !canLeaveNote()) return;
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
    const redirected = await providerLogout();
    if (!redirected) setView({ phase: 'entry', message: '이 브라우저의 로그인 정보는 지웠습니다. 로그인 서버의 세션 종료는 확인하지 못했습니다. 다시 로그인할 때 계정을 입력해야 합니다.' });
  }

  async function switchAccount() {
    await logout();
  }

  async function enterWorkspace(tenant: TenantAccess, role: TenantRole, workspace: WorkspaceAccess, product: SnapshotProduct = 'note') {
    const run = ++generation.current;
    showCurtain(); setView({ phase: 'checking' });
    try {
      const page = await listSnapshotDocuments(tenant.tenantId, workspace.id, product);
      if (run !== generation.current) return;
      setView({ phase: 'library', tenant, role, workspace, product, documents: page.items, cursor: page.nextCursor });
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
      rememberNote({ phase: 'note', tenant: current.tenant, role,
        context: { product: current.product, tenantId: current.tenant.tenantId, workspaceId: current.workspace.id, role, authorizedFetch } }, identity);
    } catch (error) { if (run === generation.current) setView({ phase: 'error', error: asAuthError(error) }); }
  }

  async function enterNote(current: Extract<View, { phase: 'library' }>, documentId: string) {
    const run = ++generation.current;
    showCurtain(); setView({ phase: 'checking' });
    try {
      const identity = await loadIdentity();
      if (!identity.tenants.some(item => item.tenantId === current.tenant.tenantId)) throw new AuthError('forbidden', '이 회사에 접근할 수 없습니다.');
      const role = await confirmTenant(current.tenant.tenantId);
      const context = await openVerifiedSnapshot(current.tenant.tenantId, current.workspace.id, documentId, role, current.product);
      if (run !== generation.current) return;
      noteIntent.current = { tenantId: context.tenantId, workspaceId: context.workspaceId, documentId, product: context.product };
      history.replaceState(null, '', `/?${snapshotIntentSearch(noteIntent.current)}`);
      if (run !== generation.current) return;
      rememberNote({ phase: 'note', tenant: current.tenant, role, context }, identity);
    } catch (error) { if (run === generation.current) setView({ phase: 'error', error: asAuthError(error) }); }
  }

  return <main className="office-auth">
    <header className="office-auth-brand"><span>wonffice</span><small>서비스 로그인 후보 · 서버 권한 확인</small></header>
    {mountedNote && leaveBlocked && <p role="alert">현재 입력을 복구 가능한 저장소에 보관하지 못했습니다. 저장 상태를 확인한 뒤 다시 시도하세요. 이 화면은 그대로 유지합니다.</p>}
    {view.phase === 'checking' && <section><h1 tabIndex={-1} ref={heading}>접근 권한 확인 중</h1><p>현재 계정과 회사 권한을 서버에서 확인하고 있습니다.</p></section>}
    {view.phase === 'entry' && <section><h1 tabIndex={-1} ref={heading}>Wonffice에 들어가기</h1><p>로그인 뒤 현재 계정의 권한을 확인합니다.</p>{view.message && <p role="status">{view.message}</p>}
      <div className="office-auth-actions"><button onClick={() => void login('user')}>일반 사용자로 들어가기</button><button onClick={() => void login('admin')}>회사 관리자로 들어가기</button><button onClick={() => void login('operator')}>Wonffice 전체 서비스 운영자로 들어가기</button></div>
      <p className="office-auth-note">진입 선택은 권한을 부여하지 않습니다. 회사 관리자와 서비스 운영자 권한은 각각 서버에서 확인합니다.</p>
    </section>}
    {view.phase === 'empty' && <section><h1 tabIndex={-1} ref={heading}>접근할 수 있는 회사가 없습니다</h1><p>로그인은 완료됐지만 현재 계정에 활성 회사가 없습니다.</p>
      <div className="office-auth-actions">{mountedNote && <button onClick={() => void checkAccess('user', mountedNote.tenant)}>권한 다시 확인</button>}<button onClick={() => void switchAccount()}>다른 계정으로 로그인</button><button onClick={() => void logout()}>로그아웃</button></div>
    </section>}
    {view.phase === 'choose' && <section><h1 tabIndex={-1} ref={heading}>회사를 선택하세요</h1><p>{view.intent === 'admin' ? '관리자로 들어갈 회사의 현재 권한을 확인합니다.' : '사용할 회사의 현재 권한을 확인합니다.'}</p>
      <ul className="office-auth-tenants">{view.identity.tenants.map(tenant => <li key={tenant.tenantId}><button onClick={() => void open(tenant, view.intent)}><strong>{tenant.name}</strong><span>{roleName(tenant.role)}</span></button></li>)}</ul>
      <div className="office-auth-actions"><button onClick={() => void switchAccount()}>다른 계정으로 로그인</button><button onClick={() => void logout()}>로그아웃</button></div>
    </section>}
    {view.phase === 'opened' && <section><h1 tabIndex={-1} ref={heading}>{view.intent === 'admin' ? `${view.tenant.name} · 회사 관리자` : `${view.tenant.name} · 사용자`}</h1>
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
    {view.phase === 'library' && <section><h1 tabIndex={-1} ref={heading}>{view.workspace.name} · {productName(view.product)} 자료</h1>
      <div className="office-auth-actions">{(['note', 'word', 'slides'] as const).map(product => <button key={product} aria-pressed={view.product === product} onClick={() => void enterWorkspace(view.tenant, view.role, view.workspace, product)}>{`${productName(product)} 자료`}</button>)}</div>
      {view.documents.length === 0 && <p>이 자료함에는 저장된 {productName(view.product)} 문서가 없습니다.</p>}
      <ul className="office-auth-tenants">{view.documents.map(item => <li key={item.documentId}><button onClick={() => void enterNote(view, item.documentId)}>{item.title}</button></li>)}</ul>
      {view.cursor && <button onClick={() => void moreDocuments(view)}>문서 더 보기</button>}
      {view.role !== 'viewer' && <button onClick={() => void createSnapshot(view)}>새 {productName(view.product)} 만들기</button>}
      <div className="office-auth-actions"><button onClick={() => void checkAccess('user', view.tenant)}>자료함 목록</button><button onClick={() => void logout()}>로그아웃</button></div>
    </section>}
    {mountedNote && <section className="office-auth-note-host" hidden={view.phase !== 'note'} aria-hidden={view.phase !== 'note'} inert={view.phase !== 'note'}>
      {view.phase === 'note' && <div className="office-auth-actions"><button onClick={() => { if (!canLeaveNote()) return; forgetNote(); noteIntent.current = null; history.replaceState(null, '', '/'); void checkAccess('user', view.tenant); }}>자료함으로 돌아가기</button><button onClick={() => void logout()}>로그아웃</button></div>}
      {(editorRenderer ?? (mountedNote.context.product === 'note' ? noteRenderer : undefined)) ? (editorRenderer ?? noteRenderer)!(mountedNote.context, mountedNote.principal, unsafe => { noteUnsafe.current = unsafe; }, documentId => {
        rememberedDocumentId.current = documentId;
        noteIntent.current = { tenantId: mountedNote.context.tenantId, workspaceId: mountedNote.context.workspaceId, documentId, product: mountedNote.context.product };
      }) : <p role="status">{productName(mountedNote.context.product)} 편집 화면 연결을 기다리고 있습니다.</p>}
    </section>}
    {view.phase === 'operator-opened' && <section><h1 tabIndex={-1} ref={heading}>Wonffice 전체 서비스 운영자</h1>
      <p>서버에서 현재 서비스 운영 권한을 확인했습니다.</p>
      <p className="office-auth-note">운영 업무 화면은 아직 연결되지 않았습니다. 이 권한으로 회사 문서를 열 수 없습니다.</p>
      <div className="office-auth-actions"><button onClick={() => void checkAccess()}>권한 다시 확인</button><button onClick={() => void switchAccount()}>계정 전환</button><button onClick={() => void logout()}>로그아웃</button></div>
    </section>}
    {view.phase === 'operator-denied' && <section><h1 tabIndex={-1} ref={heading}>서비스 운영 권한이 없습니다</h1><p role="alert">현재 계정에는 Wonffice 전체 서비스 운영 권한이 없습니다. 이 선택만으로 운영 권한이 생기지 않습니다.</p>
      <div className="office-auth-actions"><button onClick={() => void checkAccess('user', null)}>일반 사용자로 들어가기</button><button onClick={() => void checkAccess('admin', null)}>회사 관리자로 들어가기</button><button onClick={() => void switchAccount()}>계정 전환</button></div>
    </section>}
    {view.phase === 'denied' && <section><h1 tabIndex={-1} ref={heading}>관리자 권한이 없습니다</h1><p role="alert">{view.tenant.name}의 현재 역할은 {roleName(view.role)}입니다. 이 선택만으로 관리자 권한이 생기지 않습니다.</p>
      <div className="office-auth-actions"><button onClick={() => void open(view.tenant, 'user')}>사용자 화면 보기</button><button onClick={() => { selected.current = null; void checkAccess(); }}>다른 회사 선택</button><button onClick={() => void switchAccount()}>계정 전환</button></div>
    </section>}
    {view.phase === 'error' && <section><h1 tabIndex={-1} ref={heading}>{view.error.kind === 'unauthorized' || view.error.kind === 'cancelled' || view.error.kind === 'login' ? '로그인이 필요합니다' : view.error.kind === 'forbidden' ? '접근 권한이 없습니다' : view.error.kind === 'collaboration_unavailable' ? '공동 편집을 열 수 없습니다' : '접근 권한을 확인하지 못했습니다'}</h1><p role="alert">{view.error.message}</p>
      <div className="office-auth-actions">{mountedNote && <button onClick={() => void checkAccess('user', mountedNote.tenant)}>초안 권한 다시 확인</button>}{(view.error.kind === 'unavailable' || view.error.kind === 'collaboration_unavailable') && currentIntent() && <button onClick={() => void checkAccess()}>다시 확인</button>}
        {view.error.kind === 'forbidden' && currentIntent() && <button onClick={() => { selected.current = null; void checkAccess(); }}>다른 회사 선택</button>}
        <button onClick={() => void login(chosenIntent.current ?? currentIntent() ?? 'user')}>다시 로그인</button><button onClick={() => {
          if (rememberedNote.current && !canLeaveNote()) return;
          ++generation.current; clearSession(); forgetNote(); verifiedIdentity.current = null;
          selected.current = null; chosenIntent.current = null; setView({ phase: 'entry' });
        }}>진입 선택</button></div>
    </section>}
  </main>;
}
