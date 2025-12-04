import { describe, it, expect, beforeEach } from 'vitest';
import { getElementRect, getClientRectsOfNode, getScrollOffsets } from '../../src/measure.js';

describe('measure helpers (read-only)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '0px';
    container.style.left = '0px';
    document.body.appendChild(container);
  });

  it('getElementRect returns basic box', () => {
    const el = document.createElement('div');
    el.style.width = '10px';
    el.style.height = '10px';
    container.appendChild(el);
    const r = getElementRect(el);
    expect(r.width).toBeTypeOf('number');
    expect(r.height).toBeTypeOf('number');
  });

  it('getClientRectsOfNode works for text nodes', () => {
    const el = document.createElement('div');
    el.textContent = 'hello';
    container.appendChild(el);
    const text = el.firstChild as Text;
    const rects = getClientRectsOfNode(text);
    expect(Array.isArray(rects)).toBe(true);
  });

  it('getScrollOffsets returns values', () => {
    const offsets = getScrollOffsets(window);
    expect(typeof offsets.x).toBe('number');
    expect(typeof offsets.y).toBe('number');
  });
});


