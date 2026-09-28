import { afterEach, describe, expect, it } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { createSiteEditor } from '../src/site-kit';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { createSampleSite } from '../src/sample-site';
import { datasetNamed, richTextNamed, richTextsOf } from '../src/data';

const command = 'createDatasetRichText';
const editors: ReturnType<typeof createSiteEditor>[] = [];
afterEach(() => { for (const editor of editors.splice(0)) editor.destroy(); });

function setup(value?: unknown) {
  const schema = createSchema('empty-body', getSiteSchemaDefinition());
  const store = new DataStore(undefined, schema);
  const editor = createSiteEditor({ schema, dataStore: store, editable: true } as never);
  editors.push(editor);
  const tree: any = createSampleSite();
  tree.content.find((node: any) => node.stype === 'resources').content.push({ stype: 'dataset', attributes: {
    name: 'empty-body', fields: [{ name: 'Title', kind: 'text' }, { name: 'Body', kind: 'richText' }, { name: 'Other', kind: 'richText' }],
    rowIds: ['first', 'second'], records: [{ Title: 'First', Body: value, Other: '' }, { Title: 'Second', Body: '', Other: 'text:missing' }],
  } });
  editor.loadDocument(tree, 'empty-body');
  const doc = { rootId: editor.getRootId()!, getNode: (id: string) => store.getNode(id) };
  const nodeId = datasetNamed(doc, 'empty-body')!.sid!;
  const payload = { nodeId, row: 0, field: 'Body' };
  const records = () => store.getNode(nodeId)!.attributes!.records as Record<string, unknown>[];
  return { editor, store, doc, payload, records };
}

describe('createDatasetRichText', () => {
  it.each([undefined, null, ''])('creates and links one editable paragraph for the empty value %s in one undo entry', async value => {
    const { editor, store, doc, payload, records } = setup(value);
    const before = editor.exportDocument();
    const oldRows = structuredClone(records());
    const oldRich = richTextsOf(doc);
    const entries = editor.historyManager.getStats().totalEntries;
    expect(editor.canRun(command, payload)).toBe(true);
    expect(await editor.run(command, payload)).toBe(true);
    const ref = records()[0].Body;
    expect(ref).toMatch(/^text:.+/);
    const body = richTextNamed(doc, ref)!;
    expect(body).toBeDefined();
    expect(body.content).toHaveLength(1);
    const paragraph = store.getNode(body.content[0])!;
    expect(paragraph.stype).toBe('paragraph');
    expect(paragraph.content).toHaveLength(1);
    expect(store.getNode(String(paragraph.content![0]))).toMatchObject({ stype: 'inline-text', text: '' });
    expect((paragraph.content ?? []).map(id => store.getNode(String(id))?.text ?? '').join('')).toBe('');
    expect(records()).toEqual([{ ...oldRows[0], Body: ref }, oldRows[1]]);
    expect(store.getNode(payload.nodeId)!.attributes!.rowIds).toEqual(['first', 'second']);
    expect(richTextsOf(doc)).toHaveLength(oldRich.length + 1);
    expect(editor.historyManager.getStats().totalEntries).toBe(entries + 1);
    const after = editor.exportDocument();
    await editor.undo();
    expect(editor.exportDocument()).toEqual(before);
    expect(richTextNamed(doc, ref)).toBeUndefined();
    await editor.redo();
    expect(editor.exportDocument()).toEqual(after);
  });

  it('uses a different resource for each empty cell and does not recreate an existing body', async () => {
    const { editor, doc, payload, records } = setup();
    expect(await editor.run(command, payload)).toBe(true);
    const first = records()[0].Body;
    expect(await editor.run(command, { ...payload, row: 1 })).toBe(true);
    expect(records()[1].Body).not.toBe(first);
    expect(richTextNamed(doc, first)).toBeDefined();
    expect(richTextNamed(doc, records()[1].Body)).toBeDefined();
    const before = editor.exportDocument();
    expect(editor.canRun(command, payload)).toBe(false);
    expect(await editor.run(command, payload)).toBe(false);
    expect(editor.exportDocument()).toEqual(before);
  });

  it.each(['text:요약-스택', 'text:missing', 'plain text', ' ', 0, false, [], {}])('refuses an existing value %j without changing resources, rows or history', async value => {
    const { editor, payload } = setup(value);
    const before = editor.exportDocument(), entries = editor.historyManager.getStats().totalEntries;
    expect(editor.canRun(command, payload)).toBe(false);
    expect(await editor.run(command, payload)).toBe(false);
    expect(editor.exportDocument()).toEqual(before);
    expect(editor.historyManager.getStats().totalEntries).toBe(entries);
  });

  it.each([{ row: -1 }, { row: 2 }, { row: 0.5 }, { row: '0' }, { row: null }, { row: undefined },
    { field: 'Title' }, { field: 'missing' }, { field: '' }, { field: 5 }, { nodeId: 'missing' }])('rejects an invalid target %j in availability and execution', async patch => {
    const { editor, payload } = setup();
    const before = editor.exportDocument();
    expect(editor.canRun(command, { ...payload, ...patch })).toBe(false);
    expect(await editor.run(command, { ...payload, ...patch })).toBe(false);
    expect(editor.exportDocument()).toEqual(before);
  });

  it('refuses editing a read-only document', async () => {
    const { editor, payload } = setup();
    editor.setEditable(false);
    const before = editor.exportDocument();
    expect(editor.canRun(command, payload)).toBe(false);
    expect(await editor.run(command, payload)).toBe(false);
    expect(editor.exportDocument()).toEqual(before);
  });

  it('refuses a dataset outside the current document even when the store contains it', async () => {
    const { editor, store, payload } = setup();
    const foreign = { ...store.getNode(payload.nodeId)!, sid: 'foreign-dataset', parentId: 'foreign-resources' };
    store.setNode(foreign, false);
    const before = editor.exportDocument(), foreignBefore = structuredClone(store.getNode(foreign.sid));
    expect(editor.canRun(command, { ...payload, nodeId: foreign.sid })).toBe(false);
    expect(await editor.run(command, { ...payload, nodeId: foreign.sid })).toBe(false);
    expect(editor.exportDocument()).toEqual(before);
    expect(store.getNode(foreign.sid)).toEqual(foreignBefore);
  });

  it('refuses a document without resources without adding an orphan body', async () => {
    const { editor, store, doc, payload } = setup();
    const root = store.getNode(doc.rootId)!;
    store.setNode({ ...root, content: root.content!.filter(id => store.getNode(String(id))?.stype !== 'resources') }, false);
    const before = editor.exportDocument(), datasetBefore = structuredClone(store.getNode(payload.nodeId));
    expect(editor.canRun(command, payload)).toBe(false);
    expect(await editor.run(command, payload)).toBe(false);
    expect(editor.exportDocument()).toEqual(before);
    expect(store.getNode(payload.nodeId)).toEqual(datasetBefore);
  });
});
