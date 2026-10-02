// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FloatingSurface } from '../src/floating';
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 40, 160, 80));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('focuses the first available field only after an explicitly opened panel is placed', () => {
  const origin = createRef<HTMLDivElement>();
  const render = (open: boolean) => act(() => root.render(createElement('div', { ref: origin },
    createElement('button', { id: 'origin' }, 'More'),
    createElement(FloatingSurface, { open, at: new DOMRect(20, 40, 32, 32), focusOnOpen: true, focusOrigin: origin,
      children: createElement('div', null, createElement('input', { disabled: true }), createElement('input', { 'aria-label': 'Unaccepted link draft' })) }))));
  render(false); document.querySelector<HTMLButtonElement>('#origin')!.focus(); render(true);
  const panel = document.querySelector('[data-floating-ready="true"]')!;
  expect(panel).not.toBeNull(); expect(document.activeElement).toBe(panel.querySelector('input:not(:disabled)'));
});
it('does not take focus from a foreign control when the supplied opening owner is no longer focused', () => {
  const origin = createRef<HTMLDivElement>();
  const foreign = document.createElement('button'); document.body.append(foreign); foreign.focus();
  act(() => root.render(createElement('div', { ref: origin }, createElement(FloatingSurface, {
    open: true, at: new DOMRect(20, 40, 32, 32), focusOnOpen: true, focusOrigin: origin,
    children: createElement('button', { role: 'menuitem' }, 'Bold') }))));
  expect(document.querySelector('[data-floating-ready="true"]')).not.toBeNull(); expect(document.activeElement).toBe(foreign);
});

import { SecondaryPopup } from '../src/secondary-popup';
import { NumberField, TextField } from '../src/controls';
import { Dialog } from '../src/dialog';
import { useDismiss } from '../src/stack';
import { DocumentMenu, EditorHeader } from '../src/document-bar';
import { Toolbar, ToolbarToggle } from '../src/toolbar';
import { useState } from 'react';
it('keeps a real secondary field draft and returns focus one layer at a time', () => {
  function Draft() { const [draft, setDraft] = useState('Original'); return createElement('input', { 'aria-label': 'Draft', value: draft, onInput: event => setDraft(event.currentTarget.value) }); }
  act(() => root.render(createElement(SecondaryPopup, { triggerLabel:'More', label:'Extra fields', keepMounted:true, children:createElement(Draft) })));
  const trigger = container.querySelector<HTMLButtonElement>('button')!;
  act(() => trigger.click());
  const panel = container.querySelector<HTMLElement>('[data-secondary-popup]')!, field = panel.querySelector('input')!;
  expect(panel.getAttribute('data-floating-ready')).toBe('true'); expect(document.activeElement).toBe(field);
  act(() => { field.value = 'Unaccepted draft'; field.dispatchEvent(new Event('input', { bubbles:true })); });
  act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })));
  expect(panel.hidden).toBe(true); expect(panel.hasAttribute('inert')).toBe(true); expect(document.activeElement).toBe(trigger);
  const foreign = document.createElement('button'); document.body.append(foreign); foreign.focus();
  act(() => foreign.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })));
  expect(document.activeElement).toBe(foreign); expect(field.value).toBe('Unaccepted draft');
  act(() => trigger.click()); expect(panel.querySelector('input')).toBe(field); expect(document.activeElement).toBe(field); expect(field.value).toBe('Unaccepted draft');
});
it.each(['text', 'number'])('cancels a committed %s draft before closing its secondary popup', kind => {
  const commit = vi.fn();
  const field = kind === 'text'
    ? createElement(TextField, { ariaLabel: 'Link', value: 'Original', onCommit: commit })
    : createElement(NumberField, { ariaLabel: 'Width', value: 24, onCommit: commit });
  act(() => root.render(createElement(SecondaryPopup, { triggerLabel: 'More', label: 'Fields', keepMounted: true, children: field })));
  const trigger = container.querySelector<HTMLButtonElement>('[data-secondary-trigger]')!;
  act(() => trigger.click());
  const panel = container.querySelector<HTMLElement>('[data-secondary-popup]')!, input = panel.querySelector('input')!;
  expect(document.activeElement).toBe(input);
  input.value = kind === 'text' ? 'Unaccepted' : '99';
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(commit).not.toHaveBeenCalled();
  expect(input.value).toBe(kind === 'text' ? 'Original' : '24');
  expect(panel.hidden).toBe(false);
  act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(panel.hidden).toBe(true); expect(document.activeElement).toBe(trigger);
  expect(commit).not.toHaveBeenCalled();
});
it('lets a live search field close its popup on the first Escape', () => {
  const change = vi.fn();
  act(() => root.render(createElement(SecondaryPopup, { triggerLabel: 'More', label: 'Search',
    children: createElement(TextField, { ariaLabel: 'Search', value: 'query', onChange: change }) })));
  const trigger = container.querySelector<HTMLButtonElement>('[data-secondary-trigger]')!;
  act(() => trigger.click());
  const input = container.querySelector('input')!;
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(container.querySelector('[data-secondary-popup]')).toBeNull();
  expect(document.activeElement).toBe(trigger); expect(change).not.toHaveBeenCalled();
});
it('retains a committed field draft when its popup is folded with its trigger', () => {
  const commit = vi.fn();
  act(() => root.render(createElement(SecondaryPopup, { triggerLabel: 'More', label: 'Fields', keepMounted: true,
    children: createElement(TextField, { ariaLabel: 'Link', value: 'Original', onCommit: commit }) })));
  const trigger = container.querySelector<HTMLButtonElement>('[data-secondary-trigger]')!;
  act(() => trigger.click()); const input = container.querySelector('input')!; input.value = 'Unaccepted';
  act(() => trigger.click());
  expect(commit).not.toHaveBeenCalled();
  act(() => trigger.click());
  expect(container.querySelector('input')).toBe(input); expect(input.value).toBe('Unaccepted'); expect(commit).not.toHaveBeenCalled();
});
it('keeps committed field Escape separate from a stack popup dismissal', () => {
  const commit = vi.fn(), close = vi.fn();
  function Stack() {
    const host = useDismiss(true, close);
    return createElement('div', { ref: host }, createElement(NumberField, { ariaLabel: 'Width', value: 24, onCommit: commit }));
  }
  act(() => root.render(createElement(Stack)));
  const input = container.querySelector('input')!;
  act(() => input.focus()); input.value = '99';
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(input.value).toBe('24'); expect(commit).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(close).toHaveBeenCalledOnce(); expect(commit).not.toHaveBeenCalled();
});
it('cancels a committed field before closing its actual modal dialog', async () => {
  const commit = vi.fn(), change = vi.fn();
  await act(async () => root.render(createElement(Dialog, { open: true, title: 'Link', description: 'Edit address', onOpenChange: change,
    children: createElement('div', null, createElement(TextField, { ariaLabel: 'Address', value: 'Original', onCommit: commit }), createElement('button', { id: 'modal-action' }, 'Apply')) })));
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Address"]')!;
  act(() => input.focus()); input.value = 'Unaccepted';
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(input.value).toBe('Original'); expect(commit).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled();
  const action = document.querySelector<HTMLButtonElement>('#modal-action')!;
  act(() => { action.focus(); action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  expect(change).toHaveBeenCalledWith(false); expect(commit).not.toHaveBeenCalled();
});
it('retiring the supplied subject by remounting cancels its retained draft and open surface', () => {
  const render = (key:string) => act(() => root.render(createElement(SecondaryPopup, { key, triggerLabel:'More', label:'Fields', keepMounted:true, children:createElement('input',{defaultValue:key}) })));
  render('A'); act(() => container.querySelector<HTMLButtonElement>('button')!.click());
  const old = container.querySelector('[data-secondary-popup]')!;
  render('B'); expect(old.isConnected).toBe(false); expect(container.querySelector('[data-secondary-open]')).toBeNull();
});
it('groups existing document command IDs and shortcuts under a single named trigger', () => {
  vi.stubGlobal('CSS', { escape:(value:string)=>value });
  const pick=vi.fn();
  act(() => root.render(createElement(DocumentMenu, { label:'Document',onPick:pick, menus:[
    {id:'file',label:'File',blocks:[{id:'main',items:[{id:'save',label:'Save',hint:'⌘S'},{id:'export',label:'Export',disabled:true}]}]},
    {id:'edit',label:'Edit',blocks:[{id:'main',items:[{id:'undo',label:'Undo',hint:'⌘Z'}]}]}
  ] })));
  expect(container.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
  act(() => {const trigger=container.querySelector<HTMLButtonElement>('[data-menu]')!;trigger.focus();trigger.click();});
  const menu=document.querySelector('[role="menu"]')!;
  expect([...menu.querySelectorAll('.office-menu-heading')].map(e=>e.textContent)).toEqual(['File','Edit']);
  expect(menu.textContent).toContain('⌘S');expect(menu.querySelector<HTMLButtonElement>('[data-menu-item="export"]')!.disabled).toBe(true);
  act(() => menu.querySelector<HTMLButtonElement>('[data-menu-item="undo"]')!.click());expect(pick).toHaveBeenCalledWith('undo');
});
it('opts into compact shared header and keyboard toolbar without changing normal consumers', () => {
  const title='The complete accessible title';
  const render=(compact:boolean)=>act(()=>root.render(createElement('div',null,
    createElement(EditorHeader,{compact,product:'Word',title,menus:'Actual document menu'}),
    createElement(Toolbar,{variant:compact?'compact':'ribbon',label:'Selected tools',children:createElement(ToolbarToggle,{id:'bold',label:'Bold',state:'off',onActivate:()=>{},children:'B'})}))));
  render(false);expect(container.querySelector('.office-editor-header')!.hasAttribute('data-compact')).toBe(false);expect(container.querySelector('[data-toolbar-variant="ribbon"]')).not.toBeNull();
  render(true);expect(container.querySelector('.office-editor-header')!.getAttribute('data-compact')).toBe('true');expect(container.querySelector('[data-document-identity]')!.getAttribute('title')).toBe(title);
  const toolbar=container.querySelector('[role="toolbar"]')!;expect(toolbar.getAttribute('aria-label')).toBe('Selected tools');expect(toolbar.getAttribute('data-toolbar-variant')).toBe('compact');expect(toolbar.querySelector('button')!.getAttribute('aria-label')).toBe('Bold');
});
it('retires an open popup when it becomes disabled without reviving it on re-enable', () => {
  const render=(disabled:boolean)=>act(()=>root.render(createElement(SecondaryPopup,{disabled,triggerLabel:'More',label:'Fields',keepMounted:true,children:createElement('input',{defaultValue:'Draft'})})));
  render(false);act(()=>container.querySelector<HTMLButtonElement>('button')!.click());
  const panel=container.querySelector<HTMLElement>('[data-secondary-popup]')!;
  expect(panel.hidden).toBe(false);render(true);expect(panel.hidden).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
  render(false);expect(panel.hidden).toBe(true);expect(container.querySelector('[data-secondary-open]')).toBeNull();
});
it('keeps an owned child picker Escape separate from the secondary panel Escape', () => {
  act(()=>root.render(createElement(SecondaryPopup,{triggerLabel:'More',label:'Fields',children:createElement('div',null,
    createElement('input',{'aria-label':'Draft'}),createElement('div',{role:'listbox'},createElement('button',{role:'option'},'Font')))})));
  const trigger=container.querySelector<HTMLButtonElement>('[data-secondary-trigger]')!;
  act(()=>trigger.click());const panel=container.querySelector('[data-secondary-popup]')!;
  const option=panel.querySelector<HTMLButtonElement>('[role="option"]')!;
  act(()=>{option.focus();option.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
  expect(panel.isConnected).toBe(true);expect(container.querySelector('[data-secondary-open]')).not.toBeNull();
  act(()=>{panel.querySelector('[role="listbox"]')!.remove();const field=panel.querySelector<HTMLInputElement>('input')!;field.focus();field.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
  expect(panel.isConnected).toBe(false);expect(document.activeElement).toBe(trigger);
});
it('forwards the real compact toolbar host without changing ordinary attributes', () => {
  const host=createRef<HTMLDivElement>();
  act(()=>root.render(createElement(Toolbar,{variant:'compact',elementRef:host,label:'Owned toolbar','data-owned-host':'yes',children:createElement(ToolbarToggle,{id:'bold',label:'Bold',state:'off',onActivate:()=>{},children:'B'})})));
  expect(host.current).toBe(container.querySelector('[role="toolbar"]'));expect(host.current!.dataset.ownedHost).toBe('yes');
  expect(host.current!.querySelector('[data-toolbar-overflow]')).toBeNull();
});
