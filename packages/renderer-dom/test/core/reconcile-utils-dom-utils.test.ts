import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findChildHost, queryHost, reorder } from '../../src/reconcile/utils/dom-utils';
import { VNode } from '../../src/vnode/types';

describe('reconcile-utils: dom-utils', () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
  });

  afterEach(() => {
    document.body.removeChild(parent);
  });

  describe('findChildHost', () => {
    it('should find element by data-bc-sid', () => {
      const el = document.createElement('div');
      el.setAttribute('data-bc-sid', 'test-sid');
      parent.appendChild(el);

      const vnode: VNode = {
        tag: 'div',
        sid: 'test-sid',
      } as VNode;

      const result = findChildHost(parent, vnode, 0);
      expect(result).toBe(el);
    });

    it('should find element by data-decorator-sid', () => {
      const el = document.createElement('div');
      el.setAttribute('data-decorator-sid', 'deco-sid');
      parent.appendChild(el);

      const vnode: VNode = {
        tag: 'div',
        attrs: {
          'data-decorator-sid': 'deco-sid'
        }
      } as VNode;

      const result = findChildHost(parent, vnode, 0);
      expect(result).toBe(el);
    });

    it('should fallback to index and tag matching when no sid', () => {
      const el = document.createElement('span');
      el.className = 'mark bold';
      parent.appendChild(el);

      const vnode: VNode = {
        tag: 'span',
        attrs: { class: 'bold mark' },
      } as VNode;

      const result = findChildHost(parent, vnode, 0);
      expect(result).toBe(el);
    });

    it('should not match element with sid when vnode has no sid', () => {
      const el = document.createElement('span');
      el.setAttribute('data-bc-sid', 'has-sid');
      parent.appendChild(el);

      const vnode: VNode = {
        tag: 'span',
      } as VNode;

      const result = findChildHost(parent, vnode, 0);
      expect(result).toBeNull();
    });

    it('should match by class when no sid', () => {
      const el = document.createElement('span');
      el.className = 'mark bold';
      parent.appendChild(el);

      const vnode: VNode = {
        tag: 'span',
        attrs: { class: 'mark bold' },
      } as VNode;

      const result = findChildHost(parent, vnode, 0);
      expect(result).toBe(el);
    });

    it('should return null if no match found', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'non-existent',
      } as VNode;

      const result = findChildHost(parent, vnode, 0);
      expect(result).toBeNull();
    });
  });

  describe('queryHost', () => {
    it('should find direct child by data-bc-sid', () => {
      const el = document.createElement('div');
      el.setAttribute('data-bc-sid', 'test-sid');
      parent.appendChild(el);

      const result = queryHost(parent, 'test-sid');
      expect(result).toBe(el);
    });

    it('should find direct child even when nested element exists', () => {
      // Create a direct child
      const directChild = document.createElement('div');
      directChild.setAttribute('data-bc-sid', 'test-sid');
      parent.appendChild(directChild);

      // Create a nested element with same sid
      const outer = document.createElement('div');
      const inner = document.createElement('div');
      inner.setAttribute('data-bc-sid', 'test-sid');
      outer.appendChild(inner);
      parent.appendChild(outer);

      // queryHost should find the direct child (first match)
      const result = queryHost(parent, 'test-sid');
      expect(result).toBe(directChild);
      expect(Array.from(parent.children)).toContain(result);
    });

    it('should return null if not found', () => {
      const result = queryHost(parent, 'non-existent');
      expect(result).toBeNull();
    });
  });

  describe('reorder', () => {
    it('should reorder elements to match array order', () => {
      const el1 = document.createElement('div');
      el1.textContent = '1';
      const el2 = document.createElement('div');
      el2.textContent = '2';
      const el3 = document.createElement('div');
      el3.textContent = '3';

      parent.appendChild(el1);
      parent.appendChild(el2);
      parent.appendChild(el3);

      // Reorder to: el3, el1, el2
      reorder(parent, [el3, el1, el2]);

      expect(Array.from(parent.children)).toEqual([el3, el1, el2]);
    });

    it('should handle text nodes in reorder', () => {
      const text1 = document.createTextNode('text1');
      const text2 = document.createTextNode('text2');
      const el = document.createElement('div');

      parent.appendChild(text1);
      parent.appendChild(text2);
      parent.appendChild(el);

      // Reorder to: el, text2, text1
      reorder(parent, [el, text2, text1]);

      expect(Array.from(parent.childNodes)).toEqual([el, text2, text1]);
    });

    it('should handle already correct order', () => {
      const el1 = document.createElement('div');
      const el2 = document.createElement('div');
      const el3 = document.createElement('div');

      parent.appendChild(el1);
      parent.appendChild(el2);
      parent.appendChild(el3);

      reorder(parent, [el1, el2, el3]);

      expect(Array.from(parent.children)).toEqual([el1, el2, el3]);
    });

    it('should handle empty array', () => {
      const el = document.createElement('div');
      parent.appendChild(el);

      reorder(parent, []);

      // Element should remain (reorder doesn't remove, removeStale does)
      expect(parent.children.length).toBe(1);
    });

    it('should handle partial reorder', () => {
      const el1 = document.createElement('div');
      const el2 = document.createElement('div');
      const el3 = document.createElement('div');

      parent.appendChild(el1);
      parent.appendChild(el2);
      parent.appendChild(el3);

      // Only reorder first two
      reorder(parent, [el2, el1]);

      // el2 should be first, el1 second, el3 should remain
      expect(parent.children[0]).toBe(el2);
      expect(parent.children[1]).toBe(el1);
      expect(parent.children[2]).toBe(el3);
    });
  });
});

