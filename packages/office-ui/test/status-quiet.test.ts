// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { StatusIndicator } from '../src/status';
it('keeps the saved announcement while making only an idle confirmed status quiet', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    const props = { quiet: true, tone: 'success', children: 'Saved' } as ComponentProps<typeof StatusIndicator>;
    act(() => root.render(createElement(StatusIndicator, props)));
    const status = host.querySelector('[role="status"]')!;
    expect(status.getAttribute('data-quiet')).toBe('true');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('Saved');
    expect(status.getAttribute('title')).toBe('Saved');
    for (const next of [{ tone: 'neutral', busy: true, children: 'Saving' }, { tone: 'danger', children: 'Save failed' }, { tone: 'warning', children: 'Conflict draft retained' }] as const) {
      act(() => root.render(createElement(StatusIndicator, { ...props, ...next })));
      expect(status.hasAttribute('data-quiet')).toBe(false);
      expect(status.textContent).toBe(next.children);
    }
  } finally { act(() => root.unmount()); host.remove(); }
});
