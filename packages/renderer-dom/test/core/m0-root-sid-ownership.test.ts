import { afterEach, describe, expect, it, vi } from 'vitest';
import { data, define, element, external, getGlobalRegistry, portal, slot } from '@barocss/dsl';
import type { ModelData } from '@barocss/dsl';
import { DOMRenderer } from '../../src/dom-renderer';
import { FiberScheduler } from '../../src/reconcile/fiber/fiber-scheduler';

const renderers: DOMRenderer[] = [];

function fixture() {
  define('m0-root-owner', element('div', { className: 'document' }, [slot('content')]));
  define('m0-root-text', element('span', {}, [data('text')]));
  const renderer = new DOMRenderer(getGlobalRegistry());
  renderers.push(renderer);
  const container = document.createElement('main');
  document.body.appendChild(container);
  const model = (sid: string, text: string) => ({ sid, stype: 'm0-root-owner', content: [
    { sid: 'shared-text', stype: 'm0-root-text', text }
  ] });
  return { renderer, container, model };
}

function deferredWork() {
  const callbacks: Array<() => void> = [];
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => callbacks.push(callback));
  const original = FiberScheduler.prototype.scheduleWork;
  vi.spyOn(FiberScheduler.prototype, 'scheduleWork').mockImplementation(function (this: FiberScheduler, root, priority) {
    this.setSyncMode(false);
    original.call(this, root, priority);
  });
  let now = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => (now += 10));
  return { callbacks, drain() {
    clock.mockReturnValue(0);
    let turns = 0;
    while (callbacks.length) {
      expect(++turns).toBeLessThan(100);
      callbacks.shift()!();
    }
  } };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const renderer of renderers.splice(0)) renderer.destroy();
  document.body.replaceChildren();
});

describe('M0 model root SID ownership', () => {
  it('replaces the document owner when the same tag and stype acquire a different root SID', () => {
    const { renderer, container, model } = fixture();
    renderer.render(container, model('document-A', 'A'));
    const previous = container.firstElementChild;
    const previousText = previous?.querySelector('span');
    renderer.render(container, model('document-B', 'B'));
    console.info('M0 root ownership', JSON.stringify({
      expected: 'document-B', actual: container.firstElementChild?.getAttribute('data-bc-sid'),
      content: container.textContent, reusedRoot: container.firstElementChild === previous,
      reusedChild: container.querySelector('span') === previousText
    }));
    expect(container.textContent).toBe('B');
    expect(container.firstElementChild?.getAttribute('data-bc-sid')).toBe('document-B');
    expect(container.firstElementChild).not.toBe(previous);
    expect(container.querySelector('span')).not.toBe(previousText);
    expect(previous?.isConnected).toBe(false);
  });

  it('preserves actual DOM and Text identity for ordinary same-root edits', () => {
    const { renderer, container, model } = fixture();
    renderer.render(container, model('document-A', 'A'));
    const root = container.firstElementChild;
    const span = container.querySelector('span');
    const text = span?.firstChild;
    renderer.render(container, model('document-A', 'updated'));
    expect(container.textContent).toBe('updated');
    expect(container.firstElementChild).toBe(root);
    expect(container.querySelector('span')).toBe(span);
    expect(span?.firstChild).toBe(text);
  });

  it('releases old component instances, handlers and native bindings before mounting overlapping child IDs', () => {
    const { container, model } = fixture();
    const nodes = new Map<string, ModelData>();
    const renderer = new DOMRenderer(getGlobalRegistry(), { dataStore: { getNode: id => nodes.get(id) } });
    renderers.push(renderer);
    const lifecycle: string[] = [];
    const clicks: string[] = [];
    const handlers = new WeakMap<Element, () => void>();
    define('m0-root-control', external({
      managesDOM: true,
      mount: (props, parent) => {
        const value = String(props.text);
        const button = parent.ownerDocument.createElement('button');
        button.textContent = value;
        const handler = () => clicks.push(value);
        button.addEventListener('click', handler);
        handlers.set(button, handler);
        lifecycle.push(`mount:${value}`);
        return button;
      },
      unmount: instance => {
        expect(instance.element).toBeInstanceOf(Element);
        const element = instance.element!;
        lifecycle.push(`unmount:${element.textContent}`);
        element.removeEventListener('click', handlers.get(element)!);
      }
    }));
    const draw = (sid: string, text: string) => {
      const document = { ...model(sid, text), content: [
        { sid: 'shared-control', stype: 'm0-root-control', text }
      ] };
      nodes.set(sid, document);
      nodes.set('shared-control', document.content[0]);
      renderer.render(container, document);
      return document;
    };
    draw('document-A', 'A');
    const oldButton = container.querySelector('button')!;
    const oldInstance = renderer.getInstance('shared-control');
    oldButton.click();
    const next = draw('document-B', 'B');
    const newButton = container.querySelector('button')!;
    expect(lifecycle).toEqual(['mount:A', 'unmount:A', 'mount:B']);
    expect(newButton).not.toBe(oldButton);
    expect(renderer.getInstance('document-A')).toBeUndefined();
    expect(renderer.getInstance('document-B')?.getModel()).toBe(next);
    expect(renderer.getInstance('shared-control')).not.toBe(oldInstance);
    expect(renderer.getInstance('shared-control')?.getModel()).toBe(next.content[0]);
    oldButton.click();
    newButton.click();
    expect(clicks).toEqual(['A', 'B']);
  });

  it('releases a self-drawing root before adopting the new root element', () => {
    const { renderer, container } = fixture();
    const seen: string[] = [];
    define('m0-owned-root', external({
      managesDOM: true,
      mount: (props, parent) => {
        seen.push(`mount:${props.text}`);
        const root = parent.ownerDocument.createElement('article');
        root.textContent = String(props.text);
        return root;
      },
      unmount: instance => { seen.push(`unmount:${instance.element?.textContent}`); }
    }));
    renderer.render(container, { sid: 'document-A', stype: 'm0-owned-root', text: 'A' });
    const old = container.firstElementChild;
    renderer.render(container, { sid: 'document-B', stype: 'm0-owned-root', text: 'B' });
    expect(seen).toEqual(['mount:A', 'unmount:A', 'mount:B']);
    expect(container.firstElementChild?.tagName).toBe('ARTICLE');
    expect(container.firstElementChild?.getAttribute('data-bc-sid')).toBe('document-B');
    expect(container.textContent).toBe('B');
    expect(container.firstElementChild).not.toBe(old);
  });

  it('replaces portal ownership with the root and leaves foreign targets intact', () => {
    const { renderer, container } = fixture();
    const target = document.createElement('aside');
    const foreign = document.createElement('b');
    target.appendChild(foreign);
    document.body.appendChild(target);
    define('m0-root-portal', (_props, model) => element('div', {}, [
      element('i', { className: 'source' }, [String(model.text)]),
      portal(() => target, element('p', {}, [String(model.text)]), 'shared-portal')
    ]));
    const draw = (sid: string, text: string) => renderer.render(container, { sid, stype: 'm0-root-portal', text });
    draw('document-A', 'A');
    const previousSource = container.firstElementChild;
    const previousHost = target.querySelector('[data-bc-sid="shared-portal"]');
    draw('document-B', 'B');
    expect(container.textContent).toBe('B');
    expect(target.textContent).toBe('B');
    expect(container.firstElementChild).not.toBe(previousSource);
    expect(target.querySelector('[data-bc-sid="shared-portal"]')).not.toBe(previousHost);
    expect(previousHost?.parentNode).toBeNull();
    expect(target.firstChild).toBe(foreign);
    renderer.destroy();
    expect(target.childNodes).toHaveLength(1);
    expect(target.firstChild).toBe(foreign);
  });

  it('keeps committed ownership until an asynchronous replacement completes and cancels stale roots', () => {
    const { renderer, container, model } = fixture();
    renderer.render(container, model('document-A', 'A'));
    const previous = container.firstElementChild;
    const work = deferredWork();
    const completed: string[] = [];
    renderer.render(container, model('document-B', 'B'), [], undefined, undefined, { onComplete: () => completed.push('B') });
    expect(container.firstElementChild).toBe(previous);
    expect(container.textContent).toBe('A');
    renderer.render(container, model('document-C', 'C'), [], undefined, undefined, { onComplete: () => completed.push('C') });
    expect(container.firstElementChild).toBe(previous);
    work.drain();
    expect(completed).toEqual(['C']);
    expect(container.firstElementChild?.getAttribute('data-bc-sid')).toBe('document-C');
    expect(container.firstElementChild).not.toBe(previous);
    expect(container.textContent).toBe('C');
    expect(renderer['reconciler']['rootFiber']?.alternate).toBeNull();
    expect(renderer['reconciler']['activeScheduler']).toBeNull();
  });

  it.each(['mount', 'unmount'])('keeps the latest instance when an external %s hook requests another root', phase => {
    const { container } = fixture();
    const nodes = new Map<string, ModelData>();
    const renderer = new DOMRenderer(getGlobalRegistry(), { dataStore: { getNode: id => nodes.get(id) } });
    renderers.push(renderer);
    const lifecycle: string[] = [];
    const completed: string[] = [];
    const clicks: string[] = [];
    const handlers = new WeakMap<Element, () => void>();
    let requested = false;
    const draw = (letter: string) => {
      const model = { sid: `document-${letter}`, stype: 'm0-root-owner', content: [
        { sid: 'shared-control', stype: 'm0-reentrant-control', text: letter }
      ] };
      nodes.set(model.sid, model);
      nodes.set('shared-control', model.content[0]);
      renderer.render(container, model, [], undefined, undefined, { onComplete: () => completed.push(letter) });
    };
    const request = () => {
      if (requested) return;
      requested = true;
      draw('C');
    };
    define('m0-reentrant-control', external({
      managesDOM: true,
      mount: (props, parent) => {
        const button = parent.ownerDocument.createElement('button');
        button.textContent = String(props.text);
        const handler = () => clicks.push(String(props.text));
        handlers.set(button, handler);
        button.addEventListener('click', handler);
        lifecycle.push(`mount:${props.text}`);
        if (phase === 'mount' && props.text === 'B') request();
        return button;
      },
      unmount: instance => {
        expect(instance.element).toBeInstanceOf(Element);
        const element = instance.element!;
        const text = element.textContent;
        element.removeEventListener('click', handlers.get(element)!);
        lifecycle.push(`unmount:${text}`);
        if (phase === 'unmount' && text === 'A') request();
      }
    }));
    draw('A');
    const old = container.querySelector('button')!;
    draw('B');
    expect(container.textContent).toBe('C');
    expect(container.firstElementChild?.getAttribute('data-bc-sid')).toBe('document-C');
    expect(renderer.getInstance('shared-control')?.element).toBe(container.querySelector('button'));
    expect(renderer.getInstance('shared-control')?.element?.textContent).toBe('C');
    expect(renderer.getInstance('shared-control')?.getModel()).toBe(nodes.get('shared-control'));
    expect(renderer.getInstance('document-C')?.getModel()).toBe(nodes.get('document-C'));
    old.click();
    container.querySelector('button')!.click();
    expect(clicks).toEqual(['C']);
    expect(completed).toEqual(['A', 'C']);
    expect(lifecycle.filter(event => event === 'unmount:A')).toHaveLength(1);
  });

  it('retains only the latest lifecycle request after an actual asynchronous yield', () => {
    const { renderer, container } = fixture();
    const mounts: string[] = [];
    const unmounts: string[] = [];
    const completed: string[] = [];
    const draw = (letter: string) => renderer.render(container, {
      sid: `document-${letter}`, stype: 'm0-root-owner', content: [
        { sid: 'shared-control', stype: 'm0-async-control', text: letter }
      ]
    }, [], undefined, undefined, { onComplete: () => completed.push(letter) });
    define('m0-async-control', external({
      managesDOM: true,
      mount: (props, parent) => {
        const button = parent.ownerDocument.createElement('button');
        button.textContent = String(props.text);
        mounts.push(String(props.text));
        if (props.text === 'B') { draw('C'); draw('D'); }
        return button;
      },
      unmount: instance => { unmounts.push(instance.element?.textContent ?? 'missing'); }
    }));
    draw('A');
    const work = deferredWork();
    draw('B');
    expect(work.callbacks.length).toBeGreaterThan(0);
    expect(mounts).toEqual(['A']);
    expect(container.textContent).toBe('A');
    work.drain();
    expect(mounts).toEqual(['A', 'B', 'D']);
    expect(unmounts).toEqual(['A', 'B']);
    expect(completed).toEqual(['A', 'D']);
    expect(container.textContent).toBe('D');
    expect(renderer.getInstance('shared-control')?.element).toBe(container.querySelector('button'));
    expect(renderer['reconciler']['pendingReconcile']).toBeNull();
  });

  it('retires a pending lifecycle request when its component destroys the renderer', () => {
    const { renderer, container } = fixture();
    const mounts: string[] = [];
    const unmounts: string[] = [];
    const completed: string[] = [];
    const draw = (letter: string) => renderer.render(container, {
      sid: `document-${letter}`, stype: 'm0-root-owner', content: [
        { sid: 'shared-control', stype: 'm0-destroy-control', text: letter }
      ]
    }, [], undefined, undefined, { onComplete: () => completed.push(letter) });
    define('m0-destroy-control', external({
      managesDOM: true,
      mount: (props, parent) => {
        const button = parent.ownerDocument.createElement('button');
        button.textContent = String(props.text);
        mounts.push(String(props.text));
        if (props.text === 'B') { draw('C'); renderer.destroy(); }
        return button;
      },
      unmount: instance => { unmounts.push(instance.element?.textContent ?? 'missing'); }
    }));
    draw('A'); draw('B');
    expect(mounts).toEqual(['A', 'B']);
    expect(unmounts).toEqual(['A', 'B']);
    expect(completed).toEqual(['A']);
    expect(container.childNodes).toHaveLength(0);
    expect(renderer.getInstance('shared-control')).toBeUndefined();
    expect(renderer['reconciler']['rootFiber']).toBeNull();
    expect(renderer['reconciler']['pendingReconcile']).toBeNull();
    expect(renderer['reconciler']['committing']).toBe(false);
  });

  it('unlocks publication and drains the latest request when a completion callback throws', () => {
    const { renderer, container, model } = fixture();
    renderer.render(container, model('document-A', 'A'));
    const error = new Error('completion failure');
    expect(() => renderer.render(container, model('document-B', 'B'), [], undefined, undefined, {
      onComplete: () => { renderer.render(container, model('document-C', 'C')); throw error; }
    })).toThrow(error);
    expect(container.textContent).toBe('C');
    expect(container.firstElementChild?.getAttribute('data-bc-sid')).toBe('document-C');
    expect(renderer['reconciler']['committing']).toBe(false);
    expect(renderer['reconciler']['pendingReconcile']).toBeNull();
    renderer.render(container, model('document-D', 'D'));
    expect(container.textContent).toBe('D');
  });

  it('honors an explicit old Element target until the caller supplies its new source target', () => {
    const { renderer, container } = fixture();
    let target: HTMLElement | undefined;
    define('m0-explicit-source', (_props, model) => element('div', {}, [
      element('i', { className: 'source-target' }, []),
      ...(target ? [portal(() => target!, element('p', {}, [String(model.caption)]), 'explicit-portal')] : [])
    ]));
    const draw = (sid: string, caption: string) => renderer.render(container, { sid, stype: 'm0-explicit-source', caption });
    draw('document-A', 'A');
    target = container.querySelector<HTMLElement>('.source-target')!;
    draw('document-A', 'A');
    const oldTarget = target;
    const oldHost = target.firstElementChild;
    draw('document-B', 'B');
    const newTarget = container.querySelector<HTMLElement>('.source-target')!;
    // An explicit DOM reference is not a selector or a semantic counterpart map.
    expect(oldTarget.isConnected).toBe(false);
    expect(newTarget.childNodes).toHaveLength(0);
    expect(oldTarget.textContent).toBe('B');
    expect(oldTarget.firstElementChild).not.toBe(oldHost);
    expect(oldHost?.parentNode).toBeNull();
    target = newTarget;
    draw('document-B', 'B rebound');
    expect(newTarget.textContent).toBe('B rebound');
    expect(oldTarget.childNodes).toHaveLength(0);
    renderer.destroy();
    expect(newTarget.childNodes).toHaveLength(0);
  });

  it('does not let a superseded synchronous render release the latest root portals', () => {
    const { renderer, container } = fixture();
    const target = document.createElement('aside');
    document.body.appendChild(target);
    define('m0-preparation-reentry', (_props, model) => element('div', {}, [
      ...(model.caption === 'C' ? [portal(() => target, element('p', {}, ['C portal']), 'latest-portal')] : [])
    ]));
    const completed: string[] = [];
    const draw = (caption: string) => renderer.render(container, {
      sid: `document-${caption}`, stype: 'm0-preparation-reentry', caption
    }, [], undefined, undefined, { onComplete: () => completed.push(caption) });
    draw('A');
    let requested = false;
    const dom = renderer['domOperations'];
    const original = dom.createSimpleElement.bind(dom);
    vi.spyOn(dom, 'createSimpleElement').mockImplementation((...args) => {
      const element = original(...args);
      if (!requested) { requested = true; draw('C'); }
      return element;
    });
    draw('B');
    expect(completed).toEqual(['A', 'C']);
    expect(container.firstElementChild?.getAttribute('data-bc-sid')).toBe('document-C');
    expect(target.textContent).toBe('C portal');
    expect(target.querySelectorAll('[data-bc-sid="latest-portal"]')).toHaveLength(1);
    expect(renderer['reconciler']['portalHostsById'].size).toBe(1);
  });
});
