/**
 * VNodeBuilder Text Rendering Test
 * 
 * Tests various ways to render text in element() templates.
 * - element('span', {}, ['Test Component']) - Direct use of string array
 * - element('span', {}, [text('Test Component')]) - Use text() function
 * - element('span', 'Test Component') - Direct use of string (overload)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { define, element, text, getGlobalRegistry } from '@barocss/dsl';
import { VNodeBuilder } from '../../src/vnode/factory';
import { DOMRenderer } from '../../src/dom-renderer';
import { expectHTML } from '../utils/html';

describe('VNodeBuilder Text Rendering', () => {
  let builder: VNodeBuilder;
  let renderer: DOMRenderer;
  let registry: ReturnType<typeof getGlobalRegistry>;
  let container: HTMLElement;

  beforeEach(() => {
    registry = getGlobalRegistry();
    builder = new VNodeBuilder(registry);
    renderer = new DOMRenderer(registry);
    container = document.createElement('div');
    document.body.appendChild(container);

    // Define base components
    if (!registry.has('document')) {
      define('document', element('div', { className: 'document' }, []));
    }
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('Direct use of string array', () => {
    it('should render text from string array in element children', () => {
      define('test-component', element('div', { className: 'test-component' }, [
        element('span', {}, ['Test Component'])
      ]));

      const model = {
        sid: 'comp1',
        stype: 'test-component'
      };

      renderer.render(container, model);

      expectHTML(
        container,
        `<div class="test-component" data-bc-sid="comp1">
          <span>Test Component</span>
        </div>`,
        expect
      );
    });

    it('should render multiple text strings from array', () => {
      define('test-component', element('div', { className: 'test-component' }, [
        element('span', {}, ['Hello', ' ', 'World'])
      ]));

      const model = {
        sid: 'comp1',
        stype: 'test-component'
      };

      renderer.render(container, model);

      expectHTML(
        container,
        `<div class="test-component" data-bc-sid="comp1">
          <span>Hello World</span>
        </div>`,
        expect
      );
    });
  });

  describe('Use text() function', () => {
    it('should render text from text() function in element children', () => {
      define('test-component', element('div', { className: 'test-component' }, [
        element('span', {}, [text('Test Component')])
      ]));

      const model = {
        sid: 'comp1',
        stype: 'test-component'
      };

      renderer.render(container, model);

      expectHTML(
        container,
        `<div class="test-component" data-bc-sid="comp1">
          <span>Test Component</span>
        </div>`,
        expect
      );
    });

    it('should render multiple text() calls from array', () => {
      define('test-component', element('div', { className: 'test-component' }, [
        element('span', {}, [text('Hello'), text(' '), text('World')])
      ]));

      const model = {
        sid: 'comp1',
        stype: 'test-component'
      };

      renderer.render(container, model);

      expectHTML(
        container,
        `<div class="test-component" data-bc-sid="comp1">
          <span>Hello World</span>
        </div>`,
        expect
      );
    });
  });

  describe('문자열 직접 사용 (오버로드)', () => {
    it('should render text from string parameter (element overload)', () => {
      define('test-component', element('div', { className: 'test-component' }, [
        element('span', 'Test Component')
      ]));

      const model = {
        sid: 'comp1',
        stype: 'test-component'
      };

      renderer.render(container, model);

      expectHTML(
        container,
        `<div class="test-component" data-bc-sid="comp1">
          <span>Test Component</span>
        </div>`,
        expect
      );
    });
  });

  describe('혼합 콘텐츠 (텍스트 + 요소)', () => {
    it('should render mixed content with text and elements', () => {
      define('test-component', element('div', { className: 'test-component' }, [
        element('span', {}, ['Hello', element('strong', {}, ['World'])])
      ]));

      const model = {
        sid: 'comp1',
        stype: 'test-component'
      };

      renderer.render(container, model);

      expectHTML(
        container,
        `<div class="test-component" data-bc-sid="comp1">
          <span>Hello<strong>World</strong></span>
        </div>`,
        expect
      );
    });
  });

  describe('빈 텍스트 처리', () => {
    it('should handle empty string in array', () => {
      define('test-component', element('div', { className: 'test-component' }, [
        element('span', {}, [''])
      ]));

      const model = {
        sid: 'comp1',
        stype: 'test-component'
      };

      renderer.render(container, model);

      // Empty text may not be rendered
      const span = container.querySelector('span');
      expect(span).toBeTruthy();
    });

    it('should handle empty text() call', () => {
      define('test-component', element('div', { className: 'test-component' }, [
        element('span', {}, [text('')])
      ]));

      const model = {
        sid: 'comp1',
        stype: 'test-component'
      };

      renderer.render(container, model);

      const span = container.querySelector('span');
      expect(span).toBeTruthy();
    });
  });

});

