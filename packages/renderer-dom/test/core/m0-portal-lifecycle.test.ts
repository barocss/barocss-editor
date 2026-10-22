import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, element, getGlobalRegistry, portal } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';
import { FiberScheduler } from '../../src/reconcile/fiber/fiber-scheduler';
import { commitFiberNode } from '../../src/reconcile/fiber/fiber-reconciler';
import { EffectTag } from '../../src/reconcile/fiber/types';
import type { FiberNode } from '../../src/reconcile/fiber/types';

const renderers: DOMRenderer[] = [];
const contentSelector = '.m0-portal-content';

interface State {
  sid: string;
  stype: string;
  text: string;
  title: string;
  ids: string[];
}

function fixture() {
  const container = document.createElement('div');
  const first = document.createElement('aside');
  const second = document.createElement('aside');
  const foreign = document.createElement('strong');
  foreign.textContent = 'foreign';
  first.appendChild(foreign);
  document.body.append(container, first, second);
  let target = first;
  define('m0-portal-lifecycle', (_props, model) => {
    const state = model as unknown as State;
    return element('div', {}, [
      element('i', { key: 'before', className: 'source-before' }, ['before']),
      ...state.ids.flatMap(id => [
        portal(() => target, element('p', {
          className: 'm0-portal-content', title: state.title, 'data-portal-key': id
        }, [state.text]), `m0-portal-${id}`),
        element('i', { key: `source-${id}`, 'data-source-key': id }, [`[${id}]`])
      ]),
      element('i', { key: 'after', className: 'source-after' }, ['after'])
    ]);
  });
  const renderer = new DOMRenderer(getGlobalRegistry());
  renderers.push(renderer);
  const initial: State = {
    sid: 'm0-portal-document', stype: 'm0-portal-lifecycle', text: 'one', title: 'first', ids: ['a']
  };
  return {
    renderer, container, first, second, foreign,
    setTarget(next: HTMLElement) { target = next; },
    render(changes: Partial<State> = {}, onComplete?: () => void) {
      renderer.render(container, { ...initial, ...changes }, [], undefined, undefined, { onComplete });
    }
  };
}

function expectSettled(renderer: DOMRenderer) {
  const reconciler = renderer['reconciler'];
  expect(reconciler['activeScheduler']).toBeNull();
  expect(reconciler['currentVisitedPortalIds']).toBeNull();
  const pending: FiberNode[] = reconciler['rootFiber'] ? [reconciler['rootFiber']] : [];
  while (pending.length) {
    const fiber = pending.pop()!;
    expect(fiber.alternate).toBeNull();
    expect(fiber.prevVNode).toBeUndefined();
    if (fiber.child) pending.push(fiber.child);
    if (fiber.sibling) pending.push(fiber.sibling);
  }
}

function expectNodeIdentity(actual: Array<Node | null>, expected: Array<Node | null>) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((node, index) => expect(node).toBe(expected[index]));
}

function expectContent(target: HTMLElement, text: string, title: string, count = 1) {
  const content = [...target.querySelectorAll<HTMLElement>(contentSelector)];
  expect(content).toHaveLength(count);
  for (const node of content) {
    expect(node.textContent).toBe(text);
    expect(node.title).toBe(title);
  }
  return content;
}

// Keep the real FiberScheduler and rendering functions. Only its clock and idle
// callbacks are controlled, so a superseded render can stop at an actual unit.
function deferredWork() {
  const callbacks: Array<() => void> = [];
  const schedulers: FiberScheduler[] = [];
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => callbacks.push(callback));
  const original = FiberScheduler.prototype.scheduleWork;
  vi.spyOn(FiberScheduler.prototype, 'scheduleWork').mockImplementation(function (this: FiberScheduler, root, priority) {
    schedulers.push(this);
    this.setSyncMode(false);
    original.call(this, root, priority);
  });
  let now = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => (now += 10));
  const step = () => {
    expect(callbacks.length).toBeGreaterThan(0);
    clock.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(10);
    callbacks.shift()!();
  };
  return {
    schedulers,
    defer() { now = 0; clock.mockImplementation(() => (now += 10)); },
    throughPortal(root: FiberScheduler) {
      let turns = 0;
      while (root['nextUnitOfWork']?.vnode.tag !== 'portal') {
        expect(root['nextUnitOfWork']).not.toBeNull();
        expect(++turns).toBeLessThan(100);
        step();
      }
      const portalUnit = root['nextUnitOfWork'];
      while (root['nextUnitOfWork'] === portalUnit) {
        expect(++turns).toBeLessThan(100);
        step();
      }
      expect(root['nextUnitOfWork']).not.toBeNull();
    },
    drain() {
      clock.mockReturnValue(0);
      let turns = 0;
      while (callbacks.length) {
        expect(++turns).toBeLessThan(200);
        clock.mockReturnValue(0);
        callbacks.shift()!();
      }
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const renderer of renderers.splice(0)) renderer.destroy();
  document.body.replaceChildren();
});

describe('M0 portal lifecycle', () => {
  it('preserves the existing missing-VNode no-effect and deletion guards', () => {
    const { renderer, container, first, render } = fixture();
    render();
    // Exercise the existing internal defensive branch with an actual rendered
    // Fiber/DOM, without defining a null-VNode DOMRenderer input contract.
    const reconciler = renderer['reconciler'];
    const fiber = reconciler['rootFiber']!.child!;
    const previous = fiber.vnode;
    const node = fiber.domElement;
    const context = fiber.context;
    const unmount = vi.spyOn(renderer['componentManager'], 'unmountComponent');
    const deps = {
      dom: renderer['domOperations'], components: renderer['componentManager'],
      currentVisitedPortalIds: null, portalHostsById: reconciler['portalHostsById']
    };
    fiber.prevVNode = previous;
    expect(Reflect.deleteProperty(fiber, 'vnode')).toBe(true);
    fiber.effectTag = null;
    expect.soft(() => commitFiberNode(fiber, deps, context)).not.toThrow();
    expect(container.contains(node)).toBe(true);
    expect(unmount).not.toHaveBeenCalled();
    fiber.effectTag = EffectTag.DELETION;
    expect(() => commitFiberNode(fiber, deps, context)).not.toThrow();
    expect(unmount).toHaveBeenCalledExactlyOnceWith(previous, context);
    expect(node?.parentNode).toBeNull();
    expect(first.querySelectorAll(contentSelector)).toHaveLength(1);
  });

  it('updates text and title once while preserving the content element and Text node', () => {
    const { renderer, container, first, render } = fixture();
    render();
    const initial = [...first.querySelectorAll<HTMLElement>(contentSelector)];
    expect.soft(initial).toHaveLength(1);
    for (const node of initial) {
      expect.soft(node.textContent).toBe('one');
      expect.soft(node.title).toBe('first');
    }
    const content = initial[0];
    expect(content).toBeInstanceOf(HTMLElement);
    const text = content.firstChild;
    expect(text).toBeInstanceOf(Text);
    expect.soft(container.querySelector(contentSelector)).toBeNull();
    render({ text: 'two', title: 'second' });
    const updated = [...first.querySelectorAll<HTMLElement>(contentSelector)];
    expect.soft(updated).toHaveLength(1);
    for (const node of updated) {
      expect.soft(node.textContent).toBe('two');
      expect.soft(node.title).toBe('second');
    }
    expect.soft(container.querySelector(contentSelector)).toBeNull();
    expect.soft(container.textContent).toBe('before[a]after');
    expect(updated[0]).toBe(content);
    expect(updated[0].firstChild).toBe(text);
    expectSettled(renderer);
  });

  it('moves the target and removes only renderer-owned portal content', () => {
    const { renderer, first, second, foreign, render, setTarget } = fixture();
    render();
    const [content] = expectContent(first, 'one', 'first');
    const host = content.parentNode;
    const text = content.firstChild;
    setTarget(second);
    render({ text: 'moved', title: 'moved title' });
    expect(first.querySelector(contentSelector)).toBeNull();
    expect(first.childNodes).toHaveLength(1);
    expect(first.firstChild).toBe(foreign);
    const [moved] = expectContent(second, 'moved', 'moved title');
    expect(moved).toBe(content);
    expect(moved.parentNode).toBe(host);
    expect(moved.firstChild).toBe(text);
    render({ ids: [] });
    expect(second.childNodes).toHaveLength(0);
    expect(first.firstChild).toBe(foreign);
    expectSettled(renderer);
  });

  it('does not adopt an unrelated host that shares the portal ID', () => {
    const { renderer, first, render } = fixture();
    const foreignHost = document.createElement('div');
    foreignHost.setAttribute('data-bc-sid', 'm0-portal-a');
    const foreignText = document.createTextNode('external content');
    foreignHost.appendChild(foreignText);
    first.appendChild(foreignHost);
    render();
    const [content] = expectContent(first, 'one', 'first');
    expect(content.parentNode).not.toBe(foreignHost);
    expect(foreignHost.childNodes).toHaveLength(1);
    expect(foreignHost.firstChild).toBe(foreignText);
    render({ ids: [] });
    expect(foreignHost.parentNode).toBe(first);
    expect(foreignHost.firstChild).toBe(foreignText);
    expectSettled(renderer);
  });

  it('preserves keyed source siblings and portal identity through reorder, insert and delete', () => {
    const { renderer, container, first, foreign, render } = fixture();
    render({ ids: ['a', 'b'] });
    const a = first.querySelector('[data-portal-key="a"]');
    const b = first.querySelector('[data-portal-key="b"]');
    const bHost = b?.parentNode;
    const sourceA = container.querySelector('[data-source-key="a"]');
    const sourceB = container.querySelector('[data-source-key="b"]');
    const before = container.querySelector('.source-before');
    const after = container.querySelector('.source-after');
    render({ ids: ['b', 'c', 'a'], text: 'reordered', title: 'next' });
    expectContent(first, 'reordered', 'next', 3);
    expect([...first.querySelectorAll(contentSelector)].map(node => node.getAttribute('data-portal-key')))
      .toEqual(['b', 'c', 'a']);
    expect(first.querySelector('[data-portal-key="a"]')).toBe(a);
    expect(first.querySelector('[data-portal-key="b"]')).toBe(b);
    expect(container.querySelector('[data-source-key="a"]')).toBe(sourceA);
    expect(container.querySelector('[data-source-key="b"]')).toBe(sourceB);
    expect(container.querySelector('.source-before')).toBe(before);
    expect(container.querySelector('.source-after')).toBe(after);
    expect(container.textContent).toBe('before[b][c][a]after');
    expect(container.querySelector(contentSelector)).toBeNull();
    render({ ids: ['c', 'a'], text: 'remaining', title: 'last' });
    expectContent(first, 'remaining', 'last', 2);
    expect(first.contains(b)).toBe(false);
    expect(first.querySelector('[data-bc-sid="m0-portal-b"]')).toBeNull();
    expect(bHost?.parentNode).toBeNull();
    expect(first.contains(foreign)).toBe(true);
    expectSettled(renderer);
  });

  it('removes nested portal hosts when their outer portal is removed', () => {
    const { renderer, container, first, second, foreign } = fixture();
    define('m0-nested-portal-lifecycle', (_props, model) => element('div', {}, model.show ? [
      portal(first, element('section', { className: 'outer-content' }, [
        'outer', portal(second, element('p', { className: 'inner-content' }, ['inner']), 'm0-inner')
      ]), 'm0-outer')
    ] : []));
    const model = { sid: 'nested-document', stype: 'm0-nested-portal-lifecycle', show: true };
    renderer.render(container, model);
    expect(first.querySelectorAll('.outer-content')).toHaveLength(1);
    expect(second.querySelectorAll('.inner-content')).toHaveLength(1);
    expect(first.querySelector('.inner-content')).toBeNull();
    expect(container.querySelector('.outer-content, .inner-content')).toBeNull();
    renderer.render(container, { ...model, show: false });
    expect(first.childNodes).toHaveLength(1);
    expect(first.firstChild).toBe(foreign);
    expect(second.childNodes).toHaveLength(0);
    expectSettled(renderer);
  });

  it('renders into a target inside the source tree without disturbing source siblings', () => {
    const { renderer, container, render, setTarget } = fixture();
    render({ ids: [] });
    const target = container.querySelector<HTMLElement>('.source-before')!;
    const after = container.querySelector('.source-after');
    setTarget(target);
    render();
    const [content] = expectContent(target, 'one', 'first');
    const text = content.firstChild;
    render({ text: 'inside', title: 'updated' });
    const [updated] = expectContent(target, 'inside', 'updated');
    expect(updated).toBe(content);
    expect(updated.firstChild).toBe(text);
    expect(container.querySelector('.source-before')).toBe(target);
    expect(container.querySelector('.source-after')).toBe(after);
    expect(container.querySelector('[data-source-key="a"]')?.textContent).toBe('[a]');
    render({ ids: [] });
    expect(target.textContent).toBe('before');
    expect(container.textContent).toBe('beforeafter');
    expectSettled(renderer);
  });

  it('attaches a portal after its later source target finishes text reconciliation', () => {
    const { renderer, container, render, setTarget } = fixture();
    render({ ids: [] });
    const target = container.querySelector<HTMLElement>('.source-after')!;
    setTarget(target);
    render();
    const [content] = expectContent(target, 'one', 'first');
    const text = content.firstChild;
    expect(container.querySelector('.source-after')).toBe(target);
    render({ text: 'later target', title: 'updated' });
    const [updated] = expectContent(target, 'later target', 'updated');
    expect(updated).toBe(content);
    expect(updated.firstChild).toBe(text);
    render({ ids: [] });
    expect(target.textContent).toBe('after');
    expect(container.textContent).toBe('beforeafter');
    expectSettled(renderer);
  });

  it.each(['destroy', 'supersede'] as const)(
    'does not publish an old portal after a target move triggers %s', mode => {
      const { renderer, container, first, second, foreign, render, setTarget } = fixture();
      render();
      const host = first.querySelector<HTMLElement>('[data-bc-sid="m0-portal-a"]')!;
      const obsolete = vi.fn();
      const newest = vi.fn();
      const disconnected = vi.fn();
      let armed = false;
      class MoveProbe extends HTMLElement {
        disconnectedCallback() {
          if (!armed) return;
          armed = false;
          disconnected();
          if (mode === 'destroy') renderer.destroy();
          else render({ ids: [] }, newest);
        }
      }
      const tag = `m0-portal-move-${mode}-probe`;
      customElements.define(tag, MoveProbe);
      host.appendChild(document.createElement(tag));
      armed = true;
      setTarget(second);
      render({ text: 'obsolete', title: 'obsolete' }, obsolete);
      expect(disconnected).toHaveBeenCalledTimes(1);
      expect(obsolete).not.toHaveBeenCalled();
      expect(first.childNodes).toHaveLength(1);
      expect(first.firstChild).toBe(foreign);
      expect(second.childNodes).toHaveLength(0);
      expect(host.parentNode).toBeNull();
      expect(renderer['reconciler']['portalHostsById'].size).toBe(0);
      if (mode === 'destroy') {
        expect(newest).not.toHaveBeenCalled();
        expect(renderer['reconciler']['rootFiber']).toBeNull();
      } else {
        expect(newest).toHaveBeenCalledTimes(1);
        expect(container.textContent).toBe('beforeafter');
      }
      expectSettled(renderer);
    }
  );

  it('matches explicit nonportal keys before their shared inherited sid', () => {
    const { renderer, container } = fixture();
    define('m0-keyed-source-lifecycle', (_props, model) => element('div', {},
      (model.ids as string[]).map(id => element('p', {
        key: id, className: 'keyed-row', 'data-row-key': id
      }, [id]))
    ));
    const render = (ids: string[]) => renderer.render(container, {
      sid: 'keyed-document', stype: 'm0-keyed-source-lifecycle', ids
    });
    const rows = () => [...container.querySelectorAll<HTMLElement>('.keyed-row')];
    render(['a', 'b', 'c']);
    const [a, b, c] = rows();
    expect(rows().map(node => node.getAttribute('data-bc-sid')))
      .toEqual(['keyed-document', 'keyed-document', 'keyed-document']);
    render(['c', 'a', 'b']);
    expectNodeIdentity(rows(), [c, a, b]);
    render(['b', 'd', 'c', 'a']);
    const d = container.querySelector<HTMLElement>('[data-row-key="d"]')!;
    expectNodeIdentity(rows(), [b, d, c, a]);
    render(['d', 'a']);
    expectNodeIdentity(rows(), [d, a]);
    expect(rows().map(node => node.textContent)).toEqual(['d', 'a']);
    expect(b.parentNode).toBeNull();
    expect(c.parentNode).toBeNull();
    expectSettled(renderer);
  });

  it('keeps unkeyed source elements and Text nodes at their positions', () => {
    const { renderer, container } = fixture();
    define('m0-positional-source-lifecycle', (_props, model) => element('div', {},
      (model.labels as string[]).map(label => element('p', { className: 'positional-row' }, [label]))
    ));
    const render = (labels: string[]) => renderer.render(container, {
      sid: 'positional-document', stype: 'm0-positional-source-lifecycle', labels
    });
    const rows = () => [...container.querySelectorAll<HTMLElement>('.positional-row')];
    render(['A', 'B', 'C']);
    const initial = rows();
    const texts = initial.map(node => node.firstChild);
    render(['C', 'A', 'B']);
    expectNodeIdentity(rows(), initial);
    expectNodeIdentity(rows().map(node => node.firstChild), texts);
    expect(rows().map(node => node.textContent)).toEqual(['C', 'A', 'B']);
    render(['D', 'C', 'A', 'B']);
    const inserted = rows();
    expectNodeIdentity(inserted.slice(0, 3), initial);
    expect(inserted.map(node => node.textContent)).toEqual(['D', 'C', 'A', 'B']);
    render(['A', 'B']);
    expectNodeIdentity(rows(), initial.slice(0, 2));
    expectNodeIdentity(rows().map(node => node.firstChild), texts.slice(0, 2));
    expect(rows().map(node => node.textContent)).toEqual(['A', 'B']);
    expect(initial[2].parentNode).toBeNull();
    expect(inserted[3].parentNode).toBeNull();
    expectSettled(renderer);
  });

  it('cleans the newest portal visit set when superseded before any portal unit', () => {
    const { renderer, first, foreign, render } = fixture();
    render();
    const work = deferredWork();
    const obsolete = vi.fn();
    const completed = vi.fn();
    render({ ids: ['obsolete'] }, obsolete);
    render({ ids: [] }, completed);
    work.drain();
    expect(obsolete).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(first.childNodes).toHaveLength(1);
    expect(first.firstChild).toBe(foreign);
    expectSettled(renderer);
    render({ text: 'followup', title: 'followup' });
    work.drain();
    expectContent(first, 'followup', 'followup');
    expectSettled(renderer);
  });

  it('cancels portal work reached by a superseded root and keeps the newest result', () => {
    const { renderer, container, first, render } = fixture();
    render();
    const work = deferredWork();
    const obsolete = vi.fn();
    render({ text: 'obsolete', title: 'obsolete' }, obsolete);
    work.throughPortal(work.schedulers[0]);
    expect(obsolete).not.toHaveBeenCalled();
    work.defer();
    const completed = vi.fn();
    render({ text: 'newest', title: 'newest' }, completed);
    work.drain();
    expect(obsolete).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledTimes(1);
    expectContent(first, 'newest', 'newest');
    expect(container.querySelector(contentSelector)).toBeNull();
    expectSettled(renderer);
  });

  it('finishes portal cleanup before a completion callback starts another async render', () => {
    const { renderer, first, foreign, render } = fixture();
    const work = deferredWork();
    const completed: string[] = [];
    render({}, () => {
      expectContent(first, 'one', 'first');
      expectSettled(renderer);
      completed.push('first');
      work.defer();
      render({ ids: [] }, () => {
        expectSettled(renderer);
        completed.push('second');
      });
    });
    work.drain();
    expect(completed).toEqual(['first', 'second']);
    expect(first.childNodes).toHaveLength(1);
    expect(first.firstChild).toBe(foreign);
    expectSettled(renderer);
  });

  it('cancels reached portal units on destroy and permits a correct followup render', () => {
    const { renderer, container, first, foreign, render } = fixture();
    render();
    const host = first.querySelector<HTMLElement>('[data-bc-sid="m0-portal-a"]')!;
    const targetMarkup = first.innerHTML;
    const hostMarkup = host.innerHTML;
    const work = deferredWork();
    const obsolete = vi.fn();
    render({ text: 'destroyed', title: 'destroyed' }, obsolete);
    work.throughPortal(work.schedulers[0]);
    expect.soft(first.innerHTML).toBe(targetMarkup);
    renderer.destroy();
    renderer.destroy();
    work.drain();
    expect(obsolete).not.toHaveBeenCalled();
    expect(first.childNodes).toHaveLength(1);
    expect(first.firstChild).toBe(foreign);
    expect(renderer['reconciler']['rootFiber']).toBeNull();
    expect(host.parentNode).toBeNull();
    expect(host.innerHTML).toBe(hostMarkup);
    expectSettled(renderer);
    render({ text: 'after destroy', title: 'restored' });
    work.drain();
    expectContent(first, 'after destroy', 'restored');
    expect(container.querySelector(contentSelector)).toBeNull();
    expectSettled(renderer);
  });

  it('keeps portal content and Text identity across repeated completed renders', () => {
    const { renderer, first, render } = fixture();
    render();
    const [content] = expectContent(first, 'one', 'first');
    const text = content.firstChild;
    for (let i = 0; i < 20; i++) {
      render({ text: `render ${i}`, title: `title ${i}` });
      const [updated] = expectContent(first, `render ${i}`, `title ${i}`);
      expect(updated).toBe(content);
      expect(updated.firstChild).toBe(text);
      expectSettled(renderer);
    }
  });
});
