import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WordExtension } from '../src/word-commands';

/**
 * Word's own commands.
 *
 * These were reachable only through the app: the key map binds them, and the
 * only way to find out whether a shortcut did anything was to press it. That is
 * how they came to be missing in the first place — `Mod+Shift+Enter` resolved to
 * a command nothing implemented and quietly did nothing.
 *
 * What is worth pinning is the part that decides *where* an edit lands: walking
 * up from the caret to the block it is in, and finding a document-wide setting
 * among the resources. Both are ordinary tree walks with an answer that can be
 * wrong in a way the browser shows only as an edit appearing in the wrong place.
 */
const committed: any[][] = [];

vi.mock('@barocss/model', () => ({
  transaction: (_editor: unknown, operations: any[]) => ({
    commit: async () => (committed.push(operations), { success: true })
  })
}));

const editorOf = (nodes: Record<string, any>, rootId = 'root') => {
  const commands = new Map<string, any>();
  const editor: any = {
    dataStore: { getNode: (id: string) => nodes[id] },
    getRootId: () => rootId,
    selection: null,
    registerCommand: (command: any) => commands.set(command.name, command)
  };
  new WordExtension().onCreate(editor);
  return { editor, commands };
};

const caret = (nodeId: string) =>
  ({ type: 'range', startNodeId: nodeId, startOffset: 0, endNodeId: nodeId, endOffset: 0 }) as any;

/** A paragraph holding one text node, inside a body. */
const body = () => ({
  root: { sid: 'root', stype: 'document', content: ['res', 'body'] },
  body: { sid: 'body', stype: 'body', content: ['p1', 'p2'] },
  p1: { sid: 'p1', stype: 'paragraph', parentId: 'body', content: ['t1'] },
  t1: { sid: 't1', stype: 'inline-text', text: 'one', parentId: 'p1' },
  p2: { sid: 'p2', stype: 'paragraph', parentId: 'body', content: [] },
  res: { sid: 'res', stype: 'resources', content: ['settings'] },
  settings: { sid: 'settings', stype: 'docSettings', attributes: { trackRevisions: false } }
});

beforeEach(() => (committed.length = 0));

describe('a column break', () => {
  it('goes after the block the caret is in, not after the text node', () => {
    // The caret is in t1, but a break between two text nodes inside a paragraph
    // is not a break at all — it has to land among the paragraph's siblings.
    const { editor, commands } = editorOf(body());
    commands.get('insertColumnBreak').execute(editor, { selection: caret('t1') });

    expect(committed[0]).toEqual([
      {
        type: 'addChild',
        payload: {
          parentId: 'body',
          child: { stype: 'columnBreak', attributes: {} },
          position: 1
        }
      }
    ]);
  });

  it('goes after the block itself when the caret is on one', async () => {
    const { editor, commands } = editorOf(body());
    await commands.get('insertColumnBreak').execute(editor, { selection: caret('p2') });
    expect(committed[0][0].payload.position).toBe(2);
  });

  it('does nothing without a selection, and says so', async () => {
    const { editor, commands } = editorOf(body());
    expect(commands.get('insertColumnBreak').canExecute(editor, {})).toBe(false);
    expect(await commands.get('insertColumnBreak').execute(editor, {})).toBe(false);
    expect(committed).toHaveLength(0);
  });

  it('does nothing when the caret is on a node with no parent to insert into', async () => {
    const { editor, commands } = editorOf({ orphan: { sid: 'orphan', stype: 'paragraph' } });
    expect(await commands.get('insertColumnBreak').execute(editor, { selection: caret('orphan') }))
      .toBe(false);
    expect(committed).toHaveLength(0);
  });
});

describe('tracking changes', () => {
  it('is a document setting, so it flips the settings node', async () => {
    // Not a view flag: two people editing the same document are not each
    // deciding whether the other's edits are tracked.
    const { editor, commands } = editorOf(body());
    await commands.get('toggleTrackChanges').execute(editor);

    expect(committed[0]).toEqual([
      { type: 'setAttrs', payload: { nodeId: 'settings', attrs: { trackRevisions: true } } }
    ]);
  });

  it('flips back off again', async () => {
    const nodes = body();
    nodes.settings.attributes.trackRevisions = true;
    const { editor, commands } = editorOf(nodes);
    await commands.get('toggleTrackChanges').execute(editor);
    expect(committed[0][0].payload.attrs.trackRevisions).toBe(false);
  });

  it('reports the current state', () => {
    const nodes = body();
    const off = editorOf(nodes);
    expect(off.commands.get('isTrackingChanges').execute(off.editor)).toBe(false);

    nodes.settings.attributes.trackRevisions = true;
    const on = editorOf(nodes);
    expect(on.commands.get('isTrackingChanges').execute(on.editor)).toBe(true);
  });

  it('cannot run in a document that has no settings to change', async () => {
    const { editor, commands } = editorOf({
      root: { sid: 'root', stype: 'document', content: ['body'] },
      body: { sid: 'body', stype: 'body', content: [] }
    });
    expect(commands.get('toggleTrackChanges').canExecute(editor)).toBe(false);
    expect(await commands.get('toggleTrackChanges').execute(editor)).toBe(false);
    // And asking the state of a document that has none is not an error.
    expect(commands.get('isTrackingChanges').execute(editor)).toBe(false);
  });
});
