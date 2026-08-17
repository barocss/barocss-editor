import { describe, it, expect, beforeEach } from 'vitest';
import { VNodeBuilder } from '../../src/vnode/factory';
import { define, element } from '@barocss/dsl';

/**
 * A node type and a tag name are different namespaces that share a spelling.
 *
 * A template child is dispatched through the registry when its tag names a
 * registered component, which is how one template composes another. The check
 * did not exclude names the browser already owns, so a product that named a
 * node after an element got its own renderer back: `element('line', …)` inside
 * the `line` renderer was read as the node type `line`, rebuilt with the *same
 * model data*, and recursed until the stack ran out.
 *
 * Found by the second product. Four node types in the office schema collide
 * today — `line`, `path`, `ellipse`, `frame` — and any product naming a node
 * after an element would have found the next one. The rule was already written
 * down in `native-html-tags.ts` ("cannot be used as template names"); it was
 * declared in one file and not honoured in the one that builds templates.
 */
describe('a tag the browser already owns is never a component', () => {
  let builder: VNodeBuilder;

  beforeEach(() => {
    builder = new VNodeBuilder();
  });

  it('draws an element, not the node type of the same name', () => {
    // Exactly the shape that crashed: a shape node drawn as a positioned box
    // with an SVG inside, where the SVG child's tag is also the node's name.
    define(
      'line',
      element('svg', { className: 'sl-line' }, [
        element('line', { x1: 0, y1: 0, x2: 100, y2: 50, stroke: '#000' })
      ])
    );

    const vnode: any = builder.build('line', { stype: 'line', sid: 'n1', attributes: {} });

    expect(vnode).toBeTruthy();
    expect(vnode.tag).toBe('svg');

    // One child, and it is a plain SVG element rather than a rebuilt component.
    const children = vnode.children ?? [];
    expect(children).toHaveLength(1);
    expect(children[0].tag).toBe('line');
    expect(children[0].attrs?.x2).toBe('100');
    /**
     * The discriminator, and it is the tag rather than the identity: a vnode
     * built from this model carries its sid either way, so `sid` says nothing.
     * Had the child been dispatched as the node type, what came back would be
     * the `line` *renderer's* root — another `svg`, with an `svg > line` of its
     * own inside — rather than the element the template asked for.
     */
    expect(children[0].children ?? []).toHaveLength(0);
  });

  it('still dispatches a component whose name is not an element', () => {
    // The feature is intact: composing one template into another by name is
    // what the check is for, and only browser-owned names are excluded.
    define('sl-badge', element('span', { className: 'badge' }));
    define('holder', element('div', { className: 'holder' }, [element('sl-badge', {})]));

    const vnode: any = builder.build('holder', { stype: 'holder', sid: 'n2', attributes: {} });

    const children = vnode.children ?? [];
    expect(children).toHaveLength(1);
    expect(children[0].attrs?.class ?? children[0].attrs?.className).toContain('badge');
  });

  it('terminates on a template that names itself', () => {
    // The failure was a stack overflow rather than a wrong drawing, so the
    // assertion that matters is that this returns at all.
    define('path', element('svg', {}, [element('path', { d: 'M0 0 L10 10' })]));

    expect(() =>
      builder.build('path', { stype: 'path', sid: 'n3', attributes: { d: 'M0 0 L10 10' } })
    ).not.toThrow();
  });
});
