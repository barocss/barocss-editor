import { documentLibrary } from '@barocss/shared';

/** Durable product keys. No renderer is registered by the workspace catalog. */
export const products = {
  note: { label: 'Note', format: 'barocss-note', db: 'barocss-note', store: 'documents', color: '#6255a5' },
  word: { label: 'Word', format: 'barocss-word', db: 'barocss-word', store: 'documents', color: '#2861b5' },
  slides: { label: 'Slides', format: 'barocss-slides', db: 'barocss-slides-workspace', store: 'documents', color: '#b35f23' },
  site: { label: 'Site', format: 'barocss-site', db: 'barocss-site-workspace', store: 'documents', color: '#397e69' }
} as const;
export type Product = keyof typeof products;
export const productKeys = Object.keys(products) as Product[];
export const isProduct = (value: unknown): value is Product => typeof value === 'string' && Object.hasOwn(products, value);
export const productStore = (product: Product) => documentLibrary(products[product]);
export const productDraftStore = (product: Product) => documentLibrary({ db: `barocss-${product}-recovery`, store: 'drafts' });

export interface ProductCodec {
  create(): unknown;
  read(text: string): { document: unknown } | { error: string };
  text(document: never): string;
  schema(): unknown;
}
/** File adapters are separate package entries, so loading four codecs does not register four editors. */
export async function productCodec(product: Product): Promise<ProductCodec> {
  switch (product) {
    case 'note': return import('@barocss/office-note/workspace');
    case 'word': return import('@barocss/office-word/workspace');
    case 'slides': return import('@barocss/office-slides/workspace');
    case 'site': return import('@barocss/office-site/workspace');
  }
}

export interface DocumentAddress { workspace: string; product: Product; id: string; }
export function documentURL(address: DocumentAddress): string {
  const { workspace, product, id } = address;
  return `/products/${product}/index.html?workspace=${encodeURIComponent(workspace)}#${product === 'note' ? '' : `${product}=`}${encodeURIComponent(id)}`;
}
export function referenceKey(address: Pick<DocumentAddress, 'product' | 'id'>): string {
  return `${address.product}:${address.id}`;
}

type Tree = { stype?: string; text?: string; attributes?: Record<string, unknown>; content?: Tree[] };
export function visitTree(value: unknown, visit: (node: Tree) => void, depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 100) return;
  const node = value as Tree;
  visit(node);
  if (Array.isArray(node.content)) node.content.forEach(child => visitTree(child, visit, depth + 1));
}
export function plainText(tree: unknown): string {
  const parts: string[] = [];
  visitTree(tree, node => { if (typeof node.text === 'string') parts.push(node.text); });
  return parts.join(' ');
}
export function setDocumentTitle(product: Product, tree: unknown, title: string, id?: string): void {
  if (product === 'note') {
    const node = tree as Tree;
    node.attributes = { ...node.attributes, title, ...(id ? { pageId: id } : {}) };
    return;
  }
  let found = false;
  visitTree(tree, node => {
    if (node.stype === 'docTitle') { node.content = [{ stype: 'inline-text', text: title }]; found = true; }
  });
  if (!found) {
    const node = tree as Tree;
    node.content ??= [];
    node.content.unshift({ stype: 'docMeta', content: [{ stype: 'docTitle', content: [{ stype: 'inline-text', text: title }] }] });
  }
}
