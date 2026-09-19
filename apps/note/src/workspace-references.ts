import type { NoteDocument } from '@barocss/office-note';
import { pageInTrash, type WorkspacePage } from './workspace-library';

type Tree = { stype?: string; text?: string; attributes?: Record<string, unknown>; content?: unknown[] };
export interface ReferenceItem { source: string; rowId: string; title: string; next?: ReferenceItem }
export interface PageReferenceOccurrence {
  pageId: string;
  title: string;
  excerpt: string;
  item?: ReferenceItem;
}
export interface PageBacklink {
  page: WorkspacePage;
  references: PageReferenceOccurrence[];
}
const tree = (value: unknown): Tree | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Tree : undefined;
const children = (node: Tree) => (node.content ?? []).flatMap(value => { const child = tree(value); return child ? [child] : []; });
const label = (value: unknown) => typeof value === 'string' ? value : '';
const appendItem = (parent: ReferenceItem | undefined, item: ReferenceItem): ReferenceItem => parent ? { ...parent, next: appendItem(parent.next, item) } : item;

function proseText(node: Tree, titles: ReadonlyMap<string, string>, depth = 0): string {
  if (depth > 100 || node.stype === 'resources') return '';
  if (node.stype === 'pageReference') return titles.get(label(node.attributes?.pageId)) || label(node.attributes?.title) || '제목 없는 노트';
  return (node.text ?? '') + children(node).map(child => proseText(child, titles, depth + 1)).join('');
}

/** Index visible prose and live database item bodies, never orphan resources or scalar cell data. */
export function pageReferencesIn(document: NoteDocument, titles: ReadonlyMap<string, string> = new Map()): PageReferenceOccurrence[] {
  const found: PageReferenceOccurrence[] = [];
  const visited = new Set<Tree>();
  const visit = (node: Tree, inherited: Tree[] = [], item?: PageReferenceOccurrence['item'], context = '', depth = 0) => {
    if (depth > 100 || visited.has(node) || node.stype === 'resources') return;
    visited.add(node);
    const content = children(node);
    const local = content.find(child => child.stype === 'resources');
    const resources = local ? [...children(local), ...inherited] : inherited;
    const block = ['paragraph', 'heading', 'calloutTitle', 'bSummary', 'bTableCell', 'bTableHeaderCell', 'taskItem'].includes(node.stype ?? '');
    const excerpt = block ? proseText(node, titles).replace(/\s+/g, ' ').trim().slice(0, 180) : context;
    if (node.stype === 'pageReference' && label(node.attributes?.pageId)) found.push({
      pageId: label(node.attributes?.pageId), title: titles.get(label(node.attributes?.pageId)) || label(node.attributes?.title), excerpt,
      ...(item ? { item } : {})
    });
    if (node.stype === 'noteDatabase') {
      const source = label(node.attributes?.source);
      const dataset = resources.find(resource => resource.stype === 'dataset' && resource.attributes?.name === source);
      const attrs = dataset?.attributes;
      const rows = Array.isArray(attrs?.records) ? attrs.records : [];
      const rowIds = Array.isArray(attrs?.rowIds) ? attrs.rowIds : [];
      const fields = Array.isArray(attrs?.fields) ? attrs.fields : [];
      const titleField = fields.find(value => value && typeof value === 'object' && (value as Record<string, unknown>).kind === 'text') as { name?: string } | undefined;
      rows.forEach((value, index) => {
        const row = tree(value) as Record<string, unknown> | undefined;
        const rowId = label(rowIds[index]);
        if (!row || !rowId) return;
        const body = resources.find(resource => resource.stype === 'richText' && resource.attributes?.id === rowId);
        if (body) visit(body, resources, appendItem(item, { source, rowId, title: label(row[titleField?.name ?? '']) || `항목 ${index + 1}` }), '', depth + 1);
      });
    }
    for (const child of content) if (child.stype !== 'resources') visit(child, resources, item, excerpt, depth + 1);
  };
  visit(document);
  return found;
}

export function backlinksTo(pages: WorkspacePage[], pageId: string): PageBacklink[] {
  const metas = new Map(pages.map(page => [page.id, page.meta]));
  const titles = new Map(pages.map(page => [page.id, page.document.attributes.title]));
  return pages.filter(page => !pageInTrash(page.id, metas)).flatMap(page => {
    const references = pageReferencesIn(page.document, titles).filter(reference => reference.pageId === pageId);
    return references.length ? [{ page, references }] : [];
  });
}

/** Reimporting an existing page makes a copy; only its self references follow the new identity. */
export function importedPage(document: NoteDocument, existing: ReadonlySet<string>, createId: () => string): { id: string; document: NoteDocument } {
  const oldId = document.attributes.pageId;
  const id = oldId && !existing.has(oldId) ? oldId : createId();
  const copy = structuredClone(document);
  copy.attributes.pageId = id;
  if (oldId && oldId !== id) {
    const remap = (node: Tree, depth = 0) => {
      if (depth > 100) return;
      if (node.stype === 'pageReference' && node.attributes?.pageId === oldId) node.attributes.pageId = id;
      children(node).forEach(child => remap(child, depth + 1));
    };
    remap(copy);
  }
  return { id, document: copy };
}
