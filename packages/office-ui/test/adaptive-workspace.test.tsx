// @vitest-environment jsdom
import { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AdaptiveWorkspace, WorkspaceSidePanel } from '../src/adaptive-workspace';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

it('keeps the default compact panel triggers available', () => {
  act(() => root.render(<AdaptiveWorkspace><WorkspaceSidePanel side="inspector" width={280}><input /></WorkspaceSidePanel></AdaptiveWorkspace>));
  const trigger = host.querySelector<HTMLButtonElement>('[data-workspace-toggle="inspector"]')!;
  act(() => trigger.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('[data-workspace-panel="inspector"]')?.id).toBe(trigger.getAttribute('aria-controls'));
});

it('uses the external header opener and preserves panel drafts during utility clicks and layered Escape', () => {
  function Example() {
    const [active, setActive] = useState<'navigation' | 'inspector' | null>(null);
    const opener = useRef<HTMLButtonElement>(null);
    return <><button ref={opener} aria-controls="answers" aria-expanded={active === 'inspector'} onClick={() => setActive(active ? null : 'inspector')}>Properties</button>
      <AdaptiveWorkspace showPanelControls={false} activePanel={active} onActivePanelChange={setActive}
        panelIds={{ inspector: 'answers' }} restorePanelFocus={() => opener.current?.focus()}>
        <div data-workspace-main><button data-workspace-utility>Zoom</button><span>Document</span></div>
        <WorkspaceSidePanel side="inspector" width={280}><input defaultValue="original" />
          <button onKeyDown={event => { if (event.key === 'Escape') event.preventDefault(); }}>Owned popup</button>
        </WorkspaceSidePanel>
      </AdaptiveWorkspace></>;
  }
  act(() => root.render(<Example />));
  const opener = host.querySelector('button')!;
  expect(host.querySelector('.office-workspace-panel-controls')).toBeNull();
  act(() => opener.click());
  const field = host.querySelector('input')!; field.value = 'recoverable draft';
  act(() => host.querySelector('[data-workspace-utility]')!.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(opener.getAttribute('aria-expanded')).toBe('true');
  const popup = host.querySelector('#answers button')!;
  act(() => popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(opener.getAttribute('aria-expanded')).toBe('true');
  act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true })));
  expect(opener.getAttribute('aria-expanded')).toBe('true');
  act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(opener); expect(opener.getAttribute('aria-expanded')).toBe('false');
  act(() => opener.click()); expect(field.value).toBe('recoverable draft');
  act(() => host.querySelector('[data-workspace-main] span')!.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(opener.getAttribute('aria-expanded')).toBe('false'); expect(field.value).toBe('recoverable draft');
});

it('restores a wide header trigger only after its independently controlled panel is hidden', () => {
  function Example() {
    const [shown, setShown] = useState(true), opener = useRef<HTMLButtonElement>(null);
    return <><button ref={opener} onClick={() => setShown(value => !value)}>Properties</button>
      <AdaptiveWorkspace enabled={false} showPanelControls={false} restorePanelFocus={() => opener.current?.focus()}>
        <WorkspaceSidePanel side="inspector" width={280} hidden={!shown}><input defaultValue="draft" /></WorkspaceSidePanel>
      </AdaptiveWorkspace></>;
  }
  act(() => root.render(<Example />));
  const field = host.querySelector('input')!, opener = host.querySelector('button')!;
  field.focus(); field.value = 'pending';
  act(() => opener.click()); expect(document.activeElement).toBe(opener);
  expect(host.querySelector('[data-workspace-panel]')?.hasAttribute('hidden')).toBe(true);
  act(() => opener.click()); expect(field.value).toBe('pending');
});
