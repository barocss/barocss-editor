import { describe, it, expect, vi, afterEach } from 'vitest';
import { ReactInputHandler } from '../src/input-handler';

function createSelectionHandler() {
  return {
    convertDOMSelectionToModel: vi.fn(() => ({
      type: 'range',
      startNodeId: 't1',
      startOffset: 1,
      endNodeId: 't1',
      endOffset: 1,
    })),
    convertStaticRangeToModel: vi.fn(() => ({
      type: 'range',
      startNodeId: 't1',
      startOffset: 0,
      endNodeId: 't1',
      endOffset: 0,
    })),
    isSelectionInsideEditableText: vi.fn(() => true),
    convertModelSelectionToDOM: vi.fn(),
  };
}

function createDomTextFixture(initialText: string) {
  const root = document.createElement('div');
  root.setAttribute('contenteditable', 'true');
  const inline = document.createElement('span');
  inline.setAttribute('data-bc-sid', 't1');
  const textNode = document.createTextNode(initialText);
  inline.appendChild(textNode);
  root.appendChild(inline);
  document.body.appendChild(root);
  return { root, inline, textNode };
}

function createInputHandler() {
  const executeCommand = vi.fn(async () => true);
  const emit = vi.fn();
  const dataStore = {
    getNode: (sid: string) => (sid === 't1' ? { stype: 'inline-text', text: 'hello' } : null),
  };

  const selectionHandler = createSelectionHandler();
  const viewStateRef = {
    current: {
      isModelDrivenChange: false,
      isRendering: false,
      isComposing: false,
      compositionWindowUntil: 0,
      skipNextRenderFromMO: false,
      skipApplyModelSelectionToDOM: false,
    },
  };

  const editor = {
    dataStore,
    executeCommand,
    emit,
    updateSelection: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getDocumentProxy: () => ({ stype: 'document' }),
    keybindings: { resolve: vi.fn(() => []) },
  };

  const inputHandler = new ReactInputHandler(editor as any, selectionHandler as any, viewStateRef as any);

  return { inputHandler, executeCommand, emit, editor, viewStateRef, selectionHandler };
}

function createCharacterMutation(target: Node) {
  return [{ type: 'characterData', target } as unknown as MutationRecord];
}

describe('ReactInputHandler IME/Composition stability', () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    const sel = window.getSelection();
    sel?.removeAllRanges();
  });

  it('skips C1 DOM sync while composing, and re-syncs after composition window', async () => {
    const { root, textNode } = createDomTextFixture('hello');
    const { inputHandler, executeCommand } = createInputHandler();

    textNode.textContent = 'hella';
    await inputHandler.handleDomMutations(createCharacterMutation(textNode));
    expect(executeCommand).toHaveBeenCalledTimes(1);

    executeCommand.mockClear();
    inputHandler.setComposing(true);
    textNode.textContent = 'helli';
    await inputHandler.handleDomMutations(createCharacterMutation(textNode));
    expect(executeCommand).toHaveBeenCalledTimes(0);

    inputHandler.setComposing(false);
    textNode.textContent = 'hello';
    await inputHandler.handleDomMutations(createCharacterMutation(textNode));
    expect(executeCommand).toHaveBeenCalledTimes(0);

    await new Promise((resolve) => setTimeout(resolve, 140));
    textNode.textContent = 'hellu';
    await inputHandler.handleDomMutations(createCharacterMutation(textNode));
    expect(executeCommand).toHaveBeenCalledTimes(1);

    document.body.removeChild(root);
  });

  it('defers syncFocusedTextNodeAfterComposition until post-composition window expiry and applies once', async () => {
    const { root, inline, textNode } = createDomTextFixture('hello');
    const { inputHandler, executeCommand } = createInputHandler();

    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 0);
    sel?.removeAllRanges();
    sel?.addRange(range);

    textNode.textContent = 'world';
    inputHandler.setComposing(true);
    inputHandler.setComposing(false);

    // First attempt should defer while composition window is open.
    await inputHandler.syncFocusedTextNodeAfterComposition();
    expect(executeCommand).toHaveBeenCalledTimes(0);

    await new Promise((resolve) => setTimeout(resolve, 140));
    await inputHandler.syncFocusedTextNodeAfterComposition();
    expect(executeCommand).toHaveBeenCalledTimes(1);

    // Additional retries must not duplicate (composition generation changed or scheduling cleared)
    await inputHandler.syncFocusedTextNodeAfterComposition();
    expect(executeCommand).toHaveBeenCalledTimes(1);

    expect(executeCommand).toHaveBeenLastCalledWith('replaceText', {
      range: {
        type: 'range',
        startNodeId: 't1',
        startOffset: 0,
        endNodeId: 't1',
        endOffset: 5,
      },
      text: 'world',
    });

    inline.remove();
    document.body.removeChild(root);
  });

  it('supports consecutive composition cycles and keeps sync to one per cycle', async () => {
    const { root, inline, textNode } = createDomTextFixture('hello');
    const { inputHandler, executeCommand } = createInputHandler();

    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 0);
    sel?.removeAllRanges();
    sel?.addRange(range);

    textNode.textContent = 'first';
    inputHandler.setComposing(true);
    inputHandler.setComposing(false);
    await new Promise((resolve) => setTimeout(resolve, 140));
    await inputHandler.syncFocusedTextNodeAfterComposition();
    expect(executeCommand).toHaveBeenCalledTimes(1);

    textNode.textContent = 'second';
    inputHandler.setComposing(true);
    inputHandler.setComposing(false);
    await new Promise((resolve) => setTimeout(resolve, 140));
    await inputHandler.syncFocusedTextNodeAfterComposition();
    expect(executeCommand).toHaveBeenCalledTimes(2);

    await inputHandler.syncFocusedTextNodeAfterComposition();
    expect(executeCommand).toHaveBeenCalledTimes(2);

    inline.remove();
    document.body.removeChild(root);
  });

  it('beforeInput isComposing 값으로 조합 상태 진입/종료를 추적해야 함', async () => {
    const { root, inline, textNode } = createDomTextFixture('hello');
    const { inputHandler, executeCommand } = createInputHandler();

    const beginComposition = {
      inputType: 'insertText',
      isComposing: true,
      data: '한',
      preventDefault: vi.fn(),
    } as unknown as InputEvent;

    const endComposition = {
      inputType: 'insertText',
      isComposing: false,
      data: '안',
      preventDefault: vi.fn(),
    } as unknown as InputEvent;

    const inlineSelection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 0);
    inlineSelection?.removeAllRanges();
    inlineSelection?.addRange(range);

    textNode.textContent = 'hella';
    inputHandler.handleBeforeInput(beginComposition);
    await inputHandler.handleDomMutations(createCharacterMutation(textNode));
    expect(executeCommand).toHaveBeenCalledTimes(0);

    inputHandler.handleBeforeInput(endComposition);
    inputHandler.handleInput({
      isComposing: false,
    } as unknown as InputEvent);

    await new Promise((resolve) => setTimeout(resolve, 140));
    await inputHandler.syncFocusedTextNodeAfterComposition();
    expect(executeCommand).toHaveBeenCalledTimes(1);

    inline.remove();
    document.body.removeChild(root);
  });

  it('composition에서 inline-text 밖이면 beforeinput에서 기본 동작을 막아야 함', () => {
    const { inputHandler, selectionHandler } = createInputHandler();
    (selectionHandler as any).isSelectionInsideEditableText = vi.fn(() => false);

    const preventDefault = vi.fn();
    const beforeInputEvent = {
      inputType: 'insertText',
      isComposing: true,
      data: '한',
      preventDefault,
    } as unknown as InputEvent;

    inputHandler.handleBeforeInput(beforeInputEvent);
    expect((selectionHandler as any).isSelectionInsideEditableText).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('sets post-composition window on keydown 229 and blocks immediate processing through keydown path', () => {
    const { inputHandler, viewStateRef, executeCommand } = createInputHandler();

    const keydownEvent = Object.create(null) as KeyboardEvent;
    Object.defineProperty(keydownEvent, 'keyCode', { value: 229 });
    Object.defineProperty(keydownEvent, 'key', { value: 'Process' });
    Object.defineProperty(keydownEvent, 'ctrlKey', { value: false });
    Object.defineProperty(keydownEvent, 'metaKey', { value: false });
    Object.defineProperty(keydownEvent, 'altKey', { value: false });
    Object.defineProperty(keydownEvent, 'shiftKey', { value: false });
    const before = Date.now();

    inputHandler.handleKeydown(keydownEvent);

    expect(viewStateRef.current.compositionWindowUntil).toBeGreaterThan(before);
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('sets post-composition window on keydown 229 even without key fields', () => {
    const { inputHandler, viewStateRef, executeCommand } = createInputHandler();

    const keydownEvent = {
      metaKey: false,
      keyCode: 229,
      key: 'Process',
    } as unknown as KeyboardEvent;

    inputHandler.handleKeydown(keydownEvent);
    const before = Date.now();
    expect(viewStateRef.current.compositionWindowUntil).toBeGreaterThan(Date.now());
    expect(viewStateRef.current.compositionWindowUntil).toBeGreaterThan(before);
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('prevents paste handling during IME phase', async () => {
    const { root, textNode } = createDomTextFixture('hello');
    const { inputHandler, executeCommand } = createInputHandler();

    const preventDefault = vi.fn();
    const getData = vi.fn(() => 'world');
    const pasteEvent = {
      clipboardData: { getData },
      preventDefault,
    } as unknown as ClipboardEvent;

    inputHandler.setComposing(true);
    inputHandler.handlePaste(pasteEvent);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();

    inputHandler.setComposing(false);
    // Wait until composition window expires and paste can be applied.
    await new Promise((resolve) => setTimeout(resolve, 140));

    // ensure selection exists; insertTextAtSelection uses selection conversion via selectionHandler mock
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode, 1);
    range.setEnd(textNode, 1);
    sel?.removeAllRanges();
    sel?.addRange(range);

    inputHandler.handlePaste(pasteEvent);
    expect(getData).toHaveBeenCalledWith('text/plain');
    expect(executeCommand).toHaveBeenCalledTimes(1);

    document.body.removeChild(root);
  });

  it('ignore composition path in beforeinput insertFromPaste and skip command if IME active', () => {
    const { inputHandler, executeCommand } = createInputHandler();

    const inputEvent = {
      inputType: 'insertFromPaste',
      isComposing: true,
      data: 'x',
      getTargetRanges: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as InputEvent;

    inputHandler.setComposing(false);
    inputHandler.handleBeforeInput(inputEvent);
    expect(executeCommand).not.toHaveBeenCalled();
    expect((inputEvent.getTargetRanges as any)).not.toHaveBeenCalled();
  });
});
