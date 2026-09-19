import { childrenOf, type DocumentAccess, type DocumentNode } from '@barocss/office-text';
export interface NoteHeading { id: string; label: string; level: number }
export function noteHeadings(doc: DocumentAccess): NoteHeading[] {
  const headings: NoteHeading[] = [];
  const text = (node: DocumentNode, depth = 0): string => depth > 100 ? '' : node.text ?? childrenOf(doc, node).map(child => text(child, depth + 1)).join('');
  const visit = (node: DocumentNode | undefined, depth: number) => {
    if (!node || depth > 100 || node.stype === 'resources') return;
    if (node.stype === 'heading' && node.sid) headings.push({ id: node.sid, label: text(node).trim() || '제목 없음', level: Math.max(1, Math.min(6, Number(node.attributes?.level) || 1)) });
    for (const child of childrenOf(doc, node)) visit(child, depth + 1);
  };
  visit(doc.getNode(doc.rootId), 0); return headings;
}
