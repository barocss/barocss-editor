// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ModelSelection, Editor } from '@barocss/editor-core';
import { CopyPasteExtension } from '../src/copy-paste';

const recordedTransactions: any[][] = [];
const commitMock = vi.fn();

vi.mock('@barocss/model', () => {
  return {
    transaction: (_editor: Editor, operations: any[]) => {
      recordedTransactions.push(operations);
      return {
        commit: commitMock
      };
    },
    copy: (range: any) => ({ type: 'copy', payload: { range } }),
    paste: (nodes: any[], range: any) => ({ type: 'paste', payload: { data: { nodes }, range } }),
    control: (nodeId: string, ops: any[]) => ops.map(op => ({ ...op, payload: { ...op.payload, nodeId } })),
    deleteTextRange: (start: number, end: number) => ({ type: 'deleteTextRange', payload: { start, end } })
  };
});

interface RegisteredCommand {
  name: string;
  execute: (editor: any, payload?: any) => any;
  canExecute: (editor: any, payload?: any) => boolean;
}

class FakeEditor {
  public dataStore = {
    getActiveSchema: () => undefined,
    serializeRange: () => [{ stype: 'inline-text', text: 'Hello' }],
    getNode: (sid: string) => ({ sid, stype: 'inline-text', text: 'Hello' })
  };
  public commands = new Map<string, RegisteredCommand>();
  public selection: ModelSelection | null = null;

  registerCommand(cmd: RegisteredCommand) {
    this.commands.set(cmd.name, cmd);
  }

  __getCommand(name: string): RegisteredCommand | undefined {
    return this.commands.get(name);
  }
}

describe('CopyPasteExtension', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  for (const action of ['copy', 'cut']) it(`${action} refuses clipboard rejection without a document transaction`, async () => {
    const editor = new FakeEditor() as any;
    editor.selection = { type: 'range', startNodeId: 't1', endNodeId: 't1', startOffset: 0, endOffset: 5, collapsed: false };
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    new CopyPasteExtension().onCreate(editor);
    expect(await editor.__getCommand(action).execute(editor, {})).toBe(false);
    expect(recordedTransactions).toHaveLength(0);
  });

  it('does not cut a target edited while the clipboard write is pending', async () => {
    const editor = new FakeEditor() as any;
    editor.selection = { type: 'range', startNodeId: 't1', endNodeId: 't1', startOffset: 0, endOffset: 5, collapsed: false };
    let text = 'Hello';
    editor.dataStore.getNode = (sid: string) => ({ sid, stype: 'inline-text', text });
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { text = 'Changed'; }) } });
    new CopyPasteExtension().onCreate(editor);
    expect(await editor.__getCommand('cut').execute(editor, {})).toBe(false);
    expect(recordedTransactions).toHaveLength(0);
  });

  it('does not paste into a target edited while clipboard permission is pending', async () => {
    const editor = new FakeEditor() as any;
    editor.selection = { type: 'range', startNodeId: 't1', endNodeId: 't1', startOffset: 0, endOffset: 0, collapsed: true };
    let text = 'Hello';
    editor.dataStore.getNode = (sid: string) => ({ sid, stype: 'inline-text', text });
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn(async () => { text = 'Changed'; return 'paste'; }) } });
    new CopyPasteExtension().onCreate(editor);
    expect(await editor.__getCommand('paste').execute(editor, {})).toBe(false);
    expect(recordedTransactions).toHaveLength(0);
  });

  it('copy writes the selected text without adding a document transaction', async () => {
    const editor = new FakeEditor() as any;
    const ext = new CopyPasteExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('copy');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 't1',
      startOffset: 0,
      endNodeId: 't1',
      endOffset: 5,
      collapsed: false,
      direction: 'forward'
    };

    editor.selection = selection;

    const result = await cmd!.execute(editor, {});
    expect(result).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello');
    expect(recordedTransactions).toHaveLength(0);
  });

  it('paste: nodes 와 selection 이 있으면 paste operation 으로 transaction 을 실행한다', async () => {
    const editor = new FakeEditor() as any;
    const ext = new CopyPasteExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('paste');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'p1',
      startOffset: 0,
      endNodeId: 'p1',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    const nodes = [
      { stype: 'inline-text', text: 'AAA' },
      { stype: 'inline-text', text: 'BBB' }
    ];

    editor.selection = selection;

    const result = await cmd!.execute(editor, { selection, nodes });
    expect(result).toBe(true);
    expect(recordedTransactions).toHaveLength(1);
    expect(commitMock).toHaveBeenCalledTimes(1);

    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      type: 'paste',
      payload: {
        data: { nodes },
        range: selection
      }
    });
  });

  it('paste: clipboardText 로 전달받은 텍스트를 paragraph 노드로 변환하여 paste 한다', async () => {
    const editor = new FakeEditor() as any;
    const ext = new CopyPasteExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('paste');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'p1',
      startOffset: 0,
      endNodeId: 'p1',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    editor.selection = selection;

    const result = await cmd!.execute(editor, { clipboardText: 'Hello World' });
    expect(result).toBe(true);
    expect(recordedTransactions).toHaveLength(1);
    expect(commitMock).toHaveBeenCalledTimes(1);

    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('paste');
    const pastedNodes = ops[0].payload.data.nodes;
    expect(pastedNodes).toHaveLength(1);
    expect(pastedNodes[0].stype).toBe('paragraph');
    expect(pastedNodes[0].content[0].text).toBe('Hello World');
  });

  it('paste: canExecute 는 range selection 만 있으면 true (nodes 불필요)', () => {
    const editor = new FakeEditor() as any;
    const ext = new CopyPasteExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('paste');
    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'p1',
      startOffset: 0,
      endNodeId: 'p1',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    expect(cmd!.canExecute(editor, { selection })).toBe(true);
    expect(cmd!.canExecute(editor, {})).toBe(false);
  });

  it('cut writes the clipboard before using reversible range deletion', async () => {
    const editor = new FakeEditor() as any;
    const ext = new CopyPasteExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('cut');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 't1',
      startOffset: 1,
      endNodeId: 't1',
      endOffset: 4,
      collapsed: false,
      direction: 'forward'
    };

    editor.selection = selection;

    const result = await cmd!.execute(editor, {});
    expect(result).toBe(true);
    expect(recordedTransactions).toHaveLength(1);
    expect(commitMock).toHaveBeenCalledTimes(1);

    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      type: 'deleteTextRange',
      payload: { nodeId: 't1', start: 1, end: 4 }
    });
  });


  /**
   * **복사 with nothing selected** — measured in the site builder, pressing every menu entry.
   *
   * With a caret sitting in a paragraph and nothing selected, 복사 was offered. Copying nothing is
   * not a no-op: it reports success and leaves the clipboard holding an empty string, so the
   * reader's *previous* copy is gone — a gesture that quietly destroys something is worse than one
   * that is greyed.
   *
   * `cut` already asked for a range with something in it. The two are the same question about the
   * same selection and they disagreed about it.
   */
  it('copy: a collapsed caret has nothing to copy, and says so', () => {
    const editor = new FakeEditor() as any;
    const ext = new CopyPasteExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('copy');
    const at = (collapsed: boolean, endOffset: number): ModelSelection => ({
      type: 'range',
      startNodeId: 'p1',
      startOffset: 0,
      endNodeId: 'p1',
      endOffset,
      collapsed,
      direction: 'forward'
    });

    expect(cmd!.canExecute(editor, { selection: at(true, 0) })).toBe(false);
    expect(cmd!.canExecute(editor, { selection: at(false, 5) })).toBe(true);

    // And `paste` still takes a collapsed one, because pasting *into* a caret is the ordinary case.
    expect(editor.__getCommand('paste')!.canExecute(editor, { selection: at(true, 0) })).toBe(true);
  });
});
it('pastes reference labels as text when the destination schema does not support workspace references', async () => {
  recordedTransactions.length = 0;
  commitMock.mockResolvedValue({ success: true });
  const editor = new FakeEditor() as any;
  editor.dataStore = { getActiveSchema: () => ({ getNodeType: () => undefined }) };
  editor.selection = { type: 'range', startNodeId: 't1', startOffset: 0, endNodeId: 't1', endOffset: 0, collapsed: true };
  new CopyPasteExtension().onCreate(editor);
  const nodes = [{ stype: 'paragraph', content: [{ stype: 'pageReference', attributes: { pageId: 'target', title: 'Readable title' } }] }];
  expect(await editor.__getCommand('paste').execute(editor, { nodes })).toBe(true);
  expect(recordedTransactions[0][0].payload.data.nodes).toEqual([{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Readable title' }] }]);
  expect(nodes[0].content[0].stype).toBe('pageReference');
});

it('copyBlocks reports clipboard rejection without mutating the document', async () => {
  const editor = new FakeEditor() as any;
  const nodes: Record<string, any> = { root: { sid: 'root', stype: 'note', content: ['p'] }, p: { sid: 'p', stype: 'paragraph', parentId: 'root', content: ['t'] }, t: { sid: 't', stype: 'inline-text', parentId: 'p', text: 'hello' } };
  editor.dataStore = { getNode: (id: string) => nodes[id], getActiveSchema: () => undefined };
  const before = JSON.stringify(nodes);
  vi.stubGlobal('navigator', { clipboard: { write: vi.fn().mockRejectedValue(new Error('denied')) } });
  vi.stubGlobal('ClipboardItem', class { constructor(public items: unknown) {} });
  try {
    new CopyPasteExtension().onCreate(editor);
    expect(await editor.__getCommand('copyBlocks').execute(editor, { nodeIds: ['p'] })).toBe(false);
    expect(JSON.stringify(nodes)).toBe(before);
  } finally { vi.unstubAllGlobals(); }
});
