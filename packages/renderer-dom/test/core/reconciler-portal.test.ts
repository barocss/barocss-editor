import { describe, it, expect } from 'vitest';
import { DOMRenderer } from '../../src/dom-renderer';
import { getGlobalRegistry, define, element, portal, type ComponentProps, type ModelData } from '@barocss/dsl';
import { normalizeHTML } from '../utils/html';

const registry = getGlobalRegistry();

describe('Reconciler portal handling', () => {
  it('renders portal to body and retains by portalId across re-renders', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    if (!registry.has('portal-host')) {
      define('portal-host', (_p: ComponentProps, m: ModelData) => {
        const target = () => document.body as unknown as HTMLElement;
        return element('div', { className: 'host' }, [
          portal(target, element('div', { id: m.portalId, className: 'portal' }, [m.text ?? '']))
        ]);
      });
    }

    const m1: ModelData = { sid: 'ph1', stype: 'portal-host', portalId: 'prt-1', text: 'Hello' };
    renderer.render(container, m1);
    const body1 = normalizeHTML(document.body);
    expect(body1).toContain('id="prt-1"');

    const m2: ModelData = { sid: 'ph1', stype: 'portal-host', portalId: 'prt-1', text: 'World' };
    renderer.render(container, m2);
    const body2 = normalizeHTML(document.body);
    expect(body2).toContain('id="prt-1"');
  });

  it('renders multiple portals to same target and keeps both by portalId', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    const target = () => document.body as unknown as HTMLElement;
    if (!registry.has('portal-dual')) {
      define('portal-dual', (_p: ComponentProps, m: ModelData) => {
        return element('div', { className: 'host' }, [
          portal(target, element('div', { id: m.portalId1, className: 'p1' }, []), 'prt-a'),
          portal(target, element('div', { id: m.portalId2, className: 'p2' }, []), 'prt-b')
        ]);
      });
    }

    const m: ModelData = { sid: 'pd', stype: 'portal-dual', portalId1: 'prt-a', portalId2: 'prt-b' };
    renderer.render(container, m);
    const body = normalizeHTML(document.body);
    expect(body).toContain('id="prt-a"');
    expect(body).toContain('id="prt-b"');
  });

  it('updates portal content attributes across re-renders (same portalId)', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    const target = () => document.body as unknown as HTMLElement;
    if (!registry.has('portal-attr')) {
      define('portal-attr', (_p: ComponentProps, m: ModelData) => {
        return element('div', { className: 'host' }, [
          portal(target, element('div', { id: m.portalId, className: m.cls }, []))
        ]);
      });
    }

    const m1: ModelData = { sid: 'pa', stype: 'portal-attr', portalId: 'prt-x', cls: 'a' };
    renderer.render(container, m1);
    let body = normalizeHTML(document.body);
    expect(body).toContain('id="prt-x"');
    expect(body).toContain('class="a"');

    const m2: ModelData = { sid: 'pa', stype: 'portal-attr', portalId: 'prt-x', cls: 'b' };
    renderer.render(container, m2);
    body = normalizeHTML(document.body);
    expect(body).toContain('id="prt-x"');
    expect(body).toContain('class="b"');
  });

  it('changes portal target (body → selector) and cleans up previous host', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');
    const targetDiv = document.createElement('div');
    targetDiv.id = 'portal-target';
    document.body.appendChild(targetDiv);

    const bodyTarget = () => document.body as unknown as HTMLElement;
    const selectorTarget = () => document.querySelector('#portal-target') as HTMLElement;

    if (!registry.has('portal-switch')) {
      define('portal-switch', (_p: ComponentProps, m: ModelData) => {
        const tgt = m.useBody ? bodyTarget : selectorTarget;
        return element('div', { className: 'host' }, [
          portal(tgt, element('div', { id: m.portalId, className: 'switch' }, [m.text ?? '']))
        ]);
      });
    }

    // First render to body
    const m1: ModelData = { sid: 'ps', stype: 'portal-switch', portalId: 'prt-sw', text: 'A', useBody: true };
    renderer.render(container, m1);
    expect(normalizeHTML(document.body)).toContain('id="prt-sw"');
    expect(normalizeHTML(targetDiv)).not.toContain('id="prt-sw"');

    // Switch to selector target; body should be cleaned up, targetDiv should contain portal
    const m2: ModelData = { sid: 'ps', stype: 'portal-switch', portalId: 'prt-sw', text: 'B', useBody: false };
    renderer.render(container, m2);
    expect(normalizeHTML(targetDiv)).toContain('id="prt-sw"');
    // Ensure no direct portal content under body root (should be only under #portal-target)
    expect(document.body.querySelector(':scope > .switch')).toBeNull();
  });

  it('removes portal when not rendered anymore and cleans target container', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    const target = () => document.body as unknown as HTMLElement;
    if (!registry.has('portal-toggle')) {
      define('portal-toggle', (_p: ComponentProps, m: ModelData) => {
        return element('div', { className: 'host' }, [
          m.show ? portal(target, element('div', { id: m.portalId, className: 'toggle' }, [])) : null
        ] as any);
      });
    }

    // Render with portal
    const m1: ModelData = { sid: 'pt', stype: 'portal-toggle', portalId: 'prt-tg', show: true };
    renderer.render(container, m1);
    expect(normalizeHTML(document.body)).toContain('id="prt-tg"');

    // Render without portal -> should cleanup
    const m2: ModelData = { sid: 'pt', stype: 'portal-toggle', show: false };
    renderer.render(container, m2);
    expect(normalizeHTML(document.body)).not.toContain('id="prt-tg"');
  });
 
});


