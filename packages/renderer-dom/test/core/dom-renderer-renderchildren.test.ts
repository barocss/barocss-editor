import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DOMRenderer } from '../../src/dom-renderer';
import { VNode } from '../../src/vnode/types';

describe('DOMRenderer renderChildren', () => {
  let renderer: DOMRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    renderer = new DOMRenderer();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    renderer.destroy();
    vi.restoreAllMocks();
  });

  it('should pass decoratorMeta when rendering decorator model', () => {
    const reconcileSpy = vi.spyOn((renderer as any).reconciler, 'reconcileChildren').mockImplementation(() => {});
    const buildSpy = vi.spyOn((renderer as any).builder, 'build').mockImplementation((nodeType: string, _model: any, options: any): VNode => {
      return {
        tag: 'div',
        sid: options?.sid,
        stype: nodeType,
        decoratorSid: options?.decoratorMeta?.sid,
        attrs: {},
        children: []
      };
    });

    const model = {
      sid: 'decorator-1',
      stype: 'chip',
      category: 'layer',
      position: 'before'
    };

    renderer.renderChildren(container, [model as any]);

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(reconcileSpy).toHaveBeenCalledTimes(1);
    const buildOptions = buildSpy.mock.calls[0]?.[2];
    expect(buildOptions).toMatchObject({
      sid: 'decorator-1',
      decoratorMeta: {
        sid: 'decorator-1',
        stype: 'chip',
        category: 'layer',
        position: 'before'
      }
    });
  });

  it('should ignore invalid decorator metadata values', () => {
    vi.spyOn((renderer as any).reconciler, 'reconcileChildren').mockImplementation(() => {});
    const buildSpy = vi.spyOn((renderer as any).builder, 'build').mockImplementation((nodeType: string, _model: any, options: any): VNode => {
      return {
        tag: 'div',
        sid: options?.sid,
        stype: nodeType,
        attrs: {},
        children: []
      };
    });

    const model = {
      sid: 'decorator-2',
      stype: 'chip',
      category: 'invalid',
      position: 'center'
    };

    renderer.renderChildren(container, [model as any]);

    expect(buildSpy).toHaveBeenCalledTimes(1);
    const buildOptions = buildSpy.mock.calls[0]?.[2];
    expect(buildOptions?.decoratorMeta).toEqual({
      sid: 'decorator-2',
      stype: 'chip'
    });
  });

  it('should ignore models without sid', () => {
    const reconcileSpy = vi.spyOn((renderer as any).reconciler, 'reconcileChildren').mockImplementation(() => {});
    const buildSpy = vi.spyOn((renderer as any).builder, 'build').mockImplementation((nodeType: string, _model: any, _options: any): VNode => {
      return {
        tag: 'div',
        stype: nodeType,
        attrs: {},
        children: []
      };
    });

    const models = [
      { stype: 'chip', sid: '', category: 'layer' },
      { stype: '', sid: 'no-stype', category: 'layer' },
      { sid: 'd3', stype: 'chip', category: 'layer' }
    ];

    renderer.renderChildren(container, models as any);

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy).toHaveBeenCalledWith('chip', expect.objectContaining({ sid: 'd3' }), expect.anything());
    expect(reconcileSpy).toHaveBeenCalledTimes(1);
  });
});
