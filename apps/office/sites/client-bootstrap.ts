import { installDocumentLibraryHost, indexedDBDocumentLibrary, prepareProductNavigation } from '@barocss/shared';
import { reportLocalNativeFrameFailure } from '../src/local-native-bridge';
import { createOfficeStorageHost, discoverOfficeSession, OfficeStorageError } from './storage-client';
import type { StorageSession } from './storage-protocol';

declare global {
  interface Window {
    __wonfficeSitesSession?: Readonly<StorageSession>;
    __wonfficeSitesRetire?: (scope: string) => void;
  }
}
let starting: Promise<void> | undefined;
function failure(message: string, signIn = false) {
  if (reportLocalNativeFrameFailure(new Error(message))) return;
  const root = document.getElementById('root');
  if (root) { root.inert = true; root.style.visibility = 'hidden'; }
  let curtain = document.getElementById('wonffice-storage-boundary');
  if (!curtain) {
    curtain = document.createElement('section'); curtain.id = 'wonffice-storage-boundary';
    curtain.setAttribute('role', 'alert');
    curtain.style.cssText = 'position:fixed;inset:0;background:white;color:#20242b;z-index:2147483647;display:grid;place-content:center;gap:16px;padding:32px;font:16px system-ui';
    document.body.append(curtain);
  }
  curtain.replaceChildren(document.createTextNode(message));
  const action = document.createElement('a'); action.textContent = signIn ? 'ChatGPT로 로그인' : '현재 계정으로 다시 열기';
  action.href = signIn ? '/signin-with-chatgpt' : '/'; curtain.append(action);
}
export function showOfficeStorageFailure(cause: unknown): void {
  failure(cause instanceof OfficeStorageError && cause.status === 401 ? '이 작업 공간을 열려면 로그인하세요.' :
    '서버 작업 공간을 확인하지 못했습니다. 기존 브라우저 문서는 변경하지 않았습니다. 연결을 확인하고 다시 시도하세요.', cause instanceof OfficeStorageError && cause.status === 401);
}

/** Every root/product HTML entry awaits this before any native product module is imported. */
export function initializeOfficeStorage(): Promise<void> {
  return starting ??= (async () => {
    const session = Object.freeze(await discoverOfficeSession());
    let parentSession: Readonly<StorageSession> | undefined;
    // A hosted preview may itself be embedded by a different origin. Only the native
    // same-origin parent participates in this app's session boundary.
    try { if (window.parent !== window) parentSession = window.parent.__wonfficeSitesSession; } catch { /* Outer preview, no native parent. */ }
    if (parentSession && (parentSession.userScope !== session.userScope || parentSession.workspaceId !== session.workspaceId)) {
      window.parent.__wonfficeSitesRetire?.(parentSession.userScope);
      throw new OfficeStorageError(401, 'identity_changed');
    }
    window.__wonfficeSitesSession = session;
    const channel = new BroadcastChannel('wonffice-sites-session');
    let retired = false;
    const retire = (scope: string) => {
      if (scope !== session.userScope || retired) return;
      retired = true; host?.retire();
      failure('계정 또는 접근 권한이 바뀌었습니다. 이전 계정의 편집을 중지했습니다. 초안을 유지한 채 원래 계정으로 다시 확인하세요.');
      channel.postMessage({ type: 'retire', scope });
      try { if (window.parent !== window) window.parent.__wonfficeSitesRetire?.(scope); } catch { /* Outer preview. */ }
    };
    window.__wonfficeSitesRetire = retire;
    channel.onmessage = event => { if (event.data?.type === 'retire') retire(event.data.scope); };
    const host = createOfficeStorageHost(session, () => retire(session.userScope));
    const local = sessionStorage.getItem('wonffice.sites-storage') === 'local' &&
      sessionStorage.getItem('wonffice.sites-local-owner') === session.userScope;
    const storageAction = { label: local ? '서버 파일 보기' : '이 브라우저 파일 보기', async run() {
      if (retired || !await prepareProductNavigation()) throw new Error('Preserve current input before changing storage.');
      sessionStorage.setItem('wonffice.sites-storage', local ? 'server' : 'local');
      sessionStorage.setItem('wonffice.sites-local-owner', session.userScope);
      location.assign('/');
    } };
    if (local) {
      let workspaceId = localStorage.getItem('wonffice.local-workspace');
      if (!workspaceId) { workspaceId = crypto.randomUUID(); localStorage.setItem('wonffice.local-workspace', workspaceId); }
      installDocumentLibraryHost({ workspaceId, label: '이 브라우저 작업 공간', storageAction,
        library: spec => indexedDBDocumentLibrary(spec) });
    } else installDocumentLibraryHost({ ...host, storageAction });
    const check = () => {
      if (retired || document.visibilityState === 'hidden') return;
      void host.checkSession().catch(cause => {
        if (cause instanceof OfficeStorageError && (cause.status === 401 || cause.status === 403 || cause.code === 'invalid_session')) retire(session.userScope);
      });
    };
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    window.addEventListener('pagehide', () => {
      const root = document.getElementById('root'); if (root) { root.inert = true; root.style.visibility = 'hidden'; }
      channel.close(); host.retire();
    }, { once: true });
    window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  })();
}
