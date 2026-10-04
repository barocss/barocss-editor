import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ProductNavigation, ProductLocation } from '@barocss/office-workspace/host';
import { WorkspaceFrame } from '../../../packages/office-workspace/src/workspace-frame';
import { formatWorkspaceRoute, parseWorkspaceRoute, OfficeWorkspace, readProductDocument, type Product } from '@barocss/office-workspace';
import { Button, OfficeLocaleProvider, registerEditorNavigation } from '@barocss/office-ui';
import { snapshotIntentFromSearch, snapshotIntentSearch } from './auth-client';
import { productDocumentHost, registerDocumentLocation } from '@barocss/shared';
import { resolveLocalEntry } from './local-entry';
import { EntryStatus } from './entry-status';
import './style.css';

export async function mountWorkspaceProduct(product: Product, start: () => Promise<unknown>) {
 let shell: ReturnType<typeof createRoot> | undefined;
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
  const nativeRoot = document.getElementById('root')!;
  nativeRoot.hidden = true;
  const shellRoot = document.createElement('div'); shellRoot.id = 'ow-shell-root';
  document.body.append(shellRoot);
  shell = createRoot(shellRoot);
  flushSync(() => shell!.render(<EntryStatus />));
  const requestedURL = location.href;
  const assertRequested = () => { if (location.href !== requestedURL) throw new Error('The requested address changed before its original opened.'); };
  const entry = await resolveLocalEntry(requestedURL); assertRequested();
  if (!entry.item || entry.item.kind !== 'document' || entry.item.product !== product) throw new Error('The address does not match this native product.');
  const workspace = entry.route.workspaceId, id = entry.item.id;
  const library = new OfficeWorkspace(workspace);
  const source = await library.require(product, id); assertRequested();
  await readProductDocument(product, source.text); assertRequested();
  if ((await library.meta(`${product}:${id}`)).trashedAt !== null) throw new Error('휴지통에 있는 자료입니다. 자료함에서 복원하세요.');
  assertRequested();
  let installed = false;
  window.addEventListener('wonffice:host-change', () => { const host = productDocumentHost(); if (host?.product === product && host.id() === id) installed = true; });
  registerDocumentLocation({ product, workspaceId: workspace, isCurrent: () => location.href === requestedURL,
    readId: () => {
      const parsed = parseWorkspaceRoute(location.href);
      if ('error' in parsed || !parsed.route || parsed.route.kind !== 'item' || parsed.route.workspaceId !== workspace)
        throw new Error('The document address changed.');
      if (!installed && (location.href !== requestedURL || parsed.route.itemId !== id)) throw new Error('The requested original changed.');
      if (parsed.expected && (parsed.expected.kind !== 'document' || parsed.expected.product !== product)) throw new Error('The original product changed.');
      return parsed.route.itemId;
    },
    url: nextId => formatWorkspaceRoute({ ...entry.route, kind: 'item', itemId: nextId })
  });
  document.body.classList.add('ow-host');
  registerEditorNavigation(ProductNavigation, ProductLocation);
  // Vite resolves imported CSS before the native module promise. Never show an unstyled shell.
  await start();
  flushSync(() => shell!.render(<OfficeLocaleProvider><WorkspaceFrame nativeRoot={nativeRoot} expected={{ product, id }} /></OfficeLocaleProvider>));
  nativeRoot.hidden = false;
 } catch (error) {
  const failure = <main style={{ padding: 32 }}><h1 tabIndex={-1} ref={element => element?.focus()}>자료를 열지 못했습니다.</h1><p role="alert">{error instanceof Error ? error.message : '다시 시도하세요.'}</p><Button onClick={() => location.assign('/')}>자료함으로 돌아가기</Button></main>;
  if (shell) shell.render(<OfficeLocaleProvider><WorkspaceFrame key="opening-failed">{failure}</WorkspaceFrame></OfficeLocaleProvider>);
  else createRoot(document.getElementById('root')!).render(failure);
 }
}
