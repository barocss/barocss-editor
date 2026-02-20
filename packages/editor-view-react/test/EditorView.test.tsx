import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createRef } from 'react';
import {
  EditorView,
  EditorViewContentLayer,
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

function createMockEditorWithEventBus() {
  const listeners = new Map<string, Set<Function>>();
  const editor = mockEditor();

  return {
    ...editor,
    on(event: string, callback: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback);
    },
    off(event: string, callback: Function) {
      listeners.get(event)?.delete(callback);
    },
    emit(event: string, data?: unknown) {
      listeners.get(event)?.forEach((handler) => handler(data));
    },
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

  it('ref exposes getDecorator, contentEditableElement, exportDecorators, loadDecorators, convertModelSelectionToDOM, convertDOMSelectionToModel, convertStaticRangeToModel, defineDecoratorType', () => {
    const editor = mockEditor();
    const ref = createRef<any>();
    render(<EditorView ref={ref} editor={editor} />);
    const api = ref.current;
    expect(api).toBeTruthy();
    expect(typeof api.getDecorator).toBe('function');
    expect(typeof api.exportDecorators).toBe('function');
    expect(typeof api.loadDecorators).toBe('function');
    expect(typeof api.convertModelSelectionToDOM).toBe('function');
    expect(typeof api.convertDOMSelectionToModel).toBe('function');
    expect(typeof api.convertStaticRangeToModel).toBe('function');
    expect(typeof api.defineDecoratorType).toBe('function');
    expect(api.getDecorator('nonexistent')).toBeUndefined();
    const exported = api.exportDecorators();
    expect(exported.version).toBe('1.0.0');
    expect(Array.isArray(exported.targetDecorators)).toBe(true);
    expect(Array.isArray(exported.patternDecorators)).toBe(true);
    expect(api.contentEditableElement).toBe(screen.getByTestId('editor-content'));
  });

  it('ref.defineDecoratorType registers type; addDecorator applies schema defaults', () => {
    const editor = mockEditor();
    const ref = createRef<any>();
    render(<EditorView ref={ref} editor={editor} />);
    ref.current.defineDecoratorType('highlight', 'layer', {
      dataSchema: { color: { type: 'string', default: 'yellow' } },
    });
    act(() => {
      ref.current.addDecorator({
        sid: 'd1',
        stype: 'highlight',
        category: 'layer',
        data: {},
      });
    });
    const list = ref.current.getDecorators();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const d = list.find((x: { sid: string }) => x.sid === 'd1');
    expect(d).toBeTruthy();
    expect((d as { data?: { color?: string } }).data?.color).toBe('yellow');
  });

  it('ref.addDecorator accepts DecoratorGenerator and registers it', () => {
    const editor = mockEditor();
    const ref = createRef<any>();
    render(<EditorView ref={ref} editor={editor} />);
    const generator = {
      sid: 'gen-1',
      generate: () => [],
    };
    act(() => {
      ref.current.addDecorator(generator);
    });
    expect(ref.current.decoratorGeneratorManager?.getGenerator('gen-1')).toBe(generator);
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

  it('EditorViewContentLayer applies model selection when skip flag is false', () => {
    const editor = createMockEditorWithEventBus();
    let capturedCtx: any = null;

    function Capture() {
      const ctx = useEditorViewContext();
      capturedCtx = ctx;
      return <span data-testid="capture" />;
    }

    render(
      <EditorViewContextProvider editor={editor}>
        <EditorViewContentLayer />
        <Capture />
      </EditorViewContextProvider>
    );

    const convertSpy = vi.spyOn(capturedCtx.selectionHandler, 'convertModelSelectionToDOM');

    vi.useFakeTimers();
    try {
      editor.emit('editor:selection.model', {
        type: 'range',
        startNodeId: 't1',
        startOffset: 0,
        endNodeId: 't1',
        endOffset: 0,
      });

      vi.advanceTimersByTime(32);
      expect(convertSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('EditorViewContentLayer skips model selection when skip flag is true', () => {
    const editor = createMockEditorWithEventBus();
    let capturedCtx: any = null;

    function Capture() {
      const ctx = useEditorViewContext();
      capturedCtx = ctx;
      return <span data-testid="capture" />;
    }

    render(
      <EditorViewContextProvider editor={editor}>
        <EditorViewContentLayer />
        <Capture />
      </EditorViewContextProvider>
    );

    const convertSpy = vi.spyOn(capturedCtx.selectionHandler, 'convertModelSelectionToDOM');
    capturedCtx.viewStateRef.current.skipApplyModelSelectionToDOM = true;

    vi.useFakeTimers();
    try {
      editor.emit('editor:selection.model', {
        type: 'range',
        startNodeId: 't1',
        startOffset: 0,
        endNodeId: 't1',
        endOffset: 0,
      });

      vi.advanceTimersByTime(32);
      expect(convertSpy).toHaveBeenCalledTimes(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('EditorViewContentLayer skips model selection when applySelectionToView is false', () => {
    const editor = createMockEditorWithEventBus();
    let capturedCtx: any = null;

    function Capture() {
      const ctx = useEditorViewContext();
      capturedCtx = ctx;
      return <span data-testid="capture" />;
    }

    render(
      <EditorViewContextProvider editor={editor}>
        <EditorViewContentLayer />
        <Capture />
      </EditorViewContextProvider>
    );

    const convertSpy = vi.spyOn(capturedCtx.selectionHandler, 'convertModelSelectionToDOM');

    vi.useFakeTimers();
    try {
      editor.emit('editor:selection.model', {
        selection: {
          type: 'range',
          startNodeId: 't3',
          startOffset: 0,
          endNodeId: 't3',
          endOffset: 0,
        },
        applySelectionToView: false,
      });

      vi.advanceTimersByTime(32);
      expect(convertSpy).toHaveBeenCalledTimes(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('EditorViewContentLayer skips model selection when source is remote', () => {
    const editor = createMockEditorWithEventBus();
    let capturedCtx: any = null;

    function Capture() {
      const ctx = useEditorViewContext();
      capturedCtx = ctx;
      return <span data-testid="capture" />;
    }

    render(
      <EditorViewContextProvider editor={editor}>
        <EditorViewContentLayer />
        <Capture />
      </EditorViewContextProvider>
    );

    const convertSpy = vi.spyOn(capturedCtx.selectionHandler, 'convertModelSelectionToDOM');

    vi.useFakeTimers();
    try {
      editor.emit('editor:selection.model', {
        selection: {
          type: 'range',
          startNodeId: 't-remote',
          startOffset: 0,
          endNodeId: 't-remote',
          endOffset: 0,
        },
        source: 'remote',
      });

      vi.advanceTimersByTime(32);
      expect(convertSpy).toHaveBeenCalledTimes(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('EditorViewContentLayer applies node selection when source is local', () => {
    const editor = createMockEditorWithEventBus();
    let capturedCtx: any = null;

    function Capture() {
      const ctx = useEditorViewContext();
      capturedCtx = ctx;
      return <span data-testid="capture" />;
    }

    render(
      <EditorViewContextProvider editor={editor}>
        <EditorViewContentLayer />
        <Capture />
      </EditorViewContextProvider>
    );

    const convertSpy = vi.spyOn(capturedCtx.selectionHandler, 'convertModelSelectionToDOM');

    vi.useFakeTimers();
    try {
      editor.emit('editor:selection.model', {
        type: 'node',
        nodeId: 'node-local',
        startNodeId: 'node-local',
        startOffset: 0,
        endNodeId: 'node-local',
        endOffset: 3,
      });

      vi.advanceTimersByTime(32);
      expect(convertSpy).toHaveBeenCalledTimes(1);
      expect(convertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'node',
          nodeId: 'node-local',
          startNodeId: 'node-local',
          startOffset: 0,
          endNodeId: 'node-local',
          endOffset: 3,
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('EditorViewContentLayer skips node selection when source is remote', () => {
    const editor = createMockEditorWithEventBus();
    let capturedCtx: any = null;

    function Capture() {
      const ctx = useEditorViewContext();
      capturedCtx = ctx;
      return <span data-testid="capture" />;
    }

    render(
      <EditorViewContextProvider editor={editor}>
        <EditorViewContentLayer />
        <Capture />
      </EditorViewContextProvider>
    );

    const convertSpy = vi.spyOn(capturedCtx.selectionHandler, 'convertModelSelectionToDOM');

    vi.useFakeTimers();
    try {
      editor.emit('editor:selection.model', {
        type: 'node',
        nodeId: 'node-remote',
        startNodeId: 'node-remote',
        startOffset: 0,
        endNodeId: 'node-remote',
        endOffset: 2,
        source: 'remote',
      });

      vi.advanceTimersByTime(32);
      expect(convertSpy).toHaveBeenCalledTimes(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('EditorViewContentLayer composition 이벤트 비의존성', () => {
  it('beforeinput 의 isComposing 정보만으로 입력이 처리되어야 함', () => {
    const editor = mockEditor();
    let capturedCtx: any = null;

    function Capture() {
      const ctx = useEditorViewContext();
      capturedCtx = ctx;
      return <span data-testid="capture" />;
    }

    render(
      <EditorViewContextProvider editor={editor}>
        <EditorViewContentLayer />
        <Capture />
      </EditorViewContextProvider>
    );

    const beforeInputHandler = vi.spyOn(capturedCtx.inputHandler, 'handleBeforeInput');
    capturedCtx.inputHandler.handleBeforeInput({
      inputType: 'insertText',
      isComposing: true,
      data: '가',
      preventDefault: vi.fn(),
    } as unknown as InputEvent);

    expect(beforeInputHandler).toHaveBeenCalled();
  });
});
