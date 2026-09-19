// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TextField } from '../src/controls';

let root: Root | undefined;
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); });

it('keeps Korean composition Enter in the field and commits only the following Enter', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const commit = vi.fn();
  const keys = vi.fn();
  act(() => root!.render(createElement(TextField, { value: '', ariaLabel: '제목', onCommit: commit, onKeys: keys })));
  const input = container.querySelector('input')!;
  act(() => input.focus());
  input.value = '회의';
  act(() => input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  const candidate = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true });
  act(() => input.dispatchEvent(candidate));
  expect(candidate.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(input);
  expect(commit).not.toHaveBeenCalled();
  expect(keys).not.toHaveBeenCalled();
  act(() => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledWith('회의');
  expect(document.activeElement).not.toBe(input);
});
