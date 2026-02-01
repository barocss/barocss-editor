import { describe, it, expect } from 'vitest';
import { findClosestInlineTextNode, reconstructModelTextFromDOM } from '../src/dom-sync/edit-position';

describe('findClosestInlineTextNode', () => {
  it('returns element with data-bc-sid when node is that element', () => {
    const el = document.createElement('span');
    el.setAttribute('data-bc-sid', 'n1');
    expect(findClosestInlineTextNode(el)).toBe(el);
  });

  it('returns closest ancestor with data-bc-sid when node is child', () => {
    const wrap = document.createElement('span');
    wrap.setAttribute('data-bc-sid', 'n1');
    const text = document.createTextNode('hi');
    wrap.appendChild(text);
    expect(findClosestInlineTextNode(text)).toBe(wrap);
  });

  it('returns null when no ancestor has data-bc-sid', () => {
    const div = document.createElement('div');
    const text = document.createTextNode('hi');
    div.appendChild(text);
    expect(findClosestInlineTextNode(text)).toBeNull();
  });

  it('returns null for null node', () => {
    expect(findClosestInlineTextNode(null as any)).toBeNull();
  });
});

describe('reconstructModelTextFromDOM', () => {
  it('returns concatenated text from text nodes in order', () => {
    const span = document.createElement('span');
    span.setAttribute('data-bc-sid', 'n1');
    const t1 = document.createTextNode('Hello');
    const t2 = document.createTextNode(' ');
    const t3 = document.createTextNode('World');
    span.appendChild(t1);
    span.appendChild(t2);
    span.appendChild(t3);
    expect(reconstructModelTextFromDOM(span)).toBe('Hello World');
  });

  it('returns empty string when element has no text nodes', () => {
    const span = document.createElement('span');
    span.setAttribute('data-bc-sid', 'n1');
    expect(reconstructModelTextFromDOM(span)).toBe('');
  });
});
