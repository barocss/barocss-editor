import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor, type ModelSelection } from '@barocss/editor-core';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { data, define, element, getGlobalRegistry, slot } from '@barocss/dsl';
import { EditorViewDOM } from '../src/editor-view-dom';

let editor: Editor;
let view: EditorViewDOM;
let container: HTMLElement;
let button: HTMLButtonElement;
let intended: HTMLElement;
let previous: HTMLElement;
let saved: ModelSelection;
const requirement = 'Preserve the linked decision paragraph exactly as pinned.';

function textOf(element: Element): Text {
  return document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode() as Text;
}

function rangeAt(element: HTMLElement, start: number, end = start): ModelSelection {
  const sid = element.getAttribute('data-bc-sid')!;
  return { type: 'range', startNodeId: sid, startOffset: start, endNodeId: sid, endOffset: end };
}

function mouseDown(target: HTMLElement, options: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...options });
  target.dispatchEvent(event);
  return event;
}

// Controlled native default: jsdom dispatches events but does not hit-test glyphs,
// focus contenteditable on mousedown, or place a caret. Only those browser defaults
// are supplied here. The real view listeners, DOM selection API and model run.
function nativeCaret(target: HTMLElement, offset = 0): void {
  const text = textOf(target);
  document.getSelection()!.setBaseAndExtent(text, offset, text, offset);
  view.handleSelectionChange();
}

function focusEditor(): { anchor: Node | null; offset: number; text: string } {
  const result = { anchor: null as Node | null, offset: 0, text: '' };
  // Observe the real focus handler before jsdom's artificial post-focus collapse.
  view.contentEditableElement.addEventListener('focus', () => {
    const selection = document.getSelection()!;
    result.anchor = selection.anchorNode;
    result.offset = selection.anchorOffset;
    result.text = selection.toString();
  }, { once: true });
  view.contentEditableElement.focus();
  return result;
}

function expectCaret(target: HTMLElement, offset = 0): void {
  expect(document.getSelection()!.anchorNode).toBe(textOf(target));
  expect(document.getSelection()!.anchorOffset).toBe(offset);
  expect(document.getSelection()!.isCollapsed).toBe(true);
  expect(editor.selection).toMatchObject(rangeAt(target, offset));
}

beforeEach(async () => {
  vi.useFakeTimers();
  const schema = createSchema('focus-pointer', {
    topNode: 'document', nodes: {
      document: { name: 'document', group: 'document', content: 'block+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      'inline-text': { name: 'inline-text', group: 'inline' }
    }, marks: {}
  });
  define('document', element('div', {}, [slot('content')]));
  define('paragraph', element('p', {}, [slot('content')]));
  define('inline-text', element('span', {}, [data('text', '')]));
  editor = new Editor({ editable: true, schema, dataStore: new DataStore(undefined, schema) });
  editor.loadDocument({ stype: 'document', content: [requirement, 'Earlier comment belongs to this paragraph.'].map(text => ({
    stype: 'paragraph', content: [{ stype: 'inline-text', text }]
  })) }, 'focus-pointer');
  container = document.createElement('div');
  document.body.append(container);
  view = new EditorViewDOM(editor, { container, registry: getGlobalRegistry() });
  view.render(undefined, { sync: true });
  // jsdom focus() unconditionally collapses to the element after focus listeners.
  // Ignore its extra queued selection reports, as in the existing origin tests.
  // Each controlled nativeCaret report still uses the real view pipeline.
  document.removeEventListener('selectionchange', (view as unknown as {
    _boundHandleSelectionChange: EventListener
  })._boundHandleSelectionChange);
  view.contentEditableElement.tabIndex = 0;
  [intended, previous] = Array.from(view.contentEditableElement.querySelectorAll('p')).map(paragraph =>
    textOf(paragraph).parentElement!.closest<HTMLElement>('[data-bc-sid]')!);
  expect(intended.textContent).toBe(requirement);
  button = document.createElement('button');
  button.textContent = 'Comment';
  container.append(button);
  saved = rangeAt(previous, 0, previous.textContent!.length);
  focusEditor();
  editor.updateSelection(saved);
  await vi.advanceTimersByTimeAsync(50);
  button.focus();
  document.getSelection()!.setBaseAndExtent(button.firstChild!, 0, button.firstChild!, 0);
  await vi.advanceTimersByTimeAsync(50);
});

afterEach(() => {
  view.destroy();
  editor.destroy();
  container.remove();
  document.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('pointer focus leaves caret placement to the native text gesture', () => {
  it('does not replace the old external anchor with the saved comment range during focus', async () => {
    const before = JSON.stringify(editor.exportDocument());
    const root = editor.getRootId();
    const epoch = editor.dataStore.getDocumentEpoch();
    mouseDown(intended);
    const focus = focusEditor();
    // Observe the focus phase before supplying the missing native caret default.
    expect(focus.anchor).toBe(button.firstChild);
    nativeCaret(intended, 2);
    await vi.advanceTimersByTimeAsync(50);
    expectCaret(intended, 2);
    expect(JSON.stringify(editor.exportDocument())).toBe(before);
    expect(editor.getRootId()).toBe(root);
    expect(editor.dataStore.getDocumentEpoch()).toBe(epoch);
  });

  for (const focused of [false, true]) it(`retires an old pending selection retry when pointer starts; focused=${focused}`, async () => {
    if (focused) focusEditor();
    await vi.advanceTimersByTimeAsync(50);
    const parent = previous.parentElement!;
    previous.remove();
    editor.updateSelection(saved);
    mouseDown(intended);
    focusEditor();
    nativeCaret(intended, 3);
    // The delayed DOM node arrives before the selectionchange debounce ends.
    parent.append(previous);
    await vi.advanceTimersByTimeAsync(50);
    expectCaret(intended, 3);
  });

  it('retires an old pending selection applied by render completion', async () => {
    const renderer = (view as unknown as { _domRenderer: { render: (...args: unknown[]) => void } })._domRenderer;
    const original = renderer.render.bind(renderer);
    const spy = vi.spyOn(renderer, 'render').mockImplementation((...args) => {
      // Controlled render boundary: model selection can arrive while rendering.
      editor.updateSelection(saved);
      original(...args);
    });
    view.render(undefined, { sync: true });
    spy.mockRestore();
    mouseDown(intended);
    focusEditor();
    nativeCaret(intended, 4);
    await vi.advanceTimersByTimeAsync(50);
    expectCaret(intended, 4);
  });

  it('does not restore the saved range when the old native anchor is another text node', async () => {
    const text = textOf(previous);
    document.getSelection()!.setBaseAndExtent(text, 5, text, 5);
    mouseDown(intended);
    const focus = focusEditor();
    expect(focus.anchor).toBe(text);
    expect(focus.offset).toBe(5);
    expect(focus.text).toBe('');
    nativeCaret(intended, 1);
    await vi.advanceTimersByTimeAsync(50);
    expectCaret(intended, 1);
  });

  it('preserves a pending restore when an ancestor prevents the pointer default', async () => {
    const parent = previous.parentElement!;
    previous.remove();
    editor.updateSelection(saved);
    container.addEventListener('mousedown', event => event.preventDefault(), { once: true });
    mouseDown(intended);
    parent.append(previous);
    const focus = focusEditor();
    expect(focus.text).toBe(previous.textContent);
    await vi.advanceTimersByTimeAsync(50);
    expect(editor.selection).toMatchObject(saved);
  });

  it('does not let an old retry callback apply a newer model command', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    previous.remove();
    editor.updateSelection(saved);
    const parent = intended.parentElement!;
    intended.remove();
    const latest = rangeAt(intended, 6);
    editor.updateSelection(latest);
    expect(frames).toHaveLength(2);
    parent.append(intended);
    const anchor = document.getSelection()!.anchorNode;
    frames[0](0);
    expect(document.getSelection()!.anchorNode).toBe(anchor);
    frames[1](0);
    expectCaret(intended, 6);
  });

  it('still applies an explicit model selection between mousedown and focus', async () => {
    mouseDown(intended);
    editor.updateSelection(rangeAt(previous, 5));
    const focus = focusEditor();
    expect(focus.anchor).toBe(textOf(previous));
    await vi.advanceTimersByTimeAsync(50);
    expect(editor.selection).toMatchObject(rangeAt(previous, 5));
  });

  it('still applies an explicit model selection after pointer focus', async () => {
    mouseDown(intended);
    focusEditor();
    nativeCaret(intended, 2);
    editor.updateSelection(rangeAt(previous, 5));
    await vi.advanceTimersByTimeAsync(50);
    expectCaret(previous, 5);
  });

  for (const route of ['programmatic', 'keyboard', 'expired pointer', 'cancelled pointer', 'secondary button'] as const) {
    it(`restores the saved range on ${route} focus`, async () => {
      if (route === 'keyboard') button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
      if (route === 'expired pointer') { mouseDown(intended); await vi.advanceTimersByTimeAsync(1); }
      if (route === 'cancelled pointer') {
        intended.addEventListener('mousedown', event => event.preventDefault(), { once: true });
        mouseDown(intended);
      }
      if (route === 'secondary button') mouseDown(intended, { button: 2 });
      const focus = focusEditor();
      expect(focus.text).toBe(previous.textContent);
      await vi.advanceTimersByTimeAsync(50);
      expect(editor.selection).toMatchObject(saved);
    });
  }

  for (const kind of ['embedded owner', 'input', 'nested editable', 'readonly region', 'readonly editor', 'composition', 'widget', 'foreign model node', 'historical DOM root'] as const) {
    it(`keeps focus restoration outside owned editable text: ${kind}`, async () => {
      let target = intended;
      if (kind === 'embedded owner') intended.setAttribute('data-editor-input-owner', 'widget');
      if (kind === 'nested editable') intended.setAttribute('contenteditable', 'true');
      if (kind === 'readonly region') intended.setAttribute('contenteditable', 'false');
      if (kind === 'readonly editor') editor.setEditable(false);
      if (kind === 'composition') view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      if (kind === 'input') {
        target = document.createElement('input'); intended.append(target);
      }
      if (kind === 'widget') target = intended.parentElement!;
      if (kind === 'foreign model node') intended.setAttribute('data-bc-sid', 'historical:8');
      if (kind === 'historical DOM root') intended.parentElement!.parentElement!.setAttribute('data-bc-sid', 'historical:1');
      mouseDown(target);
      const focus = focusEditor();
      expect(focus.text).toBe(previous.textContent);
      await vi.advanceTimersByTimeAsync(50);
      expect(editor.selection).toMatchObject(saved);
    });
  }

  for (const retirement of ['document', 'session', 'authority', 'composition', 'destroy'] as const) {
    it(`does not run an old retry after ${retirement} changes`, async () => {
      const parent = previous.parentElement!;
      previous.remove();
      editor.updateSelection(saved);
      if (retirement === 'document') editor.loadDocument(editor.exportDocument(), 'focus-pointer');
      if (retirement === 'session') editor.dataStore.setSessionId('focus-pointer-next');
      if (retirement === 'authority') { editor.setEditable(false); editor.setEditable(true); }
      if (retirement === 'composition') view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      if (retirement === 'destroy') view.destroy();
      const anchor = document.getSelection()!.anchorNode;
      parent.append(previous);
      await vi.advanceTimersByTimeAsync(50);
      expect(document.getSelection()!.anchorNode).toBe(anchor);
    });
  }
});
