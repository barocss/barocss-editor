import { describe, it, expect, beforeEach } from 'vitest';
import { DOMOperations } from '../src/dom-operations';

/**
 * A write that changes nothing is not free.
 *
 * It produces a mutation record like any other, and the editor's input path
 * reads mutation records to work out what the user typed — so a render that
 * rewrites unchanged chrome buries a keystroke in noise. Measured on the Word
 * app: one render with nothing changed produced 261 attribute writes, 191 of
 * them setting the value that was already there.
 *
 * The comparison upstream is shallow, so an attribute whose value is an object —
 * a style map, most often — differs on identity every render even when every
 * entry in it is the same. These are the backstop for that.
 */
describe('writing what is already there', () => {
  let dom: DOMOperations;
  let element: HTMLElement;
  let records: MutationRecord[];
  let observer: MutationObserver;

  beforeEach(() => {
    dom = new DOMOperations();
    element = document.createElement('div');
    document.body.appendChild(element);
    records = [];
    observer = new MutationObserver((list) => records.push(...list));
    observer.observe(element, { attributes: true, attributeOldValue: true });
  });

  const flush = async () => {
    await Promise.resolve();
    records.push(...observer.takeRecords());
  };

  it('does not touch an attribute that already holds the value', async () => {
    dom.updateAttributes(element, undefined, { 'data-page': '3' });
    await flush();
    records.length = 0;

    // The same value again, as a render with no previous attrs would do
    dom.updateAttributes(element, undefined, { 'data-page': '3' });
    await flush();

    expect(records).toHaveLength(0);
    expect(element.getAttribute('data-page')).toBe('3');
  });

  it('still writes when the value differs', async () => {
    dom.updateAttributes(element, undefined, { 'data-page': '3' });
    await flush();
    records.length = 0;

    dom.updateAttributes(element, undefined, { 'data-page': '4' });
    await flush();

    expect(records.length).toBeGreaterThan(0);
    expect(element.getAttribute('data-page')).toBe('4');
  });

  it('leaves an unchanged class alone', async () => {
    dom.updateAttributes(element, undefined, { className: 'w-sheet' });
    await flush();
    records.length = 0;

    dom.updateAttributes(element, undefined, { className: 'w-sheet' });
    await flush();

    expect(records).toHaveLength(0);
    expect(element.className).toBe('w-sheet');
  });

  it('leaves an unchanged style property alone', async () => {
    dom.updateStyles(element, undefined, { top: '48px', position: 'absolute' });
    await flush();
    records.length = 0;

    // A fresh object with the same entries — which is what a component that
    // rebuilds its templates hands over on every render.
    dom.updateStyles(element, undefined, { top: '48px', position: 'absolute' });
    await flush();

    expect(records).toHaveLength(0);
    expect(element.style.top).toBe('48px');
  });

  it('writes the style property that did move', async () => {
    dom.updateStyles(element, undefined, { top: '48px', left: '96px' });
    await flush();
    records.length = 0;

    dom.updateStyles(element, undefined, { top: '1104px', left: '96px' });
    await flush();

    expect(records.length).toBeGreaterThan(0);
    expect(element.style.top).toBe('1104px');
    expect(element.style.left).toBe('96px');
  });
});
