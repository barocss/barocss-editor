// @vitest-environment jsdom
import { act, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OfficePortalOwner } from '../src/portal-owner';
import { Dialog, Drawer } from '../src/dialog';
import { SidePeek } from '../src/side-peek';
import { FloatingSurface } from '../src/floating';
import { Menu } from '../src/menu';
import { SelectionReadout } from '../src/selection-readout';
import { TaskStatus, TaskStatusRegion } from '../src/task-status';
import { ChoiceSelect } from '../src/select';

let root: Root, host: HTMLDivElement;
const unmounted = vi.fn();
function Draft({ children }: { children?: ReactNode }) {
  useEffect(() => () => unmounted(), []);
  return <><textarea aria-label="Protected draft" defaultValue="Original input" />{children}</>;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: () => {} });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 120, 30));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); unmounted.mockClear();
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'); });

it('retains actual Drawer and two nested SidePeek drafts inside the hidden/inert owner', async () => {
  const render = (hidden: boolean) => <OfficePortalOwner className="native-owner" hidden={hidden} inert={hidden}>
    <Drawer open onOpenChange={() => {}} title="Native row"><Draft>
      <SidePeek open onOpenChange={() => {}} title="Nested row"><Draft>
        <SidePeek open onOpenChange={() => {}} title="Deepest row"><Draft /></SidePeek>
      </Draft></SidePeek>
    </Draft></Drawer>
  </OfficePortalOwner>;
  const leaked: Node[] = [];
  const observer = new MutationObserver(records => records.forEach(record => {
    if (record.target === document.body) leaked.push(...[...record.addedNodes].filter(node => node instanceof Element && node.matches('[role="dialog"], [data-side-peek], [data-office-dialog]')));
  }));
  observer.observe(document.body, { childList: true });
  await act(async () => root.render(render(false)));
  const owner = host.querySelector('.native-owner')!;
  const panels = [...document.querySelectorAll('[data-office-dialog],[data-side-peek]')];
  expect(panels).toHaveLength(3); expect(panels.every(panel => owner.contains(panel))).toBe(true);
  const drafts = [...document.querySelectorAll<HTMLTextAreaElement>('textarea')]; expect(drafts).toHaveLength(3);
  drafts.forEach((draft, index) => { draft.value += ` retained ${index}`; draft.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
  const values = drafts.map(draft => draft.value);
  await act(async () => root.render(render(true)));
  expect(host.querySelector('.native-owner')).toBe(owner);
  expect(owner.hasAttribute('hidden')).toBe(true); expect(owner.hasAttribute('inert')).toBe(true);
  expect([...document.querySelectorAll('textarea')]).toEqual(drafts);
  expect(drafts.map(draft => draft.value)).toEqual(values); expect(unmounted).not.toHaveBeenCalled();
  expect(panels.every(panel => panel.closest('[hidden][inert]') === owner)).toBe(true);
  await act(async () => root.render(render(false)));
  expect([...document.querySelectorAll('textarea')]).toEqual(drafts); expect(unmounted).not.toHaveBeenCalled();
  observer.disconnect(); expect(leaked).toEqual([]);
});

it('preserves standalone body portals when no owner is provided', async () => {
  await act(async () => root.render(<><Dialog open onOpenChange={() => {}} title="Standalone"><Draft /></Dialog>
    <SidePeek open onOpenChange={() => {}} title="Standalone item"><Draft /></SidePeek></>));
  const panels = [...document.querySelectorAll('[data-office-dialog],[data-side-peek]')];
  expect(panels).toHaveLength(2); expect(panels.every(panel => document.body.contains(panel) && !host.contains(panel))).toBe(true);
});

it('contains actual floating menu/readout/notices and retains their content during owner retirement', async () => {
  const render = (hidden: boolean) => <OfficePortalOwner className="native-owner" hidden={hidden} inert={hidden}>
    <FloatingSurface open at={new DOMRect(100, 100, 10, 10)}><Draft /></FloatingSurface>
    <Menu at={{ x: 100, y: 100 }} blocks={[{ id: 'private', items: [{ id: 'private-row', label: 'Private row' }] }]} label="Private menu" onPick={() => {}} onClose={() => {}} />
    <SelectionReadout at={{ x: 100, y: 100 }}>Private dimensions</SelectionReadout>
    <TaskStatusRegion label="Private task"><TaskStatus title="Private export" phase="error" description="Protected input retained" /></TaskStatusRegion>
  </OfficePortalOwner>;
  await act(async () => root.render(render(false)));
  const owner = host.querySelector('.native-owner')!;
  const surfaces = [...document.querySelectorAll('[data-floating-surface],[data-context-menu],.office-selection-readout,.office-task-region')];
  expect(surfaces).toHaveLength(4); expect(surfaces.every(surface => owner.contains(surface))).toBe(true);
  const input = owner.querySelector('textarea')!; input.value = 'Last protected input';
  await act(async () => root.render(render(true)));
  expect(surfaces.every(surface => surface.closest('[hidden][inert]') === owner)).toBe(true);
  expect(owner.querySelector('textarea')).toBe(input); expect(input.value).toBe('Last protected input'); expect(unmounted).not.toHaveBeenCalled();
});

it('keeps explicit native portal roots ahead of the optional owner fallback', async () => {
  const explicit = document.createElement('div'); document.body.append(explicit);
  await act(async () => root.render(<OfficePortalOwner className="native-owner">
    <FloatingSurface open at={new DOMRect(100, 100, 10, 10)} portalRoot={explicit}>Explicit native tools</FloatingSurface>
    <Menu at={{ x: 100, y: 100 }} blocks={[{ id: 'native', items: [{ id: 'native-row', label: 'Native row' }] }]} label="Native menu" onPick={() => {}} onClose={() => {}} portalContainer={{ current: explicit }} />
  </OfficePortalOwner>));
  expect(explicit.querySelector('[data-floating-surface]')).not.toBeNull(); expect(explicit.querySelector('[data-context-menu]')).not.toBeNull();
  expect(host.querySelector('.native-owner')!.querySelector('[data-floating-surface],[data-context-menu]')).toBeNull();
});

it('places an actual Radix choice popup inside the owner', async () => {
  await act(async () => root.render(<OfficePortalOwner className="native-owner"><ChoiceSelect value="one" ariaLabel="Native property" onChange={() => {}} options={[{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }]} /></OfficePortalOwner>));
  const trigger = host.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  await act(async () => { trigger.focus(); trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); });
  const popup = document.querySelector('[role="listbox"]'); expect(popup).not.toBeNull();
  expect(host.querySelector('.native-owner')!.contains(popup)).toBe(true);
});

it('cleans up only the retiring owner task stack while unrelated standalone notices remain', async () => {
  const render = (owned: boolean) => <>
    <TaskStatusRegion label="Standalone task"><TaskStatus title="Other host export" phase="running" /></TaskStatusRegion>
    {owned && <OfficePortalOwner className="native-owner"><TaskStatusRegion label="Owned task"><TaskStatus title="Private host export" phase="error" /></TaskStatusRegion></OfficePortalOwner>}
  </>;
  await act(async () => root.render(render(true)));
  const standalone = [...document.querySelectorAll('.office-task-region')].find(element => !host.contains(element))!;
  expect(document.querySelectorAll('.office-task-region')).toHaveLength(2);
  await act(async () => root.render(render(false)));
  expect(document.querySelectorAll('.office-task-region')).toHaveLength(1); expect(standalone.isConnected).toBe(true);
  expect(standalone.textContent).toContain('Other host export'); expect(document.body.textContent).not.toContain('Private host export');
});

it.each([['dialog', Dialog], ['drawer', Drawer], ['peek', SidePeek]] as const)(
  'retains %s input during inactive-owner Escape and restores ordinary dismissal', async (_name, Panel) => {
    const close = vi.fn();
    const render = (retired: boolean) => <OfficePortalOwner hidden={retired} inert={retired}>
      <Panel open title="Retained input" onOpenChange={close}><Draft /></Panel>
    </OfficePortalOwner>;
    await act(async () => root.render(render(false)));
    const input = host.querySelector('textarea')!;
    input.value = 'Uncommitted final input';
    await act(async () => root.render(render(true)));
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(close).not.toHaveBeenCalled();
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe('Uncommitted final input');
    expect(unmounted).not.toHaveBeenCalled();
    await act(async () => root.render(render(false)));
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(false);
    expect(host.querySelector('textarea')).toBe(input);
  });

it.each([['dialog', Dialog], ['drawer', Drawer], ['peek', SidePeek]] as const)(
  'keeps standalone %s Escape dismissal enabled', async (_name, Panel) => {
    const close = vi.fn();
    await act(async () => root.render(<Panel open title="Standalone input" onOpenChange={close}><Draft /></Panel>));
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(false);
  });
