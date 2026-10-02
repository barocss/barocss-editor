// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { ModelSelection } from '@barocss/editor-core';
import { openNoteTree, type NoteSession } from '@barocss/office-note';
import { ContextToolbar, ownsEditorSelection } from '../src/context-toolbar';
import { captureTextSelection } from '../src/capture-text-selection';
import { DOMSelectionHandler } from '@barocss/editor-view-dom';

type Body = { session: NoteSession; scope: HTMLDivElement; text: Text; sid: string };
let root: Root;
let bodies: Body[];
const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
const rangeRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
const controls = [{ command: 'toggleBold', label: '굵게', icon: 'bold', mark: 'bold' }];

function makeBody(text: string): Body {
  const session = openNoteTree({ stype: 'note', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text }] }
  ] });
  const firstText = (sid: string): string | undefined => {
    const node = session.editor.dataStore.getNode(sid);
    if (typeof node?.text === 'string') return sid;
    for (const child of node?.content ?? []) {
      if (typeof child !== 'string') continue;
      const found = firstText(child);
      if (found) return found;
    }
  };
  const sid = firstText(session.rootId)!;
  const scope = document.createElement('div');
  const editable = document.createElement('div');
  editable.contentEditable = 'true';
  editable.setAttribute('contenteditable', 'true');
  editable.tabIndex = 0;
  const span = document.createElement('span');
  span.setAttribute('data-bc-sid', sid);
  const node = document.createTextNode(text);
  span.append(node);
  editable.append(span);
  scope.append(editable);
  document.body.append(scope);
  return { session, scope, text: node, sid };
}

async function select(body: Body, start = 0, end = 4) {
  await act(async () => {
    body.text.parentElement!.parentElement!.focus();
    body.session.editor.selectionManager.setSelection({
      type: 'range', startNodeId: body.sid, endNodeId: body.sid,
      startOffset: start, endOffset: end, collapsed: start === end
    });
    const range = document.createRange();
    range.setStart(body.text, start);
    range.setEnd(body.text, end);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}

const toolbar = (label: string) => document.querySelector<HTMLElement>(`[role="toolbar"][aria-label="${label}"]`);

const documentState = (body: Body) => ({
  document: body.session.editor.exportDocument(),
  undo: body.session.editor.canUndo(),
  redo: body.session.editor.canRedo()
});

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true, value: () => new DOMRect(100, 100, 80, 20)
  });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: function (this: Range) { return [this.getBoundingClientRect()]; } });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, 120, 30));
  bodies = [makeBody('First words'), makeBody('Second words')];
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  for (const body of bodies) body.session.close();
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (rangeRects) Object.defineProperty(Range.prototype, 'getClientRects', rangeRects);
  else delete (Range.prototype as Partial<Range>).getClientRects;
  if (rangeRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rangeRect);
  else delete (Range.prototype as Partial<Range>).getBoundingClientRect;
});

describe('context controls belong to one editor selection', () => {
  it('retains a range in its separate inspector but retires it on a native target change', async () => {
    const body = bodies[0], inspector = document.createElement('aside'), field = document.createElement('input');
    inspector.append(field); document.body.append(inspector);
    const close = vi.fn();
    await act(async () => root.render(createElement(ContextToolbar, {
      editor: body.session.editor, controls, label: 'related-inspector', scope: { current: body.scope },
      relatedChrome: { current: inspector }, onRelatedChromeEscape: close
    })));
    await select(body, 1, 5);
    const before = documentState(body);
    await act(async () => { field.focus(); document.getSelection()!.removeAllRanges(); });
    expect(toolbar('related-inspector')).not.toBeNull();
    await act(async () => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(close).toHaveBeenCalledOnce();
    expect(toolbar('related-inspector')).not.toBeNull();
    expect(documentState(body)).toEqual(before);
    await act(async () => body.session.editor.updateSelection({ type: 'range', startNodeId: body.sid, endNodeId: body.sid,
      startOffset: 6, endOffset: 9, collapsed: false }));
    expect(toolbar('related-inspector')).toBeNull();
    expect(documentState(body)).toEqual(before);
  });

  it.each(['caret', 'null'] as const)('retires surviving DOM text tools when the actual model becomes %s', async target => {
    const body = bodies[0];
    await act(async () => root.render(createElement(ContextToolbar, {
      editor: body.session.editor, controls, label: 'native-target', scope: { current: body.scope }
    })));
    await select(body, 1, 5);
    const before = documentState(body);
    expect(toolbar('native-target')).not.toBeNull();
    await act(async () => body.session.editor.updateSelection(target === 'null' ? null : {
      type: 'range', startNodeId: body.sid, endNodeId: body.sid,
      startOffset: 5, endOffset: 5, collapsed: true
    }));
    expect(document.getSelection()!.toString()).toBe('irst');
    expect(toolbar('native-target')).toBeNull();
    expect(documentState(body)).toEqual(before);
  });

  it('retires a field-owned captured range when the actual native target changes', async () => {
    const body = bodies[0];
    await act(async () => root.render(createElement(ContextToolbar, {
      editor: body.session.editor, controls, label: 'changed-target', scope: { current: body.scope },
      children: createElement('input', { 'aria-label': '주소 초안' })
    })));
    await select(body, 1, 5);
    const before = documentState(body);
    await act(async () => {
      toolbar('changed-target')!.querySelector('input')!.focus();
      document.getSelection()!.removeAllRanges();
    });
    expect(toolbar('changed-target')).not.toBeNull();
    await act(async () => body.session.editor.updateSelection({
      type: 'range', startNodeId: body.sid, endNodeId: body.sid,
      startOffset: 6, endOffset: 9, collapsed: false
    }));
    expect(toolbar('changed-target')).toBeNull();
    expect(documentState(body)).toEqual(before);
  });

  it('keeps dismissal across renderer endpoint replacement until an explicit owned gesture', async () => {
    const body = bodies[0];
    await act(async () => root.render(createElement(ContextToolbar, {
      editor: body.session.editor, controls, label: 'replaced-dom', scope: { current: body.scope }
    })));
    await select(body, 1, 5);
    const before = documentState(body);
    const selection = { ...body.session.editor.selection! };
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(toolbar('replaced-dom')).toBeNull();
    await act(async () => {
      const replacement = document.createTextNode(body.text.data);
      body.text.replaceWith(replacement);
      body.text = replacement;
      const range = document.createRange();
      range.setStart(replacement, 1); range.setEnd(replacement, 5);
      document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(body.session.editor.selection).toEqual(selection);
    expect(toolbar('replaced-dom')).toBeNull();
    await act(async () => body.text.parentElement!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight', shiftKey: true, bubbles: true
    })));
    expect(toolbar('replaced-dom')).not.toBeNull();
    expect(documentState(body)).toEqual(before);
  });

  it('waits for the native range after an early owned selection gesture', async () => {
    const body = bodies[0];
    await act(async () => root.render(createElement(ContextToolbar, {
      editor: body.session.editor, controls, label: 'early-gesture', scope: { current: body.scope }
    })));
    await select(body, 0, 0);
    const before = documentState(body);
    await act(async () => {
      body.text.parentElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
      const range = document.createRange(); range.setStart(body.text, 1); range.setEnd(body.text, 5);
      document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(toolbar('early-gesture')).toBeNull();
    await act(async () => body.session.editor.updateSelection({
      type: 'range', startNodeId: body.sid, endNodeId: body.sid,
      startOffset: 1, endOffset: 5, collapsed: false
    }));
    expect(toolbar('early-gesture')).not.toBeNull();
    expect(documentState(body)).toEqual(before);
  });

  it('records owned Escape while the selected range is outside the viewport', async () => {
    const body = bodies[0];
    let selectedRect = new DOMRect(100, 100, 80, 20);
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true, value: () => selectedRect
    });
    await act(async () => root.render(createElement(ContextToolbar, {
      editor: body.session.editor, controls, label: 'offscreen-escape', scope: { current: body.scope }
    })));
    await select(body, 1, 5);
    const before = documentState(body);
    const nativeRange = { ...body.session.editor.selection! };
    expect(toolbar('offscreen-escape')).not.toBeNull();
    await act(async () => {
      selectedRect = new DOMRect(100, window.innerHeight + 100, 80, 20);
      window.dispatchEvent(new Event('scroll'));
      await new Promise(resolve => setTimeout(resolve, 40));
    });
    expect(toolbar('offscreen-escape')).toBeNull();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => body.text.parentElement!.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    await act(async () => {
      selectedRect = new DOMRect(100, 100, 80, 20);
      window.dispatchEvent(new Event('resize'));
      await new Promise(resolve => setTimeout(resolve, 40));
    });
    expect(body.session.editor.selection).toEqual(nativeRange);
    expect(toolbar('offscreen-escape')).toBeNull();
    await act(async () => body.text.parentElement!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight', shiftKey: true, bubbles: true
    })));
    expect(toolbar('offscreen-escape')).not.toBeNull();
    expect(documentState(body)).toEqual(before);
  });

  it('captures the live backward range before the model updates, without changing it', async () => {
    const body = bodies[0];
    await select(body, 0, 0);
    const contentEditableElement = body.text.parentElement!.parentElement!;
    const converter = new DOMSelectionHandler(body.session.editor, { contentEditableElement });
    const view = { contentEditableElement, convertDOMSelectionToModel: converter.convertDOMSelectionToModel.bind(converter) };
    document.getSelection()!.setBaseAndExtent(body.text, 8, body.text, 2);
    const range = captureTextSelection(body.session.editor, view);
    expect(range).toMatchObject({ startOffset: 2, endOffset: 8 });
    expect(body.session.editor.selection).toMatchObject({ startOffset: 0, endOffset: 0 });
    contentEditableElement.setAttribute('data-editor-input-owner', 'math');
    expect(captureTextSelection(body.session.editor, view)).toBeUndefined();
    contentEditableElement.removeAttribute('data-editor-input-owner');
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    expect(captureTextSelection(body.session.editor, view)).toBeUndefined();
  });

  it('requires both DOM endpoints to belong to the editor and optional surface', async () => {
    const [first, second] = bodies;
    await select(first);
    expect(ownsEditorSelection(first.session.editor, document.getSelection())).toBe(true);
    expect(ownsEditorSelection(second.session.editor, document.getSelection())).toBe(false);
    expect(ownsEditorSelection(first.session.editor, document.getSelection(), second.scope)).toBe(false);
    await act(async () => {
      const range = document.createRange();
      range.setStart(first.text, 0);
      range.setEnd(second.text, 3);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
    });
    expect(ownsEditorSelection(first.session.editor, document.getSelection())).toBe(false);
    expect(ownsEditorSelection(second.session.editor, document.getSelection())).toBe(false);
  });

  it('moves the toolbar between editors and hides it for a caret', async () => {
    await act(async () => root.render(createElement('div', null,
      ...bodies.map((body, index) => createElement(ContextToolbar, {
        key: body.sid, editor: body.session.editor, controls, label: `editor-${index}`
      }))
    )));
    expect(document.querySelectorAll('[data-editor-context-toolbar]')).toHaveLength(0);
    await select(bodies[0]);
    expect(toolbar('editor-0')).not.toBeNull();
    expect(toolbar('editor-1')).toBeNull();
    await select(bodies[1]);
    expect(toolbar('editor-0')).toBeNull();
    expect(toolbar('editor-1')).not.toBeNull();
    await select(bodies[1], 2, 2);
    expect(document.querySelectorAll('[data-editor-context-toolbar]')).toHaveLength(0);
  });

  it('retains the saved model range while a toolbar input owns focus', async () => {
    const body = bodies[0];
    const saved: { current: ModelSelection | null } = { current: null };
    await act(async () => root.render(createElement(ContextToolbar, {
      editor: body.session.editor, controls, label: 'link-editor', scope: { current: body.scope },
      children: (selection: ModelSelection | null) => {
        saved.current = selection;
        return createElement('input', { 'aria-label': '링크 주소' });
      }
    })));
    await select(body, 1, 5);
    const snapshot = { ...saved.current };
    expect(snapshot).toMatchObject({ startNodeId: body.sid, startOffset: 1, endOffset: 5 });
    expect(toolbar('link-editor')!.parentElement).toBe(body.scope);
    await act(async () => {
      toolbar('link-editor')!.querySelector('input')!.focus();
      document.getSelection()!.removeAllRanges();
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(toolbar('link-editor')).not.toBeNull();
    expect(saved.current).toEqual(snapshot);
  });

  it('keeps editor ownership when tools render outside a transformed document', async () => {
    const [body, foreign] = bodies;
    body.scope.style.transform = 'scale(1.25)';
    const destination = document.createElement('div');
    document.body.append(destination);
    const before = body.session.editor.exportDocument(body.session.rootId);
    const props = {
      editor: body.session.editor, controls, label: 'unscaled-tools',
      scope: { current: body.scope }, portalRoot: destination,
      children: createElement('input', { 'aria-label': 'Selected text field' })
    };
    await act(async () => root.render(createElement(ContextToolbar, props)));
    await select(body, 1, 5);
    expect(toolbar('unscaled-tools')!.parentElement).toBe(destination);
    await act(async () => toolbar('unscaled-tools')!.querySelector('input')!.focus());
    expect(toolbar('unscaled-tools')).not.toBeNull();
    expect(body.session.editor.exportDocument(body.session.rootId)).toEqual(before);
    await select(foreign, 1, 5);
    expect(toolbar('unscaled-tools')).toBeNull();
  });

  it('returns owned field focus to the document when Escape dismisses its tools', async () => {
    const body = bodies[0];
    await act(async () => root.render(createElement(ContextToolbar, {
      editor: body.session.editor, controls, label: 'focus-return', scope: { current: body.scope },
      children: createElement('input', { 'aria-label': 'Owned tool field' })
    })));
    await select(body, 1, 5);
    const before = JSON.stringify(body.session.editor.exportDocument());
    const input = toolbar('focus-return')!.querySelector('input')!;
    await act(async () => input.focus());
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(toolbar('focus-return')).toBeNull();
    expect(document.activeElement).toBe(body.text.parentElement!.parentElement!);
    expect(JSON.stringify(body.session.editor.exportDocument())).toBe(before);
    expect(body.session.editor.selection).toMatchObject({ startOffset: 1, endOffset: 5 });
  });

  it('dismisses on Escape and reopens after a new text selection', async () => {
    const changed = vi.fn();
    await act(async () => root.render(createElement(ContextToolbar, {
      editor: bodies[0].session.editor, controls, label: 'dismissible', onOpenChange: changed
    })));
    await select(bodies[0]);
    expect(toolbar('dismissible')).not.toBeNull();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => document.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(toolbar('dismissible')).toBeNull();
    expect(changed).toHaveBeenLastCalledWith(false);
    await select(bodies[0], 2, 6);
    expect(toolbar('dismissible')).not.toBeNull();
    expect(changed).toHaveBeenLastCalledWith(true);
  });
});

it('keeps an Escape dismissal across scroll, resize and unchanged selection events', async () => {
  await act(async () => root.render(createElement(ContextToolbar, { editor: bodies[0].session.editor, controls, label: 'stable' })));
  await select(bodies[0]);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  await act(async () => {
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('selectionchange'));
  });
  expect(toolbar('stable')).toBeNull();
  await select(bodies[0], 1, 6);
  expect(toolbar('stable')).not.toBeNull();
});

it('excludes nested input owners and waits for drag or composition to end', async () => {
  const body = bodies[0];
  await act(async () => root.render(createElement(ContextToolbar, { editor: body.session.editor, controls, label: 'input-owner', scope: { current: body.scope } })));
  await select(body);
  const editable = body.text.parentElement!.parentElement!;
  editable.setAttribute('data-editor-input-owner', 'math');
  await act(async () => document.dispatchEvent(new Event('selectionchange')));
  expect(ownsEditorSelection(body.session.editor, document.getSelection(), body.scope)).toBe(false);
  expect(toolbar('input-owner')).toBeNull();
  editable.removeAttribute('data-editor-input-owner');
  await select(body);
  await act(async () => editable.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true })));
  await select(body, 1, 5);
  expect(toolbar('input-owner')).toBeNull();
  await act(async () => document.dispatchEvent(new Event('pointerup', { bubbles: true })));
  expect(toolbar('input-owner')).not.toBeNull();
  await act(async () => editable.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await select(body, 2, 6);
  expect(toolbar('input-owner')).toBeNull();
  await act(async () => editable.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  expect(toolbar('input-owner')).not.toBeNull();
});

it('does not reopen an escaped range after focus leaves and returns', async () => {
  const body = bodies[0];
  await act(async () => root.render(createElement(ContextToolbar, {
    editor: body.session.editor, controls, label: 'focus-return', scope: { current: body.scope }
  })));
  await select(body);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  const field = document.createElement('input'); document.body.append(field);
  await act(async () => field.focus());
  await select(body);
  expect(toolbar('focus-return')).toBeNull();
  await select(body, 1, 6);
  expect(toolbar('focus-return')).not.toBeNull();
});

it('hides on window blur and in read-only mode', async () => {
  const body = bodies[0];
  const scope = { current: body.scope };
  const render = () => root.render(createElement(ContextToolbar, {
    editor: body.session.editor, controls, label: 'window-focus', scope
  }));
  await act(async () => render()); await select(body);
  expect(toolbar('window-focus')).not.toBeNull();
  await act(async () => window.dispatchEvent(new Event('blur')));
  expect(toolbar('window-focus')).toBeNull();
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('selectionchange'));
  });
  expect(toolbar('window-focus')).not.toBeNull();
  const editable = vi.spyOn(body.session.editor, 'isEditable', 'get').mockReturnValue(false);
  await act(async () => render()); expect(toolbar('window-focus')).toBeNull(); editable.mockRestore();
});

it('hides a clipped range, restores it on layout change and retains Escape dismissal', async () => {
  const body = bodies[0];
  await act(async () => root.render(createElement(ContextToolbar, {
    editor: body.session.editor, controls, label: 'clipped', scope: { current: body.scope }
  })));
  await select(body);
  expect(toolbar('clipped')).not.toBeNull();
  const mutate = async (style: string) => act(async () => {
    body.scope.setAttribute('style', style);
    await new Promise(resolve => setTimeout(resolve, 40));
  });
  await mutate('overflow-y:hidden'); // Mocked scope has zero client height.
  expect(toolbar('clipped')).toBeNull();
  await mutate(''); expect(toolbar('clipped')).not.toBeNull();
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  await mutate('overflow-y:hidden'); await mutate('');
  expect(toolbar('clipped')).toBeNull();
});


it.each(['pointer', 'keyboard'])('reopens an escaped range after an explicit owned %s selection gesture', async gesture => {
  const body = bodies[0];
  await act(async () => root.render(createElement(ContextToolbar, {
    editor: body.session.editor, controls, label: 'explicit-selection', scope: { current: body.scope }
  })));
  await select(body);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(toolbar('explicit-selection')).toBeNull();
  const gestureEvent = () => gesture === 'pointer'
    ? new MouseEvent('pointerdown', { button: 0, bubbles: true })
    : new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true });
  // An independent editor and an inner input must not reopen this toolbar.
  await act(async () => bodies[1].text.parentElement!.dispatchEvent(gestureEvent()));
  expect(toolbar('explicit-selection')).toBeNull();
  body.text.parentElement!.setAttribute('data-editor-input-owner', 'math');
  await act(async () => body.text.parentElement!.dispatchEvent(gestureEvent()));
  expect(toolbar('explicit-selection')).toBeNull();
  body.text.parentElement!.removeAttribute('data-editor-input-owner');
  await select(body);
  expect(toolbar('explicit-selection')).toBeNull();
  await act(async () => {
    body.text.parentElement!.dispatchEvent(gestureEvent());
    if (gesture === 'pointer') document.dispatchEvent(new Event('pointerup', { bubbles: true }));
  });
  await select(body);
  expect(toolbar('explicit-selection')).not.toBeNull();
  await act(async () => body.session.editor.executeCommand('toggleBold'));
  expect(body.session.editor.dataStore.getNode(body.sid)?.marks).toEqual(expect.arrayContaining([expect.objectContaining({ stype: 'bold' })]));
});


it('retains an explicitly owned popup field and rejects a foreign popup field', async () => {
  const body = bodies[0];
  const saved: { current: ModelSelection | null } = { current: null };
  function Popup({ owner }: { owner?: RefObject<HTMLElement | null> }) {
    const [open, setOpen] = useState(false);
    return createElement('div', null,
      createElement('button', { onClick: () => setOpen(true), 'data-open-popup': true }, 'Open owned choices'),
      open ? createPortal(createElement('input', { 'aria-label': 'Owned popup choice' }), owner?.current ?? document.body) : null);
  }
  await act(async () => root.render(createElement(ContextToolbar, {
    editor: body.session.editor, controls, label: 'popup-owner', scope: { current: body.scope },
    children: (selection: ModelSelection | null, owner?: RefObject<HTMLElement | null>) => {
      saved.current = selection;
      return createElement(Popup, { owner });
    }
  })));
  await select(body, 1, 5);
  const snapshot = { ...saved.current };
  await act(async () => toolbar('popup-owner')!.querySelector('[data-open-popup]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const popup = document.querySelector<HTMLInputElement>('[aria-label="Owned popup choice"]')!;
  await act(async () => {
    popup.focus();
    document.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
  });
  expect(toolbar('popup-owner')).not.toBeNull();
  expect(body.scope.querySelector('[contenteditable]')!.contains(popup)).toBe(false);
  expect(saved.current).toEqual(snapshot);
  const foreign = document.createElement('input'); document.body.append(foreign);
  await act(async () => foreign.focus());
  expect(toolbar('popup-owner')).toBeNull();
  foreign.remove();
});

it('keeps owned tools during focusout before the popup receives focus', async () => {
  const body = bodies[0];
  await act(async () => root.render(createElement(ContextToolbar, {
    editor: body.session.editor, controls, label: 'focus-transfer', scope: { current: body.scope },
    children: createElement('input', { 'aria-label': 'Tool popup field' })
  })));
  await select(body);
  const popup = toolbar('focus-transfer')!.querySelector('input')!;
  // Browsers temporarily report BODY during focusout, before relatedTarget gets focusin.
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => document.body });
  try {
    await act(async () => body.text.parentElement!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: popup })));
    expect(toolbar('focus-transfer')).not.toBeNull();
  } finally { delete (document as unknown as { activeElement?: Element }).activeElement; }
  await act(async () => popup.focus());
  expect(toolbar('focus-transfer')).not.toBeNull();
  const outside = document.createElement('input'); document.body.append(outside);
  await act(async () => outside.focus());
  expect(toolbar('focus-transfer')).toBeNull(); outside.remove();
});


it('leaves Escape to the containing panel when text tools are dismissed or the caret is collapsed', async () => {
  const body = bodies[0];
  await act(async () => root.render(createElement(ContextToolbar, { editor: body.session.editor, controls, label: 'panel-escape', scope: { current: body.scope } })));
  await select(body);
  const editable = body.text.parentElement!.parentElement!;
  const key = () => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  const first = key(); await act(async () => editable.dispatchEvent(first));
  expect(first.defaultPrevented).toBe(true); expect(toolbar('panel-escape')).toBeNull();
  const next = key(); await act(async () => editable.dispatchEvent(next));
  expect(next.defaultPrevented).toBe(false);
  await select(body, 4, 4);
  const caret = key(); await act(async () => editable.dispatchEvent(caret));
  expect(caret.defaultPrevented).toBe(false);
});
