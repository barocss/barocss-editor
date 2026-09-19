import { test, expect } from '@playwright/test';
import { noteFileText, readNoteFile, type NoteDocument } from '@barocss/office-note';
import { planWorkspaceRestore, readWorkspaceBackup, workspaceBackupText, type BackupEntry, type WorkspaceBackup } from '../src/workspace-backup';
const ref = (pageId: string) => ({ stype: 'pageReference', attributes: { pageId, title: pageId } });
const entry = (id: string, content: unknown[] = [], metadata: Record<string, unknown> = {}, declared = id): BackupEntry => ({ id, title: id, savedAt: 123, metadata, text: noteFileText({ stype: 'note', attributes: { title: id, pageId: declared }, content: [{ stype: 'paragraph', content: [] }, ...content.map((node: any) => node.stype === 'pageReference' ? { stype: 'paragraph', content: [node] } : node)] } as NoteDocument) });
const backup = (pages: BackupEntry[], drafts: BackupEntry[] = []): WorkspaceBackup => ({ format: 'barocss-note-workspace', version: 1, createdAt: '2026-09-07T00:00:00Z', pages, drafts });
const refs = (document?: NoteDocument) => {
  const result: string[] = [];
  const visit = (node: any) => { if (node.stype === 'pageReference') result.push(node.attributes.pageId); for (const child of node.content ?? []) visit(child); };
  if (document) visit(document); return result;
};
test('conflicts remap nested references and hierarchy together while preserving favorite/trash metadata', () => {
  const source = backup([entry('a', [{ stype: 'resources', content: [{ stype: 'richText', attributes: { id: 'item-body' }, content: [{ stype: 'paragraph', content: [ref('a'), ref('b'), ref('external')] }] }] }], { favorite: true, trashedAt: 100 }), entry('b', [], { parentId: 'a' })]);
  const before = JSON.stringify(source), generated = ['b', 'a', 'copied-a'];
  const plan = planWorkspaceRestore(source, new Set(['a']), () => generated.shift()!);
  expect(plan.pages.map(page => page.id)).toEqual(['copied-a', 'b']);
  expect(refs(plan.pages[0].document)).toEqual(['copied-a', 'b', 'external']);
  expect(plan.pages[1].meta.parentId).toBe('copied-a');
  expect(plan.pages[0].meta).toMatchObject({ favorite: true, trashedAt: 100 });
  expect(plan.writes.every(write => write.expectedRevision === null)).toBe(true);
  expect(plan.copied).toBe(1); expect(JSON.stringify(source)).toBe(before);
});
test('raw unreadable files survive unchanged, recovery drafts get new self identities and stay out of trash', () => {
  const raw = '{damaged bytes\n🙂';
  const draft = entry('draft-storage', [ref('original'), ref('legacy-self'), ref('other')], { originalId: 'original', page: { trashedAt: 100, parentId: 'original', favorite: true } }, 'legacy-self');
  const generated = ['draft-storage', 'legacy-self', 'draft-copy'];
  const plan = planWorkspaceRestore(backup([{ id: 'broken', title: '원본', savedAt: 2, text: raw }, entry('original'), entry('other')], [draft]), new Set(), () => generated.shift()!);
  expect(plan.writes[0].text).toBe(raw); expect(plan.unreadable).toBe(1);
  expect(plan.pages[3].id).toBe('draft-copy');
  expect(refs(plan.pages[3].document)).toEqual(['draft-copy', 'draft-copy', 'other']);
  expect(plan.pages[3].meta).toMatchObject({ trashedAt: null, parentId: null, favorite: true });
});
test('legacy document identity is remapped only when another archived page does not own that ID', () => {
  const self = planWorkspaceRestore(backup([entry('stored', [ref('legacy')], {}, 'legacy')]), new Set());
  expect(refs(self.pages[0].document)).toEqual(['stored']);
  const cross = planWorkspaceRestore(backup([entry('stored', [ref('legacy')], {}, 'legacy'), entry('legacy')]), new Set());
  expect(refs(cross.pages[0].document)).toEqual(['legacy']);
});
test('missing parents and cycles detach safely without changing document bodies', () => {
  const plan = planWorkspaceRestore(backup([entry('a', [ref('b')], { parentId: 'b' }), entry('b', [], { parentId: 'a' }), entry('c', [], { parentId: 'unrelated-existing' })]), new Set(['unrelated-existing']));
  expect(plan.pages.every(page => page.meta.parentId === null)).toBe(true);
  expect(plan.repairedParents).toBe(3); expect(refs(plan.pages[0].document)).toEqual(['b']);
});
test('backup transport preserves unreadable raw text and rejects duplicate identities and malformed envelopes', () => {
  const text = workspaceBackupText([{ row: { name: 'broken', title: 'Raw', savedAt: 10 }, text: 'not json' }], [], new Date('2026-09-07'));
  const parsed = readWorkspaceBackup(text); expect('backup' in parsed && parsed.backup.pages[0].text).toBe('not json');
  for (const value of [backup([entry('a'), entry('a')]), { ...backup([]), createdAt: 'bad date' }, { ...backup([]), drafts: {} }, { ...backup([]), version: 2 }]) expect(readWorkspaceBackup(JSON.stringify(value))).toHaveProperty('error');
  expect(readWorkspaceBackup('bad json')).toHaveProperty('error');
  expect(() => planWorkspaceRestore(backup([entry('a')]), new Set(['a']), () => 'a')).toThrow();
  expect(readNoteFile(planWorkspaceRestore(backup([entry('a')]), new Set()).writes[0].text)).toHaveProperty('document');
});

test('a page parser exception preserves its raw bytes instead of aborting the whole archive', () => {
  const nested = '{"stype":"blockquote","content":['.repeat(12000) + '{"stype":"paragraph","content":[]}' + ']}'.repeat(12000);
  const raw = '{"format":"barocss-note","version":1,"document":{"stype":"note","attributes":{"title":"deep","pageId":"deep"},"content":[' + nested + ']}}';
  const plan = planWorkspaceRestore(backup([{ id: 'deep', title: 'deep', savedAt: 1, text: raw }, entry('valid')]), new Set());
  expect(plan.unreadable).toBe(1); expect(plan.writes[0].text).toBe(raw);
  expect(plan.pages[1].document?.attributes.pageId).toBe('valid');
});

test('the import size limit counts UTF-8 bytes, not JavaScript characters', () => {
  const source = '한'.repeat(Math.floor(100 * 1024 * 1024 / 3) + 1);
  expect(source.length).toBeLessThan(100 * 1024 * 1024);
  expect(readWorkspaceBackup(source)).toEqual({ error: '백업 파일은 100MB 이하로 열 수 있습니다.' });
});
