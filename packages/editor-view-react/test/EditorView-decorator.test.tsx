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

describe('EditorView with decorators', () => {
  beforeEach(() => {
    const registry = getGlobalRegistry();
    if (!registry.has?.('doc')) {
      define('doc', element('div', { className: 'document' }, [slot('content')]));
    }
    if (!registry.has?.('paragraph')) {
      define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
    }
    if (!registry.has?.('inline-text')) {
      define('inline-text', element('span', { className: 'text' }, [data('text')]));
    }
    if (!registry.has?.('chip')) {
      defineDecorator('chip', element('span', { className: 'chip', 'data-decorator': 'true' }, []));
    }
    if (!registry.has?.('comment')) {
      defineDecorator('comment', element('div', { className: 'comment-block' }, []));
    }
  });

  it('renders content without decorators when none added', () => {
    const docModel = {
      sid: 'doc1',
      stype: 'doc',
      content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
    };
    const editor = mockEditor(() => docModel);
    render(<EditorView editor={editor} />);
    const content = screen.getByTestId('editor-content');
    expect(content).toBeTruthy();
    expect(content.querySelector('[data-decorator-sid]')).toBeNull();
  });

  it('renders content with block decorators when added via ref.addDecorator', async () => {
    const docModel = {
      sid: 'doc1',
      stype: 'doc',
      content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
    };
    const editor = mockEditor(() => docModel);
    const ref = { current: null as any };
    render(<EditorView ref={ref} editor={editor} />);
    await act(() => {
      ref.current.addDecorator({
        sid: 'dec1',
        stype: 'chip',
        category: 'block',
        target: { sid: 'p1' },
        position: 'after',
      });
    });
    const content = screen.getByTestId('editor-content');
    const decoratorEl = content.querySelector('[data-decorator-sid="dec1"]');
    expect(decoratorEl).toBeTruthy();
    expect(decoratorEl?.getAttribute('data-decorator-stype')).toBe('chip');
    expect(decoratorEl?.getAttribute('data-decorator-category')).toBe('block');
  });

  it('renders inline decorators in text when added via ref.addDecorator', async () => {
    const docModel = {
      sid: 'doc1',
      stype: 'doc',
      content: [
        {
          sid: 'p1',
          stype: 'paragraph',
          content: [{ sid: 't1', stype: 'inline-text', text: 'Hello world' }],
        },
      ],
    };
    const editor = mockEditor(() => docModel);
    const ref = { current: null as any };
    render(<EditorView ref={ref} editor={editor} />);
    await act(() => {
      ref.current.addDecorator({
        sid: 'd1',
        stype: 'chip',
        category: 'inline',
        target: { sid: 't1', startOffset: 0, endOffset: 5 },
      });
    });
    const content = screen.getByTestId('editor-content');
    const decoratorEl = content.querySelector('[data-decorator-sid="d1"]');
    expect(decoratorEl).toBeTruthy();
    expect(content.textContent).toContain('Hello world');
  });

  it('ref.updateDecorator updates decorator and triggers re-render', async () => {
    const docModel = {
      sid: 'doc1',
      stype: 'doc',
      content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
    };
    const editor = mockEditor(() => docModel);
    const ref = { current: null as any };
    render(<EditorView ref={ref} editor={editor} />);
    await act(() => {
      ref.current.addDecorator({
        sid: 'upd-dec',
        stype: 'chip',
        category: 'block',
        target: { sid: 'p1' },
        position: 'after',
        data: { label: 'before' },
      });
    });
    expect(ref.current.getDecorators()[0].data?.label).toBe('before');
    await act(() => {
      ref.current.updateDecorator('upd-dec', { data: { label: 'after' } });
    });
    expect(ref.current.getDecorators()[0].data?.label).toBe('after');
    const content = screen.getByTestId('editor-content');
    expect(content.querySelector('[data-decorator-sid="upd-dec"]')).toBeTruthy();
  });

  it('ref.addDecorator and ref.getDecorators use internal manager', async () => {
    const docModel = {
      sid: 'doc1',
      stype: 'doc',
      content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
    };
    const editor = mockEditor(() => docModel);
    const ref = { current: null as any };
    render(<EditorView ref={ref} editor={editor} />);
    expect(ref.current).toBeTruthy();
    expect(ref.current.getDecorators()).toEqual([]);
    await act(() => {
      ref.current.addDecorator({
        sid: 'internal-dec',
        stype: 'chip',
        category: 'block',
        target: { sid: 'p1' },
        position: 'after',
      });
    });
    const list = ref.current.getDecorators();
    expect(list).toHaveLength(1);
    expect(list[0].sid).toBe('internal-dec');
    const content = screen.getByTestId('editor-content');
    const decoratorEl = content.querySelector('[data-decorator-sid="internal-dec"]');
    expect(decoratorEl).toBeTruthy();
  });

  it('renders decorator layer when decorator has layerTarget decorator', async () => {
    const docModel = {
      sid: 'doc1',
      stype: 'doc',
      content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
    };
    const editor = mockEditor(() => docModel);
    const ref = { current: null as any };
    const { container } = render(<EditorView ref={ref} editor={editor} />);
    await act(() => {
      ref.current.addDecorator({
        sid: 'overlay-dec',
        stype: 'comment',
        category: 'layer',
        layerTarget: 'decorator',
        target: { sid: 'p1' },
      });
    });
    const decoratorLayer = container.querySelector('[data-bc-layer="decorator"]');
    expect(decoratorLayer).toBeTruthy();
    const decoratorEl = decoratorLayer?.querySelector('[data-decorator-sid="overlay-dec"]');
    expect(decoratorEl).toBeTruthy();
  });

  it('renders all four overlay layers (decorator, selection, context, custom)', () => {
    const docModel = {
      sid: 'doc1',
      stype: 'doc',
      content: [{ sid: 'p1', stype: 'paragraph', content: [] }],
    };
    const editor = mockEditor(() => docModel);
    const { container } = render(<EditorView editor={editor} />);
    expect(container.querySelector('[data-bc-layer="decorator"]')).toBeTruthy();
    expect(container.querySelector('[data-bc-layer="selection"]')).toBeTruthy();
    expect(container.querySelector('[data-bc-layer="context"]')).toBeTruthy();
    expect(container.querySelector('[data-bc-layer="custom"]')).toBeTruthy();
  });
});
