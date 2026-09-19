import type { NoteDocument } from '@barocss/office-note';

export interface PageMeta { version: 1; parentId: string | null; favorite: boolean; trashedAt: number | null; createdAt: number; }
export interface WorkspacePage { id: string; document: NoteDocument; meta: PageMeta; revision?: number; }
export type PageTemplate = 'blank' | 'meeting' | 'project';
const paragraph = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
const heading = (text: string) => ({ stype: 'heading', attributes: { level: 2 }, content: [{ stype: 'inline-text', text }] });
export function pageTemplate(kind: PageTemplate, first = false): NoteDocument {
  if (kind === 'blank') return { stype: 'note', attributes: { title: '새 노트' }, content: [paragraph('')] };
  if (kind === 'project') return { stype: 'note', attributes: { title: '프로젝트 계획' }, content: [heading('프로젝트 목표'), paragraph('무엇을, 누구를 위해 해결하나요?'), heading('성공 기준'), paragraph('완료를 판단할 수 있는 기준을 적어보세요.'), heading('범위와 일정'), paragraph('주요 단계와 목표 날짜를 적어보세요.'), heading('역할과 다음 행동'), paragraph('담당자와 첫 번째 할 일을 정하세요.'), heading('위험과 확인할 점'), paragraph('')] };
  return { stype: 'note', attributes: { title: first ? '첫 회의록' : '회의록' }, content: [heading('회의 정보'), paragraph('일시: '), paragraph('참석자: '), heading('안건'), paragraph('오늘 함께 논의할 내용을 적어보세요.'), heading('결정 사항'), paragraph(''), heading('다음 할 일'), paragraph('담당자와 기한을 함께 기록하세요.')] };
}
export function pageMeta(value?: Record<string, unknown>, savedAt = Date.now()): PageMeta {
  return { version: 1, parentId: typeof value?.parentId === 'string' && value.parentId ? value.parentId : null, favorite: value?.favorite === true, trashedAt: typeof value?.trashedAt === 'number' && Number.isFinite(value.trashedAt) ? value.trashedAt : null, createdAt: typeof value?.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : savedAt };
}
/** Repair missing/self/cyclic parent links in metadata only; document content never changes. */
export function normalizeHierarchy(pages: WorkspacePage[]): WorkspacePage[] {
  const byId = new Map(pages.map(page => [page.id, page]));
  return pages.map(page => {
    const seen = new Set([page.id]);
    let next = page.meta.parentId;
    while (next) {
      if (seen.has(next) || !byId.has(next)) return { ...page, meta: { ...page.meta, parentId: null } };
      seen.add(next);
      next = byId.get(next)!.meta.parentId;
    }
    return page;
  });
}
export function descendantOf(id: string, ancestor: string, metas: ReadonlyMap<string, PageMeta>): boolean {
  const seen = new Set<string>();
  let next = metas.get(id)?.parentId;
  while (next && !seen.has(next)) {
    if (next === ancestor) return true;
    seen.add(next); next = metas.get(next)?.parentId;
  }
  return false;
}
export function canMovePage(id: string, parentId: string | null, metas: ReadonlyMap<string, PageMeta>): boolean {
  return metas.has(id) && (parentId === null || (metas.has(parentId) && id !== parentId && !descendantOf(parentId, id, metas)));
}
export function pageInTrash(id: string, metas: ReadonlyMap<string, PageMeta>): boolean {
  const seen = new Set<string>();
  let next: string | null = id;
  while (next && !seen.has(next)) {
    seen.add(next);
    const meta = metas.get(next);
    if (meta?.trashedAt !== null && meta?.trashedAt !== undefined) return true;
    next = meta?.parentId ?? null;
  }
  return false;
}
export function pagePlainText(value: unknown, depth = 0, titles: ReadonlyMap<string, string> = new Map()): string {
  if (!value || typeof value !== 'object' || depth > 100) return '';
  const node = value as { stype?: unknown; text?: unknown; attributes?: Record<string, unknown>; content?: unknown[] };
  if (node.stype === 'pageReference') return titles.get(String(node.attributes?.pageId ?? '')) || String(node.attributes?.title ?? '');
  return [typeof node.text === 'string' ? node.text : '', ...(Array.isArray(node.content) ? node.content.map(child => pagePlainText(child, depth + 1, titles)) : [])].filter(Boolean).join(' ');
}
export function searchPages(pages: WorkspacePage[], query: string, titles: ReadonlyMap<string, string> = new Map(pages.map(page => [page.id, page.document.attributes.title]))): WorkspacePage[] {
  const needle = query.trim().normalize('NFC').toLocaleLowerCase();
  return needle ? pages.filter(page => `${page.document.attributes.title} ${pagePlainText(page.document, 0, titles)}`.normalize('NFC').toLocaleLowerCase().includes(needle)) : pages;
}
export function orderedPages(pages: WorkspacePage[]): { page: WorkspacePage; depth: number }[] {
  const ids = new Set(pages.map(page => page.id));
  const groups = new Map<string | null, WorkspacePage[]>();
  for (const page of pages) {
    const key = page.meta.parentId && ids.has(page.meta.parentId) ? page.meta.parentId : null;
    groups.set(key, [...(groups.get(key) ?? []), page]);
  }
  const rows: { page: WorkspacePage; depth: number }[] = [];
  const visited = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const page of groups.get(parent) ?? []) {
      if (visited.has(page.id)) continue;
      visited.add(page.id); rows.push({ page, depth }); walk(page.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}
