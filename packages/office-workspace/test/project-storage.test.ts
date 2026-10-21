import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectComment, requestProjectWork } from '../../shared/src/connected-work';
const memory = vi.hoisted(() => new Map<string, Map<string, { row: { name: string; title?: string; savedAt: number; revision: number; metadata?: Record<string, unknown> }; text: string }>>());
vi.mock('@barocss/shared', async importOriginal => {
  const actual = await importOriginal<typeof import('../../shared/src/index')>();
  return { ...actual, documentLibrary: ({ db, store }: { db: string; store: string }) => {
    const key = `${db}/${store}`; if (!memory.has(key)) memory.set(key, new Map());
    const records = memory.get(key)!;
    const read = async (name: string) => structuredClone(records.get(name));
    const keep = async (entry: { name: string; title?: string; metadata?: Record<string, unknown> }, text: string, options: { expectedRevision?: number | null } = {}) => {
      const current = records.get(entry.name), revision = current?.row.revision ?? null;
      if (options.expectedRevision !== undefined && options.expectedRevision !== revision) throw new actual.LibraryRevisionConflict(options.expectedRevision, current);
      const row = { ...entry, savedAt: 1, revision: (revision ?? 0) + 1 };
      records.set(entry.name, { row, text }); return structuredClone(row);
    };
    return { read, keep, snapshots: async () => structuredClone([...records.values()]),
      keepMany: async (items: { entry: { name: string; title?: string }; text: string; expectedRevision?: number | null }[]) => {
        for (const item of items) if (item.expectedRevision !== undefined && (records.get(item.entry.name)?.row.revision ?? null) !== item.expectedRevision) throw new Error('Conflict');
        return Promise.all(items.map(item => keep(item.entry, item.text, item)));
      } };
  } };
});
vi.mock('@barocss/schema', () => ({ createSchema: () => ({}), validateTree: () => [] }));
vi.mock('../src/products', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/products')>();
  return { ...actual, productCodec: async () => ({ read: (text: string) => ({ document: JSON.parse(text).document }), schema: () => ({}), text: (document: unknown) => JSON.stringify({ document }) }) };
});
import { documentLibrary } from '@barocss/shared';
import { productStore } from '../src/products';
import { OfficeWorkspace, readWorkspaceBackup } from '../src/workspace';
async function original() {
  await productStore('word').keep({ name: 'original', title: '고객 설치 안내' }, JSON.stringify({ document: { stype: 'doc', content: [{ stype: 'resources', content: [{ stype: 'commentThread', attributes: { id: 'durable-thread', resolved: false }, content: [] }] }, { stype: 'docMeta', content: [{ stype: 'docTitle', content: [{ stype: 'text', text: '안내' }] }] }, { stype: 'paragraph', content: [{ stype: 'text', text: '앱 실행 중에도 설치합니다.' }] }] } }), { expectedRevision: null });
}
async function withResult(workspace: OfficeWorkspace) {
  const project = await workspace.createProject('Windows 베타 공개', '고객 설치를 돕는다');
  project.record.results.push({ id: 'result', name: '고객 설치 안내', document: { product: 'word', id: 'original' }, inputs: [await workspace.pin({ product: 'word', id: 'original' })] });
  return workspace.saveProject(project.record, project.revision);
}
beforeEach(() => { memory.clear(); });
describe('local project storage', () => {
  it('persists goals, results, comment-only feedback and explicit unconnected work across reopening', async () => {
    await original(); const workspace = new OfficeWorkspace('local');
    const before = await productStore('word').read('original'), project = await withResult(workspace);
    const pin = project.record.results[0]!.inputs[0]!;
    const feedback = createProjectComment(project.record, { resultId: 'result', target: { kind: 'document', id: 'original', quote: '앱 실행 중' }, pin,
      actor: { kind: 'local', id: 'owner', label: 'Local owner' }, body: '교육자료에도 반영해줘.' });
    const saved = await workspace.saveProject(feedback, project.revision);
    expect(saved.record.works).toEqual([]); expect(await productStore('word').read('original')).toEqual(before);
    const requested = requestProjectWork(saved.record, saved.record.comments[0]!.id, '교육자료에도 반영해줘.');
    await workspace.saveProject(requested, saved.revision);
    const reopened = (await new OfficeWorkspace('local').project(project.record.id))!;
    expect(reopened.record.works[0]?.state).toBe('unconnected'); expect(reopened.record.works[0]?.inputs[0]?.text).toBe(before?.text);
    expect((await workspace.list()).map(d => d.id)).toEqual(['original']);
  });
  it('does not overwrite another writer, a pinned source, or changed source bytes', async () => {
    await original(); const workspace = new OfficeWorkspace('cas');
    const project = await withResult(workspace), other = (await new OfficeWorkspace('cas').project(project.record.id))!;
    project.record.goal = '현재 목표'; await workspace.saveProject(project.record, project.revision);
    other.record.goal = '오래된 목표'; await expect(workspace.saveProject(other.record, other.revision)).rejects.toThrow('another writer');
    const latest = (await workspace.project(project.record.id))!;
    latest.record.results[0]!.inputs[0]!.text = 'forged'; await expect(workspace.saveProject(latest.record, latest.revision)).rejects.toThrow('immutable');
    const empty = await workspace.createProject('다른 프로젝트', ''); const stalePin = await workspace.pin({ product: 'word', id: 'original' });
    const source = (await productStore('word').read('original'))!; await productStore('word').keep(source.row, `${source.text} `, { expectedRevision: source.row.revision });
    empty.record.results.push({ id: 'r', name: '결과', document: stalePin.document, inputs: [stalePin] });
    await expect(workspace.saveProject(empty.record, empty.revision)).rejects.toThrow('source changed');
    expect((await workspace.project(empty.record.id))?.record.results).toEqual([]);
  });
  it('refuses missing or trashed current sources but retains historical evidence after a source changes', async () => {
    await original(); const workspace = new OfficeWorkspace('trash'), project = await withResult(workspace);
    await expect(workspace.pin({ product: 'word', id: 'missing' })).rejects.toThrow('자료가 없습니다');
    const source = (await productStore('word').read('original'))!; await productStore('word').keep(source.row, `${source.text} `, { expectedRevision: source.row.revision });
    project.record.drafts.result = '의견 초안'; const saved = await workspace.saveProject(project.record, project.revision);
    expect(saved.record.results[0]?.inputs[0]?.text).toBe(source.text);
    await workspace.update('word:original', { trashedAt: 100 });
    await expect(workspace.pin({ product: 'word', id: 'original' })).rejects.toThrow('trash');
  });
  it('restores native result links to new originals while keeping exact historical pin bytes and thread IDs', async () => {
    await original(); const workspace = new OfficeWorkspace('backup'), project = await withResult(workspace);
    const pin = project.record.results[0]!.inputs[0]!;
    const feedback = createProjectComment(project.record, { resultId: 'result', target: { kind: 'word-comment', id: 'durable-thread', quote: '앱 실행 중' }, pin,
      actor: { kind: 'local', id: 'owner', label: 'Local owner' }, body: '설명 추가' });
    await workspace.saveProject(feedback, project.revision);
    const backup = await workspace.backup(), originals = await productStore('word').snapshots();
    expect(await workspace.restore(backup)).toBe(1);
    const restored = (await workspace.projects()).find(p => p.record.id !== project.record.id)!;
    expect(restored.record.results[0]?.document.id).not.toBe('original'); expect(restored.record.comments[0]?.pin).toEqual(pin);
    expect(restored.record.comments[0]?.target.id).toBe('durable-thread'); expect((await productStore('word').read('original'))).toEqual(originals[0]);
    const legacy = structuredClone(backup); delete legacy.projects; expect(readWorkspaceBackup(legacy).projects).toBeUndefined();
    expect(await new OfficeWorkspace('legacy').restore(legacy)).toBe(1);
  });
  it('rejects malformed backup/project membership before any native write and records partial failure truthfully', async () => {
    await original(); const workspace = new OfficeWorkspace('invalid'); await withResult(workspace);
    const backup = await workspace.backup(), before = await productStore('word').snapshots();
    const malformed = structuredClone(backup); malformed.projects![0]!.results.push({ ...malformed.projects![0]!.results[0]!, id: 'duplicate' });
    await expect(workspace.restore(malformed)).rejects.toThrow('Invalid project'); expect(await productStore('word').snapshots()).toEqual(before);
    const forged = { ...backup, projects: [{ ...backup.projects![0], applied: true }] }; expect(() => readWorkspaceBackup(forged)).toThrow();
    const catalog = documentLibrary({ db: 'wonffice-workspace-invalid', store: 'catalog' });
    const keepMany = workspace.metaStore.keepMany.bind(workspace.metaStore);
    vi.spyOn(workspace.metaStore, 'keepMany').mockImplementation(async items => {
      if (items.length) throw new Error('storage unavailable');
      return keepMany(items);
    });
    await expect(workspace.restore(backup)).rejects.toThrow('1개 사본이 저장');
    expect((await catalog.snapshots()).filter(s => s.row.name.startsWith('project:'))).toHaveLength(1);
  });
  it('archives and unlinks without deleting originals, and retains empty projects', async () => {
    await original(); const workspace = new OfficeWorkspace('archive'), project = await withResult(workspace);
    project.record.results = []; project.record.archived = true; await workspace.saveProject(project.record, project.revision);
    const reopened = (await workspace.project(project.record.id))!;
    expect(reopened.record.archived).toBe(true); expect(reopened.record.results).toEqual([]); expect(await productStore('word').read('original')).toBeDefined();
    expect((await workspace.projects())).toHaveLength(1);
  });
});
