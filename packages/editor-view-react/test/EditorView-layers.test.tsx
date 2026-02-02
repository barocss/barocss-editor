import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { define, element, slot, data, defineDecorator, getGlobalRegistry } from '@barocss/dsl';
import { EditorView } from '../src';
import type { Decorator } from '@barocss/shared';

function mockEditor(getDocumentProxy: () => unknown = () => null) {
  return {
    getDocumentProxy,
    on: () => {},
    off: () => {},
    dataStore: { getNode: () => null },
    updateSelection: () => {},
    executeCommand: () => false,
  } as any;
}

describe('EditorView layers', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('doc')) {
      define('doc', element('div', { className: 'document' }, [slot('content')]));
    }
    if (!registry.has?.('paragraph')) {
      define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    }
    if (!registry.has?.('chip')) {
      defineDecorator('chip', element('span', { className: 'chip', 'data-decorator': 'true' }, []));
    }
    if (!registry.has?.('comment')) {
      defineDecorator('comment', element('div', { className: 'comment-block' }, []));
    }
    if (!registry.has?.('tooltip')) {
      defineDecorator('tooltip', element('div', { className: 'tooltip-ui' }, []));
    }
    if (!registry.has?.('cursor')) {
      defineDecorator('cursor', element('div', { className: 'cursor-ui' }, []));
    }
  });

  const docModel = {
    sid: 'doc1',
    stype: 'doc',
    content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
  };

  describe('layer DOM structure', () => {
    it('renders content layer first with data-bc-layer="content"', () => {
      const editor = mockEditor(() => docModel);
      const { container } = render(<EditorView editor={editor} />);
      const content = screen.getByTestId('editor-content');
      expect(content.getAttribute('data-bc-layer')).toBe('content');
      const layers = container.querySelectorAll('[data-bc-layer]');
      expect(layers[0].getAttribute('data-bc-layer')).toBe('content');
    });

    it('renders overlay layers in order: decorator, selection, context, custom', () => {
      const editor = mockEditor(() => docModel);
      const { container } = render(<EditorView editor={editor} />);
      const layers = Array.from(container.querySelectorAll('[data-bc-layer]'));
      const names = layers.map((el) => el.getAttribute('data-bc-layer'));
      expect(names).toContain('content');
      expect(names).toContain('decorator');
      expect(names).toContain('selection');
      expect(names).toContain('context');
      expect(names).toContain('custom');
      const contentIdx = names.indexOf('content');
      const decoratorIdx = names.indexOf('decorator');
      const selectionIdx = names.indexOf('selection');
      const contextIdx = names.indexOf('context');
      const customIdx = names.indexOf('custom');
      expect(contentIdx).toBeLessThan(decoratorIdx);
      expect(decoratorIdx).toBeLessThan(selectionIdx);
      expect(selectionIdx).toBeLessThan(contextIdx);
      expect(contextIdx).toBeLessThan(customIdx);
    });

    it('applies default classNames to overlay layers', () => {
      const editor = mockEditor(() => docModel);
      const { container } = render(<EditorView editor={editor} />);
      expect(container.querySelector('[data-bc-layer="decorator"]')?.className).toContain('barocss-editor-decorators');
      expect(container.querySelector('[data-bc-layer="selection"]')?.className).toContain('barocss-editor-selection');
      expect(container.querySelector('[data-bc-layer="context"]')?.className).toContain('barocss-editor-context');
      expect(container.querySelector('[data-bc-layer="custom"]')?.className).toContain('barocss-editor-custom');
    });

    it('overlay layers have position absolute and pointer-events none', () => {
      const editor = mockEditor(() => docModel);
      const { container } = render(<EditorView editor={editor} />);
      const decoratorLayer = container.querySelector('[data-bc-layer="decorator"]') as HTMLElement;
      expect(decoratorLayer?.style?.position).toBe('absolute');
      expect(decoratorLayer?.style?.pointerEvents).toBe('none');
    });
  });

  describe('decorator layer', () => {
    it('renders only decorators with layerTarget decorator in decorator layer', async () => {
      const editor = mockEditor(() => docModel);
      const ref = { current: null as any };
      const { container } = render(<EditorView ref={ref} editor={editor} />);
      await act(() => {
        ref.current.addDecorator({
          sid: 'dec-layer-1',
          stype: 'comment',
          category: 'layer',
          layerTarget: 'decorator',
          target: { sid: 'p1' },
        });
      });
      const decoratorLayer = container.querySelector('[data-bc-layer="decorator"]');
      expect(decoratorLayer?.querySelector('[data-decorator-sid="dec-layer-1"]')).toBeTruthy();
      expect(container.querySelector('[data-bc-layer="selection"]')?.querySelector('[data-decorator-sid="dec-layer-1"]')).toBeFalsy();
    });

    it('renders multiple decorators with layerTarget decorator in decorator layer', async () => {
      const editor = mockEditor(() => docModel);
      const ref = { current: null as any };
      const { container } = render(<EditorView ref={ref} editor={editor} />);
      await act(() => {
        ref.current.addDecorator({
          sid: 'dec-a',
          stype: 'comment',
          category: 'layer',
          layerTarget: 'decorator',
          target: { sid: 'p1' },
        });
        ref.current.addDecorator({
          sid: 'dec-b',
          stype: 'chip',
          category: 'layer',
          layerTarget: 'decorator',
          target: { sid: 'p1' },
        });
      });
      const decoratorLayer = container.querySelector('[data-bc-layer="decorator"]');
      expect(decoratorLayer?.querySelector('[data-decorator-sid="dec-a"]')).toBeTruthy();
      expect(decoratorLayer?.querySelector('[data-decorator-sid="dec-b"]')).toBeTruthy();
    });

    it('decorator layer is empty when no decorators have layerTarget decorator', () => {
      const editor = mockEditor(() => docModel);
      const { container } = render(<EditorView editor={editor} />);
      const decoratorLayer = container.querySelector('[data-bc-layer="decorator"]');
      expect(decoratorLayer?.querySelector('[data-decorator-sid]')).toBeFalsy();
    });
  });

  describe('selection layer', () => {
    it('renders only decorators with layerTarget selection in selection layer', async () => {
      const editor = mockEditor(() => docModel);
      const ref = { current: null as any };
      const { container } = render(<EditorView ref={ref} editor={editor} />);
      await act(() => {
        ref.current.addDecorator({
          sid: 'sel-1',
          stype: 'cursor',
          category: 'layer',
          layerTarget: 'selection',
          target: { sid: 'p1' },
        });
      });
      const selectionLayer = container.querySelector('[data-bc-layer="selection"]');
      expect(selectionLayer?.querySelector('[data-decorator-sid="sel-1"]')).toBeTruthy();
      expect(container.querySelector('[data-bc-layer="decorator"]')?.querySelector('[data-decorator-sid="sel-1"]')).toBeFalsy();
    });

    it('selection layer is empty when no decorators have layerTarget selection', () => {
      const editor = mockEditor(() => docModel);
      const { container } = render(<EditorView editor={editor} />);
      const selectionLayer = container.querySelector('[data-bc-layer="selection"]');
      expect(selectionLayer?.querySelector('[data-decorator-sid]')).toBeFalsy();
    });
  });

  describe('context layer', () => {
    it('renders only decorators with layerTarget context in context layer', async () => {
      const editor = mockEditor(() => docModel);
      const ref = { current: null as any };
      const { container } = render(<EditorView ref={ref} editor={editor} />);
      await act(() => {
        ref.current.addDecorator({
          sid: 'ctx-1',
          stype: 'tooltip',
          category: 'layer',
          layerTarget: 'context',
          target: { sid: 'p1' },
        });
      });
      const contextLayer = container.querySelector('[data-bc-layer="context"]');
      expect(contextLayer?.querySelector('[data-decorator-sid="ctx-1"]')).toBeTruthy();
      expect(container.querySelector('[data-bc-layer="decorator"]')?.querySelector('[data-decorator-sid="ctx-1"]')).toBeFalsy();
    });

    it('context layer is empty when no decorators have layerTarget context', () => {
      const editor = mockEditor(() => docModel);
      const { container } = render(<EditorView editor={editor} />);
      const contextLayer = container.querySelector('[data-bc-layer="context"]');
      expect(contextLayer?.querySelector('[data-decorator-sid]')).toBeFalsy();
    });
  });

  describe('custom layer', () => {
    it('renders only decorators with layerTarget custom in custom layer', async () => {
      const editor = mockEditor(() => docModel);
      const ref = { current: null as any };
      const { container } = render(<EditorView ref={ref} editor={editor} />);
      await act(() => {
        ref.current.addDecorator({
          sid: 'custom-dec-1',
          stype: 'chip',
          category: 'layer',
          layerTarget: 'custom',
          target: { sid: 'p1' },
        });
      });
      const customLayer = container.querySelector('[data-bc-layer="custom"]');
      expect(customLayer?.querySelector('[data-decorator-sid="custom-dec-1"]')).toBeTruthy();
      expect(container.querySelector('[data-bc-layer="decorator"]')?.querySelector('[data-decorator-sid="custom-dec-1"]')).toBeFalsy();
    });

    it('renders children inside custom layer after overlay decorators', () => {
      const editor = mockEditor(() => docModel);
      const { container } = render(
        <EditorView editor={editor}>
          <span data-testid="custom-child">Custom content</span>
        </EditorView>
      );
      const customLayer = container.querySelector('[data-bc-layer="custom"]');
      expect(customLayer).toBeTruthy();
      expect(screen.getByTestId('custom-child').textContent).toBe('Custom content');
    });

    it('custom layer is empty of decorators when none have layerTarget custom', () => {
      const editor = mockEditor(() => docModel);
      const { container } = render(<EditorView editor={editor} />);
      const customLayer = container.querySelector('[data-bc-layer="custom"]');
      expect(customLayer?.querySelector('[data-decorator-sid]')).toBeFalsy();
    });
  });

  describe('layerTarget filtering', () => {
    it('decorator with layerTarget content appears only in content layer', async () => {
      const editor = mockEditor(() => docModel);
      const ref = { current: null as any };
      const { container } = render(<EditorView ref={ref} editor={editor} />);
      await act(() => {
        ref.current.addDecorator({
          sid: 'content-only',
          stype: 'chip',
          category: 'block',
          layerTarget: 'content',
          target: { sid: 'p1' },
          position: 'after',
        });
      });
      const contentLayer = screen.getByTestId('editor-content');
      expect(contentLayer.querySelector('[data-decorator-sid="content-only"]')).toBeTruthy();
      expect(container.querySelector('[data-bc-layer="decorator"]')?.querySelector('[data-decorator-sid="content-only"]')).toBeFalsy();
      expect(container.querySelector('[data-bc-layer="selection"]')?.querySelector('[data-decorator-sid="content-only"]')).toBeFalsy();
      expect(container.querySelector('[data-bc-layer="context"]')?.querySelector('[data-decorator-sid="content-only"]')).toBeFalsy();
      expect(container.querySelector('[data-bc-layer="custom"]')?.querySelector('[data-decorator-sid="content-only"]')).toBeFalsy();
    });

    it('decorators with different layerTargets appear only in their layer', async () => {
      const editor = mockEditor(() => docModel);
      const ref = { current: null as any };
      const { container } = render(<EditorView ref={ref} editor={editor} />);
      await act(() => {
        ref.current.addDecorator({
          sid: 'd-decorator',
          stype: 'comment',
          category: 'layer',
          layerTarget: 'decorator',
          target: { sid: 'p1' },
        });
        ref.current.addDecorator({
          sid: 'd-selection',
          stype: 'cursor',
          category: 'layer',
          layerTarget: 'selection',
          target: { sid: 'p1' },
        });
        ref.current.addDecorator({
          sid: 'd-context',
          stype: 'tooltip',
          category: 'layer',
          layerTarget: 'context',
          target: { sid: 'p1' },
        });
        ref.current.addDecorator({
          sid: 'd-custom',
          stype: 'chip',
          category: 'layer',
          layerTarget: 'custom',
          target: { sid: 'p1' },
        });
      });
      expect(container.querySelector('[data-bc-layer="decorator"]')?.querySelector('[data-decorator-sid="d-decorator"]')).toBeTruthy();
      expect(container.querySelector('[data-bc-layer="selection"]')?.querySelector('[data-decorator-sid="d-selection"]')).toBeTruthy();
      expect(container.querySelector('[data-bc-layer="context"]')?.querySelector('[data-decorator-sid="d-context"]')).toBeTruthy();
      expect(container.querySelector('[data-bc-layer="custom"]')?.querySelector('[data-decorator-sid="d-custom"]')).toBeTruthy();
      expect(container.querySelector('[data-bc-layer="decorator"]')?.querySelector('[data-decorator-sid="d-selection"]')).toBeFalsy();
      expect(container.querySelector('[data-bc-layer="selection"]')?.querySelector('[data-decorator-sid="d-context"]')).toBeFalsy();
    });
  });

  describe('options.layers overrides', () => {
    it('options.layers.decorator.className is applied to decorator layer', () => {
      const editor = mockEditor(() => docModel);
      const { container } = render(
        <EditorView
          editor={editor}
          options={{ layers: { decorator: { className: 'my-decorator-layer' } } }}
        />
      );
      const el = container.querySelector('[data-bc-layer="decorator"]');
      expect(el?.className).toContain('my-decorator-layer');
    });

    it('options.layers.selection.style is applied to selection layer', () => {
      const editor = mockEditor(() => docModel);
      const { container } = render(
        <EditorView
          editor={editor}
          options={{ layers: { selection: { style: { zIndex: 150 } } } }}
        />
      );
      const el = container.querySelector('[data-bc-layer="selection"]') as HTMLElement;
      expect(el?.style?.zIndex).toBe('150');
    });

    it('options.layers.context and custom can override className and style', () => {
      const editor = mockEditor(() => docModel);
      const { container } = render(
        <EditorView
          editor={editor}
          options={{
            layers: {
              context: { className: 'my-ctx', style: { opacity: 0.9 } },
              custom: { className: 'my-custom' },
            },
          }}
        />
      );
      const ctx = container.querySelector('[data-bc-layer="context"]') as HTMLElement;
      const custom = container.querySelector('[data-bc-layer="custom"]');
      expect(ctx?.className).toContain('my-ctx');
      expect(ctx?.style?.opacity).toBe('0.9');
      expect(custom?.className).toContain('my-custom');
    });
  });
});
