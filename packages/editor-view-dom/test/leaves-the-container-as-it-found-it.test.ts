import { describe, it, expect, beforeEach } from 'vitest';
import { getGlobalRegistry, define, element, slot, data } from '@barocss/dsl';
import { DataStore } from '@barocss/datastore';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../src/editor-view-dom';

/**
 * A view that has been destroyed, and one that was never created, should be the same thing.
 *
 * Found in a site builder, where a board is destroyed and rebuilt whenever React's strict mode
 * double-invokes an effect: the container held **two** content layers, one live and one an empty
 * shell, and every query written against that board had a one-in-two chance of reading the dead one.
 *
 * The layers used to be emptied and cloned in place — which removes their listeners and leaves five
 * divs behind. Emptying is not removing.
 */
describe('a destroyed view leaves the container as it found it', () => {
  let container: HTMLElement;
  let editor: Editor;

  beforeEach(() => {
    define('document', element('div', { className: 'doc' }, [slot('content')]));
    define('paragraph', element('p', {}, [slot('content')]));
    define('inline-text', element('span', {}, [data('text')]));

    const schema = createSchema('standard', getStandardSchemaDefinition());
    const dataStore = new DataStore(undefined as never, schema as never);
    editor = new Editor({ editable: true, schema, dataStore } as never);
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '가' }] }]
      } as never,
      'standard'
    );

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  const view = () =>
    new EditorViewDOM(editor, { container, registry: getGlobalRegistry() } as never);

  it('takes its layers out again', () => {
    const before = container.children.length;
    const one = view();
    expect(container.children.length).toBeGreaterThan(before);

    one.destroy();
    expect(container.children.length).toBe(before);
  });

  it('leaves one content layer after being rebuilt, not two', () => {
    // The strict-mode sequence: mount, unmount, mount.
    view().destroy();
    const live = view();
    live.render(undefined, { sync: true });

    expect(container.querySelectorAll('.barocss-editor-content')).toHaveLength(1);
    // And it is the live one: the drawing is in it.
    expect(container.querySelector('.barocss-editor-content')?.textContent).toContain('가');
    live.destroy();
  });

  it('is the same after several rounds, so nothing accumulates', () => {
    for (let round = 0; round < 5; round++) view().destroy();
    expect(container.children.length).toBe(0);
  });
});
