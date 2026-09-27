import { createRoot } from 'react-dom/client';
import { ProductNavigation } from '@barocss/office-workspace/host';
import { OfficeWorkspace, readProductDocument, workspaceIdentity, type Product } from '@barocss/office-workspace';
import { Button, registerEditorNavigation } from '@barocss/office-ui';
import '@barocss/office-workspace/style.css';

export async function mountWorkspaceProduct(product: Product, start: () => Promise<unknown>) {
 try {
  if (import.meta.env.VITE_OFFICE_AUTH_MODE === 'oidc') {
   // #367 must confirm this document's tenant and ACL before any local or remote body read.
   createRoot(document.getElementById('root')!).render(<main style={{ padding: 32 }}><h1 tabIndex={-1} ref={element => element?.focus()}>문서 접근 확인이 필요합니다</h1><p role="alert">서버의 문서별 접근 확인이 아직 연결되지 않았습니다. 이 주소에서 문서 본문을 열 수 없습니다.</p><Button onClick={() => location.assign('/')}>진입 화면으로 돌아가기</Button></main>);
   return;
  }
  const requested = new URLSearchParams(location.search).get('workspace');
  const workspace = workspaceIdentity();
  if (requested && requested !== workspace) throw new Error('다른 작업 공간의 주소입니다. 자료함에서 자료를 다시 여세요.');
  const id = product === 'note' ? decodeURIComponent(location.hash.slice(1)) : new URLSearchParams(location.hash.slice(1)).get(product);
  if (!id) throw new Error('자료 주소가 없습니다. 자료함에서 새 자료를 만드세요.');
  const library = new OfficeWorkspace(workspace);
  const source = await library.require(product, id);
  await readProductDocument(product, source.text);
  if ((await library.meta(`${product}:${id}`)).trashedAt !== null) throw new Error('휴지통에 있는 자료입니다. 자료함에서 복원하세요.');
  document.body.classList.add('ow-host');
  registerEditorNavigation(ProductNavigation);
  await start();
 } catch (error) {
  createRoot(document.getElementById('root')!).render(<main style={{ padding: 32 }}><h1 tabIndex={-1} ref={element => element?.focus()}>자료를 열지 못했습니다.</h1><p role="alert">{error instanceof Error ? error.message : '다시 시도하세요.'}</p><Button onClick={() => location.assign('/')}>자료함으로 돌아가기</Button></main>);
 }
}
