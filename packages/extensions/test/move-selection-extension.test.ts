import { describe, it, expect, beforeEach } from 'vitest';
import type { ModelSelection } from '@barocss/editor-core';
import { MoveSelectionExtension } from '../src/move-selection';

interface RegisteredCommand {
  name: string;
  execute: (editor: any, payload: any) => any;
  canExecute: (editor: any, payload: any) => boolean;
}

class FakeEditor {
  public commands = new Map<string, RegisteredCommand>();
  public dataStore: any;
  public lastSelection: ModelSelection | null = null;

  constructor(dataStore: any) {
    this.dataStore = dataStore;
  }

  registerCommand(cmd: RegisteredCommand) {
    this.commands.set(cmd.name, cmd);
  }

  executeCommand(name: string, payload: any) {
    const cmd = this.commands.get(name);
    if (!cmd) {
      throw new Error(`Command not found: ${name}`);
    }
    return cmd.execute(this, payload);
  }

  updateSelection(selection: ModelSelection): void {
    this.lastSelection = selection;
  }
}

describe('MoveSelectionExtension - horizontal movement', () => {
  beforeEach(() => {
    // nothing yet
  });

  it('moveCursorRight: 텍스트 안에서 offset + 1 로 이동한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) =>
        sid === 'text-1' ? { sid, stype: 'inline-text', text: 'Hello' } : null
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('moveCursorRight');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 2,
      endNodeId: 'text-1',
      endOffset: 2,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });

    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 3,
      endNodeId: 'text-1',
      endOffset: 3,
      collapsed: true,
      direction: 'forward'
    });
  });

  it('moveCursorRight: 텍스트 끝에서 다음 텍스트 노드의 처음으로 이동한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-1') return { sid, stype: 'inline-text', text: 'Hello' };
        if (sid === 'text-2') return { sid, stype: 'inline-text', text: 'World' };
        return null;
      },
      getNextEditableNode: (sid: string) => (sid === 'text-1' ? 'text-2' : null)
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('moveCursorRight');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5,
      endNodeId: 'text-1',
      endOffset: 5,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });

    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-2',
      startOffset: 0,
      endNodeId: 'text-2',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    });
  });

  it('moveCursorRight: 텍스트 끝에서 다음 selectable inline-image 로 이동한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-1') return { sid, stype: 'inline-text', text: 'Hello' };
        if (sid === 'image-1') return { sid, stype: 'inline-image', attributes: { src: 'x' } };
        return null;
      },
      getNextEditableNode: (sid: string) => (sid === 'text-1' ? 'image-1' : null),
      isSelectableNode: (sid: string) => sid === 'image-1'
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('moveCursorRight');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5,
      endNodeId: 'text-1',
      endOffset: 5,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });

    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'image-1',
      startOffset: 0,
      endNodeId: 'image-1',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    });
  });

  it('moveCursorLeft: 텍스트 안에서 offset - 1 로 이동한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) =>
        sid === 'text-1' ? { sid, stype: 'inline-text', text: 'Hello' } : null
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('moveCursorLeft');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 3,
      endNodeId: 'text-1',
      endOffset: 3,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });

    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 2,
      endNodeId: 'text-1',
      endOffset: 2,
      collapsed: true,
      direction: 'backward'
    });
  });

  it('moveCursorLeft: 텍스트 처음에서 이전 텍스트 노드의 끝으로 이동한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-1') return { sid, stype: 'inline-text', text: 'Hello' };
        if (sid === 'text-2') return { sid, stype: 'inline-text', text: 'World' };
        return null;
      },
      getPreviousEditableNode: (sid: string) => (sid === 'text-2' ? 'text-1' : null)
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('moveCursorLeft');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-2',
      startOffset: 0,
      endNodeId: 'text-2',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });

    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5,
      endNodeId: 'text-1',
      endOffset: 5,
      collapsed: true,
      direction: 'backward'
    });
  });

  it('moveCursorLeft: 텍스트 처음에서 이전 selectable inline-image 로 이동한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-2') return { sid, stype: 'inline-text', text: 'World' };
        if (sid === 'image-1') return { sid, stype: 'inline-image', attributes: { src: 'x' } };
        return null;
      },
      getPreviousEditableNode: (sid: string) => (sid === 'text-2' ? 'image-1' : null),
      isSelectableNode: (sid: string) => sid === 'image-1'
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('moveCursorLeft');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-2',
      startOffset: 0,
      endNodeId: 'text-2',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });

    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'image-1',
      startOffset: 0,
      endNodeId: 'image-1',
      endOffset: 0,
      collapsed: true,
      direction: 'backward'
    });
  });

  it('moveCursorRight: 2x2 테이블처럼 배치된 텍스트 체인을 순방향으로 순회한다', async () => {
    /**
     * 구조(논리적):
     * row-1: text-1a "A1", text-1b "B1"
     * row-2: text-2a "A2", text-2b "B2"
     *
     * getNextEditableNode 체인:
     *   text-1a -> text-1b -> text-2a -> text-2b
     */
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-1a') return { sid, stype: 'inline-text', text: 'A1' };
        if (sid === 'text-1b') return { sid, stype: 'inline-text', text: 'B1' };
        if (sid === 'text-2a') return { sid, stype: 'inline-text', text: 'A2' };
        if (sid === 'text-2b') return { sid, stype: 'inline-text', text: 'B2' };
        return null;
      },
      getNextEditableNode: (sid: string) => {
        if (sid === 'text-1a') return 'text-1b';
        if (sid === 'text-1b') return 'text-2a';
        if (sid === 'text-2a') return 'text-2b';
        return null;
      }
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('moveCursorRight');
    expect(cmd).toBeDefined();

    // 시작: text-1a 끝 (offset 2) → text-1b 처음
    let selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1a',
      startOffset: 2,
      endNodeId: 'text-1a',
      endOffset: 2,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-1b',
      startOffset: 0,
      endNodeId: 'text-1b',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    });

    // text-1b 끝에서 → text-2a 처음
    await cmd!.execute(editor, {
      selection: {
        type: 'range',
        startNodeId: 'text-1b',
        startOffset: 2,
        endNodeId: 'text-1b',
        endOffset: 2,
        collapsed: true,
        direction: 'forward'
      } as ModelSelection
    });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-2a',
      startOffset: 0,
      endNodeId: 'text-2a',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    });

    // text-2a 끝에서 → text-2b 처음
    await cmd!.execute(editor, {
      selection: {
        type: 'range',
        startNodeId: 'text-2a',
        startOffset: 2,
        endNodeId: 'text-2a',
        endOffset: 2,
        collapsed: true,
        direction: 'forward'
      } as ModelSelection
    });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-2b',
      startOffset: 0,
      endNodeId: 'text-2b',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    });
  });

  it('moveCursorLeft: 2x2 테이블처럼 배치된 텍스트 체인을 역방향으로 순회한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-1a') return { sid, stype: 'inline-text', text: 'A1' };
        if (sid === 'text-1b') return { sid, stype: 'inline-text', text: 'B1' };
        if (sid === 'text-2a') return { sid, stype: 'inline-text', text: 'A2' };
        if (sid === 'text-2b') return { sid, stype: 'inline-text', text: 'B2' };
        return null;
      },
      getPreviousEditableNode: (sid: string) => {
        if (sid === 'text-2b') return 'text-2a';
        if (sid === 'text-2a') return 'text-1b';
        if (sid === 'text-1b') return 'text-1a';
        return null;
      }
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('moveCursorLeft');
    expect(cmd).toBeDefined();

    // 시작: text-2b 처음(offset 0) → text-2a 끝
    let selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-2b',
      startOffset: 0,
      endNodeId: 'text-2b',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-2a',
      startOffset: 2,
      endNodeId: 'text-2a',
      endOffset: 2,
      collapsed: true,
      direction: 'backward'
    });

    // text-2a 처음(offset 0)으로 맞춰서 → text-1b 끝
    await cmd!.execute(editor, {
      selection: {
        type: 'range',
        startNodeId: 'text-2a',
        startOffset: 0,
        endNodeId: 'text-2a',
        endOffset: 0,
        collapsed: true,
        direction: 'backward'
      } as ModelSelection
    });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-1b',
      startOffset: 2,
      endNodeId: 'text-1b',
      endOffset: 2,
      collapsed: true,
      direction: 'backward'
    });

    // text-1b 처음(offset 0) → text-1a 끝
    await cmd!.execute(editor, {
      selection: {
        type: 'range',
        startNodeId: 'text-1b',
        startOffset: 0,
        endNodeId: 'text-1b',
        endOffset: 0,
        collapsed: true,
        direction: 'backward'
      } as ModelSelection
    });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-1a',
      startOffset: 2,
      endNodeId: 'text-1a',
      endOffset: 2,
      collapsed: true,
      direction: 'backward'
    });
  });

  it('moveCursorRight: 텍스트 → 이미지 → 빈 텍스트 → 이미지 → 텍스트 체인을 순서대로 이동한다', async () => {
    /**
     * 구조:
     * para-1:
     *   text-1 "A"
     *   image-1
     *   text-2 ""
     *   image-2
     *   text-3 "B"
     */
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-1') return { sid, stype: 'inline-text', text: 'A' };
        if (sid === 'image-1') return { sid, stype: 'inline-image', attributes: { src: 'x' } };
        if (sid === 'text-2') return { sid, stype: 'inline-text', text: '' };
        if (sid === 'image-2') return { sid, stype: 'inline-image', attributes: { src: 'y' } };
        if (sid === 'text-3') return { sid, stype: 'inline-text', text: 'B' };
        return null;
      },
      getNextEditableNode: (sid: string) => {
        if (sid === 'text-1') return 'image-1';
        if (sid === 'image-1') return 'text-2';
        if (sid === 'text-2') return 'image-2';
        if (sid === 'image-2') return 'text-3';
        return null;
      },
      isSelectableNode: (sid: string) => sid === 'image-1' || sid === 'image-2'
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('moveCursorRight');
    expect(cmd).toBeDefined();

    // 1. text-1 "A|" (offset 1) → text-1 끝이라 다음 editable 로 이동
    let selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 1,
      endNodeId: 'text-1',
      endOffset: 1,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'image-1',
      startOffset: 0,
      endNodeId: 'image-1',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    });

    // 2. image-1 → text-2 (빈 텍스트, offset 0)
    await cmd!.execute(editor, { selection: editor.lastSelection });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-2',
      startOffset: 0,
      endNodeId: 'text-2',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    });

    // 3. text-2 "" (offset 0 == textLength) → image-2
    await cmd!.execute(editor, { selection: editor.lastSelection });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'image-2',
      startOffset: 0,
      endNodeId: 'image-2',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    });

    // 4. image-2 → text-3(offset 0)
    await cmd!.execute(editor, { selection: editor.lastSelection });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-3',
      startOffset: 0,
      endNodeId: 'text-3',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    });
  });

  it('moveCursorLeft: 텍스트 → 이미지 → 빈 텍스트 → 이미지 → 텍스트 체인을 역방향으로 이동한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-1') return { sid, stype: 'inline-text', text: 'A' };
        if (sid === 'image-1') return { sid, stype: 'inline-image', attributes: { src: 'x' } };
        if (sid === 'text-2') return { sid, stype: 'inline-text', text: '' };
        if (sid === 'image-2') return { sid, stype: 'inline-image', attributes: { src: 'y' } };
        if (sid === 'text-3') return { sid, stype: 'inline-text', text: 'B' };
        return null;
      },
      getPreviousEditableNode: (sid: string) => {
        if (sid === 'text-3') return 'image-2';
        if (sid === 'image-2') return 'text-2';
        if (sid === 'text-2') return 'image-1';
        if (sid === 'image-1') return 'text-1';
        return null;
      },
      isSelectableNode: (sid: string) => sid === 'image-1' || sid === 'image-2'
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('moveCursorLeft');
    expect(cmd).toBeDefined();

    // 1. text-3 "|B" (offset 0) → 이전 editable 로 이동
    let selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-3',
      startOffset: 0,
      endNodeId: 'text-3',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'image-2',
      startOffset: 0,
      endNodeId: 'image-2',
      endOffset: 0,
      collapsed: true,
      direction: 'backward'
    });

    // 2. image-2 → text-2 (빈 텍스트, offset 0)
    await cmd!.execute(editor, { selection: editor.lastSelection });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-2',
      startOffset: 0,
      endNodeId: 'text-2',
      endOffset: 0,
      collapsed: true,
      direction: 'backward'
    });

    // 3. text-2 "" (offset 0) → image-1
    await cmd!.execute(editor, { selection: editor.lastSelection });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'image-1',
      startOffset: 0,
      endNodeId: 'image-1',
      endOffset: 0,
      collapsed: true,
      direction: 'backward'
    });

    // 4. image-1 → text-1(offset len=1)
    await cmd!.execute(editor, { selection: editor.lastSelection });
    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 1,
      endNodeId: 'text-1',
      endOffset: 1,
      collapsed: true,
      direction: 'backward'
    });
  });

  it('Shift+Right: 같은 텍스트 노드 안에서 한 글자 범위를 확장한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) =>
        sid === 'text-1' ? { sid, stype: 'inline-text', text: 'Hello' } : null
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('extendSelectionRight');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 2,
      endNodeId: 'text-1',
      endOffset: 2,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });

    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 2,
      endNodeId: 'text-1',
      endOffset: 3,
      collapsed: false,
      direction: 'forward'
    });
  });

  it('Shift+Left: 같은 텍스트 노드 안에서 한 글자 범위를 역방향으로 확장한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) =>
        sid === 'text-1' ? { sid, stype: 'inline-text', text: 'Hello' } : null
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('extendSelectionLeft');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 3,
      endNodeId: 'text-1',
      endOffset: 3,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });

    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 2,
      endNodeId: 'text-1',
      endOffset: 3,
      collapsed: false,
      direction: 'backward'
    });
  });

  it('Shift+Right: 텍스트 끝에서 다음 텍스트 노드의 첫 글자까지 cross-node 범위를 확장한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-1') return { sid, stype: 'inline-text', text: 'Hello' };
        if (sid === 'text-2') return { sid, stype: 'inline-text', text: 'World' };
        return null;
      },
      getNextEditableNode: (sid: string) => (sid === 'text-1' ? 'text-2' : null)
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('extendSelectionRight');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5,
      endNodeId: 'text-1',
      endOffset: 5,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });

    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5,
      endNodeId: 'text-2',
      endOffset: 1,
      collapsed: false,
      direction: 'forward'
    });
  });

  it('Shift+Left: 텍스트 처음에서 이전 텍스트 노드의 마지막 글자까지 cross-node 범위를 확장한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-1') return { sid, stype: 'inline-text', text: 'Hello' };
        if (sid === 'text-2') return { sid, stype: 'inline-text', text: 'World' };
        return null;
      },
      getPreviousEditableNode: (sid: string) => (sid === 'text-2' ? 'text-1' : null)
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new MoveSelectionExtension();
    ext.onCreate(editor);

    const cmd = editor.commands.get('extendSelectionLeft');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-2',
      startOffset: 0,
      endNodeId: 'text-2',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    await cmd!.execute(editor, { selection });

    expect(editor.lastSelection).toEqual({
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 4,
      endNodeId: 'text-2',
      endOffset: 0,
      collapsed: false,
      direction: 'backward'
    });
  });

  describe('word-wise movement (moveCursorWordLeft/Right)', () => {
    it('moveCursorWordRight: 같은 텍스트 노드 안에서 다음 단어의 시작으로 이동한다', async () => {
      const fakeDataStore = {
        getNode: (sid: string) =>
          sid === 'text-1'
            ? { sid, stype: 'inline-text', text: 'foo  bar baz' } // 두 개의 공백 포함
            : null
      };

      const editor = new FakeEditor(fakeDataStore) as any;
      const ext = new MoveSelectionExtension();
      ext.onCreate(editor);

      const cmd = editor.commands.get('moveCursorWordRight');
      expect(cmd).toBeDefined();

      const selection: ModelSelection = {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 0, // "foo"의 시작 지점
        endNodeId: 'text-1',
        endOffset: 0,
        collapsed: true,
        direction: 'forward'
      };

      await cmd!.execute(editor, { selection });

      // "foo__bar baz"
      // offset 0 에서 오른쪽으로 단어 단위 이동 → "bar"의 시작 인덱스 5 로 이동
      expect(editor.lastSelection).toEqual({
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 5,
        endNodeId: 'text-1',
        endOffset: 5,
        collapsed: true,
        direction: 'forward'
      });
    });

    it('moveCursorWordLeft: 같은 텍스트 노드 안에서 이전 단어의 시작으로 이동한다', async () => {
      const fakeDataStore = {
        getNode: (sid: string) =>
          sid === 'text-1'
            ? { sid, stype: 'inline-text', text: 'foo  bar baz' }
            : null
      };

      const editor = new FakeEditor(fakeDataStore) as any;
      const ext = new MoveSelectionExtension();
      ext.onCreate(editor);

      const cmd = editor.commands.get('moveCursorWordLeft');
      expect(cmd).toBeDefined();

      const selection: ModelSelection = {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 8, // "baz" 직전 공백/문자 경계 근처
        endNodeId: 'text-1',
        endOffset: 8,
        collapsed: true,
        direction: 'forward'
      };

      await cmd!.execute(editor, { selection });

      // "foo__bar baz"
      // offset 8(대략 "baz" 인근)에서 왼쪽으로 단어 단위 이동 → "bar"의 시작 인덱스 5 로 이동
      expect(editor.lastSelection).toEqual({
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 5,
        endNodeId: 'text-1',
        endOffset: 5,
        collapsed: true,
        direction: 'backward'
      });
    });
  });
});

