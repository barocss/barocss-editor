import { walkBlocks, type DocumentAccess } from './document-access';

export interface DocumentBookmark {
  name: string;
  text: string;
  sid: string;
  offset: number;
  order: number;
  kind: 'range' | 'point';
}
/** One index for reference rendering and product navigation. Range fragments share a name. */
export function documentBookmarks(doc: DocumentAccess): DocumentBookmark[] {
  const entries = new Map<string, DocumentBookmark>();
  let order = 0;
  for (const node of walkBlocks(doc, doc.getNode(doc.rootId))) {
    if (!node.sid) continue;
    if (node.stype === 'bookmarkAnchor' && typeof node.attributes?.id === 'string') {
      const name = node.attributes.id;
      if (!entries.has(name)) entries.set(name, { name, text: name, sid: node.sid, offset: 0, order, kind: 'point' });
    }
    for (const mark of node.marks ?? []) {
      const name = mark.attrs?.name;
      if (mark.stype !== 'bookmark' || typeof name !== 'string' || typeof node.text !== 'string') continue;
      const [start, end] = mark.range ?? [0, node.text.length];
      const text = node.text.slice(start, end);
      const entry = entries.get(name);
      if (entry?.kind === 'range') entry.text += text;
      else if (!entry) entries.set(name, { name, text, sid: node.sid, offset: start, order, kind: 'range' });
    }
    order++;
  }
  return [...entries.values()].map(entry => ({ ...entry, text: entry.text.trim() }));
}
