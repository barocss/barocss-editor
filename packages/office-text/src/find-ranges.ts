import { childrenOf, type DocumentAccess, type DocumentNode } from './document-access';
import type { FindOptions, Match } from './find';

export interface TextMatch { blockId: string; text: string; parts: Match[] }

/** Read-only matches across adjacent formatted runs, never across blocks or inline objects. */
export function findTextRanges(doc: DocumentAccess, query: string, options: FindOptions = {}): TextMatch[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options.caseSensitive ? 'gu' : 'giu');
  const result: TextMatch[] = [];
  const word = (value: string) => /[\p{L}\p{N}_]/u.test(value);
  const scan = (nodes: DocumentNode[], blockId: string) => {
    const pieces: { sid: string; text: string; at: number }[] = []; let text = '';
    for (const node of nodes) { if (!node.sid) continue; pieces.push({ sid: node.sid, text: node.text ?? '', at: text.length }); text += node.text ?? ''; }
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const start = match.index!, end = start + match[0].length;
      if (options.wholeWord && (word(Array.from(text.slice(0, start)).at(-1) ?? '') || word(Array.from(text.slice(end))[0] ?? ''))) continue;
      result.push({ blockId, text, parts: pieces.filter(piece => piece.at < end && piece.at + piece.text.length > start).map(piece => ({ sid: piece.sid, start: Math.max(0, start - piece.at), end: Math.min(piece.text.length, end - piece.at) })) });
    }
  };
  const visit = (node: DocumentNode | undefined, depth: number) => {
    if (!node || depth > 100 || ['resources', 'docMeta'].includes(node.stype ?? '')) return;
    if (typeof node.text === 'string') { scan([node], node.parentId ?? node.sid ?? ''); return; }
    let runs: DocumentNode[] = [];
    const flush = () => { if (runs.length) scan(runs, node.sid ?? ''); runs = []; };
    for (const child of childrenOf(doc, node)) {
      if (typeof child.text === 'string') runs.push(child);
      else { flush(); visit(child, depth + 1); }
    }
    flush();
  };
  visit(doc.getNode(doc.rootId), 0);
  return result;
}
