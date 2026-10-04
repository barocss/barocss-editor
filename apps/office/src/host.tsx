import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ProductNavigation, ProductLocation, captureLocalWorkspaceBeforeLeave, waitForLocalWorkspacePreparation } from '@barocss/office-workspace/host';
import { WorkspaceFrame } from '../../../packages/office-workspace/src/workspace-frame';
import { formatWorkspaceRoute, parseWorkspaceRoute, OfficeWorkspace, readProductDocument, type Product } from '@barocss/office-workspace';
import { Button, OfficeLocaleProvider, registerEditorNavigation } from '@barocss/office-ui';
import { snapshotIntentFromSearch, snapshotIntentSearch } from './auth-client';
import { captureProductNavigation, registerDocumentLocation, registerProductReplacementPreparation } from '@barocss/shared';
import { resolveLocalEntry } from './local-entry';
import { EntryStatus } from './entry-status';
import { connectLocalNativeChild, localNativeFrameRoute, localNativeFrameURL, type LocalNativeConnection } from './local-native-bridge';
import './style.css';

export async function mountWorkspaceProduct(product: Product, start: () => Promise<unknown>) {
 let shell: ReturnType<typeof createRoot> | undefined;
 let connection: LocalNativeConnection | undefined;
 let releaseNative: (() => void) | undefined;
 try {
  if (import.meta.env.VITE_OFFICE_AUTH_MODE === 'oidc') {
   const requestedIntent = snapshotIntentFromSearch(location.search);
   const intent = requestedIntent?.product === product ? requestedIntent : null;
   if (intent) {
    location.replace(`/?${snapshotIntentSearch(intent)}`);
    return;
   }
   createRoot(document.getElementById('root')!).render(<main style={{ padding: 32 }}><h1 tabIndex={-1} ref={element => element?.focus()}>문서 접근 확인이 필요합니다</h1><p role="alert">회사, 자료함, 문서와 제품을 확인할 수 없습니다. 이 주소에서 문서 본문을 열 수 없습니다.</p><Button onClick={() => location.assign('/')}>진입 화면으로 돌아가기</Button></main>);
   return;
  }
  const frameRoute = localNativeFrameRoute(location.href);
  if (frameRoute.token) {
   let prepared: { guard: NonNullable<ReturnType<typeof captureProductNavigation>>; feedback: ReturnType<typeof captureLocalWorkspaceBeforeLeave> } | undefined;
   connection = connectLocalNativeChild(frameRoute.token, {
   prepare: async guard => {
    prepared = undefined;
    if (!await waitForLocalWorkspacePreparation(guard) || connection?.isCurrent() !== true || !guard.isCurrent()) return false;
    const feedback = captureLocalWorkspaceBeforeLeave();
    if (connection?.isCurrent() !== true || !guard.isCurrent() || !await feedback.prepare() ||
      connection?.isCurrent() !== true || !guard.isCurrent() || !await guard.prepare() ||
      connection?.isCurrent() !== true || !guard.isCurrent() || !feedback.isPrepared()) return false;
    prepared = { guard, feedback }; return true;
   },
   isPrepared: guard => prepared?.guard === guard && connection?.isCurrent() === true && guard.isCurrent() && prepared.feedback.isPrepared()
  });
  }
  const nativeRoot = document.getElementById('root')!;
  nativeRoot.hidden = true;
  const shellRoot = document.createElement('div'); shellRoot.id = 'ow-shell-root';
  document.body.append(shellRoot);
  shell = createRoot(shellRoot);
  flushSync(() => shell!.render(<EntryStatus />));
  const requestedURL = location.href;
  const assertRequested = () => { if (location.href !== requestedURL) throw new Error('The requested address changed before its original opened.'); };
  const entry = await resolveLocalEntry(frameRoute.url); assertRequested();
  if (!entry.item || entry.item.kind !== 'document' || entry.item.product !== product) throw new Error('The address does not match this native product.');
  const workspace = entry.route.workspaceId, id = entry.item.id;
  const library = new OfficeWorkspace(workspace);
  const source = await library.require(product, id); assertRequested();
  await readProductDocument(product, source.text); assertRequested();
  if ((await library.meta(`${product}:${id}`)).trashedAt !== null) throw new Error('휴지통에 있는 자료입니다. 자료함에서 복원하세요.');
  assertRequested();
  if (!connection) {
   const { LocalNativeFrame } = await import('./local-native-frame'); assertRequested();
   shell.unmount(); shellRoot.remove(); nativeRoot.hidden = false;
   createRoot(nativeRoot).render(<LocalNativeFrame initial={{ product, id, url: new URL(formatWorkspaceRoute(entry.route), location.origin).href }} />);
   return;
  }
  let installed = false;
  let installing = false;
  let retired = false;
  const error = (event: ErrorEvent) => connection?.error(event.error ?? new Error(event.message));
  const rejected = (event: PromiseRejectionEvent) => connection?.error(event.reason);
  const hostChanged = () => {
   if (retired || connection && !connection.isCurrent()) return;
   const guard = captureProductNavigation();
   if (!guard) return;
   if (!installed) {
    if (guard.product !== product || guard.id !== id || !guard.isCurrent()) {
     connection?.error(new Error('The native editor did not install the requested original.')); return;
    }
    if (installing) return;
    installing = true;
    const ready = connection ? connection.ready(guard) : Promise.resolve(true);
    void ready.then(accepted => {
     if (!accepted || retired || !guard.isCurrent() || connection && !connection.isCurrent()) return;
     installed = true;
     nativeRoot.hidden = false; shell?.unmount(); shellRoot.remove();
    }).catch(reason => connection?.error(reason)).finally(() => { installing = false; });
   } else connection?.changed(guard);
  };
  window.addEventListener('wonffice:host-change', hostChanged);
  const cleanups: Array<() => void> = [];
  releaseNative = () => {
    if (retired) return;
    retired = true; window.removeEventListener('wonffice:host-change', hostChanged);
    window.removeEventListener('error', error); window.removeEventListener('unhandledrejection', rejected);
    for (const cleanup of cleanups) cleanup();
  };
  if (connection) {
   window.addEventListener('error', error);
   window.addEventListener('unhandledrejection', rejected);
   window.addEventListener('pagehide', releaseNative, { once: true });
  }
  cleanups.push(registerDocumentLocation({ product, workspaceId: workspace, isCurrent: () => !retired && (connection ? connection.isCurrent() && (installed || location.href === requestedURL) : location.href === requestedURL),
    readId: () => {
      const parsed = parseWorkspaceRoute(localNativeFrameRoute(location.href).url);
      if ('error' in parsed || !parsed.route || parsed.route.kind !== 'item' || parsed.route.workspaceId !== workspace)
        throw new Error('The document address changed.');
      if (!installed && (location.href !== requestedURL || parsed.route.itemId !== id)) throw new Error('The requested original changed.');
      if (parsed.expected && (parsed.expected.kind !== 'document' || parsed.expected.product !== product)) throw new Error('The original product changed.');
      return parsed.route.itemId;
    },
    url: nextId => {
      const url = formatWorkspaceRoute({ ...entry.route, kind: 'item', itemId: nextId });
      return frameRoute.token ? localNativeFrameURL(url, frameRoute.token) : url;
    }
  }));
  cleanups.push(registerProductReplacementPreparation(captureLocalWorkspaceBeforeLeave));
  const ownedConnection = connection;
  cleanups.push(registerEditorNavigation(props => <ProductNavigation {...props} navigate={url => ownedConnection.navigate(url)} />, ProductLocation));
  // Vite resolves imported CSS before the native module promise. Never show an unstyled shell.
  await start();
  if (!installed) hostChanged();
 } catch (error) {
  releaseNative?.();
  if (connection) { connection.error(error); return; }
  const failure = <main style={{ padding: 32 }}><h1 tabIndex={-1} ref={element => element?.focus()}>자료를 열지 못했습니다.</h1><p role="alert">{error instanceof Error ? error.message : '다시 시도하세요.'}</p><Button onClick={() => location.assign('/')}>자료함으로 돌아가기</Button></main>;
  if (shell) shell.render(<OfficeLocaleProvider><WorkspaceFrame key="opening-failed">{failure}</WorkspaceFrame></OfficeLocaleProvider>);
  else createRoot(document.getElementById('root')!).render(failure);
 }
}
