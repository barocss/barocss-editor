// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { registerEditorNavigation, useEditorNavigation, useEditorLocation } from '../src/editor-host';

it('updates a mounted header and ignores cleanup from a replaced host', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  function Header() { const Navigation = useEditorNavigation(), Location = useEditorLocation(); return <>{Navigation ? <Navigation product="Slides" /> : <span>Standalone</span>}{Location && <Location product="Slides" />}</>; }
  const First = () => <span>First workspace</span>;
  const Context = () => <span>Local project</span>;
  const Second = () => <span>Second workspace</span>;
  let removeFirst = () => {}, removeSecond = () => {};
  try {
    act(() => root.render(<Header />));
    expect(container.textContent).toBe('Standalone');
    act(() => { removeFirst = registerEditorNavigation(First, Context); });
    expect(container.textContent).toBe('First workspaceLocal project');
    act(() => { removeSecond = registerEditorNavigation(Second); removeFirst(); });
    expect(container.textContent).toBe('Second workspace');
    act(() => removeSecond());
    expect(container.textContent).toBe('Standalone');
  } finally {
    act(() => { removeFirst(); removeSecond(); root.unmount(); });
  }
});


it('keeps the current location when the same navigation component is registered again', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const view = createRoot(container);
  const Navigation = () => <span>Workspace</span>;
  const A = () => <span>Project A</span>, B = () => <span>Project B</span>;
  function Header() { const Location = useEditorLocation(), Menu = useEditorNavigation(); return <>{Menu && <Menu product="Word" />}{Location && <Location product="Word" />}</>; }
  let removeA = () => {}, removeB = () => {}, removeCurrent = () => {};
  try {
    act(() => view.render(<Header />));
    act(() => { removeA = registerEditorNavigation(Navigation, A); removeB = registerEditorNavigation(Navigation, B); removeA(); });
    expect(container.textContent).toBe('WorkspaceProject B');
    act(() => { removeCurrent = registerEditorNavigation(Navigation, A); removeB(); removeA(); });
    expect(container.textContent).toBe('WorkspaceProject A');
    act(() => removeCurrent());
    expect(container.textContent).toBe('');
  } finally { act(() => { removeA(); removeB(); removeCurrent(); view.unmount(); }); }
});
