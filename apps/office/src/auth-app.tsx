import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AuthError, beginLogin, clearSession, confirmTenant, currentIntent, finishLogin,
  isLogoutEvent, loadIdentity, providerLogout, announceLogout, consumeLogoutReturn, consumeResumeIntent,
  type EntryIntent, type Identity, type TenantAccess, type TenantRole,
} from './auth-client';
import './auth-style.css';

type View =
  | { phase: 'checking' }
  | { phase: 'entry'; message?: string }
  | { phase: 'choose'; identity: Identity; intent: EntryIntent }
  | { phase: 'empty' }
  | { phase: 'opened'; intent: EntryIntent; tenant: TenantAccess; role: TenantRole }
  | { phase: 'denied'; tenant: TenantAccess; role: TenantRole }
  | { phase: 'error'; error: AuthError };

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

export function AuthApp() {
  const [view, setView] = useState<View>({ phase: 'checking' });
  const selected = useRef<TenantAccess | null>(null);
  const chosenIntent = useRef<EntryIntent | null>(null);
  const generation = useRef(0);
  const authCompleting = useRef(location.pathname === '/auth/callback');
  const heading = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    if (view.phase !== 'checking') hideCurtain();
    heading.current?.focus();
  }, [view]);

  async function checkAccess(intent = chosenIntent.current ?? currentIntent(), tenant = selected.current) {
    const run = ++generation.current;
    showCurtain();
    setView({ phase: 'checking' });
    if (!intent) { selected.current = null; chosenIntent.current = null; setView({ phase: 'entry' }); return; }
    try {
      const identity = await loadIdentity();
      if (run !== generation.current) return;
      chosenIntent.current = intent;
      if (identity.tenants.length === 0) { selected.current = null; setView({ phase: 'empty' }); return; }
      if (!tenant) { setView({ phase: 'choose', identity, intent }); return; }
      const fresh = identity.tenants.find(item => item.tenantId === tenant.tenantId);
      if (!fresh) { selected.current = null; setView({ phase: 'error', error: new AuthError('forbidden', '현재 계정에는 이 회사의 접근 권한이 없습니다.') }); return; }
      const role = await confirmTenant(fresh.tenantId);
      if (run !== generation.current) return;
      selected.current = fresh;
      if (intent === 'admin' && role !== 'owner' && role !== 'admin') setView({ phase: 'denied', tenant: fresh, role });
      else {
        history.replaceState(null, '', intent === 'admin' ? '/admin' : '/');
        setView({ phase: 'opened', intent, tenant: fresh, role });
      }
    } catch (error) {
      if (run !== generation.current) return;
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
      setView({ phase: 'entry', message: consumeLogoutReturn() ? '로그아웃했습니다.' : location.pathname === '/admin' ? '관리자 권한을 확인하려면 로그인해 주세요.' : undefined });
    }
    const onPageHide = () => showCurtain();
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted && !authCompleting.current) void checkAccess(); };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') showCurtain();
      else if (!authCompleting.current) void checkAccess();
    };
    const onStorage = (event: StorageEvent) => {
      if (!isLogoutEvent(event)) return;
      showCurtain();
      ++generation.current;
      clearSession();
      selected.current = null;
      chosenIntent.current = null;
      setView({ phase: 'entry', message: '다른 창에서 로그아웃했습니다. 다시 로그인해 주세요.' });
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
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
    selected.current = tenant;
    chosenIntent.current = intent;
    await checkAccess(intent, tenant);
  }

  async function logout() {
    ++generation.current;
    showCurtain();
    selected.current = null;
    chosenIntent.current = null;
    setView({ phase: 'checking' });
    const redirected = await providerLogout();
    if (!redirected) setView({ phase: 'entry', message: '이 브라우저의 로그인 정보는 지웠습니다. 로그인 서버의 세션 종료는 확인하지 못했습니다. 다시 로그인할 때 계정을 입력해야 합니다.' });
  }

  async function switchAccount() {
    ++generation.current;
    showCurtain();
    const intent = currentIntent() ?? 'user';
    clearSession();
    announceLogout();
    selected.current = null;
    chosenIntent.current = null;
    await login(intent, true);
  }

  return <main className="office-auth">
    <header className="office-auth-brand"><span>wonffice</span><small>서비스 로그인 후보 · 서버 권한 확인</small></header>
    {view.phase === 'checking' && <section><h1 tabIndex={-1} ref={heading}>접근 권한 확인 중</h1><p>현재 계정과 회사 권한을 서버에서 확인하고 있습니다.</p></section>}
    {view.phase === 'entry' && <section><h1 tabIndex={-1} ref={heading}>Wonffice에 들어가기</h1><p>로그인 뒤 현재 계정의 권한을 확인합니다.</p>{view.message && <p role="status">{view.message}</p>}
      <div className="office-auth-actions"><button onClick={() => void login('user')}>사용자로 들어가기</button><button onClick={() => void login('admin')}>관리자로 들어가기</button></div>
      <p className="office-auth-note">진입 선택은 권한을 부여하지 않습니다. 관리자 권한은 로그인 뒤 서버에서 확인합니다.</p>
    </section>}
    {view.phase === 'empty' && <section><h1 tabIndex={-1} ref={heading}>접근할 수 있는 회사가 없습니다</h1><p>로그인은 완료됐지만 현재 계정에 활성 회사가 없습니다.</p>
      <div className="office-auth-actions"><button onClick={() => void switchAccount()}>다른 계정으로 로그인</button><button onClick={() => void logout()}>로그아웃</button></div>
    </section>}
    {view.phase === 'choose' && <section><h1 tabIndex={-1} ref={heading}>회사를 선택하세요</h1><p>{view.intent === 'admin' ? '관리자로 들어갈 회사의 현재 권한을 확인합니다.' : '사용할 회사의 현재 권한을 확인합니다.'}</p>
      <ul className="office-auth-tenants">{view.identity.tenants.map(tenant => <li key={tenant.tenantId}><button onClick={() => void open(tenant, view.intent)}><strong>{tenant.name}</strong><span>{roleName(tenant.role)}</span></button></li>)}</ul>
      <div className="office-auth-actions"><button onClick={() => void switchAccount()}>다른 계정으로 로그인</button><button onClick={() => void logout()}>로그아웃</button></div>
    </section>}
    {view.phase === 'opened' && <section><h1 tabIndex={-1} ref={heading}>{view.intent === 'admin' ? `${view.tenant.name} · 회사 관리자` : `${view.tenant.name} · 사용자`}</h1>
      <p>서버가 확인한 현재 역할: {roleName(view.role)}</p>
      {view.intent === 'admin' ? <p className="office-auth-note">관리 업무 화면은 아직 연결되지 않았습니다. 서비스 운영자 권한은 회사 관리자 권한과 별도로 정합니다.</p> :
        <p className="office-auth-note">서버 문서 자료함은 아직 연결되지 않았습니다. 이 브라우저의 로컬 자료는 회사 자료로 표시하지 않습니다.</p>}
      <div className="office-auth-actions"><button onClick={() => void checkAccess()}>권한 다시 확인</button><button onClick={() => { selected.current = null; void checkAccess(); }}>회사 바꾸기</button>
        {view.intent === 'admin' && <button onClick={() => void open(view.tenant, 'user')}>사용자 화면 보기</button>}
        <button onClick={() => void switchAccount()}>계정 전환</button><button onClick={() => void logout()}>로그아웃</button></div>
    </section>}
    {view.phase === 'denied' && <section><h1 tabIndex={-1} ref={heading}>관리자 권한이 없습니다</h1><p role="alert">{view.tenant.name}의 현재 역할은 {roleName(view.role)}입니다. 이 선택만으로 관리자 권한이 생기지 않습니다.</p>
      <div className="office-auth-actions"><button onClick={() => void open(view.tenant, 'user')}>사용자 화면 보기</button><button onClick={() => { selected.current = null; void checkAccess(); }}>다른 회사 선택</button><button onClick={() => void switchAccount()}>계정 전환</button></div>
    </section>}
    {view.phase === 'error' && <section><h1 tabIndex={-1} ref={heading}>{view.error.kind === 'unauthorized' || view.error.kind === 'cancelled' || view.error.kind === 'login' ? '로그인이 필요합니다' : view.error.kind === 'forbidden' ? '접근 권한이 없습니다' : '접근 권한을 확인하지 못했습니다'}</h1><p role="alert">{view.error.message}</p>
      <div className="office-auth-actions">{view.error.kind === 'unavailable' && currentIntent() && <button onClick={() => void checkAccess()}>다시 확인</button>}
        {view.error.kind === 'forbidden' && currentIntent() && <button onClick={() => { selected.current = null; void checkAccess(); }}>다른 회사 선택</button>}
        <button onClick={() => void login('user')}>다시 로그인</button><button onClick={() => { ++generation.current; clearSession(); selected.current = null; chosenIntent.current = null; setView({ phase: 'entry' }); }}>진입 선택</button></div>
    </section>}
  </main>;
}
