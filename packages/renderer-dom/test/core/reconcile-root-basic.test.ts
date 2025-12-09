import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, getGlobalRegistry } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';
import { normalizeHTML } from '../utils/html';

describe('Reconciler root rendering (basic)', () => {
  let container: HTMLElement;
  let renderer: DOMRenderer;

  beforeEach(() => {
    container = document.createElement('div');
    const reg = getGlobalRegistry();
    // Cleanup: assume global registry only overwrites, in case of same stype redefinition
    define('paragraph', element('p', { className: 'para' }, []));
    renderer = new DOMRenderer(reg);
  });

  it('should render a single host under container with sid/stype and correct tag', () => {
    renderer.render(container, { stype: 'paragraph', sid: 'p1', text: 'Hello' });
    expect(normalizeHTML(container.firstElementChild as Element)).toBe(
      '<p class="para" data-bc-sid="p1">Hello</p>'
    );
  });

  it('should update text by re-rendering with new model', () => {
    renderer.render(container, { stype: 'paragraph', sid: 'p2', text: 'A' });
    expect(normalizeHTML(container.firstElementChild as Element)).toBe(
      '<p class="para" data-bc-sid="p2">A</p>'
    );
    renderer.render(container, { stype: 'paragraph', sid: 'p2', text: 'B' });
    expect(normalizeHTML(container.firstElementChild as Element)).toBe(
      '<p class="para" data-bc-sid="p2">B</p>'
    );
  });
});


