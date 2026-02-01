import { describe, it, expect, beforeEach } from 'vitest';
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';
import { buildToReact } from '../src/build-to-react';
import { ReactRenderer } from '../src/react-renderer';

describe('buildToReact / ReactRenderer (spec verification)', () => {
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
  });

  it('buildToReact returns element with key, data-bc-sid, data-bc-stype when model.stype is registered via define()', () => {
    const registry = getGlobalRegistry();
    const model = { sid: 'd1', stype: 'doc', content: [] };
    const node = buildToReact(registry, 'doc', model as any);
    expect(node).toBeTruthy();
    expect(typeof node).toBe('object');
    const el = node as any;
    expect(el.key).toBe('d1');
    expect(el.props?.['data-bc-sid']).toBe('d1');
    expect(el.props?.['data-bc-stype']).toBe('doc');
    expect(el.type).toBe('div');
  });

  it('ReactRenderer.build(model) returns ReactNode when model.stype is registered', () => {
    const renderer = new ReactRenderer(getGlobalRegistry());
    const model = { sid: 'd1', stype: 'doc', content: [] };
    const node = renderer.build(model as any);
    expect(node).toBeTruthy();
    const el = node as any;
    expect(el.key).toBe('d1');
    expect(el.props?.['data-bc-sid']).toBe('d1');
  });

  it('build(model) throws when model.stype is missing', () => {
    const renderer = new ReactRenderer(getGlobalRegistry());
    expect(() => renderer.build({ sid: 'd1' } as any)).toThrow(/model must have stype property/);
  });

  it('buildToReact throws when nodeType is not registered', () => {
    const registry = getGlobalRegistry();
    expect(() => buildToReact(registry, 'unknown-type', { sid: 'x', stype: 'unknown-type' } as any)).toThrow(
      /No renderer for node type 'unknown-type'/
    );
  });

  it('slot(content) expands model.content; each child has key and data-bc-*', () => {
    const registry = getGlobalRegistry();
    const model = {
      sid: 'd1',
      stype: 'doc',
      content: [
        { sid: 'p1', stype: 'paragraph', content: [{ sid: 't1', stype: 'inline-text', text: 'Hello' }] },
      ],
    };
    const node = buildToReact(registry, 'doc', model as any) as any;
    expect(node.type).toBe('div');
    expect(node.props?.children).toBeDefined();
    const children = Array.isArray(node.props.children)
      ? node.props.children
      : node.props.children != null
        ? [node.props.children]
        : [];
    expect(children.length).toBeGreaterThanOrEqual(1);
    const p = children[0] as any;
    expect(p).toBeTruthy();
    expect(p.key).toBe('p1');
    expect(p.props?.['data-bc-sid']).toBe('p1');
    expect(p.type).toBe('p');
  });
});
