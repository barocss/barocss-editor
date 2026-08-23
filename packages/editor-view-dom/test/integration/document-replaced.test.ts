import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';

/**
 * A view has to follow the document being **replaced**, not only edited.
 *
 * `render()` with no tree preferred the last tree it drew, and that is right for
 * an edit: the last tree is a *proxy* over the store, so every change shows up in
 * it without anything being exported again. It is wrong for `loadDocument`, which
 * makes a **new root** — the proxy is live for the root it was made from, so the
 * view kept drawing the old document forever.
 *
 * Measured in the deck app, where it looks like this: a new presentation left the
 * model holding one slide and the DOM holding the previous five, and an explicit
 * `render()` changed nothing, because the staleness was in the view rather than in
 * the caller. Which is also why this test is here and not there — the product
 * found it, and the engine is where it is wrong.
 */
describe('a document replaced under a view', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  let schema: ReturnType<typeof createSchema>;

  const tree = (id: string, words: string) => ({
    sid: id,
    stype: 'document',
    content: [
      {
        sid: `${id}-p`,
        stype: 'paragraph',
        content: [{ sid: `${id}-t`, stype: 'inline-text', text: words }]
      }
    ]
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    schema = createSchema('replace-test', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline' }
      },
      marks: {}
    });

    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text', '')]));
  });

  afterEach(() => {
    view?.destroy();
    container?.parentNode?.removeChild(container);
  });

  it('draws the new document rather than the one it drew before', () => {
    const dataStore = new DataStore(undefined, schema);
    editor = new Editor({ editable: true, schema, dataStore });
    editor.loadDocument(tree('first', 'The first document'), 'replace-test');

    view = new EditorViewDOM(editor, { container, registry: getGlobalRegistry() });
    view.render();
    expect(view.layers.content.innerHTML).toContain('The first document');

    // A different document entirely, which is what opening a file is.
    editor.loadDocument(tree('second', 'The second document'), 'replace-test');
    view.render();

    expect(view.layers.content.innerHTML).toContain('The second document');
    // And the old one is gone rather than left underneath it.
    expect(view.layers.content.innerHTML).not.toContain('The first document');
  });

  /**
   * The path a product actually takes: nobody calls `render()` by hand. Loading
   * emits `editor:content.change`, the view renders, and that render has to see
   * the new root — which is the whole of the fix.
   */
  it('follows a load without being asked to render', () => {
    const dataStore = new DataStore(undefined, schema);
    editor = new Editor({ editable: true, schema, dataStore });
    editor.loadDocument(tree('first', 'Before'), 'replace-test');

    view = new EditorViewDOM(editor, { container, registry: getGlobalRegistry() });
    view.render();
    expect(view.layers.content.innerHTML).toContain('Before');

    editor.loadDocument(tree('second', 'After'), 'replace-test');
    expect(view.layers.content.innerHTML).toContain('After');
  });
});
