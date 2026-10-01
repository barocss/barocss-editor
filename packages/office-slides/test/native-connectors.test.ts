import { describe, expect, it } from 'vitest';
import { createSlidesEditor } from '../src/slides-kit';
import { createSampleDeck } from '../src/sample-deck';
import { deckFileText, readDeckFile } from '../src/deck-file';

async function attachedFixture() {
  const editor = createSlidesEditor();
  editor.loadDocument(createSampleDeck(), 'source418');
  const create = async (command: string, x: number, y: number) => {
    expect(await editor.executeCommand(command, { x, y, width: 3000, height: 1500 })).toBe(true);
    return editor.selection!.nodeIds![0];
  };
  const a = await create('insertRectangle', 1500, 1500);
  const b = await create('insertEllipse', 9000, 6000);
  editor.setNode({ nodeIds: [a, b] });
  expect(await editor.executeCommand('insertConnector')).toBe(true);
  const line = editor.selection!.nodeIds![0];
  const c = await create('insertRectangle', 3000, 7500);
  expect(await editor.executeCommand('insertConnector', { startNodeId: c, endNodeId: line, endT: 0.35 })).toBe(true);
  return { editor, a, b, c, line, branch: editor.selection!.nodeIds![0] };
}

describe('native attached connector identity', () => {
  it('resolves actual command-created shape and line attachments in fresh and nonempty sessions', async () => {
    const fixture = await attachedFixture();
    const bytes = deckFileText(fixture.editor.exportDocument(), 'fixed');
    const file = JSON.parse(bytes);
    expect(file.version).toBe(2);
    expect(bytes).not.toContain('source418:');
    expect(bytes).not.toContain('startNodeId');
    const read = readDeckFile(bytes);
    if ('error' in read) throw new Error(read.error);
    const sourceIds = [fixture.a, fixture.b, fixture.c, fixture.line, fixture.branch]
      .map(sid => fixture.editor.dataStore.getNode(sid)!.attributes!.objectId);
    expect(new Set(sourceIds).size).toBe(5);
    for (const populated of [false, true]) {
      const fresh = createSlidesEditor();
      try {
        if (populated) fresh.loadDocument(createSampleDeck(), 'fresh418');
        fresh.loadDocument(read.document, 'fresh418');
        const nodes = [...fresh.dataStore.getNodes().values()];
        const activeRoot = fresh.getRootId()!;
        const active = (sid: string): boolean => {
          let node = fresh.dataStore.getNode(sid);
          while (node?.parentId) { if (node.parentId === activeRoot) return true; node = fresh.dataStore.getNode(node.parentId); }
          return false;
        };
        const resolve = (id: unknown) => nodes.find(node => active(node.sid!) && node.attributes?.objectId === id)!;
        const [a, b, c, line, branch] = sourceIds.map(resolve);
        expect(line.attributes!.startNodeId).toBe(a.sid);
        expect(line.attributes!.endNodeId).toBe(b.sid);
        expect(branch.attributes!.startNodeId).toBe(c.sid);
        expect(branch.attributes!.endNodeId).toBe(line.sid);
        expect(branch.attributes!.endT).toBe(0.35);
        expect(fresh.documentFaults).toEqual([]);
        expect(JSON.parse(deckFileText(fresh.exportDocument(), 'fixed')).document).toEqual(file.document);
        expect(deckFileText(fresh.exportDocument(), 'fixed')).toBe(deckFileText(fresh.exportDocument(), 'fixed'));
      } finally { fresh.destroy(); }
    }
    fixture.editor.destroy();
  });
});

type Tree = { stype: string; attributes?: Record<string, unknown>; metadata?: Record<string, unknown>; content?: Tree[]; text?: string };
const allNodes = (tree: Tree): Tree[] => [tree, ...(tree.content ?? []).flatMap(allNodes)];
const objectIds = (editor: ReturnType<typeof createSlidesEditor>): unknown[] => allNodes(editor.exportDocument() as Tree)
  .map(node => node.attributes?.objectId).filter(Boolean);

describe('native connector refusal and identity stability', () => {
  it('refuses missing, duplicate, foreign-scope and self targets before replacing a populated model', async () => {
    const fixture = await attachedFixture();
    const document = JSON.parse(deckFileText(fixture.editor.exportDocument(), 'fixed')).document as Tree;
    const invalid = (change: (copy: Tree) => void) => { const copy = structuredClone(document); change(copy); return copy; };
    const bad = [
      invalid(copy => { allNodes(copy).find(node => node.stype === 'connector')!.attributes!.startObjectId = 'missing-target'; }),
      invalid(copy => { const targets = allNodes(copy).filter(node => node.attributes?.objectId); targets[1].attributes!.objectId = targets[0].attributes!.objectId; }),
      invalid(copy => { const nodes = allNodes(copy); nodes.find(node => node.stype === 'connector')!.attributes!.startObjectId = copy.content!.filter(node => node.stype === 'surface')[1].content!.find(node => node.attributes?.objectId)!.attributes!.objectId; }),
      invalid(copy => { const line = allNodes(copy).find(node => node.stype === 'connector')!; line.attributes!.startObjectId = line.attributes!.objectId; }),
      invalid(copy => { const lines = allNodes(copy).filter(node => node.stype === 'connector'); delete lines[1].attributes!.endT; }),
      invalid(copy => { allNodes(copy).find(node => node.stype === 'connector')!.attributes!.startNodeId = 'lost-source:1'; })
    ];
    const before = fixture.editor.exportDocument(), root = fixture.editor.getRootId();
    try {
      for (const document of bad) {
        expect(readDeckFile(JSON.stringify({ format: 'barocss-slides', version: 2, document }))).toHaveProperty('error');
        expect(() => fixture.editor.loadDocument(document, 'must-not-replace')).toThrow();
        expect(fixture.editor.getRootId()).toBe(root);
        expect(fixture.editor.exportDocument()).toEqual(before);
      }
    } finally { fixture.editor.destroy(); }
  });

  it('reads old free decks with provenance metadata, but refuses lost legacy attachments and unknown versions', () => {
    const free = { stype: 'document', metadata: { objectId: 'source-provenance', note: 'startObjectId is only text' }, content: [
      { stype: 'surface', content: [{ stype: 'connector', attributes: { startX: 0, startY: 0, endX: 10, endY: 10, startNodeId: '', endNodeId: '' } }] }
    ] };
    const encode = (version: unknown, document = free) => JSON.stringify({ format: 'barocss-slides', version, document });
    expect(readDeckFile(encode(0))).toHaveProperty('document');
    expect(readDeckFile(encode(1))).toEqual({ document: free, version: 1 });
    for (const version of [undefined, -1, 1.5, 3]) expect(readDeckFile(encode(version))).toHaveProperty('error');
    const lost = structuredClone(free);
    lost.content[0].content[0].attributes.startNodeId = 'legacy-session:1';
    expect(readDeckFile(encode(1, lost))).toHaveProperty('error');
    const editor = createSlidesEditor();
    try {
      editor.loadDocument(free, 'free');
      const saved = JSON.parse(deckFileText(editor.exportDocument()));
      expect(saved.version).toBe(2);
      expect(saved.document.metadata).toEqual(free.metadata);
      const line = allNodes(saved.document).find(node => node.stype === 'connector')!;
      expect(line.attributes?.startObjectId).toBeUndefined();
      expect(line.attributes?.endObjectId).toBeUndefined();
    } finally { editor.destroy(); }
  });

  it('keeps identities through target movement, undo and redo while routes still follow the intended shape', async () => {
    const fixture = await attachedFixture();
    try {
      const { connectorRouteOf } = await import('../src/deck');
      const doc = { rootId: fixture.editor.getRootId()!, getNode: (id: string) => fixture.editor.dataStore.getNode(id) };
      const initial = objectIds(fixture.editor);
      const before = connectorRouteOf(doc, fixture.line);
      fixture.editor.setNode({ nodeIds: [fixture.a] });
      expect(await fixture.editor.executeCommand('nudgeBoxes', { dx: 1800, dy: 0 })).toBe(true);
      const moved = connectorRouteOf(doc, fixture.line);
      expect(moved).not.toEqual(before);
      expect(objectIds(fixture.editor)).toEqual(initial);
      expect(await fixture.editor.executeCommand('undo')).toBe(true);
      expect(connectorRouteOf(doc, fixture.line)).toEqual(before);
      expect(objectIds(fixture.editor)).toEqual(initial);
      expect(await fixture.editor.executeCommand('redo')).toBe(true);
      expect(connectorRouteOf(doc, fixture.line)).toEqual(moved);
      expect(objectIds(fixture.editor)).toEqual(initial);
    } finally { fixture.editor.destroy(); }
  });

  it('gives command-created layout placeholders and detached component parts independent stable identities', async () => {
    const editor = createSlidesEditor();
    try {
      editor.loadDocument(createSampleDeck());
      expect(await editor.executeCommand('insertSlide')).toBe(true);
      const first = objectIds(editor);
      expect(new Set(first).size).toBe(first.length);
      expect(await editor.executeCommand('insertRectangle')).toBe(true);
      const box = editor.selection!.nodeIds![0];
      editor.setNode({ nodeIds: [box] });
      expect(await editor.executeCommand('createComponent', { id: 'native-test-card' })).toBe(true);
      const instance = editor.selection!.nodeIds![0];
      expect(await editor.executeCommand('detachComponent', { nodeId: instance })).toBe(true);
      const detached = objectIds(editor);
      expect(new Set(detached).size).toBe(detached.length);
      editor.setNode({ nodeIds: [instance] });
      expect(await editor.executeCommand('nudgeBoxes', { dx: 500, dy: 0 })).toBe(true);
      expect(await editor.executeCommand('undo')).toBe(true);
      expect(await editor.executeCommand('redo')).toBe(true);
      expect(objectIds(editor)).toEqual(detached);
      expect(() => deckFileText(editor.exportDocument())).not.toThrow();
    } finally { editor.destroy(); }
  });
});
