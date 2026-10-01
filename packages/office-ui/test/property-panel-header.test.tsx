// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PropertyPanel, PropertyTabs } from '../src/properties';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

it('keeps the default named title, action and editable content for existing products', () => {
  const action = vi.fn();
  act(() => root.render(<PropertyPanel title="서식" action={<button onClick={action}>설정</button>}>
    <input aria-label="제목" defaultValue="원래 값" />
  </PropertyPanel>));
  expect(host.querySelector('aside')?.getAttribute('aria-label')).toBe('서식');
  expect(host.querySelector('h2')?.textContent).toBe('서식');
  const field = host.querySelector('input')!;
  field.focus(); field.value = '입력 유지';
  act(() => host.querySelector('button')!.click());
  expect(action).toHaveBeenCalledOnce(); expect(field.value).toBe('입력 유지');
});

it('composes accessible tabs and preferences without resetting field input or keyboard focus', () => {
  function Example() {
    const [tab, setTab] = useState('style');
    const [unit, setUnit] = useState('cm');
    return <PropertyPanel title="속성" header={<div>
      <PropertyTabs panelId="answers" tabs={[{ id: 'style', label: '속성' }, { id: 'motion', label: '모션' }]}
        active={tab} onChange={setTab} />
      <select aria-label="단위" value={unit} onChange={event => setUnit(event.target.value)}>
        <option value="cm">cm</option><option value="in">in</option>
      </select>
    </div>}>
      <div id="answers" role="tabpanel" aria-labelledby={`answers-${tab}`}>{tab}</div>
      <input aria-label="선택 속성" defaultValue="12" />
    </PropertyPanel>;
  }
  act(() => root.render(<Example />));
  expect(host.querySelector('aside')?.getAttribute('aria-label')).toBe('속성');
  expect(host.querySelector('h2')).toBeNull();
  const field = host.querySelector('input')!; field.value = '24';
  const style = host.querySelector<HTMLButtonElement>('#answers-style')!;
  act(() => { style.focus(); style.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
  const motion = host.querySelector<HTMLButtonElement>('#answers-motion')!;
  expect(document.activeElement).toBe(motion); expect(motion.getAttribute('aria-selected')).toBe('true');
  expect(host.querySelector('[role=tabpanel]')?.getAttribute('aria-labelledby')).toBe(motion.id);
  const unit = host.querySelector('select')!;
  act(() => { unit.value = 'in'; unit.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(unit.value).toBe('in'); expect(motion.getAttribute('aria-selected')).toBe('true'); expect(field.value).toBe('24');
  act(() => motion.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  expect(document.activeElement).toBe(style); expect(style.getAttribute('aria-selected')).toBe('true');
  expect(unit.value).toBe('in'); expect(field.value).toBe('24');
});
