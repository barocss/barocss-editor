import { describe, it, expect, vi } from 'vitest';
import { DOMRenderer } from '../../src/dom-renderer';
import { getGlobalRegistry, define, element, type ComponentProps, type ModelData } from '@barocss/dsl';
import { normalizeHTML } from '../utils/html';

const registry = getGlobalRegistry();

describe('Reconciler error/edge handling', () => {
  it('rendering model without sid updates DOM but hides auto-generated ids', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    if (!registry.has('para')) {
      define('para', (_p: ComponentProps, m: ModelData) => element('p', {}, [m.text ?? '']));
    }

    // Initial valid render
    const m1: ModelData = { sid: 'p1', stype: 'para', text: 'OK' };
    renderer.render(container, m1);
    const initial = container.firstElementChild as HTMLElement;
    expect(initial?.getAttribute('data-bc-sid')).toBe('p1');
    expect(normalizeHTML(initial)).toContain('OK');

    // Render invalid model (missing sid) should be skipped and not break existing DOM
    const invalid: any = { stype: 'para', text: 'NO' };
    renderer.render(container, invalid);
    const updated = container.firstElementChild as HTMLElement;
    expect(updated?.getAttribute('data-bc-sid')).toBeNull();
    expect(normalizeHTML(updated)).toContain('NO');
  });

  it('skips model without stype and throws early', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    if (!registry.has('para2')) {
      define('para2', (_p: ComponentProps, m: ModelData) => element('p', {}, [m.text ?? '']));
    }

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Initial valid render
    const m1: ModelData = { sid: 'p2', stype: 'para2', text: 'OK2' };
    renderer.render(container, m1);
    const h1 = normalizeHTML(container.firstElementChild as Element);
    expect(h1).toContain('OK2');

    // Render invalid model (missing stype) -> should throw at entry
    const invalid: any = { sid: 'x', text: 'NO2' };
    expect(() => renderer.render(container, invalid)).toThrowError();

    spy.mockRestore();
  });

  it('throws when stype is not registered in registry', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    const unknown: any = { sid: 'u1', stype: 'no-such-stype', text: 'X' };
    expect(() => renderer.render(container, unknown)).toThrowError();
  });

  it('ignores decorators with invalid range/position and continues rendering', () => {
    const renderer = new DOMRenderer();
    const container = document.createElement('div');

    if (!registry.has('para3')) {
      define('para3', (_p: ComponentProps, m: ModelData) => element('p', {}, [m.text ?? '']));
    }

    const m1: ModelData = { sid: 'p3', stype: 'para3', text: 'Hello' };
    const decorators = [
      {
        sid: 'dec1',
        stype: 'comment',
        category: 'inline',
        range: [100, 200], // Invalid: beyond text length
        position: 'invalid-position' // Invalid position
      }
    ] as any[];

    // Should not throw, just ignore invalid decorator
    expect(() => renderer.render(container, m1, decorators)).not.toThrow();
    const h1 = normalizeHTML(container.firstElementChild as Element);
    expect(h1).toContain('Hello');
  });
});


