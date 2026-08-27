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

/**
 * And the element it returns **is** the node's element.
 *
 * `mount(props, container): HTMLElement` says so in its own signature, and the return value was
 * recorded on the instance and used for nothing. `createComponentVNode` hard-codes `tag: 'div'`, so
 * a component that draws a `pre` got a `div` with a `pre` inside it: one element in the document per
 * such node that nobody asked for, and a published page carrying a wrapper around every code block.
 *
 * Which is the claim not being kept rather than a detail. *The component owns its DOM* has to mean
 * the element too — otherwise the renderer still decides what the node is and only lets the
 * component fill it in.
 */
describe('the element a component returns', () => {
  let host: HTMLElement;
  let renderer: DOMRenderer;
  let mounts: number;

  beforeEach(() => {
    mounts = 0;
    define(
      'ownsElement',
      external({
        managesDOM: true,
        mount: (props: Record<string, any>, container: HTMLElement) => {
          mounts += 1;
          const el = container.ownerDocument.createElement('pre');
          el.className = 'mine';
          el.textContent = String(props.attributes?.said ?? '');
          return el;
        },
        update: (instance: any, _prev: Record<string, any>, next: Record<string, any>) => {
          if (instance?.element) instance.element.textContent = String(next.attributes?.said ?? '');
        },
        unmount: () => undefined
      })
    );

    host = document.createElement('div');
    document.body.appendChild(host);
    renderer = new DOMRenderer(getGlobalRegistry());
  });

  const draw = (said: string) =>
    renderer.render(host, { sid: 'mine1', stype: 'ownsElement', attributes: { said } } as never, [], undefined);

  it('is the node’s element, with no wrapper around it', () => {
    draw('hello');
    // The board's own child, not a div holding it.
    expect(host.firstElementChild?.tagName).toBe('PRE');
    expect(host.querySelectorAll('div')).toHaveLength(0);
    expect(host.firstElementChild?.className).toBe('mine');
  });

  it('carries the node’s id, because everything else finds it by that', () => {
    draw('hello');
    /*
     * Hit tests, the selection, the export's media queries and the layer that draws over a board all
     * ask for `data-bc-sid`. An element the renderer adopts has to be stamped like one it made.
     */
    expect(host.firstElementChild?.getAttribute('data-bc-sid')).toBe('mine1');
  });

  it('is kept across renders rather than made again', () => {
    draw('hello');
    const first = host.firstElementChild;
    draw('goodbye');
    expect(host.firstElementChild).toBe(first);
    expect(mounts).toBe(1);
    expect(host.firstElementChild?.textContent).toBe('goodbye');
  });
});
