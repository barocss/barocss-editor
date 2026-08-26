import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import { Editor } from '@barocss/editor-core';
import { data, define, defineMark, element, getGlobalRegistry, slot } from '@barocss/dsl';
import { EditorViewDOM } from '../../src/editor-view-dom';

/**
 * A render's own mutations are not somebody typing.
 *
 * The observer exists to catch what the *browser* did to the DOM behind the
 * editor's back — a character, an IME's composition, a drop. When the view
 * renders, the DOM is being made to match the model, so anything the observer
 * finds there is something the model already has. Reading it back is at best a
 * no-op and at worst a loop.
 *
 * It was a loop. Pressing bold and then italic on the same words rewrote the
 * paragraph: applying a mark re-wraps the run in nested elements, the observer
 * saw the childList change, classified it as inserted text, committed an
 * `insertText`, which changed the model, which rendered, which mutated, which
 * inserted again — nineteen times, in Word as much as in Slides, and undo could
 * not get it back.
 *
 * **This test does not reproduce that.** It stands the whole loop up — a real
 * editor, a real view, a real observer, marks applied and rendered — and passes
 * both before and after the fault, so it is not the regression guard for it and
 * must not be read as one. What it does check is real and worth keeping: a
 * render never adds text, however deeply its mark wrappers nest.
 *
 * Reproducing the fault needs something jsdom does not give — the browser's own
 * mutation timing and its selection behaviour inside nested inline wrappers.
 * Until a test exists that fails on it, the reproduction is the one written
 * down in `docs/BACKLOG.md`: two clicks in a browser.
 */
describe('a render is not input', () => {
  let container: HTMLElement;
  let editor: Editor;
  let store: DataStore;
  let view: EditorViewDOM;
  let textId: string;

  /** Long enough for the observer's batch timer and any render it provokes. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

  beforeEach(() => {
    getGlobalRegistry().clear?.();
    define('document', element('div', { className: 'doc' }, [slot('content')]));
    define('paragraph', element('p', {}, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text', '')]));
    defineMark('bold', element('strong', {}, [data('text')]));
    defineMark('italic', element('em', {}, [data('text')]));

    const schema = createSchema('standard', getStandardSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = new Editor({ schema, dataStore: store, editable: true } as never);
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: 'Contents' }] }
        ]
      } as never,
      'standard'
    );

    const root: any = store.getNode(editor.getRootId());
    const paragraph: any = store.getNode(root.content[0]);
    textId = paragraph.content[0];

    container = document.createElement('div');
    document.body.appendChild(container);
    view = new EditorViewDOM(editor, { container, registry: getGlobalRegistry() });
    view.render(undefined, { sync: true });

    /**
     * A caret in the text, which is the condition the whole bug needs.
     *
     * Without one the observer already turns a render's records away — the
     * guard asks `!region && isModelDrivenChange`. A reader applying a format
     * has selected something, so there *is* a region, and that is exactly why
     * the guard missed this. The first version of this test had no selection
     * and passed while the browser was corrupting text.
     */
    editor.updateSelection({
      type: 'range',
      startNodeId: textId,
      startOffset: 0,
      endNodeId: textId,
      endOffset: 6,
      collapsed: false
    });

    const drawn = container.querySelector(`[data-bc-sid="${textId}"]`);
    const leaf = document.createTreeWalker(drawn!, NodeFilter.SHOW_TEXT).nextNode();
    if (leaf) {
      const range = document.createRange();
      range.setStart(leaf, 0);
      range.setEnd(leaf, Math.min(6, leaf.textContent?.length ?? 0));
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  });

  afterEach(() => {
    view.destroy?.();
    container.remove();
  });

  const textNow = () => (store.getNode(textId) as { text?: string } | undefined)?.text;

  /**
   * Apply a mark the way a toolbar does: change the model, then render.
   *
   * Deliberately not through a command — the commands were checked separately
   * and are right. What is under test is what happens to the DOM afterwards.
   */
  const mark = async (stype: string) => {
    const node: any = store.getNode(textId);
    store.updateNode(textId, {
      marks: [...(node.marks ?? []), { stype, range: [0, 6] }]
    } as never);
    /**
     * The view's *own* render, not one asked for here.
     *
     * Driving it by hand with `sync: true` was the first attempt and it hid the
     * bug: the loop needs the render the editor schedules for itself, because
     * that is the one whose mutations arrive while another can still start.
     */
    editor?.emit('editor:content.change', {});
    await settle();
  };

  it('draws the text once to begin with', () => {
    expect(textNow()).toBe('Contents');
    expect(container.textContent).toBe('Contents');
  });

  it('survives one mark', async () => {
    await mark('bold');
    expect(textNow()).toBe('Contents');
  });

  /**
   * The one that failed. Two marks over the same words nest their wrappers, and
   * it is the *nesting* the observer read as typing.
   */
  it('survives a second, overlapping mark', async () => {
    await mark('bold');
    await mark('italic');

    expect(textNow()).toBe('Contents');
    expect(container.textContent).toBe('Contents');
  });

  it('leaves the marks it was given', async () => {
    await mark('bold');
    await mark('italic');

    const marks = ((store.getNode(textId) as any).marks ?? []).map((m: any) => m.stype ?? m.type);
    expect(marks.sort()).toEqual(['bold', 'italic']);
  });

  it('survives a third', async () => {
    // Nothing about two is special; what matters is that a render never adds
    // text, however deeply its wrappers nest.
    defineMark('underline', element('u', {}, [data('text')]));
    await mark('bold');
    await mark('italic');
    await mark('underline');
    expect(textNow()).toBe('Contents');
  });
});
