import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { walkBlocks } from '@barocss/office-text';
import { bookmarkSelection } from '../src/bookmark-commands';
import { jumpToWordBookmark } from '../src/bookmark-navigation';
import { createWordEditor } from '../src/word-kit';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

async function fixture(captionIdentity = true) {
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  const editor = createWordEditor();
  cleanups.push(() => editor.destroy());
  editor.loadDocument({ stype: 'document', content: [{ stype: 'surface', content: [
    { stype: 'paragraph', content: [
      { stype: 'inline-text', text: '그림 ' },
      { stype: 'fieldSeq', attributes: { sequence: 'Figure', ...(captionIdentity ? { id: 'SharedTarget' } : {}) } },
      { stype: 'inline-text', text: ': 결과' }
    ] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'AlphaBeta' }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Other paragraph' }] }
  ] }] } as never);
  const doc = { rootId: editor.getRootId()!, getNode: (id: string) => editor.dataStore.getNode(id) };
  const nodes = () => [...walkBlocks(doc, doc.getNode(doc.rootId))];
  const bookmarkText = nodes().find(node => node.text === 'AlphaBeta')!;
  editor.updateSelection({ type: 'range', startNodeId: bookmarkText.sid!, endNodeId: bookmarkText.sid!,
    startOffset: 0, endOffset: 5, collapsed: false });
  expect(await editor.run('addWordBookmark', { name: 'SharedTarget' })).toBe(true);
  const other = nodes().find(node => node.text === 'Other paragraph')!;
  editor.updateSelection({ type: 'range', startNodeId: other.sid!, endNodeId: other.sid!,
    startOffset: 3, endOffset: 3, collapsed: true });

  const host = document.createElement('div');
  document.body.append(host);
  const view = new EditorViewDOM(editor, { container: host, autoRender: false });
  cleanups.push(() => view.destroy());
  // Navigation owns focus and selection, not rendering. Give its actual view
  // real text targets without scheduling an unrelated layout/render cycle.
  const content = view.contentEditableElement;
  content.tabIndex = 0;
  const scrolls = new Map<string, ReturnType<typeof vi.fn>>();
  for (const node of nodes().filter(node => node.stype === 'inline-text')) {
    const target = document.createElement('span');
    target.setAttribute('data-bc-sid', node.sid!);
    target.textContent = node.text!;
    const scroll = vi.fn();
    target.scrollIntoView = scroll;
    scrolls.set(node.sid!, scroll);
    content.append(target);
  }
  const otherControl = document.createElement('button');
  document.body.append(otherControl);
  otherControl.focus();
  const focus = vi.spyOn(content, 'focus');
  const updateSelection = vi.spyOn(editor, 'updateSelection');
  return { editor, view, content, otherControl, focus, updateSelection, scrolls };
}

describe('Word bookmark navigation without UI components', () => {
  it('focuses the actual content and moves to the model bookmark before scrolling its text', async () => {
    const f = await fixture();
    const expected = bookmarkSelection(f.editor, 'SharedTarget')!;
    expect(expected).toBeDefined();
    const before = f.editor.exportDocument();

    expect(jumpToWordBookmark(f.editor, f.view, 'SharedTarget')).toBe(true);

    expect(document.activeElement).toBe(f.content);
    expect(f.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(f.updateSelection).toHaveBeenCalledWith({ selection: expected, applySelectionToView: true });
    expect(f.editor.selection).toMatchObject(expected);
    const scroll = f.scrolls.get(expected.startNodeId)!;
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
    expect(f.focus.mock.invocationCallOrder[0]).toBeLessThan(f.updateSelection.mock.invocationCallOrder[0]);
    expect(f.updateSelection.mock.invocationCallOrder[0]).toBeLessThan(scroll.mock.invocationCallOrder[0]);
    expect([...f.scrolls.values()].filter(scroll => scroll.mock.calls.length > 0)).toHaveLength(1);
    expect(f.editor.exportDocument()).toEqual(before);
  });

  it('leaves focus and selection unchanged when the bookmark is missing', async () => {
    const f = await fixture();
    const before = structuredClone(f.editor.selection);

    expect(jumpToWordBookmark(f.editor, f.view, 'Missing')).toBe(false);

    expect(document.activeElement).toBe(f.otherControl);
    expect(f.focus).not.toHaveBeenCalled();
    expect(f.updateSelection).not.toHaveBeenCalled();
    expect(f.editor.selection).toEqual(before);
    expect([...f.scrolls.values()].every(scroll => scroll.mock.calls.length === 0)).toBe(true);
  });

  it('uses caption identity only when the caller requests caption navigation', async () => {
    const f = await fixture();
    const bookmark = bookmarkSelection(f.editor, 'SharedTarget')!;
    const caption = bookmarkSelection(f.editor, 'SharedTarget', 'caption')!;
    expect(caption).toBeDefined();
    expect(caption.startNodeId).not.toBe(bookmark.startNodeId);

    expect(jumpToWordBookmark(f.editor, f.view, 'SharedTarget', 'caption')).toBe(true);

    expect(document.activeElement).toBe(f.content);
    expect(f.updateSelection).toHaveBeenCalledWith({ selection: caption, applySelectionToView: true });
    expect(f.editor.selection).toMatchObject(caption);
    expect(f.scrolls.get(caption.startNodeId)).toHaveBeenCalledWith({ block: 'center' });
    expect(f.scrolls.get(bookmark.startNodeId)).not.toHaveBeenCalled();
  });

  it('does not fall back to a bookmark for a missing caption or unsupported target kind', async () => {
    const f = await fixture(false);
    expect(bookmarkSelection(f.editor, 'SharedTarget')).toBeDefined();
    expect(bookmarkSelection(f.editor, 'SharedTarget', 'caption')).toBeUndefined();
    const before = structuredClone(f.editor.selection);

    expect(jumpToWordBookmark(f.editor, f.view, 'SharedTarget', 'caption')).toBe(false);
    expect(jumpToWordBookmark(f.editor, f.view, 'SharedTarget', 'unknown')).toBe(false);

    expect(document.activeElement).toBe(f.otherControl);
    expect(f.focus).not.toHaveBeenCalled();
    expect(f.updateSelection).not.toHaveBeenCalled();
    expect(f.editor.selection).toEqual(before);
    expect([...f.scrolls.values()].every(scroll => scroll.mock.calls.length === 0)).toBe(true);
  });
});
