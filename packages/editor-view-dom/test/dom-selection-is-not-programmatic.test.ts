import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { data, define, element, getGlobalRegistry, slot } from '@barocss/dsl';
import { EditorViewDOM } from '../src/editor-view-dom';

let view: EditorViewDOM | undefined;
let editor: Editor | undefined;
let container: HTMLElement | undefined;
afterEach(() => { view?.destroy(); editor?.destroy(); container?.remove(); document.getSelection()?.removeAllRanges(); vi.useRealTimers(); });

describe('consecutive browser selections retain the latest endpoints', () => {
  for (const direction of ['forward', 'backward'] as const) for (const origin of ['browser', 'after caret restoration', 'after leaving editor', 'after destroying view'] as const) it(`${direction}: ${origin}`, async () => {
    if (origin !== 'browser') vi.useFakeTimers();
    const schema = createSchema('selection-origin', {
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
    editor.loadDocument({ stype: 'document', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: 'This paragraph takes its font from the document.' }] }] }, 'selection-origin');
    container = document.createElement('div'); document.body.append(container);
    view = new EditorViewDOM(editor, { container, registry: getGlobalRegistry() });
    view.render(undefined, { sync: true });
    // Deliver one known browser report below, without JSDOM's additional queued reports.
    document.removeEventListener('selectionchange', (view as unknown as { _boundHandleSelectionChange: EventListener })._boundHandleSelectionChange);
    view.contentEditableElement.tabIndex = 0;
    view.contentEditableElement.focus();
    expect(document.activeElement).toBe(view.contentEditableElement);
    const text = document.createTreeWalker(view.contentEditableElement.querySelector('p')!, NodeFilter.SHOW_TEXT).nextNode()!;
    const before = JSON.stringify(editor.exportDocument());
    const selection = document.getSelection()!;
    const capture = (end: number) => {
      selection.setBaseAndExtent(text, direction === 'backward' ? end : 0, text, direction === 'backward' ? 0 : end);
      // Exercise the view's real selection pipeline without exposing a product API.
      (view as unknown as { selectionHandler: { handleSelectionChange(): void } }).selectionHandler.handleSelectionChange();
    };
    capture(6);
    expect(editor.selection).toMatchObject({ startOffset: 0, endOffset: 6, direction });
    if (origin !== 'browser') {
      (view as unknown as { selectionHandler: { convertModelSelectionToDOM(selection: unknown): void } }).selectionHandler.convertModelSelectionToDOM(editor.selection);
    }
    // The final browser gesture can arrive before any programmatic timeout runs.
    if (origin !== 'browser') {
      selection.setBaseAndExtent(text, direction === 'backward' ? 25 : 0, text, direction === 'backward' ? 0 : 25);
      view.handleSelectionChange();
      if (origin === 'after leaving editor') {
        const field = document.createElement('input'); container.append(field); field.focus();
      }
      if (origin === 'after destroying view') { view.destroy(); view = undefined; }
      await vi.advanceTimersByTimeAsync(50);
    } else capture(25);
    expect(JSON.stringify(editor.exportDocument())).toBe(before);
    if (origin === 'after leaving editor' || origin === 'after destroying view') {
      expect(editor.selection).toMatchObject({ startOffset: 0, endOffset: 6 });
      return;
    }
    expect(selection.toString()).toBe('This paragraph takes its ');
    expect(editor.selection).toMatchObject({ startOffset: 0, endOffset: 25, direction });
  });
});
