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
    insertCallout: (calloutType?: string, title?: string) => ({
      type: 'insertCallout',
      payload: {
        calloutType: calloutType ?? 'info',
        ...(title != null && { title })
      }
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

describe('CalloutExtension', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('registers insertCallout command', async () => {
    const { CalloutExtension } = await import('../src/callout');
    const editor = createFakeEditor();
    const ext = new CalloutExtension();
    ext.onCreate(editor);

    expect(editor.__getCommand('insertCallout')).toBeDefined();
  });

  it('creates callout with default type info', async () => {
    const { CalloutExtension } = await import('../src/callout');
    const editor = createFakeEditor();
    const ext = new CalloutExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertCallout');
    await cmd.execute(editor);

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0]).toEqual([
      { type: 'insertCallout', payload: { calloutType: 'info' } }
    ]);
  });

  it('creates callout with custom type and title', async () => {
    const { CalloutExtension } = await import('../src/callout');
    const editor = createFakeEditor();
    const ext = new CalloutExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertCallout');
    await cmd.execute(editor, { type: 'warning', title: 'Caution!' });

    expect(recordedTransactions[0]).toEqual([
      { type: 'insertCallout', payload: { calloutType: 'warning', title: 'Caution!' } }
    ]);
  });

  it('uses extension default type option', async () => {
    const { CalloutExtension } = await import('../src/callout');
    const editor = createFakeEditor();
    const ext = new CalloutExtension({ defaultType: 'tip' });
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertCallout');
    await cmd.execute(editor);

    expect(recordedTransactions[0][0].payload.calloutType).toBe('tip');
  });

  it('does not register commands when disabled', async () => {
    const { CalloutExtension } = await import('../src/callout');
    const editor = createFakeEditor();
    const ext = new CalloutExtension({ enabled: false });
    ext.onCreate(editor);

    expect(editor.__getCommand('insertCallout')).toBeUndefined();
  });
});
