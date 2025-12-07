import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelSelection } from '@barocss/editor-core';

// Mock @barocss/model module to avoid dependency on actual DataStore/Transaction
// vi.mock must be defined synchronously at the top of the file, so maintain mock data in this scope
const commitMock = vi.fn().mockResolvedValue({ success: true });
const recordedTransactions: any[][] = [];

vi.mock('@barocss/model', () => {
  return {
    transaction: (_editor: any, operations: any[]) => {
      recordedTransactions.push(operations);
      return { commit: commitMock };
    },
    // control is used for wrapping operations in single node text deletion,
    // so just return the internal operations array as is
    control: (_nodeId: string, ops: any[]) => ops
  };
});

import { DeleteExtension } from '../src/delete';

interface RegisteredCommand {
  name: string;
  execute: (editor: any, payload: any) => any;
  canExecute: (editor: any, payload: any) => boolean;
}

class FakeEditor {
  public commands = new Map<string, RegisteredCommand>();
  public dataStore: any;

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
}

describe('DeleteExtension - backspace / deleteForward', () => {
  beforeEach(() => {
    commitMock.mockClear();
    recordedTransactions.length = 0;
  });

  it('backspace: deletes one character to the left from current node with deleteText when offset > 0', async () => {
    const fakeDataStore = {}; // _executeBackspace's offset>0 path does not use dataStore
    const editor = new FakeEditor(fakeDataStore) as any;

    const ext = new DeleteExtension();
    ext.onCreate(editor);

    const backspaceCmd = editor.commands.get('backspace');
    expect(backspaceCmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 3,
      endNodeId: 'text-1',
      endOffset: 3,
      collapsed: true,
      direction: 'forward'
    };

    await backspaceCmd!.execute(editor, { selection });

    // transaction should be called once and commit should be called once
    expect(recordedTransactions).toHaveLength(1);
    expect(commitMock).toHaveBeenCalledTimes(1);

    // Simply verify that deleteTextRange is included in the passed operations
    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('deleteTextRange');
    expect(ops[0].payload).toEqual({ start: 2, end: 3 });
  });

  it('deleteForward: offset < textLength 인 경우 현재 노드에서 오른쪽 한 글자를 삭제한다', async () => {
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-1') {
          return { sid, stype: 'inline-text', text: 'Hello' };
        }
        return null;
      }
    };
    const editor = new FakeEditor(fakeDataStore) as any;

    const ext = new DeleteExtension();
    ext.onCreate(editor);

    const deleteForwardCmd = editor.commands.get('deleteForward');
    expect(deleteForwardCmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 2, // "He|llo"
      endNodeId: 'text-1',
      endOffset: 2,
      collapsed: true,
      direction: 'forward'
    };

    await deleteForwardCmd!.execute(editor, { selection });

    expect(recordedTransactions).toHaveLength(1);
    expect(commitMock).toHaveBeenCalledTimes(1);

    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('deleteTextRange');
    expect(ops[0].payload).toEqual({ start: 2, end: 3 });
  });

  it('deleteForward: 텍스트 끝에서 다음 텍스트 노드 첫 글자를 삭제한다 (케이스 A′)', async () => {
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-1') {
          return { sid, stype: 'inline-text', text: 'Hello' };
        }
        if (sid === 'text-2') {
          return { sid, stype: 'inline-text', text: 'World' };
        }
        return null;
      },
      getNextEditableNode: (sid: string) => {
        if (sid === 'text-1') return 'text-2';
        return null;
      },
      getParent: (_sid: string) => ({ sid: 'para-1', stype: 'paragraph' })
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new DeleteExtension();
    ext.onCreate(editor);

    const deleteForwardCmd = editor.commands.get('deleteForward');
    expect(deleteForwardCmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5, // End of "Hello|"
      endNodeId: 'text-1',
      endOffset: 5,
      collapsed: true,
      direction: 'forward'
    };

    await deleteForwardCmd!.execute(editor, { selection });

    expect(recordedTransactions).toHaveLength(1);
    expect(commitMock).toHaveBeenCalledTimes(1);

    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('deleteTextRange');
    expect(ops[0].payload).toEqual({ start: 0, end: 1 });
  });

  it('deleteForward: does nothing when there is no next node at text end (case E′)', async () => {
    const fakeDataStore = {
      getNode: (sid: string) => {
        if (sid === 'text-1') {
          return { sid, stype: 'inline-text', text: 'Hello' };
        }
        return null;
      },
      getNextEditableNode: (_sid: string) => null
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new DeleteExtension();
    ext.onCreate(editor);

    const deleteForwardCmd = editor.commands.get('deleteForward');
    expect(deleteForwardCmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5, // End
      endNodeId: 'text-1',
      endOffset: 5,
      collapsed: true,
      direction: 'forward'
    };

    await deleteForwardCmd!.execute(editor, { selection });

    // Transaction should not be called as there is no next editable node
    expect(recordedTransactions).toHaveLength(0);
    expect(commitMock).not.toHaveBeenCalled();
  });

  it('backspace: 블록 경계에서 이전 블록과 병합한다 (케이스 D)', async () => {
    /**
     * 구조:
     * document
     *  ├─ para-1
     *  │    └─ text-1 ("Hello")
     *  └─ para-2
     *       └─ text-2 ("World") ← 커서 offset 0
     *
     * getPreviousEditableNode(text-2) = text-1
     * prevParent = para-1, currentParent = para-2, stype 둘 다 'paragraph'
     * → mergeBlockNodes(left=para-1, right=para-2)
     */
    const fakeDataStore = {
      getPreviousEditableNode: (sid: string) => (sid === 'text-2' ? 'text-1' : null),
      getNode: (sid: string) => {
        if (sid === 'text-1') return { sid, stype: 'inline-text', text: 'Hello', parentId: 'para-1' };
        if (sid === 'text-2') return { sid, stype: 'inline-text', text: 'World', parentId: 'para-2' };
        if (sid === 'para-1') return { sid, stype: 'paragraph', content: ['text-1'], parentId: 'doc' };
        if (sid === 'para-2') return { sid, stype: 'paragraph', content: ['text-2'], parentId: 'doc' };
        return null;
      },
      getParent: (sid: string) => {
        if (sid === 'text-1') return { sid: 'para-1', stype: 'paragraph' };
        if (sid === 'text-2') return { sid: 'para-2', stype: 'paragraph' };
        if (sid === 'para-1' || sid === 'para-2') return { sid: 'doc', stype: 'document' };
        return null;
      }
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new DeleteExtension();
    ext.onCreate(editor);

    const backspaceCmd = editor.commands.get('backspace');
    expect(backspaceCmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-2',
      startOffset: 0, // Start of first text in paragraph-2
      endNodeId: 'text-2',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    await backspaceCmd!.execute(editor, { selection });

    expect(recordedTransactions).toHaveLength(1);
    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('mergeBlockNodes');
    expect(ops[0].payload).toEqual({ leftNodeId: 'para-1', rightNodeId: 'para-2' });
  });

  it('deleteForward: merges with next block at block boundary (case D′)', async () => {
    /**
     * 구조:
     * document
     *  ├─ para-1
     *  │    └─ text-1 ("Hello") ← 커서 offset textLength
     *  └─ para-2
     *       └─ text-2 ("World")
     *
     * getNextEditableNode(text-1) = text-2
     * currentParent = para-1, nextParent = para-2, stype 둘 다 'paragraph'
     * → mergeBlockNodes(left=para-1, right=para-2)
     */
    const fakeDataStore = {
      getNextEditableNode: (sid: string) => (sid === 'text-1' ? 'text-2' : null),
      getNode: (sid: string) => {
        if (sid === 'text-1') return { sid, stype: 'inline-text', text: 'Hello', parentId: 'para-1' };
        if (sid === 'text-2') return { sid, stype: 'inline-text', text: 'World', parentId: 'para-2' };
        if (sid === 'para-1') return { sid, stype: 'paragraph', content: ['text-1'], parentId: 'doc' };
        if (sid === 'para-2') return { sid, stype: 'paragraph', content: ['text-2'], parentId: 'doc' };
        return null;
      },
      getParent: (sid: string) => {
        if (sid === 'text-1') return { sid: 'para-1', stype: 'paragraph' };
        if (sid === 'text-2') return { sid: 'para-2', stype: 'paragraph' };
        if (sid === 'para-1' || sid === 'para-2') return { sid: 'doc', stype: 'document' };
        return null;
      }
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new DeleteExtension();
    ext.onCreate(editor);

    const deleteForwardCmd = editor.commands.get('deleteForward');
    expect(deleteForwardCmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5, // End of "Hello"
      endNodeId: 'text-1',
      endOffset: 5,
      collapsed: true,
      direction: 'forward'
    };

    await deleteForwardCmd!.execute(editor, { selection });

    expect(recordedTransactions).toHaveLength(1);
    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('mergeBlockNodes');
    expect(ops[0].payload).toEqual({ leftNodeId: 'para-1', rightNodeId: 'para-2' });
  });

  it('backspace: treats inline-image as previous editable node and deletes entirely (case C)', async () => {
    /**
     * 구조:
     * paragraph
     *   ├─ text-1 ("Hello")
     *   ├─ image-1 (inline-image, atom, text 없음)
     *   └─ text-2 ("World") ← 커서 offset 0
     *
     * getPreviousEditableNode(text-2) = image-1
     * prevNode.text 가 없으므로 → deleteNode(image-1)
     */
    const fakeDataStore = {
      getPreviousEditableNode: (sid: string) => (sid === 'text-2' ? 'image-1' : null),
      getNode: (sid: string) => {
        if (sid === 'text-1') return { sid, stype: 'inline-text', text: 'Hello', parentId: 'para-1' };
        if (sid === 'image-1') return { sid, stype: 'inline-image', parentId: 'para-1', attributes: { src: 'x' } };
        if (sid === 'text-2') return { sid, stype: 'inline-text', text: 'World', parentId: 'para-1' };
        return null;
      },
      getParent: (sid: string) => {
        if (sid === 'text-1' || sid === 'image-1' || sid === 'text-2') {
          return { sid: 'para-1', stype: 'paragraph' };
        }
        return null;
      }
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new DeleteExtension();
    ext.onCreate(editor);

    const backspaceCmd = editor.commands.get('backspace');
    expect(backspaceCmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-2',
      startOffset: 0,
      endNodeId: 'text-2',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    await backspaceCmd!.execute(editor, { selection });

    expect(recordedTransactions).toHaveLength(1);
    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('delete');
    expect(ops[0].payload).toEqual({ nodeId: 'image-1' });
  });

  it('deleteForward: inline-image 를 다음 편집 가능한 노드로 보고 전체 삭제한다 (케이스 C′)', async () => {
    /**
     * 구조:
     * paragraph
     *   ├─ text-1 ("Hello") ← 커서 offset 5
     *   ├─ image-1 (inline-image, atom, text 없음)
     *   └─ text-2 ("World")
     *
     * getNextEditableNode(text-1) = image-1
     * nextNode.text 가 없으므로 → deleteNode(image-1)
     */
    const fakeDataStore = {
      getNextEditableNode: (sid: string) => (sid === 'text-1' ? 'image-1' : null),
      getNode: (sid: string) => {
        if (sid === 'text-1') return { sid, stype: 'inline-text', text: 'Hello', parentId: 'para-1' };
        if (sid === 'image-1') return { sid, stype: 'inline-image', parentId: 'para-1', attributes: { src: 'x' } };
        if (sid === 'text-2') return { sid, stype: 'inline-text', text: 'World', parentId: 'para-1' };
        return null;
      },
      getParent: (sid: string) => {
        if (sid === 'text-1' || sid === 'image-1' || sid === 'text-2') {
          return { sid: 'para-1', stype: 'paragraph' };
        }
        return null;
      }
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new DeleteExtension();
    ext.onCreate(editor);

    const deleteForwardCmd = editor.commands.get('deleteForward');
    expect(deleteForwardCmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5,
      endNodeId: 'text-1',
      endOffset: 5,
      collapsed: true,
      direction: 'forward'
    };

    await deleteForwardCmd!.execute(editor, { selection });

    expect(recordedTransactions).toHaveLength(1);
    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('delete');
    expect(ops[0].payload).toEqual({ nodeId: 'image-1' });
  });

  it('backspace: 서로 다른 블록 타입(heading ← paragraph)에서는 블록 병합을 하지 않는다', async () => {
    /**
     * 구조:
     * heading-1("Title")
     * paragraph-1("Body") ← 커서 offset 0
     *
     * getPreviousEditableNode(text-body) = text-title
     * prevParent = heading-1, currentParent = paragraph-1, stype 다름
     * → mergeBlockNodes 가 호출되지 않아야 한다.
     */
    const fakeDataStore = {
      getPreviousEditableNode: (sid: string) => (sid === 'text-body' ? 'text-title' : null),
      getNode: (sid: string) => {
        if (sid === 'text-title') return { sid, stype: 'inline-text', text: 'Title', parentId: 'heading-1' };
        if (sid === 'text-body') return { sid, stype: 'inline-text', text: 'Body', parentId: 'para-1' };
        if (sid === 'heading-1') return { sid, stype: 'heading', content: ['text-title'], parentId: 'doc' };
        if (sid === 'para-1') return { sid, stype: 'paragraph', content: ['text-body'], parentId: 'doc' };
        return null;
      },
      getParent: (sid: string) => {
        if (sid === 'text-title') return { sid: 'heading-1', stype: 'heading' };
        if (sid === 'text-body') return { sid: 'para-1', stype: 'paragraph' };
        if (sid === 'heading-1' || sid === 'para-1') return { sid: 'doc', stype: 'document' };
        return null;
      }
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new DeleteExtension();
    ext.onCreate(editor);

    const backspaceCmd = editor.commands.get('backspace');
    expect(backspaceCmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-body',
      startOffset: 0,
      endNodeId: 'text-body',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    await backspaceCmd!.execute(editor, { selection });

    // mergeBlockNodes should not be created as block types are different
    // (current implementation does not create any operation)
    expect(recordedTransactions).toHaveLength(0);
    expect(commitMock).not.toHaveBeenCalled();
  });

  it('deleteForward: 서로 다른 블록 타입(paragraph → codeBlock)에서는 블록 병합을 하지 않는다', async () => {
    /**
     * 구조:
     * paragraph-1("Hello") ← 커서 offset 5
     * code-1("console.log")  (stype: codeBlock)
     *
     * getNextEditableNode(text-para) = text-code
     * currentParent = para-1, nextParent = code-1, stype 다름
     * → mergeBlockNodes 가 호출되지 않아야 한다.
     */
    const fakeDataStore = {
      getNextEditableNode: (sid: string) => (sid === 'text-para' ? 'text-code' : null),
      getNode: (sid: string) => {
        if (sid === 'text-para') return { sid, stype: 'inline-text', text: 'Hello', parentId: 'para-1' };
        if (sid === 'text-code') return { sid, stype: 'inline-text', text: 'console.log', parentId: 'code-1' };
        if (sid === 'para-1') return { sid, stype: 'paragraph', content: ['text-para'], parentId: 'doc' };
        if (sid === 'code-1') return { sid, stype: 'codeBlock', content: ['text-code'], parentId: 'doc', editable: true };
        return null;
      },
      getParent: (sid: string) => {
        if (sid === 'text-para') return { sid: 'para-1', stype: 'paragraph' };
        if (sid === 'text-code') return { sid: 'code-1', stype: 'codeBlock' };
        if (sid === 'para-1' || sid === 'code-1') return { sid: 'doc', stype: 'document' };
        return null;
      }
    };

    const editor = new FakeEditor(fakeDataStore) as any;
    const ext = new DeleteExtension();
    ext.onCreate(editor);

    const deleteForwardCmd = editor.commands.get('deleteForward');
    expect(deleteForwardCmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-para',
      startOffset: 5,
      endNodeId: 'text-para',
      endOffset: 5,
      collapsed: true,
      direction: 'forward'
    };

    await deleteForwardCmd!.execute(editor, { selection });

    expect(recordedTransactions).toHaveLength(0);
    expect(commitMock).not.toHaveBeenCalled();
  });
});


