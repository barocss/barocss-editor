// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Properties } from '../src/properties';
import type { LengthUnit } from '@barocss/office-ui';
import { createSlidesEditor } from '../src/slides-kit';
import { createSampleDeck } from '../src/sample-deck';
import { deckSlides } from '../src/deck';

let host: HTMLDivElement, root: Root;
let editor: ReturnType<typeof createSlidesEditor>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  editor = createSlidesEditor(); editor.loadDocument(createSampleDeck(), 'chrome422');
});
afterEach(() => { act(() => root.unmount()); host.remove(); editor.destroy(); vi.restoreAllMocks(); });
const slides = () => deckSlides({ rootId: editor.getRootId()!, getNode: id => editor.dataStore.getNode(id) });

it('read-only inspector allows keyboard tabs and units while preserving native data and blocking body actions', () => {
  const editTheme = vi.fn();
  function Example() {
    const [unit, setUnit] = useState<LengthUnit>('cm');
    return <Properties editor={editor} slides={slides()} current={slides()[0].sid}
      unit={unit} onUnit={setUnit} readOnly onEditTheme={editTheme} />;
  }
  editor.setEditable(false); const before = JSON.stringify(editor.exportDocument());
  act(() => root.render(<Example />));
  const unit = host.querySelector<HTMLSelectElement>('[aria-label="단위"]')!;
  expect(unit.matches(':disabled')).toBe(false);
  act(() => { unit.value = 'in'; unit.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(unit.value).toBe('in');
  const style = host.querySelector<HTMLButtonElement>('[role=tab][data-tab=style]')!;
  act(() => { style.focus(); style.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
  const motion = host.querySelector<HTMLButtonElement>('[role=tab][data-tab=motion]')!;
  expect(document.activeElement).toBe(motion); expect(motion.getAttribute('aria-selected')).toBe('true');
  act(() => motion.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  const body = host.querySelector('fieldset.sl-properties-body')!;
  expect(body.hasAttribute('inert')).toBe(true);
  const edit = body.querySelector<HTMLButtonElement>('[data-theme-edit]')!;
  expect(edit.matches(':disabled')).toBe(true); act(() => edit.click());
  expect(editTheme).not.toHaveBeenCalled(); expect(JSON.stringify(editor.exportDocument())).toBe(before);
});

it('keeps a failed command retry inside the read-only mutation guard', async () => {
  const execute = vi.spyOn(editor, 'executeCommand').mockResolvedValue(false);
  const render = (readOnly: boolean) => <Properties editor={editor} slides={slides()} current={slides()[0].sid}
    unit="cm" onUnit={() => {}} readOnly={readOnly} />;
  const before = JSON.stringify(editor.exportDocument());
  await act(async () => { root.render(render(false)); });
  const theme = host.querySelector<HTMLSelectElement>('select[aria-label="테마"]')!;
  const alternative = [...theme.options].find(option => option.value !== theme.value)!;
  await act(async () => { theme.value = alternative.value; theme.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(execute).toHaveBeenCalledOnce();
  const retry = () => [...host.querySelectorAll('button')].find(button => button.textContent === '다시 시도')!;
  expect(retry()).toBeDefined();
  await act(async () => { root.render(render(true)); });
  expect(retry().matches(':disabled')).toBe(true);
  expect(retry().closest('[inert]')).not.toBeNull();
  await act(async () => retry().click());
  expect(execute).toHaveBeenCalledOnce(); expect(JSON.stringify(editor.exportDocument())).toBe(before);
  expect(host.querySelector<HTMLSelectElement>('[aria-label="단위"]')!.matches(':disabled')).toBe(false);
});
