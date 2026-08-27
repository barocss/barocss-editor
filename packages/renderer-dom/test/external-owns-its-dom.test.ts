import { describe, it, expect, beforeEach } from 'vitest';
import { define, external, getGlobalRegistry } from '@barocss/dsl';
import { DOMRenderer } from '../src/dom-renderer';

/**
 * A component that says it **owns its DOM**, and is left to.
 *
 * `external({ managesDOM: true, mount, update, unmount })` is the way a node type says *I will draw
 * myself* — the place for anything the renderer cannot express as elements: a code editor, a chart,
 * a map, an embed. It is the equivalent of a ProseMirror NodeView, and it is what every editor of
 * this shape eventually needs.
 *
 * It was declared and not honoured. Measured with a probe before any of this was written:
 *
 * - `mount` was handed `{ id }` and nothing else — no model, no text, no attributes — so it could
 *   not draw what the node says;
 * - the element it returned and appended was **wiped**, because `removeStaleChildren` removes every
 *   child of a host that no fiber accounts for, and a component's own DOM has no fibers;
 * - `update` and `unmount` were never called at all, on any later render.
 *
 * Which is the same family as the fields this schema declared and nothing read. A capability the
 * types promise and the renderer does not keep is worse than one that is missing, because the next
 * person builds on it.
 */
/**
 * What a node holds, read the way a component would.
 *
 * Its **own** `text` when it has one, and its children's when it does not — which is faithful to the
 * node rather than convenient: a renderer that flattened a subtree into `props.text` would be
 * inventing a field the model does not have, and `data('text')` in a template means the node's own.
 */
const words = (props: Record<string, any>): string => {
  if (typeof props.text === 'string') return props.text;
  return ((props.content ?? []) as any[])
    .map((one) => (typeof one?.text === 'string' ? one.text : ''))
    .join('');
};

describe('a component that manages its own DOM', () => {
  let host: HTMLElement;
  let renderer: DOMRenderer;
  let seen: { at: string; text?: string; language?: string }[];

  beforeEach(() => {
    seen = [];
    define(
      'ownDom',
      external({
        managesDOM: true,
        mount: (props: Record<string, any>, container: HTMLElement) => {
          seen.push({ at: 'mount', text: words(props), language: props.attributes?.language });
          const el = container.ownerDocument.createElement('pre');
          el.className = 'own';
          el.textContent = words(props);
          container.appendChild(el);
          return el;
        },
        update: (instance: any, _prev: Record<string, any>, next: Record<string, any>) => {
          seen.push({ at: 'update', text: words(next), language: next.attributes?.language });
          if (instance?.element) instance.element.textContent = words(next);
        },
        unmount: () => {
          seen.push({ at: 'unmount' });
        }
      })
    );

    host = document.createElement('div');
    document.body.appendChild(host);
    renderer = new DOMRenderer(getGlobalRegistry());
  });

  const draw = (text: string, language = 'js') =>
    renderer.render(
      host,
      {
        sid: 'own1',
        stype: 'ownDom',
        attributes: { language },
        content: [{ sid: 'r', stype: 'inline-text', text }]
      } as never,
      [],
      undefined
    );

  it('is told what the node says, not only its id', () => {
    draw('const x = 1;');
    /*
     * A component that draws itself has to know what it is drawing. `{ id }` alone is the address of
     * a node and says nothing about it — every `managesDOM` component would have had to reach around
     * the renderer for the model it was just called about.
     */
    expect(seen[0]).toMatchObject({ at: 'mount', text: 'const x = 1;', language: 'js' });
  });

  it('keeps what it drew', () => {
    draw('const x = 1;');
    const own = host.querySelector('pre.own');
    expect(own).not.toBeNull();
    expect(own!.textContent).toBe('const x = 1;');
  });

  it('is asked to update rather than mounted again', () => {
    draw('const x = 1;');
    draw('const y = 2;');

    expect(seen.filter((one) => one.at === 'mount')).toHaveLength(1);
    expect(seen.filter((one) => one.at === 'update')).toHaveLength(1);
    expect(seen.find((one) => one.at === 'update')).toMatchObject({ text: 'const y = 2;' });
    expect(host.querySelector('pre.own')!.textContent).toBe('const y = 2;');
  });

  it('is told when its node is gone', () => {
    draw('const x = 1;');
    define('ownDomHost', (_p: any, _n: any) => ({ type: 'element', tag: 'div', attributes: {}, children: [] }) as never);
    renderer.render(host, { sid: 'page', stype: 'ownDomHost', content: [] } as never, [], undefined);
    expect(seen.some((one) => one.at === 'unmount')).toBe(true);
  });
});
