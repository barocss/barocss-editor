import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { BusinessPairPanel } from '../../../apps/word/src/business-pair-panel';
import type { WordRuntime } from '../../../apps/word/src/runtime';
import { createSampleDocument } from '../src/sample-document';
import { createStandaloneRequirement, deriveBusinessPair } from '../src/business-pair';

// Component ownership only. Actual native commands, auth and persistence have separate checks.
it('retires the chosen version when a different requirement replaces it within the same runtime root', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let native = createSampleDocument();
  const surface = native.content!.find(node => typeof node !== 'string' && node.stype === 'surface');
  if (!surface || typeof surface === 'string') throw Error('Missing surface');
  surface.content = [{ stype: 'paragraph', content: [{ stype: 'bookmarkAnchor', attributes: { id: 'requirement' } }, { stype: 'inline-text', text: 'Fictional requirement.' }] }];
  native.metadata = { wonfficeBusinessPair: createStandaloneRequirement(native, 'requirement') };
  const runtime = { editor: { getRootId: () => 'same-root', isEditable: true, on: () => {}, off: () => {} }, exportNativeDocument: () => native } as unknown as WordRuntime;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const render = () => root.render(createElement(BusinessPairPanel, { runtime, readOnly: false }));
  try {
    await act(async () => render());
    const select = container.querySelector('select')!;
    expect(select.value).toBe('');
    await act(async () => { select.value = '1'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(select.value).toBe('1');
    const before = structuredClone(native);
    native = deriveBusinessPair(native) as typeof native;
    await act(async () => render());
    expect(select.value).toBe('');
    expect(container.textContent).toContain('결정 미연결');
    expect(container.textContent).not.toContain('서버 확인 기록 읽기');
    expect(before.metadata).not.toEqual(native.metadata);
  } finally {
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  }
});
