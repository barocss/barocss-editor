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
    control: (_nodeId: string, ops: any[]) => ops,
    deleteTextRange: (start: number, end: number) => ({ type: 'deleteTextRange', payload: { start, end } }),
    deleteOp: (nodeId: string) => ({ type: 'delete', payload: { nodeId } }),
    deleteRange: (range: any) => ({ type: 'deleteRange', payload: { range } })
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
  /** Where the extension left the caret, which a merge has to decide. */
  public selection: any = null;

  constructor(dataStore: any) {
    this.dataStore = dataStore;
  }

  updateSelection(selection: any) {
    this.selection = selection;
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

  /**
   * A selection that crosses more than one run.
   *
   * Formatting splits a paragraph into runs, so any selection over a bold word
   * and the plain text after it spans two — which is most selections in a
   * document anybody has formatted. The operations built for it named only
   * `startNodeId` and used the *end* offset from a different node, so the
   * deletion went one run deep and stopped.
   *
   * The rest of it was not left undone on screen: the browser had already
   * removed the text natively, and the MutationObserver imported the difference
   * afterwards. So the model was being finished by the DOM — measured, three
   * `deleteText` calls where the model asked for one — and blocking that import
   * (which is what stops mark application corrupting the text) stopped the
   * deletion halfway.
   */
  it('backspace: deletes the whole selection when it spans more than one run', async () => {
    const editor = new FakeEditor({}) as any;
    const ext = new DeleteExtension();
    ext.onCreate(editor);

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'run-a',
      startOffset: 3,
      endNodeId: 'run-c',
      endOffset: 2,
      collapsed: false,
      direction: 'forward'
    };

    await editor.commands.get('backspace')!.execute(editor, { selection });

    expect(recordedTransactions).toHaveLength(1);
    const ops = recordedTransactions[0];

    // Both ends have to reach the operation. Naming only the first run is what
    // made this delete one run deep.
    const payloads = JSON.stringify(ops);
    expect(payloads).toContain('run-a');
    expect(payloads).toContain('run-c');
  });

  it('backspace: still deletes within one run without reaching for the range operation', async () => {
    // The single-run path is the common one and stays as it was: a selection
    // inside one run is a substring, and saying so is cheaper and clearer than
    // describing it as a range between two ends that happen to be equal.
    const editor = new FakeEditor({}) as any;
    const ext = new DeleteExtension();
    ext.onCreate(editor);

    await editor.commands.get('backspace')!.execute(editor, {
      selection: {
        type: 'range',
        startNodeId: 'run-a',
        startOffset: 1,
        endNodeId: 'run-a',
        endOffset: 4,
        collapsed: false,
        direction: 'forward'
      } as ModelSelection
    });

    const ops = recordedTransactions[0];
    expect(JSON.stringify(ops)).toContain('deleteTextRange');
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
    // Where the caret ends up is the operation's business, and is covered there:
    // this test mocks the transaction away, so no operation runs.
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



/**
 * Word deletion used to live in the view, which computed the boundary itself and
 * dispatched a low-level range delete. How far a word reaches is a question
 * about the text, so it belongs with the other delete semantics — and having it
 * here is what lets a word delete at the start of a block fall through to the
 * block merge instead of doing nothing.
 */
describe('DeleteExtension - word deletion', () => {
  beforeEach(() => {
    commitMock.mockClear();
    recordedTransactions.length = 0;
  });

  const textStore = (text: string) => ({
    getNode: (sid: string) => (sid === 'text-1' ? { sid, stype: 'inline-text', text } : null)
  });

  const caretAt = (offset: number): ModelSelection => ({
    type: 'range',
    startNodeId: 'text-1',
    startOffset: offset,
    endNodeId: 'text-1',
    endOffset: offset,
    collapsed: true,
    direction: 'forward'
  });

  const run = async (command: string, text: string, offset: number) => {
    const editor = new FakeEditor(textStore(text)) as any;
    new DeleteExtension().onCreate(editor);
    await editor.commands.get(command)!.execute(editor, { selection: caretAt(offset) });
    return editor;
  };

  it('deletes the word before the caret, and the space in front of it', async () => {
    // "Hello world|" → "Hello " : the space between two words goes with the word
    // being removed, which is what makes repeated presses feel like word steps.
    await run('deleteWordBackward', 'Hello world', 11);

    expect(recordedTransactions).toHaveLength(1);
    expect(recordedTransactions[0][0].type).toBe('deleteTextRange');
    expect(recordedTransactions[0][0].payload).toEqual({ start: 6, end: 11 });
  });

  it('crosses the whitespace before reaching the word', async () => {
    // "Hello   |" → "Hello": the run of spaces is not a word of its own
    await run('deleteWordBackward', 'Hello   ', 8);
    expect(recordedTransactions[0][0].payload).toEqual({ start: 0, end: 8 });
  });

  it('deletes the word after the caret when going forward', async () => {
    await run('deleteWordForward', 'Hello world', 5);
    expect(recordedTransactions[0][0].payload).toEqual({ start: 5, end: 11 });
  });

  it('falls back to the character behaviour at the start of a node', async () => {
    // There is no word left to measure, and the ordinary backspace is the one
    // that knows how to merge two blocks.
    const editor = new FakeEditor({
      ...textStore('Hello'),
      getPreviousEditableNode: () => null
    }) as any;
    new DeleteExtension().onCreate(editor);

    const handled = await editor.commands
      .get('deleteWordBackward')!
      .execute(editor, { selection: caretAt(0) });

    // No previous node to merge with, so nothing happens — but it got there by
    // asking backspace, not by giving up on its own.
    expect(handled).toBe(false);
    expect(recordedTransactions).toHaveLength(0);
  });

  it('deletes the selection instead when there is one', async () => {
    const editor = new FakeEditor(textStore('Hello world')) as any;
    new DeleteExtension().onCreate(editor);

    await editor.commands.get('deleteWordBackward')!.execute(editor, {
      selection: {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 2,
        endNodeId: 'text-1',
        endOffset: 7,
        collapsed: false,
        direction: 'forward'
      } as ModelSelection
    });

    expect(recordedTransactions[0][0].payload).toEqual({ start: 2, end: 7 });
  });
});

/**
 * Deleting a set of nodes rather than a span of text.
 *
 * A node selection can have holes in it — three shapes on a board, two cells in
 * different rows — so the span between its first and last is not what the user
 * chose.
 */
describe('DeleteExtension - a selection of whole nodes', () => {
  beforeEach(() => {
    commitMock.mockClear();
    recordedTransactions.length = 0;
  });

  const nodeSelection = (nodeIds: string[]): ModelSelection =>
    ({
      type: 'node',
      nodeIds,
      startNodeId: nodeIds[0],
      startOffset: 0,
      endNodeId: nodeIds[nodeIds.length - 1],
      endOffset: 0,
      collapsed: false,
      direction: 'none'
    }) as ModelSelection;

  it('removes every selected node, not the span between the first and the last', async () => {
    const editor = new FakeEditor({}) as any;
    new DeleteExtension().onCreate(editor);

    await editor.commands.get('backspace')!.execute(editor, {
      selection: nodeSelection(['shape-1', 'shape-3', 'shape-7'])
    });

    expect(recordedTransactions).toHaveLength(1);
    const ops = recordedTransactions[0];
    expect(ops.map((op: any) => op.type)).toEqual(['delete', 'delete', 'delete']);
    expect(ops.map((op: any) => op.payload.nodeId)).toEqual(['shape-1', 'shape-3', 'shape-7']);
  });

  it('deletes them in one transaction, so undo brings all of them back', async () => {
    const editor = new FakeEditor({}) as any;
    new DeleteExtension().onCreate(editor);

    await editor.commands.get('backspace')!.execute(editor, {
      selection: nodeSelection(['a', 'b'])
    });

    // Not two edits: a document briefly missing one of two selected shapes is a
    // state no reader should be able to observe.
    expect(commitMock).toHaveBeenCalledTimes(1);
  });

  it('leaves text selections alone', async () => {
    const editor = new FakeEditor({}) as any;
    new DeleteExtension().onCreate(editor);

    await editor.commands.get('backspace')!.execute(editor, {
      selection: {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 1,
        endNodeId: 'text-1',
        endOffset: 4,
        collapsed: false,
        direction: 'forward'
      } as ModelSelection
    });

    expect(recordedTransactions[0][0].type).toBe('deleteTextRange');
  });
});
