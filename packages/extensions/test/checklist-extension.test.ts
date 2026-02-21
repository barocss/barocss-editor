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
    insertChecklist: (checked?: boolean) => ({
      type: 'insertChecklist',
      payload: { checked: checked ?? false }
    })
  };
});

function createFakeEditor(dataStore?: any): Editor & { __getCommand: (name: string) => any; dataStore: any } {
  const commands: Record<string, any> = {};
  return {
    registerCommand: (cmd: any) => { commands[cmd.name] = cmd; },
    __getCommand(name: string) { return commands[name]; },
    dataStore: dataStore ?? {}
  } as any;
}

describe('ChecklistExtension', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('registers insertChecklist command', async () => {
    const { ChecklistExtension } = await import('../src/checklist');
    const editor = createFakeEditor();
    const ext = new ChecklistExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertChecklist');
    expect(cmd).toBeDefined();
  });

  it('insertChecklist creates a transaction with unchecked by default', async () => {
    const { ChecklistExtension } = await import('../src/checklist');
    const editor = createFakeEditor();
    const ext = new ChecklistExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertChecklist');
    await cmd.execute(editor);

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0]).toEqual([
      { type: 'insertChecklist', payload: { checked: false } }
    ]);
  });

  it('insertChecklist passes checked=true when specified', async () => {
    const { ChecklistExtension } = await import('../src/checklist');
    const editor = createFakeEditor();
    const ext = new ChecklistExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertChecklist');
    await cmd.execute(editor, { checked: true });

    expect(recordedTransactions[0]).toEqual([
      { type: 'insertChecklist', payload: { checked: true } }
    ]);
  });

  it('registers toggleChecklistItem command', async () => {
    const { ChecklistExtension } = await import('../src/checklist');
    const dataStore = {
      getNode: (id: string) => {
        if (id === 'task-1') return { sid: 'task-1', stype: 'taskItem', attributes: { checked: false } };
        return null;
      },
      setAttrs: vi.fn()
    };
    const editor = createFakeEditor(dataStore);
    const ext = new ChecklistExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('toggleChecklistItem');
    expect(cmd).toBeDefined();

    await cmd.execute(editor, { nodeId: 'task-1' });
    expect(dataStore.setAttrs).toHaveBeenCalledWith('task-1', { checked: true });
  });

  it('does not register commands when disabled', async () => {
    const { ChecklistExtension } = await import('../src/checklist');
    const editor = createFakeEditor();
    const ext = new ChecklistExtension({ enabled: false });
    ext.onCreate(editor);

    expect(editor.__getCommand('insertChecklist')).toBeUndefined();
  });
});
