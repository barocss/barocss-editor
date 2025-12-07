import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findHostForChildVNode, findPrevChildVNode } from '../../src/reconcile/utils/host-finding';
import { VNode } from '../../src/vnode/types';

describe('reconcile-utils: host-finding', () => {
  let parent: HTMLElement;
  let document: Document;

  beforeEach(() => {
    document = window.document;
    parent = document.createElement('div');
    document.body.appendChild(parent);
  });

  afterEach(() => {
    document.body.removeChild(parent);
  });

  describe('findHostForChildVNode', () => {
    it('should find host by sid within parent', () => {
      const el = document.createElement('div');
      el.setAttribute('data-bc-sid', 'test-sid');
      parent.appendChild(el);

      const prevChildVNode: VNode = {
        tag: 'div',
        sid: 'test-sid',
        meta: {
          domElement: el
        }
      } as VNode;

      const childVNode: VNode = {
        tag: 'div',
        sid: 'test-sid',
      } as VNode;

      const result = findHostForChildVNode(
        parent,
        childVNode,
        0,
        [prevChildVNode],
        new Map()
      );

      expect(result).toBe(el);
    });

    it('should find host by decoratorSid within parent', () => {
      const el = document.createElement('div');
      el.setAttribute('data-decorator-sid', 'deco-sid');
      parent.appendChild(el);

      const prevChildVNode: VNode = {
        tag: 'div',
        attrs: {
          'data-decorator-sid': 'deco-sid'
        },
        meta: {
          domElement: el
        }
      } as VNode;

      const childVNode: VNode = {
        tag: 'div',
        attrs: {
          'data-decorator-sid': 'deco-sid'
        }
      } as VNode;

      const result = findHostForChildVNode(
        parent,
        childVNode,
        0,
        [prevChildVNode],
        new Map()
      );

      expect(result).toBe(el);
    });

    // NOTE: Global search has been removed (compare only by children like React)
    // Cross-parent move is correct behavior to create new
    it.skip('should find host globally by sid when not in parent', () => {
      // Global search removed: compare only by children like React
      // Cross-parent move creates new (React style)
      const otherParent = document.createElement('div');
      document.body.appendChild(otherParent);
      const el = document.createElement('div');
      el.setAttribute('data-bc-sid', 'test-sid');
      otherParent.appendChild(el);

      const childVNode: VNode = {
        tag: 'div',
        sid: 'test-sid',
      } as VNode;

      const result = findHostForChildVNode(
        parent,
        childVNode,
        0,
        [],
        new Map()
      );

      expect(result).toBe(el);

      document.body.removeChild(otherParent);
    });

    it('should find host by structural matching when no sid', () => {
      const el = document.createElement('span');
      el.className = 'mark bold';
      parent.appendChild(el);

      const prevChildVNode: VNode = {
        tag: 'span',
        attrs: { class: 'mark bold' },
        meta: {
          domElement: el,
        },
      } as VNode;

      const childVNode: VNode = {
        tag: 'span',
        attrs: { class: 'bold mark' },
      } as VNode;

      const result = findHostForChildVNode(
        parent,
        childVNode,
        0,
        [prevChildVNode],
        new Map()
      );

      expect(result).toBe(el);
    });

    it('should use prevChildToElement map as fallback', () => {
      const el = document.createElement('span');
      el.className = 'mark';
      parent.appendChild(el);

      const prevChildVNode: VNode = {
        tag: 'span',
        attrs: { class: 'mark' },
      } as VNode;

      const prevChildToElement = new Map([[prevChildVNode, el]]);

      const childVNode: VNode = {
        tag: 'span',
        attrs: { class: 'mark' },
      } as VNode;

      const result = findHostForChildVNode(
        parent,
        childVNode,
        0,
        [prevChildVNode],
        prevChildToElement
      );

      expect(result).toBe(el);
    });

    it('should fallback to index-based matching when no structural match', () => {
      const el = document.createElement('span');
      parent.appendChild(el);

      const childVNode: VNode = {
        tag: 'span',
      } as VNode;

      const result = findHostForChildVNode(
        parent,
        childVNode,
        0,
        [],
        new Map()
      );

      expect(result).toBe(el);
    });

    it('should return null if no match found', () => {
      const childVNode: VNode = {
        tag: 'div',
        sid: 'non-existent',
      } as VNode;

      const result = findHostForChildVNode(
        parent,
        childVNode,
        0,
        [],
        new Map()
      );

      expect(result).toBeNull();
    });
  });

  describe('findPrevChildVNode', () => {
    it('should find prevChildVNode by sid', () => {
      const prevChildVNode: VNode = {
        tag: 'div',
        sid: 'test-sid',
      } as VNode;

      const childVNode: VNode = {
        tag: 'div',
        sid: 'test-sid',
      } as VNode;

      const prevChildVNodes: VNode[] = [prevChildVNode];

      const result = findPrevChildVNode(childVNode, 0, prevChildVNodes);
      expect(result).toBe(prevChildVNode);
    });

    it('should find prevChildVNode by decoratorSid', () => {
      const prevChildVNode: VNode = {
        tag: 'div',
        attrs: {
          'data-decorator-sid': 'deco-sid'
        }
      } as VNode;

      const childVNode: VNode = {
        tag: 'div',
        attrs: {
          'data-decorator-sid': 'deco-sid'
        }
      } as VNode;

      const prevChildVNodes: VNode[] = [prevChildVNode];

      const result = findPrevChildVNode(childVNode, 0, prevChildVNodes);
      expect(result).toBe(prevChildVNode);
    });

    it('should find prevChildVNode by structural matching at same index', () => {
      const prevChildVNode: VNode = {
        tag: 'span',
        attrs: { class: 'mark bold' },
      } as VNode;

      const childVNode: VNode = {
        tag: 'span',
        attrs: { class: 'bold mark' },
      } as VNode;

      const prevChildVNodes: VNode[] = [prevChildVNode];

      const result = findPrevChildVNode(childVNode, 0, prevChildVNodes);
      expect(result).toBe(prevChildVNode);
    });

    it('should return undefined if no match found', () => {
      const childVNode: VNode = {
        tag: 'div',
        sid: 'non-existent',
      } as VNode;

      const prevChildVNodes: VNode[] = [];

      const result = findPrevChildVNode(childVNode, 0, prevChildVNodes);
      expect(result).toBeUndefined();
    });

    it('should not match if structure differs', () => {
      const prevChildVNode: VNode = {
        tag: 'span',
        attrs: { class: 'mark' },
      } as VNode;

      const childVNode: VNode = {
        tag: 'div',
        attrs: { class: 'mark' },
      } as VNode;

      const prevChildVNodes: VNode[] = [prevChildVNode];

      const result = findPrevChildVNode(childVNode, 0, prevChildVNodes);
      expect(result).toBeUndefined();
    });
  });
});

