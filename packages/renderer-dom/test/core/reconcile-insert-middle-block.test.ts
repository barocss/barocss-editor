/**
 * Regression: inserting a new block in the middle of an already-rendered
 * container must mount it into the DOM.
 *
 * Pressing Enter builds a VNode tree that contains the new paragraph, but the
 * reconciler dropped it and the DOM kept the old child list — Enter looked like
 * a no-op in the editor.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { define, element, data, getGlobalRegistry, slot } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';

describe('Reconcile: insert a block into an existing container', () => {
  let renderer: DOMRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    const registry = getGlobalRegistry();
    renderer = new DOMRenderer(registry);
    container = document.createElement('div');
    document.body.appendChild(container);

    define('document', element('div', { className: 'document' }, [slot('content')]));
    define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    define('inline-text', element('span', { className: 'text' }, [data('text')]));
  });

  afterEach(() => {
    container.parentNode?.removeChild(container);
    renderer.destroy();
  });

  const para = (sid: string, text: string) => ({
    sid,
    stype: 'paragraph',
    content: [{ sid: `${sid}-t`, stype: 'inline-text', text }]
  });

  const blockSids = () =>
    Array.from(container.querySelectorAll('.document > [data-bc-sid]')).map((el) =>
      el.getAttribute('data-bc-sid')
    );

  it('mounts a block inserted in the middle', () => {
    const doc: any = { sid: 'doc', stype: 'document', content: [para('p1', 'one'), para('p2', 'two')] };
    renderer.render(container, doc);
    expect(blockSids()).toEqual(['p1', 'p2']);

    doc.content = [doc.content[0], para('0:25', ''), doc.content[1]];
    renderer.render(container, doc);

    expect(blockSids()).toEqual(['p1', '0:25', 'p2']);
  });

  it('mounts a block appended at the end', () => {
    const doc: any = { sid: 'doc', stype: 'document', content: [para('p1', 'one'), para('p2', 'two')] };
    renderer.render(container, doc);

    doc.content = [...doc.content, para('0:26', '')];
    renderer.render(container, doc);

    expect(blockSids()).toEqual(['p1', 'p2', '0:26']);
  });

  it('mounts a block inserted at the start', () => {
    const doc: any = { sid: 'doc', stype: 'document', content: [para('p1', 'one'), para('p2', 'two')] };
    renderer.render(container, doc);

    doc.content = [para('0:27', ''), ...doc.content];
    renderer.render(container, doc);

    expect(blockSids()).toEqual(['0:27', 'p1', 'p2']);
  });

  it('mounts a block whose sid has no colon (control case)', () => {
    const doc: any = { sid: 'doc', stype: 'document', content: [para('p1', 'one'), para('p2', 'two')] };
    renderer.render(container, doc);

    doc.content = [doc.content[0], para('pNew', ''), doc.content[1]];
    renderer.render(container, doc);

    expect(blockSids()).toEqual(['p1', 'pNew', 'p2']);
  });
});
