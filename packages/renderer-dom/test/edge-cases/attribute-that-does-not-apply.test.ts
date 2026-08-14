import { describe, it, expect } from 'vitest';
import { define, element, data, getGlobalRegistry } from '@barocss/dsl';
import { VNodeBuilder } from '../../src/vnode/factory';

/**
 * A function attribute that resolves to nothing.
 *
 * Returning nothing is how a template says an attribute does not apply — a
 * `lang` only some runs carry, a `title` only some cells have. The vnode starts
 * from the template's own attributes, functions and all, and each is then
 * overwritten by what it resolves to; a function that resolved to `undefined`
 * left the seed untouched, so the *source of the function* became the value.
 *
 * Found in a Word document, where every run that did not name a language read
 * `lang="(d) => typeof d.attributes?.lang === 'string' ? …"`. Which is every
 * run: an attribute that is sometimes absent was drawing its own source the
 * rest of the time.
 */
describe('an attribute whose function resolves to nothing', () => {
  const build = (attributes: Record<string, unknown>, model: Record<string, unknown>) => {
    define('probe', element('span', attributes as never, [data('text', '')]));
    return new VNodeBuilder(getGlobalRegistry()).build('probe', {
      stype: 'probe',
      sid: 'probe-1',
      ...model
    } as never);
  };

  it('is absent, rather than drawing the function', () => {
    const vnode: any = build(
      { lang: (d: any) => d.attributes?.lang },
      { attributes: {} }
    );
    expect(vnode.attrs.lang).toBeUndefined();
    expect(JSON.stringify(vnode.attrs)).not.toContain('=>');
  });

  it('is there when the function has something to say', () => {
    const vnode: any = build(
      { lang: (d: any) => d.attributes?.lang },
      { attributes: { lang: 'en-GB' } }
    );
    expect(vnode.attrs.lang).toBe('en-GB');
  });

  it('leaves the attributes that did resolve alone', () => {
    const vnode: any = build(
      {
        className: 'probe',
        title: () => undefined,
        'data-kept': (d: any) => String(d.sid)
      },
      { attributes: {} }
    );
    expect(vnode.attrs.title).toBeUndefined();
    expect(vnode.attrs['data-kept']).toBe('probe-1');
    expect(vnode.attrs.class ?? vnode.attrs.className).toBe('probe');
  });

  it('says nothing for a static undefined either', () => {
    // The same question from the other side: a template that writes the value
    // directly rather than through a function
    const vnode: any = build({ title: undefined }, { attributes: {} });
    expect(vnode.attrs.title).toBeUndefined();
  });
});
