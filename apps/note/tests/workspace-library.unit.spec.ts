import { test, expect } from '@playwright/test';
import { pageMeta, pageTemplate, normalizeHierarchy, canMovePage, pageInTrash, orderedPages, searchPages, type WorkspacePage } from '../src/workspace-library';
const page = (id: string, parentId: string | null = null): WorkspacePage => ({ id, document: pageTemplate('blank'), meta: { ...pageMeta(undefined, 100), parentId } });
test('legacy metadata gets defaults without changing any document', () => {
  expect(pageMeta(undefined, 123)).toEqual({ version: 1, parentId: null, favorite: false, trashedAt: null, createdAt: 123 });
  expect(pageMeta({ favorite: true, parentId: 'parent', trashedAt: 456, createdAt: 789 })).toMatchObject({ favorite: true, parentId: 'parent', trashedAt: 456, createdAt: 789 });
});
test('hierarchy repairs missing and cyclic parents without losing body content', () => {
  const pages = [page('a', 'b'), page('b', 'a'), page('c', 'gone')];
  const before = JSON.stringify(pages);
  const repaired = normalizeHierarchy(pages);
  expect(repaired.every(page => page.meta.parentId === null)).toBe(true);
  expect(repaired.map(page => page.document)).toEqual(pages.map(page => page.document));
  expect(JSON.stringify(pages)).toBe(before);
});
test('moving beneath a descendant or itself is refused, valid parents are allowed', () => {
  const pages = [page('a'), page('b', 'a'), page('c', 'b'), page('other')];
  const metas = new Map(pages.map(page => [page.id, page.meta]));
  expect(canMovePage('a', 'a', metas)).toBe(false);
  expect(canMovePage('a', 'c', metas)).toBe(false);
  expect(canMovePage('a', 'missing', metas)).toBe(false);
  expect(canMovePage('b', 'other', metas)).toBe(true);
  expect(canMovePage('b', null, metas)).toBe(true);
  expect(orderedPages(pages).map(row => [row.page.id, row.depth])).toEqual([['a', 0], ['b', 1], ['c', 2], ['other', 0]]);
});
test('trashing a parent hides descendants and restoring it restores their hierarchy', () => {
  const pages = [page('a'), page('b', 'a'), page('c', 'b'), page('other')];
  const metas = new Map(pages.map(page => [page.id, page.meta]));
  metas.get('a')!.trashedAt = 456;
  expect(pages.map(page => pageInTrash(page.id, metas))).toEqual([true, true, true, false]);
  metas.get('a')!.trashedAt = null;
  expect(pages.some(page => pageInTrash(page.id, metas))).toBe(false);
  expect(metas.get('c')!.parentId).toBe('b');
});
test('search matches case-insensitive titles and nested body text without markup or metadata', () => {
  const pages = [page('a'), page('b')];
  pages[0].document.attributes.title = 'API 출시';
  pages[1].document = pageTemplate('project');
  expect(searchPages(pages, 'api').map(page => page.id)).toEqual(['a']);
  expect(searchPages(pages, '담당자').map(page => page.id)).toEqual(['b']);
  expect(searchPages(pages, 'paragraph')).toEqual([]);
  expect(searchPages(pages, '  ')).toHaveLength(2);
});
test('starter templates are independent documents containing usable sections', () => {
  expect(pageTemplate('meeting').attributes.title).toBe('회의록');
  expect(pageTemplate('project').content.length).toBeGreaterThan(5);
  expect(pageTemplate('blank').content).toHaveLength(1);
  const first = pageTemplate('blank'); first.attributes.title = 'Changed';
  expect(pageTemplate('blank').attributes.title).toBe('새 노트');
});
