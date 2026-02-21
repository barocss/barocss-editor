import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Editor } from '@barocss/editor-core';

const recordedTransactions: any[][] = [];
const commitMock = vi.fn();

vi.mock('@barocss/model', () => {
  return {
    transaction: (_editor: Editor, operations: any[]) => {
      recordedTransactions.push(operations);
      return { commit: commitMock };
    },
    insertHorizontalRule: () => ({
      type: 'insertHorizontalRule',
      payload: {}
    })
  };
});

function createFakeEditor(): Editor & { __getCommand: (name: string) => any } {
  const commands: Record<string, any> = {};
  return {
    registerCommand: (cmd: any) => { commands[cmd.name] = cmd; },
    __getCommand(name: string) { return commands[name]; }
  } as any;
}

describe('HorizontalRuleExtension', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('registers insertHorizontalRule command', async () => {
    const { HorizontalRuleExtension } = await import('../src/horizontal-rule');
    const editor = createFakeEditor();
    const ext = new HorizontalRuleExtension();
    ext.onCreate(editor);

    expect(editor.__getCommand('insertHorizontalRule')).toBeDefined();
  });

  it('creates transaction for horizontal rule', async () => {
    const { HorizontalRuleExtension } = await import('../src/horizontal-rule');
    const editor = createFakeEditor();
    const ext = new HorizontalRuleExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertHorizontalRule');
    await cmd.execute(editor);

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0]).toEqual([
      { type: 'insertHorizontalRule', payload: {} }
    ]);
  });
});
