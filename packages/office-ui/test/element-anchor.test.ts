// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { observeElementAnchor, visibleElementRect } from '../src/element-anchor';

function box(element: HTMLElement, rect: DOMRect) {
  element.getBoundingClientRect = () => rect;
  element.getClientRects = () => [rect] as unknown as DOMRectList;
}
function fixture() {
  const scope = document.createElement('div'), target = document.createElement('span');
  scope.append(target); document.body.append(scope);
  box(scope, new DOMRect(40, 50, 300, 200)); box(target, new DOMRect(70, 80, 90, 30));
  return { scope, target };
}
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('keeps full bounds for partly visible objects and hides offscreen, hidden or detached objects', () => {
  const { target } = fixture();
  const partial = new DOMRect(-20, 80, 90, 30); box(target, partial);
  expect(visibleElementRect(target)).toBe(partial);
  box(target, new DOMRect(-100, 80, 90, 30)); expect(visibleElementRect(target)).toBeNull();
  box(target, partial); target.style.visibility = 'hidden'; expect(visibleElementRect(target)).toBeNull();
  target.style.visibility = ''; target.remove(); expect(visibleElementRect(target)).toBeNull();
});

it('uses the scaled client area of independently clipped ancestors', () => {
  const { scope, target } = fixture();
  scope.style.overflowY = 'auto';
  Object.defineProperties(scope, {
    offsetWidth: { value: 150 }, offsetHeight: { value: 100 },
    clientTop: { value: 5 }, clientLeft: { value: 5 }, clientWidth: { value: 140 }, clientHeight: { value: 90 }
  });
  // Scaled padding box is y=60..240; viewport visibility alone would accept all three.
  box(target, new DOMRect(70, 55, 90, 4)); expect(visibleElementRect(target)).toBeNull();
  const partial = new DOMRect(70, 55, 90, 10); box(target, partial); expect(visibleElementRect(target)).toBe(partial);
  box(target, new DOMRect(70, 241, 90, 30)); expect(visibleElementRect(target)).toBeNull();
});

it('uses the visual viewport when browser zoom narrows its visible area', () => {
  const { target } = fixture();
  vi.stubGlobal('visualViewport', { offsetLeft: 100, offsetTop: 100, width: 400, height: 300 });
  expect(visibleElementRect(target)).not.toBeNull();
  box(target, new DOMRect(70, 80, 20, 10)); expect(visibleElementRect(target)).toBeNull();
});

it('coalesces transform, replacement and scroll updates and cleans up observers', async () => {
  const { scope, target } = fixture();
  let latest = target;
  const frames = new Map<number, FrameRequestCallback>(); let next = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++next, callback); return next; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  const disconnect = vi.fn(), observe = vi.fn(), unobserve = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe = observe; unobserve = unobserve; disconnect = disconnect; });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); };
  const update = vi.fn();
  const stop = observeElementAnchor(scope, () => latest, update);
  expect(update).toHaveBeenCalledTimes(1);
  scope.style.transform = 'scale(2)';
  scope.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('resize'));
  await Promise.resolve(); expect(frames.size).toBe(1); flush();
  expect(update).toHaveBeenCalledTimes(2);
  latest = document.createElement('span'); box(latest, new DOMRect(200, 200, 50, 40)); scope.replaceChildren(latest);
  await Promise.resolve(); flush();
  expect(update.mock.lastCall?.[0]).toBe(latest); expect(unobserve).toHaveBeenCalledWith(target);
  window.dispatchEvent(new Event('resize')); stop(); flush();
  expect(disconnect).toHaveBeenCalledOnce(); expect(update).toHaveBeenCalledTimes(3);
});
