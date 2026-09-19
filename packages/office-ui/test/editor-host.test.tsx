// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { registerEditorNavigation, useEditorNavigation } from '../src/editor-host';

it('updates a mounted header and ignores cleanup from a replaced host', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  function Header() { const Navigation = useEditorNavigation(); return Navigation ? <Navigation product="Slides" /> : <span>Standalone</span>; }
  const First = () => <span>First workspace</span>;
  const Second = () => <span>Second workspace</span>;
  let removeFirst = () => {}, removeSecond = () => {};
  try {
    act(() => root.render(<Header />));
    expect(container.textContent).toBe('Standalone');
    act(() => { removeFirst = registerEditorNavigation(First); });
    expect(container.textContent).toBe('First workspace');
    act(() => { removeSecond = registerEditorNavigation(Second); removeFirst(); });
    expect(container.textContent).toBe('Second workspace');
    act(() => removeSecond());
    expect(container.textContent).toBe('Standalone');
  } finally {
    act(() => { removeFirst(); removeSecond(); root.unmount(); });
  }
});
