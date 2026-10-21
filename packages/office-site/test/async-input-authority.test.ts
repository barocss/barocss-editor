import { afterEach, expect, it, vi } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { datasetsOf } from '../src/data';
import { pagesOf } from '../src/selection';

const editors: ReturnType<typeof createSiteEditor>[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); vi.unstubAllGlobals(); });
function fixture() {
  const schema = createSchema('site', getSiteSchemaDefinition());
  const editor = createSiteEditor({ editable: true, schema, dataStore: new DataStore(undefined, schema) });
  editors.push(editor); editor.loadDocument(createSampleSite());
  const doc = { rootId: editor.getRootId()!, getNode: (id: string) => editor.dataStore.getNode(id) };
  return { editor, dataset: datasetsOf(doc)[0].sid!, page: pagesOf(doc)[0].sid };
}
const state = (editor: ReturnType<typeof createSiteEditor>) => structuredClone({
  native: editor.exportDocument(), nodes: editor.dataStore.getAllNodes(), selection: editor.selection,
  history: editor.historyManager.getHistory(), stats: editor.getHistoryStats()
});
function held<T>() { let release!: (value: T) => void; const promise = new Promise<T>(resolve => { release = resolve; }); return { promise, release }; }
function retire(editor: ReturnType<typeof createSiteEditor>, kind: string) {
  if (kind === 'authority ABA') { editor.setEditable(false); editor.setEditable(true); }
  else editor.loadDocument(editor.exportDocument());
}
for (const kind of ['authority ABA', 'same-root reload']) {
  it(`refuses a real dataset response dispatched before ${kind}`, async () => {
    const { editor, dataset } = fixture();
    expect(await editor.executeCommand('setDatasetInfo', { nodeId: dataset, kind: 'url', url: 'https://fixture.invalid/rows' })).toBe(true);
    const answer = held<Response>(); const fetch = vi.fn(() => answer.promise);
    const pending = editor.executeCommand('refreshDataset', { nodeId: dataset, fetch });
    expect(fetch).toHaveBeenCalledOnce(); retire(editor, kind); const before = state(editor);
    answer.release({ ok: true, json: async () => [{ title: 'late response' }] } as Response);
    expect(await pending).toBe(false); expect(state(editor)).toEqual(before);
  });
  for (const command of ['pasteBlocks', 'cutBlocks']) it(`refuses actual ${command} clipboard completion after ${kind}`, async () => {
    const { editor, page } = fixture(); const block = editor.dataStore.getNode(page)!.content![0] as string;
    let copied = ''; vi.stubGlobal('navigator', { clipboard: { writeText: async (text: string) => { copied = text; } } });
    expect(await editor.executeCommand('copyBlocks', { nodeIds: [block] })).toBe(true);
    const clipboard = held<string>(); const wait = vi.fn(() => clipboard.promise);
    vi.stubGlobal('navigator', { clipboard: { readText: wait, writeText: wait } });
    const pending = editor.executeCommand(command, { pageId: page, nodeIds: [block] });
    expect(wait).toHaveBeenCalledOnce(); retire(editor, kind); const before = state(editor);
    clipboard.release(copied); expect(await pending).toBe(false); expect(state(editor)).toEqual(before);
  });
}
it('admits a current real dataset response and keeps its normal history entry', async () => {
  const { editor, dataset } = fixture();
  await editor.executeCommand('setDatasetInfo', { nodeId: dataset, kind: 'url', url: 'https://fixture.invalid/rows' });
  const before = editor.historyManager.getHistory().length;
  expect(await editor.executeCommand('refreshDataset', { nodeId: dataset, fetch: async () => ({ ok: true, json: async () => [{ title: 'current' }] }) })).toBe(true);
  expect(editor.dataStore.getNode(dataset)!.attributes?.records).toEqual([{ title: 'current' }]);
  expect(editor.historyManager.getHistory()).toHaveLength(before + 1);
});
it('keeps delegated cut removal guarded while the actual model lock is held', async () => {
  const { editor, page } = fixture(); const block = editor.dataStore.getNode(page)!.content![0] as string;
  let owns = true; const clipboard = vi.fn(async () => {});
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
  const lock = await editor.dataStore.acquireLock('held-cut');
  const entered = held<void>(); const acquire = editor.dataStore.acquireLock.bind(editor.dataStore);
  vi.spyOn(editor.dataStore, 'acquireLock').mockImplementation((...args) => { entered.release(); return acquire(...args); });
  const pending = editor.executeCommand('cutBlocks', { nodeIds: [block], canApply: () => owns });
  await entered.promise; expect(clipboard).toHaveBeenCalledOnce();
  owns = false; const before = state(editor); editor.dataStore.releaseLock(lock);
  expect(await pending).toBe(false); expect(state(editor)).toEqual(before);
});
