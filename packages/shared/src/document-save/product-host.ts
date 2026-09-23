import { documentLibrary } from '../document-library/document-library';

export interface ProductDocumentHost {
  product: 'note' | 'word' | 'slides' | 'site';
  id(): string;
  /** Resolve only after nested input and conditional storage writes settle. */
  beforeNavigate(): Promise<boolean>;
}
let current: ProductDocumentHost | undefined;
export function registerProductDocumentHost(host: ProductDocumentHost): () => void {
  current = host;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('wonffice:host-change'));
  return () => {
    if (current !== host) return;
    current = undefined;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('wonffice:host-change'));
  };
}
export function productDocumentHost(): ProductDocumentHost | undefined { return current; }
export async function prepareProductNavigation(): Promise<boolean> {
  const host = current;
  if (!host) return false;
  const id = host.id();
  return await host.beforeNavigate() && current === host && host.id() === id;
}

/** The local workspace owns trash state. Standalone development hosts have no workspace policy. */
export class ProductDocumentTrashedError extends Error {
  constructor() { super('휴지통에 있는 자료입니다. 자료함에서 복원하세요.'); }
}

export async function assertProductDocumentOpen(product: string, id: string): Promise<void> {
  const workspace = new URLSearchParams(location.search).get('workspace');
  if (!workspace) return;
  if (workspace !== localStorage.getItem('wonffice.local-workspace')) throw new Error('다른 작업 공간의 자료입니다.');
  if (await isProductDocumentTrashed(product, id))
    throw new ProductDocumentTrashedError();
}

/** The workspace catalog is advisory for lists; opening still checks it at execution time. */
export async function isProductDocumentTrashed(product: string, id: string): Promise<boolean> {
  const workspace = new URLSearchParams(location.search).get('workspace');
  if (!workspace || workspace !== localStorage.getItem('wonffice.local-workspace')) return false;
  const catalog = documentLibrary({ db: `wonffice-workspace-${workspace}`, store: 'catalog' });
  const snapshot = await catalog.read(`${product}:${id}`);
  if (!snapshot) return false;
  const { trashedAt } = JSON.parse(snapshot.text) as { trashedAt?: number | null };
  return trashedAt !== null && trashedAt !== undefined;
}
