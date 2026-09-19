import { test, expect } from '@playwright/test';
import type { NoteDocument } from '@barocss/office-note';
import { pageMeta, searchPages, type WorkspacePage } from '../src/workspace-library';
import { pageReferencesIn, backlinksTo, importedPage } from '../src/workspace-references';

const reference = (pageId = 'target', title = '이전 제목') => ({ stype: 'pageReference', attributes: { pageId, title } });
const paragraph = (...content: unknown[]) => ({ stype: 'paragraph', content });
const document = (content: unknown[], pageId?: string): NoteDocument => ({ stype: 'note', attributes: { title: '문서', ...(pageId ? { pageId } : {}) }, content });
const page = (id: string, content: unknown[], parentId: string | null = null): WorkspacePage => ({ id, document: document(content, id), meta: { ...pageMeta(), parentId } });

test('backlinks count explicit references, use current titles, and exclude inherited trash', () => {
  const pages = [page('target', []), page('source', [paragraph({ stype: 'inline-text', text: '관련 내용: ' }, reference()), paragraph(reference())]), page('deleted', [paragraph(reference())]), page('child', [paragraph(reference())], 'deleted')];
  pages[0].document.attributes.title = '새 제목';
  pages[2].meta.trashedAt = 1;
  const before = JSON.stringify(pages);
  const links = backlinksTo(pages, 'target');
  expect(links.map(link => link.page.id)).toEqual(['source']);
  expect(links[0].references).toHaveLength(2);
  expect(links[0].references[0]).toMatchObject({ title: '새 제목', excerpt: '관련 내용: 새 제목' });
  expect(searchPages(pages, '새 제목').map(page => page.id)).toContain('source');
  expect(JSON.stringify(pages)).toBe(before);
  expect(pageReferencesIn(document([paragraph({ stype: 'inline-text', text: '[[target]] https://host/#target' })]))).toEqual([]);
});

test('only reachable item bodies contribute backlinks, with stable navigation targets and no duplicate views', () => {
  const doc = document([
    { stype: 'noteDatabase', attributes: { source: 'tasks' } }, { stype: 'noteDatabase', attributes: { source: 'tasks' } },
    { stype: 'resources', content: [
      { stype: 'dataset', attributes: { name: 'tasks', fields: [{ name: 'Name', kind: 'text' }], records: [{ Name: '출시 준비' }], rowIds: ['item-1'] } },
      { stype: 'richText', attributes: { id: 'item-1' }, content: [paragraph(reference())] },
      { stype: 'richText', attributes: { id: 'deleted-item' }, content: [paragraph(reference())] },
      { stype: 'dataset', attributes: { name: 'orphan', records: [{}], rowIds: ['orphan-item'] } },
      { stype: 'richText', attributes: { id: 'orphan-item' }, content: [paragraph(reference())] }
    ] }
  ]);
  const found = pageReferencesIn(doc);
  expect(found).toHaveLength(1);
  expect(found[0].item).toEqual({ source: 'tasks', rowId: 'item-1', title: '출시 준비' });
  doc.content = doc.content.filter((node: any) => node.stype !== 'noteDatabase');
  expect(pageReferencesIn(doc)).toEqual([]);
});

test('embedded local resources shadow parent resources when traversing item bodies', () => {
  const doc = document([{ stype: 'noteDatabase', attributes: { source: 'outer' } }, { stype: 'resources', content: [
    { stype: 'dataset', attributes: { name: 'outer', records: [{}], rowIds: ['outer-item'] } },
    { stype: 'richText', attributes: { id: 'outer-item' }, content: [
      { stype: 'noteDatabase', attributes: { source: 'inner' } }, { stype: 'resources', content: [
        { stype: 'dataset', attributes: { name: 'inner', records: [{}], rowIds: ['inner-item'] } },
        { stype: 'richText', attributes: { id: 'inner-item' }, content: [paragraph(reference('correct'))] }
      ] }
    ] },
    { stype: 'dataset', attributes: { name: 'inner', records: [{}], rowIds: ['wrong-item'] } },
    { stype: 'richText', attributes: { id: 'wrong-item' }, content: [paragraph(reference('wrong'))] }
  ] }]);
  expect(pageReferencesIn(doc).map(reference => reference.pageId)).toEqual(['correct']);
  expect(pageReferencesIn(doc)[0].item).toMatchObject({ source: 'outer', rowId: 'outer-item', next: { source: 'inner', rowId: 'inner-item' } });
});

test('import preserves a fresh identity and remaps only self references on collisions without altering originals', () => {
  const original = document([paragraph(reference('self'), reference('other'))], 'self');
  const before = JSON.stringify(original);
  const fresh = importedPage(original, new Set(), () => 'new-id');
  expect(fresh.id).toBe('self'); expect(fresh.document.attributes.pageId).toBe('self');
  const copied = importedPage(original, new Set(['self']), () => 'copy-id');
  expect(copied.id).toBe('copy-id'); expect(copied.document.attributes.pageId).toBe('copy-id');
  expect(pageReferencesIn(copied.document).map(reference => reference.pageId)).toEqual(['copy-id', 'other']);
  expect(JSON.stringify(original)).toBe(before);
  expect(importedPage(document([]), new Set(), () => 'legacy-id').document.attributes.pageId).toBe('legacy-id');
});
