import { afterEach, describe, expect, it, vi } from 'vitest';
import { data, define, defineDecorator, defineMark, element, getGlobalRegistry, portal, slot } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';
import type { FiberNode } from '../../src/reconcile/fiber/types';
import { FiberScheduler } from '../../src/reconcile/fiber/fiber-scheduler';

const renderers: DOMRenderer[] = [];

function fixture() {
  const registry = getGlobalRegistry();
  define('m0-document', element('div', {}, [slot('content')]));
  define('m0-paragraph', element('p', {}, [slot('content')]));
  define('m0-text', element('span', {}, [data('text')]));
  const renderer = new DOMRenderer(registry);
  renderers.push(renderer);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const model = {
    sid: 'm0-doc', stype: 'm0-document',
    content: [{ sid: 'm0-p', stype: 'm0-paragraph',
      content: [{ sid: 'm0-t', stype: 'm0-text', text: 'same document' }] }]
  };
  return { renderer, container, model };
}

function currentRoot(renderer: DOMRenderer) {
  return renderer['reconciler']['rootFiber'];
}

function currentFibers(root: FiberNode | null): FiberNode[] {
  const result: FiberNode[] = [];
  const pending = root ? [root] : [];
  while (pending.length) {
    const fiber = pending.pop()!;
    result.push(fiber);
    if (fiber.child) pending.push(fiber.child);
    if (fiber.sibling) pending.push(fiber.sibling);
  }
  return result;
}

// Follow actual enumerable data edges, including VNode/context records and all
// Fiber links. DOM internals and service instances are outside the Fiber graph.
function reachable(root: FiberNode | null, generations: WeakMap<object, number>) {
  const seen = new Set<object>();
  const fibers = new Set<object>();
  const history = new Set<number>();
  const pending: unknown[] = [root];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value) || value instanceof Node) continue;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value) &&
      !(value instanceof Map) && !(value instanceof Set)) continue;
    seen.add(value);
    if ('alternate' in value && 'parentFiber' in value && 'vnode' in value) {
      fibers.add(value);
      const generation = generations.get(value);
      if (generation !== undefined) history.add(generation);
    }
    if (value instanceof Map) pending.push(...value.keys(), ...value.values());
    else if (value instanceof Set) pending.push(...value.values());
    else pending.push(...Object.values(value));
  }
  return { fibers: fibers.size, generations: history.size, objects: seen.size };
}

function expectReleasedHistory(renderer: DOMRenderer) {
  expect(renderer['reconciler']['activeScheduler']).toBeNull();
  for (const fiber of currentFibers(currentRoot(renderer))) {
    expect(fiber.alternate).toBeNull();
    expect(fiber.prevVNode).toBeUndefined();
  }
}

// Run the real scheduler in async mode, yielding before work until explicitly
// drained. No scheduler/renderer implementation is replaced by a fake graph.
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
  return {
    callbacks,
    schedulers,
    drain() {
      clock.mockReturnValue(0);
      let turns = 0;
      while (callbacks.length) {
        expect(++turns).toBeLessThan(100);
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

describe('M0 committed Fiber retention', () => {
  it('bounds reachable generations and objects after actual same-document completions', () => {
    const { renderer, container, model } = fixture();
    const generations = new WeakMap<object, number>();
    const samples: ReturnType<typeof reachable>[] = [];
    let nodes: Node[] = [];
    let completed = 0;
    for (let generation = 0; generation < 40; generation++) {
      renderer.render(container, model, [], undefined, undefined, { onComplete: () => completed++ });
      const root = currentRoot(renderer);
      for (const fiber of currentFibers(root)) generations.set(fiber, generation);
      samples.push(reachable(root, generations));
      const actual: Node[] = [];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_ALL);
      while (walker.nextNode()) actual.push(walker.currentNode);
      if (generation === 0) nodes = actual;
      else {
        expect(actual.length).toBe(nodes.length);
        actual.forEach((node, index) => expect(node).toBe(nodes[index]));
      }
      expect(container.textContent).toBe('same document');
    }
    expect(completed).toBe(40);
    console.info('M0 retention samples', JSON.stringify([samples[0], samples[9], samples[39]]));
    expect(samples[39].generations).toBeLessThanOrEqual(2);
    expect(samples[39].fibers).toBeLessThanOrEqual(samples[1].fibers);
    expect(samples[39].objects).toBeLessThanOrEqual(samples[1].objects);
    expectReleasedHistory(renderer);
  });

  it('preserves keyed nodes through insert, move, delete and type replacement', () => {
    const { renderer, container, model } = fixture();
    define('m0-heading', element('h2', {}, [slot('content')]));
    const paragraph = (sid: string, text: string) => ({
      sid, stype: 'm0-paragraph', content: [{ sid: `${sid}-t`, stype: 'm0-text', text }]
    });
    model.content = [paragraph('a', 'A'), paragraph('b', 'B')];
    renderer.render(container, model);
    const a = container.querySelector('[data-bc-sid="a"]');
    const b = container.querySelector('[data-bc-sid="b"]');
    const aText = container.querySelector('[data-bc-sid="a-t"]');
    model.content = [model.content[1], paragraph('c', 'C'), model.content[0]];
    renderer.render(container, model);
    expect(container.textContent).toBe('BCA');
    expect(container.querySelector('[data-bc-sid="a"]')).toBe(a);
    expect(container.querySelector('[data-bc-sid="b"]')).toBe(b);
    model.content = [model.content[2], model.content[1]];
    renderer.render(container, model);
    expect(container.textContent).toBe('AC');
    expect(b?.parentNode).toBeNull();
    model.content[0] = { ...model.content[0], stype: 'm0-heading' };
    renderer.render(container, model);
    const heading = container.querySelector('[data-bc-sid="a"]');
    expect(heading?.tagName).toBe('H2');
    expect(heading).not.toBe(a);
    expect(container.querySelector('[data-bc-sid="a-t"]')).not.toBe(aText);
    expect(a?.parentNode).toBeNull();
    expect(container.textContent).toBe('AC');
    renderer.render(container, model);
    expect(container.querySelector('[data-bc-sid="a"]')).toBe(heading);
    expectReleasedHistory(renderer);
  });

  it('keeps nested marks, decorator text and DOM identity across completed renders', () => {
    const { renderer, container, model } = fixture();
    defineMark('m0-bold', element('strong', {}, [data('text')]));
    defineMark('m0-italic', element('em', {}, [data('text')]));
    defineDecorator('m0-chip', element('i', {}, ['CHIP']));
    const marked = { ...model.content[0].content[0], marks: [
      { stype: 'm0-bold', range: [0, 4] }, { stype: 'm0-italic', range: [0, 4] }
    ] };
    model.content[0].content = [marked];
    const decorators = [{ sid: 'm0-chip-1', stype: 'm0-chip', category: 'inline' as const,
      target: { sid: 'm0-t', startOffset: 0, endOffset: 4 }, position: 'before' as const }];
    renderer.render(container, model, decorators);
    const mark = container.querySelector('strong');
    const decorator = container.querySelector('[data-decorator-sid="m0-chip-1"]');
    expect(mark).not.toBeNull();
    expect(container.querySelector('strong em, em strong')).not.toBeNull();
    expect(decorator?.textContent).toBe('CHIP');
    const text = container.textContent;
    for (let i = 0; i < 12; i++) renderer.render(container, model, decorators);
    expect(container.textContent).toBe(text);
    expect(container.querySelector('strong')).toBe(mark);
    expect(container.querySelector('[data-decorator-sid="m0-chip-1"]')).toBe(decorator);
    expectReleasedHistory(renderer);
  });

  it('releases owned portal hosts on removal and repeated disposal', () => {
    const { renderer, container } = fixture();
    const first = document.createElement('aside');
    const second = document.createElement('aside');
    const foreign = document.createElement('span');
    first.appendChild(foreign);
    document.body.append(first, second);
    let target = first;
    define('m0-portal', (_props, model) => element('div', {}, model.show ? [
      portal(() => target, element('p', { className: 'm0-portal-content' }, []), 'm0-portal-id')
    ] : []));
    const model = { sid: 'm0-portal-doc', stype: 'm0-portal', show: true };
    renderer.render(container, model);
    const host = first.querySelector('[data-bc-sid="m0-portal-id"]');
    expect(host).not.toBeNull();
    expect(host?.querySelector('.m0-portal-content')).not.toBeNull();
    renderer.render(container, { ...model, show: false });
    expect(host?.parentNode).toBeNull();
    expect(first.firstChild).toBe(foreign);
    target = second;
    renderer.render(container, model);
    expect(first.querySelector('[data-bc-sid="m0-portal-id"]')).toBeNull();
    expect(second.querySelector('[data-bc-sid="m0-portal-id"]')).not.toBeNull();
    renderer.render(container, { ...model, show: false });
    expect(second.childNodes.length).toBe(0);
    renderer.render(container, model);
    renderer.destroy();
    renderer.destroy();
    expect(second.childNodes.length).toBe(0);
    expect(first.firstChild).toBe(foreign);
    expect(currentRoot(renderer)).toBeNull();
    expect(renderer['reconciler']['activeScheduler']).toBeNull();
    expect(renderer.getVNodeSnapshotBySid('m0-portal-doc')).toBeUndefined();
  });

  it('publishes and releases a completed tree before callback reentrancy', () => {
    const { renderer, container, model } = fixture();
    const completed: string[] = [];
    let latestRoot: FiberNode | null = null;
    renderer.render(container, model, [], undefined, undefined, { onComplete: () => {
      expectReleasedHistory(renderer);
      completed.push('first');
      model.content[0].content[0].text = 'callback render';
      renderer.render(container, model, [], undefined, undefined, { onComplete: () => {
        completed.push('second');
        expectReleasedHistory(renderer);
        latestRoot = currentRoot(renderer);
      } });
    } });
    expect(completed).toEqual(['first', 'second']);
    expect(container.textContent).toBe('callback render');
    expect(currentRoot(renderer)).toBe(latestRoot);
    expectReleasedHistory(renderer);
  });

  it('cancels superseded async work and completes the newer document', () => {
    const { renderer, container, model } = fixture();
    renderer.render(container, model);
    const text = container.querySelector('[data-bc-sid="m0-t"]');
    const work = deferredWork();
    const obsolete = vi.fn();
    const completed = vi.fn();
    model.content[0].content[0].text = 'obsolete';
    renderer.render(container, model, [], undefined, undefined, { onComplete: obsolete });
    model.content[0].content[0].text = 'newest';
    renderer.render(container, model, [], undefined, undefined, { onComplete: completed });
    expect(work.callbacks.length).toBe(2);
    work.drain();
    expect(obsolete).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('newest');
    expect(container.querySelector('[data-bc-sid="m0-t"]')).toBe(text);
    expectReleasedHistory(renderer);
  });

  it('keeps a new async scheduler started from a completion callback', () => {
    const { renderer, container, model } = fixture();
    const work = deferredWork();
    const completed = vi.fn();
    renderer.render(container, model, [], undefined, undefined, { onComplete: () => {
      expectReleasedHistory(renderer);
      let now = 0;
      vi.mocked(performance.now).mockImplementation(() => (now += 10));
      model.content[0].content[0].text = 'reentrant async';
      renderer.render(container, model, [], undefined, undefined, { onComplete: completed });
    } });
    vi.mocked(performance.now).mockReturnValue(0);
    work.callbacks.shift()!();
    expect(renderer['reconciler']['activeScheduler']).not.toBeNull();
    work.drain();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('reentrant async');
    expectReleasedHistory(renderer);
  });

  it('supersedes work after some actual Fiber units have been rendered', () => {
    const { renderer, container, model } = fixture();
    renderer.render(container, model);
    const paragraph = container.querySelector('[data-bc-sid="m0-p"]');
    const work = deferredWork();
    const clock = vi.mocked(performance.now);
    clock.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValue(10);
    const obsolete = vi.fn();
    model.content[0].content[0].text = 'partial';
    renderer.render(container, model, [], undefined, undefined, { onComplete: obsolete });
    expect(work.callbacks.length).toBe(1);
    expect(obsolete).not.toHaveBeenCalled();
    // The active scheduler has advanced into the actual current child tree.
    expect(renderer['reconciler']['activeScheduler']).not.toBeNull();
    expect(work.schedulers[0]['nextUnitOfWork']?.vnode.sid).toBe('m0-t');
    expect(work.schedulers[0]['nextUnitOfWork']?.parentFiber?.domElement).toBe(paragraph);
    let now = 0;
    clock.mockImplementation(() => (now += 10));
    model.content[0].content[0].text = 'after partial';
    const completed = vi.fn();
    renderer.render(container, model, [], undefined, undefined, { onComplete: completed });
    work.drain();
    expect(obsolete).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('after partial');
    expect(container.querySelector('[data-bc-sid="m0-p"]')).toBe(paragraph);
    expectReleasedHistory(renderer);
  });

  it('cancels queued work on idempotent destroy and permits a correct later render', () => {
    const { renderer, container, model } = fixture();
    const work = deferredWork();
    const obsolete = vi.fn();
    renderer.render(container, model, [], undefined, undefined, { onComplete: obsolete });
    renderer.destroy();
    renderer.destroy();
    expect(currentRoot(renderer)).toBeNull();
    expect(renderer['reconciler']['activeScheduler']).toBeNull();
    work.drain();
    expect(obsolete).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
    const completed = vi.fn();
    renderer.render(container, model, [], undefined, undefined, { onComplete: completed });
    expect(completed).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('same document');
    expectReleasedHistory(renderer);
  });
});
