import { isProduct, type Product } from './products';

export interface LibraryOrigin {
  query: string;
  view: 'all' | 'recent' | 'favorites' | 'trash';
  product: Product | 'all';
  folder: string;
  scroll: number;
}
export const emptyLibraryOrigin = (): LibraryOrigin => ({ query: '', view: 'all', product: 'all', folder: '', scroll: 0 });
const key = (workspace: string) => `wonffice.workspace-origin:${workspace}`;

/** Navigation context is local UI state. It never changes native content or authority. */
export function readLibraryOrigin(workspace: string): LibraryOrigin {
  try {
    const value = JSON.parse(sessionStorage.getItem(key(workspace)) ?? 'null');
    if (!value || typeof value !== 'object') return emptyLibraryOrigin();
    return {
      query: typeof value.query === 'string' ? value.query : '',
      view: ['all', 'recent', 'favorites', 'trash'].includes(value.view) ? value.view : 'all',
      product: isProduct(value.product) ? value.product : 'all',
      folder: typeof value.folder === 'string' ? value.folder : '',
      scroll: typeof value.scroll === 'number' && Number.isFinite(value.scroll) && value.scroll >= 0 ? value.scroll : 0,
    };
  } catch { return emptyLibraryOrigin(); }
}
export function saveLibraryOrigin(workspace: string, value: LibraryOrigin): void {
  sessionStorage.setItem(key(workspace), JSON.stringify(value));
}
export function workspaceReturnURL(workspace: string, project?: string | null): string {
  return `/?${new URLSearchParams({ workspace, ...(project ? { project } : { view: 'library' }) })}`;
}
