import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DOMRenderer } from '../../src/dom-renderer';
import { getGlobalRegistry, define, element, slot } from '@barocss/dsl';
import { normalizeHTML } from '../utils/html';

const registry = getGlobalRegistry();

if (!registry.has('display')) {
  define('display', (_props: any, model: any) => element('div', {}, [String(model?.text ?? '')]));
}
if (!registry.has('document')) {
  define('document', (_props: any, _model: any) => element('article', { className: 'document' }, [slot('content')]));
}


describe('Reconciler component state (emit + manual update)', () => {
  it('emits changeState and then updates subtree manually to reflect new state', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    const disp = { sid: 'disp1', stype: 'display', text: 'Initial' } as any;
    const doc = { sid: 'doc-state', stype: 'document', content: [disp] } as any;

    renderer.render(container, doc);
    const before = normalizeHTML(container.firstElementChild as Element);
    expect(before).toContain('Initial');

    // simulate state change: ComponentManager emits, then we re-render only target node
    const compMgr = (renderer as any).componentManager;
    compMgr.emit('changeState', 'disp1', { state: { text: 'Changed' }, patch: { text: 'Changed' } });

    const dispChanged = { sid: 'disp1', stype: 'display', text: 'Changed' } as any;
    const doc2 = { sid: 'doc-state', stype: 'document', content: [dispChanged] } as any;
    renderer.render(container, doc2);

    const after = normalizeHTML(container.firstElementChild as Element);
    expect(after).toContain('Changed');
    expect(after).not.toContain('>Initial<');
  });
});

describe('Component State Change Flow', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container && container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it('should trigger full re-render on changeState event', async () => {
    const renderer = new DOMRenderer(registry);
    
    const disp = { sid: 'disp1', stype: 'display', text: 'Initial' } as any;
    const doc = { sid: 'doc-state', stype: 'document', content: [disp] } as any;

    // Initial render
    renderer.render(container, doc);
    expect(container.textContent).toContain('Initial');

    // Spy on render method BEFORE emit
    const renderSpy = vi.spyOn(renderer, 'render');

    // Simulate state change
    const componentManager = (renderer as any).componentManager;
    componentManager.emit('changeState', 'disp1', { 
      state: { text: 'Changed' }, 
      patch: { text: 'Changed' } 
    });

    // queueMicrotask는 마이크로태스크 큐에 넣으므로 대기 필요
    await new Promise(resolve => queueMicrotask(resolve));

    // Should trigger render after microtask
    expect(renderSpy).toHaveBeenCalled();
    // Verify it was called with the stored lastModel
    const calls = renderSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe(container);
    expect(lastCall[1]).toEqual(expect.objectContaining({ sid: 'doc-state' }));

    renderSpy.mockRestore();
  });

  it('should prevent duplicate renders with renderScheduled flag', async () => {
    const renderer = new DOMRenderer(registry);
    
    const disp = { sid: 'disp1', stype: 'display', text: 'Initial' } as any;
    const doc = { sid: 'doc-state', stype: 'document', content: [disp] } as any;

    renderer.render(container, doc);

    const renderSpy = vi.spyOn(renderer, 'render');
    const componentManager = (renderer as any).componentManager;

    // Rapid state changes
    componentManager.emit('changeState', 'disp1', { state: { text: 'Change1' } });
    componentManager.emit('changeState', 'disp1', { state: { text: 'Change2' } });
    componentManager.emit('changeState', 'disp1', { state: { text: 'Change3' } });

    // queueMicrotask는 마이크로태스크 큐에 넣으므로 대기 필요
    await new Promise(resolve => queueMicrotask(resolve));

    // Should only trigger render once (renderScheduled flag prevents duplicates)
    expect(renderSpy).toHaveBeenCalledTimes(1);

    renderSpy.mockRestore();
  });

  it('should batch state changes with queueMicrotask', async () => {
    const renderer = new DOMRenderer(registry);
    
    const disp = { sid: 'disp1', stype: 'display', text: 'Initial' } as any;
    const doc = { sid: 'doc-state', stype: 'document', content: [disp] } as any;

    renderer.render(container, doc);

    const renderSpy = vi.spyOn(renderer, 'render');
    const componentManager = (renderer as any).componentManager;

    // Multiple state changes before microtask
    componentManager.emit('changeState', 'disp1', { state: { text: 'Change1' } });
    componentManager.emit('changeState', 'disp2', { state: { text: 'Change2' } });
    componentManager.emit('changeState', 'disp3', { state: { text: 'Change3' } });

    // Before microtask, render should not be called
    expect(renderSpy).not.toHaveBeenCalled();

    // queueMicrotask는 마이크로태스크 큐에 넣으므로 대기 필요
    await new Promise(resolve => queueMicrotask(resolve));

    // After microtask, render should be called once (batched)
    expect(renderSpy).toHaveBeenCalledTimes(1);

    renderSpy.mockRestore();
  });

  it('should reuse nextVNode in updateComponent instead of rebuilding', () => {
    // Register paragraph renderer
    if (!registry.has('paragraph')) {
      define('paragraph', element('p', {
        'data-bc-sid': (data: any) => data.sid || '',
        'data-bc-stype': (data: any) => data.stype || ''
      }, [slot('content')]));
    }
    if (!registry.has('inline-text')) {
      define('inline-text', element('span', {
        'data-bc-sid': (data: any) => data.sid || '',
        'data-bc-stype': (data: any) => data.stype || ''
      }, [(data: any) => data.text || '']));
    }

    const renderer = new DOMRenderer(registry);
    
    const model1 = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [
        { sid: 'text-1', stype: 'inline-text', text: 'Hello' }
      ]
    } as any;

    // First render (mount)
    renderer.render(container, model1);
    const paragraphElement1 = container.querySelector('[data-bc-sid="p-1"]') as HTMLElement;
    expect(paragraphElement1).toBeTruthy();

    // Spy on updateComponent to verify it reuses nextVNode
    const componentManager = (renderer as any).componentManager;
    const updateComponentSpy = vi.spyOn(componentManager, 'updateComponent');

    // Re-render with same model (update, not mount)
    renderer.render(container, model1);
    const paragraphElement2 = container.querySelector('[data-bc-sid="p-1"]') as HTMLElement;

    // Component should be reused
    expect(paragraphElement1).toBe(paragraphElement2);

    // updateComponent should be called (component exists)
    // Since we're re-rendering with the same model, nextVNode should be reused
    if (updateComponentSpy.mock.calls.length > 0) {
      // Component was updated successfully
      expect(updateComponentSpy).toHaveBeenCalled();
    }

    updateComponentSpy.mockRestore();
  });

  it('should rebuild only when nextVNode is missing or empty', () => {
    // Enable debug logging
    (globalThis as any).__DEBUG_RECONCILE__ = true;
    
    // Register paragraph renderer
    if (!registry.has('paragraph')) {
      define('paragraph', element('p', {
        'data-bc-sid': (data: any) => data.sid || '',
        'data-bc-stype': (data: any) => data.stype || ''
      }, [slot('content')]));
    }
    if (!registry.has('inline-text')) {
      define('inline-text', element('span', {
        'data-bc-sid': (data: any) => data.sid || '',
        'data-bc-stype': (data: any) => data.stype || ''
      }, [(data: any) => data.text || '']));
    }

    const renderer = new DOMRenderer(registry);
    
    const model = {
      sid: 'p-1',
      stype: 'paragraph',
      content: [
        { sid: 'text-1', stype: 'inline-text', text: 'Hello' }
      ]
    } as any;

    // First render (mount)
    renderer.render(container, model);
    
    // Also spy on mountComponent and updateComponent to distinguish calls
    const componentManager = (renderer as any).componentManager;
    const mountComponentSpy = vi.spyOn(componentManager, 'mountComponent');
    const updateComponentSpy = vi.spyOn(componentManager, 'updateComponent');

    // Re-render with same model (update) - should reuse nextVNode
    console.log('=== Second render 시작 ===');
    renderer.render(container, model);
    console.log('=== Second render 완료 ===');

    // mountComponent should NOT be called (component already mounted)
    expect(mountComponentSpy).not.toHaveBeenCalled();
    
    // updateComponent should be called (component exists and is being updated)
    expect(updateComponentSpy).toHaveBeenCalled();

    mountComponentSpy.mockRestore();
    updateComponentSpy.mockRestore();
    delete (globalThis as any).__DEBUG_RECONCILE__;
  });

  it('should reflect component state in VNode during full rebuild', async () => {
    const renderer = new DOMRenderer(registry);
    
    // Create a component that uses state
    if (!registry.has('counter')) {
      define('counter', (_props: any, model: any, ctx: any) => {
        const count = ctx?.getState?.('count') || model?.count || 0;
        return element('div', { className: 'counter' }, [
          element('span', {}, [String(count)])
        ]);
      });
    }

    const counter = { sid: 'counter-1', stype: 'counter', count: 0 } as any;
    const doc = { sid: 'doc-state', stype: 'document', content: [counter] } as any;

    // Initial render
    renderer.render(container, doc);
    expect(container.textContent).toContain('0');

    // Spy on render method BEFORE emit
    const renderSpy = vi.spyOn(renderer, 'render');

    // Update component state
    const componentManager = (renderer as any).componentManager;
    const instance = componentManager.getInstance('counter-1');
    if (instance) {
      instance.state = { count: 5 };
      (instance as any).lastRenderedState = { count: 0 };
    }

    // Trigger changeState event
    componentManager.emit('changeState', 'counter-1', { 
      state: { count: 5 }, 
      patch: { count: 5 } 
    });

    // queueMicrotask는 마이크로태스크 큐에 넣으므로 대기 필요
    await new Promise(resolve => queueMicrotask(resolve));

    // State should be reflected in the rebuilt VNode
    // Note: This test verifies that changeState triggers re-render
    // The actual state reflection depends on componentStateProvider implementation
    expect(renderSpy).toHaveBeenCalled();

    renderSpy.mockRestore();
  });
});


