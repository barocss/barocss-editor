import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, slot, data, defineDecorator, getGlobalRegistry } from '@barocss/dsl';
import { buildToReact } from '../src/build-to-react';
import { ReactRenderer } from '../src/react-renderer';
import type { Decorator } from '../src/decorator/types';

function getChildren(node: any): any[] {
  const c = node?.props?.children;
  if (c == null) return [];
  return Array.isArray(c) ? c : [c];
}

describe('renderer-react decorators', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('doc')) {
      define('doc', element('div', { className: 'document' }, [slot('content')]));
    }
    if (!registry.has?.('paragraph')) {
      define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    }
    if (!registry.has?.('inline-text')) {
      define('inline-text', element('span', {}, [data('text')]));
    }
    if (!registry.has?.('chip')) {
      defineDecorator('chip', element('span', { className: 'chip', 'data-decorator': 'true' }, []));
    }
  });

  it('build(model, []) renders without decorators (backward compatible)', () => {
    const renderer = new ReactRenderer(getGlobalRegistry());
    const model = { sid: 'd1', stype: 'doc', content: [] };
    const node = renderer.build(model as any);
    expect(node).toBeTruthy();
    const el = node as any;
    expect(el.props?.['data-bc-sid']).toBe('d1');
  });

  it('build(model, decorators) renders block decorators after child when position is after', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 'doc1',
      stype: 'doc',
      content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
    };
    const decorators: Decorator[] = [
      {
        sid: 'dec1',
        stype: 'chip',
        category: 'block',
        target: { sid: 'p1' },
        position: 'after',
      },
    ];
    const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
    const children = getChildren(node);
    expect(children.length).toBeGreaterThanOrEqual(2);
    const first = children[0] as any;
    const second = children[1] as any;
    expect(first.key).toBe('p1');
    expect(second.props?.['data-decorator-sid']).toBe('dec1');
    expect(second.props?.['data-decorator-stype']).toBe('chip');
    expect(second.props?.['data-decorator-category']).toBe('block');
  });

  it('build(model, decorators) renders inline decorator wrapping text range', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 'p1',
      stype: 'paragraph',
      content: [{ sid: 't1', stype: 'inline-text', text: 'Hello world' }],
    };
    const decorators: Decorator[] = [
      {
        sid: 'd1',
        stype: 'chip',
        category: 'inline',
        target: { sid: 't1', startOffset: 0, endOffset: 5 },
      },
    ];
    const node = buildToReact(registry, 'paragraph', model as any, { decorators }) as any;
    const children = getChildren(node);
    expect(children.length).toBeGreaterThanOrEqual(1);
    const first = children[0] as any;
    if (first.props?.['data-decorator-sid'] === 'd1') {
      expect(first.props?.['data-decorator-stype']).toBe('chip');
      expect(first.props?.['data-decorator-category']).toBe('inline');
    } else {
      const inner = getChildren(first)[0];
      expect(inner?.props?.['data-decorator-sid']).toBe('d1');
    }
  });

  it('ReactRenderer.build(model, decorators) passes decorators to buildToReact', () => {
    const renderer = new ReactRenderer(getGlobalRegistry());
    const model = {
      sid: 'doc1',
      stype: 'doc',
      content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
    };
    const decorators: Decorator[] = [
      { sid: 'dec1', stype: 'chip', category: 'block', target: { sid: 'p1' }, position: 'after' },
    ];
    const node = renderer.build(model as any, decorators) as any;
    const children = getChildren(node);
    const hasDecorator = children.some((c: any) => c?.props?.['data-decorator-sid'] === 'dec1');
    expect(hasDecorator).toBe(true);
  });

  it('buildToReact(registry, nodeType, model, { decorators }) yields same decorator as ReactRenderer.build(model, decorators)', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 'doc1',
      stype: 'doc',
      content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
    };
    const decorators: Decorator[] = [
      { sid: 'dec1', stype: 'chip', category: 'block', target: { sid: 'p1' }, position: 'after' },
    ];
    const nodeFromBuild = buildToReact(registry, 'doc', model as any, { decorators }) as any;
    const renderer = new ReactRenderer(registry);
    const nodeFromRenderer = renderer.build(model as any, decorators) as any;
    const childrenFromBuild = getChildren(nodeFromBuild);
    const childrenFromRenderer = getChildren(nodeFromRenderer);
    const decFromBuild = childrenFromBuild.find((c: any) => c?.props?.['data-decorator-sid'] === 'dec1');
    const decFromRenderer = childrenFromRenderer.find((c: any) => c?.props?.['data-decorator-sid'] === 'dec1');
    expect(decFromBuild).toBeTruthy();
    expect(decFromRenderer).toBeTruthy();
    expect(decFromBuild?.props?.['data-decorator-stype']).toBe('chip');
    expect(decFromRenderer?.props?.['data-decorator-stype']).toBe('chip');
  });

  it('decorator node has data-decorator-sid, data-decorator-stype, data-decorator-category', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 'doc1',
      stype: 'doc',
      content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
    };
    const decorators: Decorator[] = [
      { sid: 'dec1', stype: 'chip', category: 'block', target: { sid: 'p1' }, position: 'after' },
    ];
    const node = buildToReact(registry, 'doc', model as any, { decorators }) as any;
    const children = getChildren(node);
    const dec = children.find((c: any) => c?.props?.['data-decorator-sid'] === 'dec1');
    expect(dec?.props?.['data-decorator-sid']).toBe('dec1');
    expect(dec?.props?.['data-decorator-stype']).toBe('chip');
    expect(dec?.props?.['data-decorator-category']).toBe('block');
  });

  it('build(model) without decorators argument does not render any decorator nodes', () => {
    const renderer = new ReactRenderer(getGlobalRegistry());
    const model = {
      sid: 'doc1',
      stype: 'doc',
      content: [{ sid: 'p1', stype: 'paragraph', content: [{ sid: 't1', stype: 'inline-text', text: 'Hi' }] }],
    };
    const node = renderer.build(model as any) as any;
    function countDecorators(n: any): number {
      if (n?.props?.['data-decorator-sid']) return 1 + (getChildren(n) as any[]).reduce((s, c) => s + countDecorators(c), 0);
      return (getChildren(n) as any[]).reduce((s, c) => s + countDecorators(c), 0);
    }
    expect(countDecorators(node)).toBe(0);
  });
});
