import { documentLibrary } from '../document-library/document-library';

export interface ProductDocumentHost {
  product: 'note' | 'word' | 'slides' | 'site';
  id(): string;
  /** The product increments this lifetime when its document is replaced, including A → B → A. */
  identityEpoch?(): number;
  /** Resolve only after nested input and conditional storage writes settle. */
  beforeNavigate(): Promise<boolean>;
}
let current: ProductDocumentHost | undefined;
let registrationEpoch = 0;
export function registerProductDocumentHost(host: ProductDocumentHost): () => void {
  current = host;
  const registered = ++registrationEpoch;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('wonffice:host-change'));
  return () => {
    if (current !== host || registered !== registrationEpoch) return;
    current = undefined;
    registrationEpoch++;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('wonffice:host-change'));
  };
}
export function productDocumentHost(): ProductDocumentHost | undefined { return current; }
export interface ProductNavigationGuard {
  readonly product: ProductDocumentHost['product'];
  readonly id: string;
  /** Recheck after every async catalog operation and immediately before changing the route. */
  isCurrent(): boolean;
  prepare(): Promise<boolean>;
}

/** Captures a lifetime, not only the document ID seen at both ends of an async operation. */
export function captureProductNavigation(): ProductNavigationGuard | undefined {
  const host = current;
  if (!host) return undefined;
  const registered = registrationEpoch, id = host.id(), identity = host.identityEpoch?.();
  const isCurrent = () => current === host && registrationEpoch === registered &&
    host.id() === id && host.identityEpoch?.() === identity;
  return Object.freeze({ product: host.product, id, isCurrent,
    prepare: async () => isCurrent() && await host.beforeNavigate() && isCurrent() });
}

export async function prepareProductNavigation(): Promise<boolean> {
  return await captureProductNavigation()?.prepare() ?? false;
}

/** The local workspace owns trash state. Standalone development hosts have no workspace policy. */
export class ProductDocumentTrashedError extends Error {
  constructor() { super('휴지통에 있는 자료입니다. 자료함에서 복원하세요.'); }
}

export async function assertProductDocumentOpen(product: string, id: string): Promise<void> {
  const workspace = new URLSearchParams(location.search).get('workspace');
  if (!workspace) return;
  if (workspace !== localStorage.getItem('wonffice.local-workspace')) throw new Error('다른 작업 공간의 자료입니다.');
  if (await isProductDocumentTrashed(product, id)) throw new ProductDocumentTrashedError();
}

/** Lists use the catalog as a hint; opening checks the current policy again. */
export async function isProductDocumentTrashed(product: string, id: string): Promise<boolean> {
  const workspace = new URLSearchParams(location.search).get('workspace');
  if (!workspace || workspace !== localStorage.getItem('wonffice.local-workspace')) return false;
  const catalog = documentLibrary({ db: `wonffice-workspace-${workspace}`, store: 'catalog' });
  const snapshot = await catalog.read(`${product}:${id}`);
  const trashedAt = snapshot ? JSON.parse(snapshot.text).trashedAt : null;
  return trashedAt !== null && trashedAt !== undefined;
}
