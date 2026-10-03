// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { PropertySheet } from '../src/property-sheet';

it('keeps focused input identity and draft text when group headings change language', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const row = { attr: 'name', label: 'Name', ariaLabel: 'Name', group: 'selection', control: 'embedded-editor' };
  const render = (label: string) => act(() => root.render(<PropertySheet
    groups={[{ id: 'selection', label, rows: [row] }]}
    value={() => 'Original'} onWrite={() => {}} render={() => <input defaultValue="Original" aria-label="Name" />} />));
  try {
    render('선택');
    const input = host.querySelector('input')!;
    input.focus(); input.value = 'Pending composition';
    render('Selection');
    expect(host.querySelector('input')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Pending composition');
  } finally { act(() => root.unmount()); host.remove(); }
});

it('keeps distinct groups with equal translated headings when their order changes', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const groups = ['position', 'size'].map(id => ({ id, label: 'Layout', rows: [{ attr: id, label: id, ariaLabel: id, group: id, control: 'embedded-editor' }] }));
  const render = (reverse: boolean) => act(() => root.render(<PropertySheet
    groups={reverse ? [...groups].reverse() : groups} value={() => ''} onWrite={() => {}}
    render={row => <input aria-label={row.attr} defaultValue={row.attr} />} />));
  try {
    render(false);
    const field = host.querySelector<HTMLInputElement>('input[aria-label="position"]')!;
    field.focus(); field.value = 'Uncommitted value';
    render(true);
    expect(host.querySelector('input[aria-label="position"]')).toBe(field);
    expect(field.value).toBe('Uncommitted value');
    expect(document.activeElement).toBe(field);
  } finally { act(() => root.unmount()); host.remove(); }
});
