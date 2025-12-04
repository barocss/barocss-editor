import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DOMRenderer } from '../../src/dom-renderer';
import { RendererRegistry, getGlobalRegistry, define, element, slot } from '@barocss/dsl';
import { normalizeHTML } from '../utils/html';

describe('DOMRenderer Component State', () => {
  let registry: RendererRegistry;
  let renderer: DOMRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    registry = getGlobalRegistry();
    renderer = new DOMRenderer(registry);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    container.innerHTML = '';
    renderer.destroy();
  });

  describe('Component state (new spec)', () => {
    it('renders initial value and updates on re-render', () => {
      define('counter', ((_props: any, _model: any) => {
        return element('div', {}, []);
      }) as any);

      const m1 = { stype: 'counter', sid: 'cnt1', text: '0' } as any;
      renderer.render(container, m1);
      const h1 = normalizeHTML(container.firstElementChild as Element);
      expect(h1).toContain('0');

      const m2 = { stype: 'counter', sid: 'cnt1', text: '5' } as any;
      renderer.render(container, m2);
      const h2 = normalizeHTML(container.firstElementChild as Element);
      expect(h2).toContain('5');
    });

    it('keeps siblings untouched when only one sid changes', () => {
      if (!registry.has('document')) {
        define('document', (_p: any, _m: any) => element('article', {}, [slot('content')]));
      }
      define('counter2', ((_p: any, m: any) => element('div', {}, [String(m?.text ?? '')])) as any);

      const doc1 = { sid: 'doc', stype: 'document', content: [
        { sid: 'a', stype: 'counter2', text: '1' },
        { sid: 'b', stype: 'counter2', text: '2' }
      ] } as any;
      renderer.render(container, doc1);
      const before = normalizeHTML(container.firstElementChild as Element);
      expect(before).toContain('1');
      expect(before).toContain('2');

      const doc2 = { sid: 'doc', stype: 'document', content: [
        { sid: 'a', stype: 'counter2', text: '10' },
        { sid: 'b', stype: 'counter2', text: '2' }
      ] } as any;
      renderer.render(container, doc2);
      const after = normalizeHTML(container.firstElementChild as Element);
      expect(after).toContain('10');
      expect(after).toContain('2');
    });

    it('separates props from model (HTML only)', () => {
      define('display', ((_props: any, _model: any) => element('div', {}, [])) as any);

      const info = 'props.label:Test|model.sid:disp1';
      const m = { stype: 'display', sid: 'disp1', label: 'Test', value: 42, text: info } as any;
      renderer.render(container, m);
      const html = normalizeHTML(container.firstElementChild as Element);
      expect(html).toContain('props.label:Test');
      expect(html).toContain('model.sid:disp1');
    });

    it('multiple instances render independently (HTML)', () => {
      define('counter3', ((_p: any, m: any) => element('div', {}, [String(m?.count ?? 0)])) as any);
      if (!registry.has('wrapdoc')) {
        define('wrapdoc', (_p: any, _m: any) => element('div', {}, [slot('content')]));
      }
      const doc = { stype: 'wrapdoc', sid: 'wrap', content: [
        { sid: 'c3a', stype: 'counter3', count: 0 },
        { sid: 'c3b', stype: 'counter3', count: 0 }
      ] } as any;
      renderer.render(container, doc);
      const html = normalizeHTML(container.firstElementChild as Element);
      expect(html).toContain('0');
    });

    it('complex object rendering via model-only', () => {
      define('form', ((_p: any, _m: any) => element('div', {}, [])) as any);
      const status = 'draft';
      const cnt = 0;
      const m = { stype: 'form', sid: 'form1', submitted: false, errors: [], text: `${status}:${cnt}` } as any;
      renderer.render(container, m);
      const html = normalizeHTML(container.firstElementChild as Element);
      expect(html).toContain('draft:0');
    });

    it('updates when model changes (HTML compare)', () => {
      define('display2', ((_p: any, _m: any) => element('div', {}, [])) as any);
      const m1 = { stype: 'display2', sid: 'disp2', text: 'Initial' } as any;
      renderer.render(container, m1);
      const h1 = normalizeHTML(container.firstElementChild as Element);
      expect(h1).toContain('Initial');
      const m2 = { stype: 'display2', sid: 'disp2', text: 'Updated' } as any;
      renderer.render(container, m2);
      const h2 = normalizeHTML(container.firstElementChild as Element);
      expect(h2).toContain('Updated');
    });

    it('handles nested objects (HTML)', () => {
      define('list', ((_props: any, _ctx: any) => element('div', {}, [])) as any);
      const m = { stype: 'list', sid: 'list1', text: '2/2' } as any;
      renderer.render(container, m);
      const html = normalizeHTML(container.firstElementChild as Element);
      expect(html).toContain('2/2');
    });
  });
});


