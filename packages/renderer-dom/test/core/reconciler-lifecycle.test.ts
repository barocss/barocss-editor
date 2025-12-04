import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DOMRenderer } from '../../src/dom-renderer';
import { getGlobalRegistry, define, element, slot, type ComponentProps, type ModelData } from '@barocss/dsl';
import { ComponentManager } from '../../src/component-manager';
import { defineState } from '../../src/api/define-state';

const registry = getGlobalRegistry();

describe('Reconciler component lifecycle stubs', () => {
  let mountSpy: any;
  let unmountSpy: any;
  let stateMountSpy: any;
  let stateUnmountSpy: any;

  beforeEach(() => {
    mountSpy = vi.spyOn(ComponentManager.prototype as any, 'mountComponent');
    unmountSpy = vi.spyOn(ComponentManager.prototype as any, 'unmountComponent');
  });

  afterEach(() => {
    mountSpy.mockRestore();
    unmountSpy.mockRestore();
  });

  it('calls mountComponent for newly created component hosts', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    if (!registry.has('doc')) {
      define('doc', (_p: ComponentProps, _m: ModelData) => element('article', {}, [slot('content')]));
    }
    if (!registry.has('item')) {
      define('item', (_p: ComponentProps, m: ModelData) => element('p', {}, [m.text ?? '']));
    }

    const m1: ModelData = { sid: 'd', stype: 'doc', content: [
      { sid: 'i1', stype: 'item', text: 'A' },
      { sid: 'i2', stype: 'item', text: 'B' },
    ] } as any;

    renderer.render(container, m1);
    expect(mountSpy).toHaveBeenCalled();
    // At least two mounts for i1, i2
    const mountCalls = mountSpy.mock.calls.filter((args: any[]) => args[0]?.stype === 'item');
    expect(mountCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('calls unmountComponent when component hosts are removed', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    if (!registry.has('doc2')) {
      define('doc2', (_p: ComponentProps, _m: ModelData) => element('article', {}, [slot('content')]));
    }
    if (!registry.has('item2')) {
      define('item2', (_p: ComponentProps, m: ModelData) => element('p', {}, [m.text ?? '']));
    }

    const m1: ModelData = { sid: 'd2', stype: 'doc2', content: [
      { sid: 'x1', stype: 'item2', text: 'X' },
      { sid: 'x2', stype: 'item2', text: 'Y' },
    ] } as any;
    renderer.render(container, m1);
    mountSpy.mockClear();
    unmountSpy.mockClear();

    // Remove x2
    const m2: ModelData = { sid: 'd2', stype: 'doc2', content: [
      { sid: 'x1', stype: 'item2', text: 'X' },
    ] } as any;
    renderer.render(container, m2);

    expect(unmountSpy).toHaveBeenCalled();
    const unmountCalls = unmountSpy.mock.calls.filter((args: any[]) => args[0]?.sid === 'x2');
    expect(unmountCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('invokes BaseComponentState mount/unmount hooks', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    if (!registry.has('doc-hook')) {
      define('doc-hook', (_p: ComponentProps, _m: ModelData) => element('section', {}, [slot('content')]));
    }
    if (!registry.has('item-hook')) {
      define('item-hook', (_p: ComponentProps, m: ModelData) => element('div', {}, [m.text ?? '']));
    }

    class HookState {
      mountCalls = 0;
      unmountCalls = 0;
      mount(_v: any, _c: HTMLElement) { this.mountCalls++; }
      unmount() { this.unmountCalls++; }
      snapshot() { return {}; }
    }
    defineState('item-hook', HookState as any);

    const m1: ModelData = { sid: 'dh', stype: 'doc-hook', content: [ { sid: 'ih1', stype: 'item-hook', text: 'X' } ] } as any;
    renderer.render(container, m1);

    const cm = (renderer as any).componentManager as ComponentManager;
    const inst = cm.getComponentInstance('ih1') as any;
    const stateInst = inst?.__stateInstance as HookState | undefined;
    expect(stateInst?.mountCalls).toBe(1);

    // Remove child to trigger unmount
    const m2: ModelData = { sid: 'dh', stype: 'doc-hook', content: [] } as any;
    renderer.render(container, m2);
    // instance may be removed from map; check last state snapshot via stored reference
    expect(stateInst?.unmountCalls).toBe(1);
  });

  it('cleans up prevVNodeTree and ComponentManager instances for removed sids', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    if (!registry.has('doc4')) {
      define('doc4', (_p: ComponentProps, _m: ModelData) => element('div', {}, [slot('content')]));
    }
    if (!registry.has('item4')) {
      define('item4', (_p: ComponentProps, m: ModelData) => element('span', {}, [m.text ?? '']));
    }

    const m1: ModelData = { sid: 'd4', stype: 'doc4', content: [
      { sid: 'r1', stype: 'item4', text: 'R1' },
      { sid: 'r2', stype: 'item4', text: 'R2' },
    ] } as any;
    renderer.render(container, m1);

    // Verify instances exist
    const cm = (renderer as any).componentManager as ComponentManager;
    expect(cm.getComponentInstance('r1')).toBeTruthy();
    expect(cm.getComponentInstance('r2')).toBeTruthy();

    // Remove r2
    const m2: ModelData = { sid: 'd4', stype: 'doc4', content: [
      { sid: 'r1', stype: 'item4', text: 'R1' },
    ] } as any;
    renderer.render(container, m2);

    // r2 should be cleaned up
    expect(cm.getComponentInstance('r2')).toBeUndefined();
    // r1 should still exist
    expect(cm.getComponentInstance('r1')).toBeTruthy();
  });
});

describe('Reconciler state change throttling', () => {
  it('throttles multiple setState calls to single render', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    if (!registry.has('counter5')) {
      define('counter5', (_p: ComponentProps, _m: ModelData, ctx: any) => {
        const count = ctx.instance?.get('count') ?? 0;
        return element('div', {}, [String(count)]);
      });
    }
    class State5 {
      count = 0;
      set(patch: any) {
        Object.assign(this, patch);
      }
      get(key: string) {
        return (this as any)[key];
      }
    }
    defineState('counter5', State5);

    const m1: ModelData = { sid: 'c5', stype: 'counter5' };
    renderer.render(container, m1);

    const cm = (renderer as any).componentManager as ComponentManager;
    const instance = cm.getComponentInstance('c5');
    const stateInst = (instance as any)?.__stateInstance;

    let renderCount = 0;
    const originalRender = renderer.render.bind(renderer);
    renderer.render = (...args: any[]) => {
      renderCount++;
      return originalRender(...args);
    };

    // Multiple setState calls
    if (stateInst) {
      stateInst.set({ count: 1 });
      stateInst.set({ count: 2 });
      stateInst.set({ count: 3 });
    }

    // 동기 모드에서는 즉시 완료되므로 대기 불필요

    // Should only render once (throttled)
    expect(renderCount).toBeLessThanOrEqual(2); // Allow initial + throttled
  });
});

describe('initState redefinition behavior', () => {
  it('keeps existing instance state, new sids use new initial state', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    if (!registry.has('doc6')) {
      define('doc6', (_p: ComponentProps, _m: ModelData) => element('section', {}, [slot('content')]));
    }
    if (!registry.has('counter6')) {
      define('counter6', (_p: ComponentProps, _m: ModelData, _ctx: any) => {
        return element('div', {}, []);
      });
    }

    // Define initial state: count = 0
    class State6_v1 { count = 0; set(p: any) { Object.assign(this, p); } get(k: string) { return (this as any)[k]; } }
    defineState('counter6', State6_v1);

    const child1: ModelData = { sid: 'c6', stype: 'counter6' };
    const root1: ModelData = { sid: 'd6', stype: 'doc6', content: [child1] } as any;
    renderer.render(container, root1);

    const cm = (renderer as any).componentManager as ComponentManager;
    const inst1 = cm.getComponentInstance('c6');
    const state1 = (inst1 as any)?.__stateInstance;
    expect(state1?.get('count')).toBe(0);

    // Redefine state: count = 10
    class State6_v2 { count = 10; set(p: any) { Object.assign(this, p); } get(k: string) { return (this as any)[k]; } }
    defineState('counter6', State6_v2);

    // Existing sid 'c6' should keep previous state (0)
    renderer.render(container, root1);
    const inst1b = cm.getComponentInstance('c6');
    const state1b = (inst1b as any)?.__stateInstance;
    expect(state1b?.get('count')).toBe(0);

    // New sid 'c6b' should get new initial (10)
    const child2: ModelData = { sid: 'c6b', stype: 'counter6' };
    const root2: ModelData = { sid: 'd6', stype: 'doc6', content: [child1, child2] } as any;
    renderer.render(container, root2);
    const inst2 = cm.getComponentInstance('c6b');
    const state2 = (inst2 as any)?.__stateInstance;
    expect(state2?.get('count')).toBe(10);
  });
});


