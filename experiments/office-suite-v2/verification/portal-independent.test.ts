import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, element, getGlobalRegistry, portal } from '@barocss/dsl';
import { DOMRenderer } from '../../../packages/renderer-dom/src/dom-renderer';
import { FiberScheduler } from '../../../packages/renderer-dom/src/reconcile/fiber/fiber-scheduler';

const renderers: DOMRenderer[] = [];
const leaf = '.v526-portal-content';

function fixture(portalId = 'v526-portal') {
  define('v526-document', (_props, model) => element('main', {}, model.show ? [
    portal(() => model.target as HTMLElement, element('article', {
      className: 'v526-portal-content', title: String(model.title),
    }, [String(model.text), element('strong', {}, [String(model.strong)])]), String(model.portalId)),
  ] : []));
  const renderer = new DOMRenderer(getGlobalRegistry());
  renderers.push(renderer);
  const container = document.createElement('section');
  const first = document.createElement('aside');
  const second = document.createElement('aside');
  const foreign = document.createElement('i');
  foreign.textContent = 'FOREIGN';
  first.append(foreign);
  document.body.append(container, first, second);
  const model = { sid: `v526-document-${portalId}`, stype: 'v526-document',
    portalId, target: first, show: true, text: 'first', strong: 'nested', title: 'title-0' };
  const host = () => document.querySelector(`[data-bc-sid="${portalId}"]`);
  const render = (onComplete?: () => void) => renderer.render(container, { ...model }, [], undefined, undefined,
    onComplete ? { onComplete } : undefined);
  return { renderer, container, first, second, foreign, model, host, render };
}

// Control when the actual scheduler yields. Keep its native reconciliation and
// commit functions intact. Every queued callback is later delivered, even stale ones.
function deferred() {
  const callbacks: Array<() => void> = [];
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  const schedule = FiberScheduler.prototype.scheduleWork;
  vi.spyOn(FiberScheduler.prototype, 'scheduleWork').mockImplementation(function (this: FiberScheduler, root, priority) {
    this.setSyncMode(false);
    schedule.call(this, root, priority);
  });
  const clock = vi.spyOn(performance, 'now');
  function yieldBeforeWork() {
    let tick = 0;
    clock.mockImplementation(() => (tick += 10));
  }
  yieldBeforeWork();
  return {
    callbacks, clock, yieldBeforeWork,
    one() { clock.mockReturnValue(0); callbacks.shift()?.(); },
    drain() {
      let turns = 0;
      while (callbacks.length) {
        expect(++turns, 'bounded actual scheduler drain').toBeLessThan(128);
        clock.mockReturnValue(0);
        callbacks.shift()!();
      }
    },
  };
}

afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('#526 independent portal lifecycle', () => {
  it('updates text and attributes forty times with one host/content and stable nested DOM', () => {
    const f = fixture();
    const complete = vi.fn();
    f.render(complete);
    const host = f.host();
    const content = host?.querySelector(leaf);
    const strong = content?.querySelector('strong');
    const primitiveText = content?.firstChild;
    const nestedText = strong?.firstChild;
    expect(content).not.toBeNull();
    for (let i = 1; i <= 40; i++) {
      Object.assign(f.model, { text: `value-${i}`, strong: `nested-${i}`, title: `title-${i}` });
      f.render(complete);
      expect(f.host()).toBe(host);
      expect(host?.querySelectorAll(leaf).length).toBe(1);
      expect(host?.querySelector(leaf)).toBe(content);
      expect(content?.querySelector('strong')).toBe(strong);
      expect(content?.firstChild).toBe(primitiveText);
      expect(strong?.firstChild).toBe(nestedText);
      expect(content?.getAttribute('title')).toBe(`title-${i}`);
      expect(content?.textContent).toBe(`value-${i}nested-${i}`);
      expect(f.container.querySelector(leaf)).toBeNull();
      expect(f.first.firstChild).toBe(f.foreign);
    }
    expect(complete).toHaveBeenCalledTimes(41);
  });

  it('moves the same owned host and content between targets without touching foreign nodes', () => {
    const f = fixture(); f.render();
    const host = f.host(), content = host?.querySelector(leaf);
    for (const target of [f.second, f.first, f.second]) {
      f.model.target = target; f.render();
      expect(f.host()).toBe(host);
      expect(host?.parentNode).toBe(target);
      expect(host?.querySelector(leaf)).toBe(content);
      expect(document.querySelectorAll('[data-bc-sid="v526-portal"]').length).toBe(1);
      expect(f.foreign.parentNode).toBe(f.first);
      expect(f.container.querySelector(leaf)).toBeNull();
    }
  });

  it('removes only owned portal DOM and remains safe across repeated disposal', () => {
    const f = fixture(); f.render(); const host = f.host();
    expect(host).not.toBeNull();
    f.model.show = false; f.render();
    expect(host?.parentNode).toBeNull(); expect(f.host()).toBeNull();
    expect(f.first.childNodes.length).toBe(1); expect(f.first.firstChild).toBe(f.foreign);
    f.model.show = true; f.render();
    expect(f.host()).not.toBeNull();
    f.renderer.destroy(); f.renderer.destroy();
    expect(f.host()).toBeNull(); expect(f.foreign.parentNode).toBe(f.first);
  });

  it('disposing one renderer cannot remove another renderer portal in the same target', () => {
    const a = fixture('v526-owner-a'), b = fixture('v526-owner-b');
    b.model.target = a.first; a.render(); b.render();
    const other = b.host(), content = other?.querySelector(leaf);
    a.renderer.destroy();
    expect(a.host()).toBeNull(); expect(b.host()).toBe(other);
    expect(other?.querySelector(leaf)).toBe(content);
    expect(content?.textContent).toBe('firstnested');
    expect(a.foreign.parentNode).toBe(a.first);
  });

  it('superseded queued portal work cannot publish obsolete content or completion', () => {
    const f = fixture(); f.render(); const host = f.host(), content = host?.querySelector(leaf);
    const work = deferred(), obsolete = vi.fn(), newest = vi.fn();
    f.model.text = 'obsolete'; f.render(obsolete);
    f.model.text = 'newest'; f.render(newest);
    expect(work.callbacks.length).toBeGreaterThan(0); work.drain();
    expect(obsolete).not.toHaveBeenCalled(); expect(newest).toHaveBeenCalledTimes(1);
    expect(f.host()).toBe(host); expect(host?.querySelector(leaf)).toBe(content);
    expect(content?.textContent).toBe('newestnested');
    expect(host?.querySelectorAll(leaf).length).toBe(1);
  });

  it('cancels partially progressed portal work before a newer removal completes', () => {
    const f = fixture(); f.render();
    const work = deferred(), obsolete = vi.fn(), newest = vi.fn();
    work.clock.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValue(10);
    f.model.target = f.second; f.model.text = 'partial'; f.render(obsolete);
    expect(obsolete).not.toHaveBeenCalled(); expect(work.callbacks.length).toBeGreaterThan(0);
    work.yieldBeforeWork(); f.model.show = false; f.render(newest); work.drain();
    expect(obsolete).not.toHaveBeenCalled(); expect(newest).toHaveBeenCalledTimes(1);
    expect(f.host()).toBeNull(); expect(f.second.querySelector(leaf)).toBeNull();
    expect(f.first.firstChild).toBe(f.foreign);
    const reedited = vi.fn();
    Object.assign(f.model, { show: true, target: f.first, text: 're-edited-after-cancel' });
    f.render(reedited); work.drain();
    expect(reedited).toHaveBeenCalledTimes(1);
    expect(f.host()?.querySelector(leaf)?.textContent).toBe('re-edited-after-cancelnested');
    expect(f.second.querySelector(leaf)).toBeNull();
  });

  it('a completion callback can own the next async target move without stale cleanup', () => {
    const f = fixture(); const work = deferred();
    const completed: string[] = [];
    f.render(() => {
      completed.push('first');
      work.yieldBeforeWork(); f.model.target = f.second; f.model.text = 'reentrant';
      f.render(() => completed.push('second'));
    });
    work.one(); expect(completed).toEqual(['first']);
    expect(work.callbacks.length).toBeGreaterThan(0); work.drain();
    expect(completed).toEqual(['first', 'second']);
    expect(f.host()?.parentNode).toBe(f.second);
    expect(f.host()?.querySelector(leaf)?.textContent).toBe('reentrantnested');
    expect(f.first.firstChild).toBe(f.foreign);
    expect(f.first.querySelector(leaf)).toBeNull();
  });

  it('stale callbacks after destroy cannot mutate a new render owned by the reused renderer', () => {
    const f = fixture(); const work = deferred(), obsolete = vi.fn(), newest = vi.fn();
    f.render(obsolete); f.renderer.destroy(); f.renderer.destroy();
    f.model.target = f.second; f.model.text = 'after-destroy'; f.render(newest);
    work.drain();
    expect(obsolete).not.toHaveBeenCalled(); expect(newest).toHaveBeenCalledTimes(1);
    expect(f.host()?.parentNode).toBe(f.second);
    expect(f.host()?.querySelector(leaf)?.textContent).toBe('after-destroynested');
    expect(f.first.firstChild).toBe(f.foreign);
    f.renderer.destroy(); expect(f.host()).toBeNull();
  });
});
