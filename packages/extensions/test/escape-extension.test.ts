import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { EscapeExtension } from '../src/escape';

function createFakeEditor(selection?: ModelSelection | null): Editor & { 
  __getCommand: (name: string) => any; 
  selection: ModelSelection | null;
  clearSelection: () => void;
  emit: (event: string, data?: any) => void;
} {
  const commands: Record<string, any> = {};
  const events: Map<string, Function[]> = new Map();

  return {
    // @ts-expect-error - 최소 구현만 제공
    registerCommand: (cmd: any) => {
      commands[cmd.name] = cmd;
    },
    __getCommand(name: string) {
      return commands[name];
    },
    // @ts-expect-error - 실제 Editor 인터페이스와 다를 수 있음
    selection: selection || null,
    clearSelection: vi.fn(),
    emit: vi.fn((event: string, data?: any) => {
      const listeners = events.get(event) || [];
      listeners.forEach(listener => listener(data));
    }),
    on: (event: string, listener: Function) => {
      if (!events.has(event)) {
        events.set(event, []);
      }
      events.get(event)!.push(listener);
    }
  } as Editor & { 
    __getCommand: (name: string) => any; 
    selection: ModelSelection | null;
    clearSelection: () => void;
    emit: (event: string, data?: any) => void;
  };
}

describe('EscapeExtension - escape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('선택이 있으면 선택 취소를 수행한다', async () => {
    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 2,
      endNodeId: 'text-1',
      endOffset: 7,
      collapsed: false,
      direction: 'forward'
    };

    const editor = createFakeEditor(selection);
    const ext = new EscapeExtension();
    ext.onCreate(editor);

    const cmd = (editor as any).__getCommand('escape');
    const result = await cmd.execute(editor);

    expect(result).toBe(true);
    expect(editor.clearSelection).toHaveBeenCalledTimes(1);
    expect(editor.emit).not.toHaveBeenCalledWith('editor:blur.request', expect.anything());
  });

  it('선택이 없으면 blur 요청 이벤트를 emit한다', async () => {
    const editor = createFakeEditor(null);
    const ext = new EscapeExtension();
    ext.onCreate(editor);

    const cmd = (editor as any).__getCommand('escape');
    const result = await cmd.execute(editor);

    expect(result).toBe(true);
    expect(editor.clearSelection).not.toHaveBeenCalled();
    expect(editor.emit).toHaveBeenCalledWith('editor:blur.request', {});
  });

  it('collapsed selection이면 blur 요청 이벤트를 emit한다', async () => {
    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5,
      endNodeId: 'text-1',
      endOffset: 5,
      collapsed: true,
      direction: 'forward'
    };

    const editor = createFakeEditor(selection);
    const ext = new EscapeExtension();
    ext.onCreate(editor);

    const cmd = (editor as any).__getCommand('escape');
    const result = await cmd.execute(editor);

    expect(result).toBe(true);
    expect(editor.clearSelection).not.toHaveBeenCalled();
    expect(editor.emit).toHaveBeenCalledWith('editor:blur.request', {});
  });
});

