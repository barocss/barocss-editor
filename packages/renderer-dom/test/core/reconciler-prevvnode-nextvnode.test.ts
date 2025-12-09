import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, data, getGlobalRegistry, slot } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';
import { normalizeHTML } from '../utils/html';

describe('Reconciler: prevVNode vs nextVNode 비교', () => {
  let container: HTMLElement;
  let renderer: DOMRenderer;

  beforeEach(() => {
    container = document.createElement('div');
    const reg = getGlobalRegistry();
    // Template that can dynamically receive attrs and style
    define('paragraph', element('p', {
      className: data('attrs.className', 'para'),
      id: data('attrs.id'),
      style: data('style')
    }, []));
    define('div', element('div', {}, []));
    renderer = new DOMRenderer(reg);
  });

  describe('초기 렌더링 (prevVNode 없음)', () => {
    it('should apply all attributes and styles on first render', () => {
      renderer.render(container, {
        stype: 'paragraph',
        sid: 'p1',
        attrs: { className: 'para', id: 'p1' },
        style: { color: 'red', fontSize: '16px' }
      });

      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para" data-bc-sid="p1" id="p1" style="color: red; font-size: 16px"></p>'
      );
    });
  });

  describe('속성 업데이트', () => {
    it('should add new attribute when not in prevVNode', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p2', attrs: { className: 'para' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para" data-bc-sid="p2"></p>'
      );

      renderer.render(container, { stype: 'paragraph', sid: 'p2', attrs: { className: 'para', id: 'p2' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para" data-bc-sid="p2" id="p2"></p>'
      );
    });

    it('should remove attribute when not in nextVNode', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p3', attrs: { className: 'para', id: 'p3' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para" data-bc-sid="p3" id="p3"></p>'
      );

      renderer.render(container, { stype: 'paragraph', sid: 'p3', attrs: { className: 'para' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para" data-bc-sid="p3"></p>'
      );
    });

    it('should update attribute when value changes', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p4', attrs: { className: 'para' } });
      renderer.render(container, { stype: 'paragraph', sid: 'p4', attrs: { className: 'para-updated' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para-updated" data-bc-sid="p4"></p>'
      );
    });

    it('should not update attribute when value is same', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p5', attrs: { className: 'para', id: 'p5' } });
      const first = normalizeHTML(container.firstElementChild as Element);
      renderer.render(container, { stype: 'paragraph', sid: 'p5', attrs: { className: 'para', id: 'p5' } });
      const second = normalizeHTML(container.firstElementChild as Element);
      expect(second).toBe(first);
    });
  });

  describe('스타일 업데이트', () => {
    it('should add new style when not in prevVNode', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p6', style: { color: 'red' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para" data-bc-sid="p6" style="color: red"></p>'
      );

      renderer.render(container, { stype: 'paragraph', sid: 'p6', style: { color: 'red', fontSize: '16px' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para" data-bc-sid="p6" style="color: red; font-size: 16px"></p>'
      );
    });

    it('should remove style when not in nextVNode', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p7', style: { color: 'red', fontSize: '16px' } });
      renderer.render(container, { stype: 'paragraph', sid: 'p7', style: { color: 'red' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para" data-bc-sid="p7" style="color: red"></p>'
      );
    });

    it('should update style when value changes', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p8', style: { color: 'red' } });
      renderer.render(container, { stype: 'paragraph', sid: 'p8', style: { color: 'blue' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para" data-bc-sid="p8" style="color: blue"></p>'
      );
    });

    it('should not update style when value is same', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p9', style: { color: 'red', fontSize: '16px' } });
      const first = normalizeHTML(container.firstElementChild as Element);
      renderer.render(container, { stype: 'paragraph', sid: 'p9', style: { color: 'red', fontSize: '16px' } });
      const second = normalizeHTML(container.firstElementChild as Element);
      expect(second).toBe(first);
    });
  });

  describe('복합 시나리오', () => {
    it('should handle attribute and style changes simultaneously', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p10', attrs: { className: 'para', id: 'p10' }, style: { color: 'red', fontSize: '16px' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para" data-bc-sid="p10" id="p10" style="color: red; font-size: 16px"></p>'
      );
      renderer.render(container, { stype: 'paragraph', sid: 'p10', attrs: { className: 'para-updated' }, style: { color: 'blue' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para-updated" data-bc-sid="p10" style="color: blue"></p>'
      );
    });

    it('should handle multiple attribute removals', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p11', attrs: { className: 'para', id: 'p11', 'data-test': 'value' } });
      renderer.render(container, { stype: 'paragraph', sid: 'p11', attrs: { className: 'para' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para" data-bc-sid="p11"></p>'
      );
    });

    it('should handle multiple style removals', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p12', style: { color: 'red', fontSize: '16px', fontWeight: 'bold' } });
      renderer.render(container, { stype: 'paragraph', sid: 'p12', style: { color: 'red' } });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<p class="para" data-bc-sid="p12" style="color: red"></p>'
      );
    });
  });

  describe('Children reconcile', () => {
    beforeEach(() => {
      define('list', element('ul', {}, [slot('content')]))
      define('listItem', element('li', {}, [slot('content')]))
    });

    it('should reconcile children with prevVNode', () => {
      renderer.render(container, { stype: 'list', sid: 'list1', content: [ { stype: 'paragraph', sid: 'p13', attrs: { className: 'para' } } ] });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<ul data-bc-sid="list1"><p class="para" data-bc-sid="p13"></p></ul>'
      );
      renderer.render(container, { stype: 'list', sid: 'list1', content: [ { stype: 'paragraph', sid: 'p13', attrs: { className: 'para-updated' } } ] });
      expect(normalizeHTML(container.firstElementChild as Element)).toBe(
        '<ul data-bc-sid="list1"><p class="para-updated" data-bc-sid="p13"></p></ul>'
      );
    });
  });

  describe('sid 기반 매칭', () => {
    it('should match elements by sid across renders', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p14', attrs: { className: 'para' } });
      const first = normalizeHTML(container.firstElementChild as Element);
      renderer.render(container, { stype: 'paragraph', sid: 'p14', attrs: { className: 'para-updated' } });
      const second = normalizeHTML(container.firstElementChild as Element);
      expect(second).not.toBe('<p class="para" data-bc-sid="p14"></p>');
      expect(second).toBe('<p class="para-updated" data-bc-sid="p14"></p>');
      expect(first !== second).toBe(true);
    });

    it('should create new element when sid changes', () => {
      renderer.render(container, { stype: 'paragraph', sid: 'p15', attrs: { className: 'para' } });
      const first = normalizeHTML(container.firstElementChild as Element);
      renderer.render(container, { stype: 'paragraph', sid: 'p16', attrs: { className: 'para' } });
      const containerHTML = normalizeHTML(container);
      expect(first).toBe('<p class="para" data-bc-sid="p15"></p>');
      expect(containerHTML.includes('data-bc-sid="p16"')).toBe(true);
    });
  });
});

