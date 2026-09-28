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

  it('preserves both rows and distinct resources when two empty cells are created together', async () => {
    const { editor, doc, payload, records } = setup();
    const before = editor.exportDocument();
    const beforeRich = richTextsOf(doc).length;
    const results = await Promise.all([
      editor.run(command, payload),
      editor.run(command, { ...payload, row: 1 }),
    ]);
    expect(results).toEqual([true, true]);
    const first = records()[0].Body, second = records()[1].Body;
    expect(first).toMatch(/^text:.+/);
    expect(second).toMatch(/^text:.+/);
    expect(second).not.toBe(first);
    expect(richTextNamed(doc, first)).toBeDefined();
    expect(richTextNamed(doc, second)).toBeDefined();
    expect(richTextsOf(doc)).toHaveLength(beforeRich + 2);
    expect(records()[0].Title).toBe('First');
    expect(records()[1].Title).toBe('Second');
    expect(records()[1].Other).toBe('text:missing');
    const after = editor.exportDocument();
    await editor.undo();
    expect(records()[0].Body).toBe(first);
    expect(records()[1].Body).toBe('');
    await editor.undo();
    expect(editor.exportDocument()).toEqual(before);
    await editor.redo();
    await editor.redo();
    expect(editor.exportDocument()).toEqual(after);
  });

  it('creates only one resource when the same empty cell is requested together', async () => {
    const { editor, doc, payload, records } = setup();
    const before = editor.exportDocument();
    const beforeRich = richTextsOf(doc).length;
    const beforeEntries = editor.historyManager.getStats().totalEntries;
    const results = await Promise.all([editor.run(command, payload), editor.run(command, payload)]);
    expect(results.sort()).toEqual([false, true]);
    expect(records()[0].Body).toMatch(/^text:.+/);
    expect(richTextNamed(doc, records()[0].Body)).toBeDefined();
    expect(richTextsOf(doc)).toHaveLength(beforeRich + 1);
    expect(editor.historyManager.getStats().totalEntries).toBe(beforeEntries + 1);
    const after = editor.exportDocument();
    await editor.undo();
    expect(editor.exportDocument()).toEqual(before);
    await editor.redo();
    expect(editor.exportDocument()).toEqual(after);
  });

  it.each(['create-first', 'cell-first'])('preserves a concurrent edit to another row (%s)', async order => {
    const { editor, doc, payload, records } = setup();
    const create = () => editor.run(command, payload);
    const edit = () => editor.run('setDatasetCell', { ...payload, row: 1, field: 'Title', value: 'Second changed' });
    const results = order === 'create-first'
      ? await Promise.all([create(), edit()])
      : await Promise.all([edit(), create()]);
    expect(results).toEqual([true, true]);
    expect(records()[1].Title).toBe('Second changed');
    expect(richTextNamed(doc, records()[0].Body)).toBeDefined();
  });

  it('replans after a queued cell edit commits under the model lock', async () => {
    const { editor, store, doc, payload, records } = setup();
    const held = await store.acquireLock('existing work');
    let queued!: () => void;
    const waiting = new Promise<void>(resolve => { queued = resolve; });
    const original = store.acquireLock.bind(store);
    store.acquireLock = async owner => {
      queued();
      return original(owner);
    };
    try {
      const edit = editor.run('setDatasetCell', { ...payload, row: 1, field: 'Title', value: 'Second changed' });
      const create = editor.run(command, payload);
      await waiting;
      store.releaseLock(held);
      expect(await Promise.all([edit, create])).toEqual([true, true]);
      expect(records()[1].Title).toBe('Second changed');
      expect(richTextNamed(doc, records()[0].Body)).toBeDefined();
    } finally {
      store.acquireLock = original;
      store.releaseLock(held);
    }
  });

  it.each(['addDatasetRow', 'removeDatasetRow'])('keeps the created body when %s follows it', async writer => {
    const { editor, store, doc, payload, records } = setup();
    const held = await store.acquireLock('existing work');
    let queued!: () => void;
    const waiting = new Promise<void>(resolve => { queued = resolve; });
    const original = store.acquireLock.bind(store);
    store.acquireLock = async owner => { queued(); return original(owner); };
    try {
      const create = editor.run(command, payload);
      await waiting;
      const change = editor.run(writer, { nodeId: payload.nodeId, row: 1 });
      store.releaseLock(held);
      expect(await Promise.all([create, change])).toEqual([true, true]);
      expect(richTextNamed(doc, records()[0].Body)).toBeDefined();
    } finally {
      store.acquireLock = original;
      store.releaseLock(held);
    }
  });

  it('refuses a queued creation if an inserted row takes the original row index', async () => {
    const { editor, store, doc, payload, records } = setup();
    const beforeRich = richTextsOf(doc).length;
    const held = await store.acquireLock('existing work');
    let queued!: () => void;
    const waiting = new Promise<void>(resolve => { queued = resolve; });
    const original = store.acquireLock.bind(store);
    store.acquireLock = async owner => { queued(); return original(owner); };
    try {
      const add = editor.run('addDatasetRow', { nodeId: payload.nodeId, at: 0 });
      await waiting;
      const create = editor.run(command, { ...payload, row: 1 });
      store.releaseLock(held);
      expect(await Promise.all([add, create])).toEqual([true, false]);
      expect(store.getNode(payload.nodeId)!.attributes!.rowIds).toEqual([expect.any(String), 'first', 'second']);
      expect(records()[1].Body).toBeUndefined();
      expect(records()[2].Body).toBe('');
      expect(richTextsOf(doc)).toHaveLength(beforeRich);
    } finally {
      store.acquireLock = original;
      store.releaseLock(held);
    }
  });

  it('refuses a queued cell edit if an inserted row takes the original row index', async () => {
    const { editor, store, payload, records } = setup();
    const held = await store.acquireLock('existing work');
    let queued!: () => void;
    const waiting = new Promise<void>(resolve => { queued = resolve; });
    const original = store.acquireLock.bind(store);
    store.acquireLock = async owner => { queued(); return original(owner); };
    try {
      const add = editor.run('addDatasetRow', { nodeId: payload.nodeId, at: 0 });
      await waiting;
      const edit = editor.run('setDatasetCell', {
        nodeId: payload.nodeId, row: 1, field: 'Title', value: 'Wrong row'
      });
      store.releaseLock(held);
      expect(await Promise.all([add, edit])).toEqual([true, false]);
      expect(records()[1].Title).toBe('First');
      expect(records()[2].Title).toBe('Second');
    } finally {
      store.acquireLock = original;
      store.releaseLock(held);
    }
  });

  it('keeps a queued body creation when a later cell edit starts during the model lock', async () => {
    const { editor, store, doc, payload, records } = setup();
    const held = await store.acquireLock('existing work');
    let firstQueued!: () => void;
    const waiting = new Promise<void>(resolve => { firstQueued = resolve; });
    const original = store.acquireLock.bind(store);
    store.acquireLock = async owner => {
      firstQueued();
      return original(owner);
    };
    try {
      const create = editor.run(command, payload);
      await waiting;
      const edit = editor.run('setDatasetCell', { ...payload, row: 1, field: 'Title', value: 'Second changed' });
      store.releaseLock(held);
      expect(await Promise.all([create, edit])).toEqual([true, true]);
      expect(records()[1].Title).toBe('Second changed');
      expect(richTextNamed(doc, records()[0].Body)).toBeDefined();
    } finally {
      store.acquireLock = original;
      store.releaseLock(held);
    }
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
