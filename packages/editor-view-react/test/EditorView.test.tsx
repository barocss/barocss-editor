import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  EditorView,
  EditorViewLayer,
  EditorViewContextProvider,
  useEditorViewContext,
  useOptionalEditorViewContext,
} from '../src';

function mockEditor() {
  return {
    getDocumentProxy: () => null,
    on: () => {},
    off: () => {},
    dataStore: { getNode: () => null },
    updateSelection: () => {},
    executeCommand: () => false,
  } as any;
}

describe('EditorView', () => {
  it('renders root div with data-editor-view="true" and position relative', () => {
    const editor = mockEditor();
    const { container } = render(<EditorView editor={editor} />);
    const root = container.firstElementChild;
    expect(root?.getAttribute('data-editor-view')).toBe('true');
    expect((root as HTMLElement)?.style?.position).toBe('relative');
  });

  it('renders content layer with data-bc-layer="content" and data-testid="editor-content"', () => {
    const editor = mockEditor();
    render(<EditorView editor={editor} />);
    const content = screen.getByTestId('editor-content');
    expect(content).toBeTruthy();
    expect(content.getAttribute('data-bc-layer')).toBe('content');
  });

  it('applies options.className to root container', () => {
    const editor = mockEditor();
    const { container } = render(
      <EditorView editor={editor} options={{ className: 'my-editor-root' }} />
    );
    const root = container.firstElementChild;
    expect(root?.className).toContain('my-editor-root');
  });

  it('renders all overlay layers (decorator, selection, context, custom) by default', () => {
    const editor = mockEditor();
    const { container } = render(<EditorView editor={editor} />);
    expect(container.querySelector('[data-bc-layer="decorator"]')).toBeTruthy();
    expect(container.querySelector('[data-bc-layer="selection"]')).toBeTruthy();
    expect(container.querySelector('[data-bc-layer="context"]')).toBeTruthy();
    expect(container.querySelector('[data-bc-layer="custom"]')).toBeTruthy();
  });

  it('applies options.layers.* className and style to overlay layers', () => {
    const editor = mockEditor();
    const { container } = render(
      <EditorView
        editor={editor}
        options={{
          layers: {
            decorator: { className: 'my-decorator-layer' },
            selection: { style: { zIndex: 999 } },
          },
        }}
      />
    );
    const decoratorLayer = container.querySelector('[data-bc-layer="decorator"]');
    const selectionLayer = container.querySelector('[data-bc-layer="selection"]');
    expect(decoratorLayer?.className).toContain('my-decorator-layer');
    expect((selectionLayer as HTMLElement)?.style?.zIndex).toBe('999');
  });

  it('renders children inside custom layer when layers.custom or children present', () => {
    const editor = mockEditor();
    const { container } = render(
      <EditorView editor={editor} options={{ layers: { custom: {} } }}>
        <span data-testid="custom-child">Custom</span>
      </EditorView>
    );
    const customLayer = container.querySelector('[data-bc-layer="custom"]');
    expect(customLayer).toBeTruthy();
    expect(screen.getByTestId('custom-child').textContent).toBe('Custom');
  });
});

describe('EditorViewLayer', () => {
  it('renders div with data-bc-layer and position absolute, pointer-events none', () => {
    const { container } = render(<EditorViewLayer layer="selection" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el?.getAttribute('data-bc-layer')).toBe('selection');
    expect(el?.style?.position).toBe('absolute');
    expect(el?.style?.pointerEvents).toBe('none');
  });

  it('uses default className and zIndex per layer type', () => {
    const { container } = render(<EditorViewLayer layer="decorator" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el?.className).toContain('barocss-editor-decorators');
    expect(el?.style?.zIndex).toBe('10');
  });

  it('merges style prop with base style', () => {
    const { container } = render(
      <EditorViewLayer layer="custom" style={{ opacity: 0.5 }} />
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el?.style?.opacity).toBe('0.5');
    expect(el?.style?.position).toBe('absolute');
  });
});

describe('EditorViewContext', () => {
  it('useEditorViewContext throws when used outside Provider', () => {
    function Consumer() {
      useEditorViewContext();
      return null;
    }
    expect(() => render(<Consumer />)).toThrow(/must be used within EditorViewContext/);
  });

  it('useOptionalEditorViewContext returns null when outside Provider', () => {
    function Consumer() {
      const ctx = useOptionalEditorViewContext();
      return <span data-testid="ctx">{ctx === null ? 'null' : 'value'}</span>;
    }
    render(<Consumer />);
    expect(screen.getByTestId('ctx').textContent).toBe('null');
  });

  it('EditorViewContextProvider provides editor, selectionHandler, inputHandler, mutationObserverManager, setContentEditableElement', () => {
    const editor = mockEditor();
    function Consumer() {
      const ctx = useEditorViewContext();
      return (
        <span
          data-testid="ctx"
          data-has-editor={!!ctx.editor}
          data-has-selection-handler={!!ctx.selectionHandler}
          data-has-input-handler={!!ctx.inputHandler}
          data-has-mutation-manager={!!ctx.mutationObserverManager}
          data-has-set-content-editable={!!ctx.setContentEditableElement}
        />
      );
    }
    render(
      <EditorViewContextProvider editor={editor}>
        <Consumer />
      </EditorViewContextProvider>
    );
    const el = screen.getByTestId('ctx');
    expect(el.getAttribute('data-has-editor')).toBe('true');
    expect(el.getAttribute('data-has-selection-handler')).toBe('true');
    expect(el.getAttribute('data-has-input-handler')).toBe('true');
    expect(el.getAttribute('data-has-mutation-manager')).toBe('true');
    expect(el.getAttribute('data-has-set-content-editable')).toBe('true');
  });
});
