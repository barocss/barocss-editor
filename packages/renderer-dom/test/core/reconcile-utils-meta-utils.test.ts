import { describe, it, expect } from 'vitest';
import { transferMetaFromPrevToNext } from '../../src/reconcile/utils/meta-utils';
import { VNode } from '../../src/vnode/types';

describe('reconcile-utils: meta-utils', () => {
  describe('transferMetaFromPrevToNext', () => {
    it('should transfer meta.domElement from prevVNode to nextVNode', () => {
      const domElement = document.createElement('div');
      const prevVNode: VNode = {
        tag: 'div',
        meta: {
          domElement: domElement,
        },
      } as VNode;

      const nextVNode: VNode = {
        tag: 'div',
      } as VNode;

      transferMetaFromPrevToNext(prevVNode, nextVNode);

      expect(nextVNode.meta?.domElement).toBe(domElement);
    });

    it('should transfer other meta properties', () => {
      const prevVNode: VNode = {
        tag: 'div',
        meta: {
          customProp: 'value',
          anotherProp: 123,
        },
      } as VNode;

      const nextVNode: VNode = {
        tag: 'div',
      } as VNode;

      transferMetaFromPrevToNext(prevVNode, nextVNode);

      expect(nextVNode.meta?.customProp).toBe('value');
      expect(nextVNode.meta?.anotherProp).toBe(123);
    });

    it('should not overwrite existing meta properties in nextVNode', () => {
      const prevVNode: VNode = {
        tag: 'div',
        meta: {
          customProp: 'prev-value',
        },
      } as VNode;

      const nextVNode: VNode = {
        tag: 'div',
        meta: {
          customProp: 'next-value',
        },
      } as VNode;

      transferMetaFromPrevToNext(prevVNode, nextVNode);

      expect(nextVNode.meta?.customProp).toBe('next-value');
    });

    it('should always transfer domElement even if nextVNode has meta', () => {
      const domElement = document.createElement('div');
      const prevVNode: VNode = {
        tag: 'div',
        meta: {
          domElement: domElement,
          customProp: 'prev-value',
        },
      } as VNode;

      const nextVNode: VNode = {
        tag: 'div',
        meta: {
          customProp: 'next-value',
        },
      } as VNode;

      transferMetaFromPrevToNext(prevVNode, nextVNode);

      expect(nextVNode.meta?.domElement).toBe(domElement);
      expect(nextVNode.meta?.customProp).toBe('next-value');
    });

    it('should recursively transfer children meta when structure matches', () => {
      const childDomElement = document.createElement('span');
      const prevChild: VNode = {
        tag: 'span',
        attrs: { class: 'mark' },
        meta: {
          domElement: childDomElement,
        },
      } as VNode;

      const prevVNode: VNode = {
        tag: 'div',
        children: [prevChild],
      } as VNode;

      const nextChild: VNode = {
        tag: 'span',
        attrs: { class: 'mark' },
      } as VNode;

      const nextVNode: VNode = {
        tag: 'div',
        children: [nextChild],
      } as VNode;

      transferMetaFromPrevToNext(prevVNode, nextVNode);

      expect(nextChild.meta?.domElement).toBe(childDomElement);
    });

    it('should recursively transfer children meta when sid matches', () => {
      const childDomElement = document.createElement('span');
      const prevChild: VNode = {
        tag: 'span',
        sid: 'child-sid',
        meta: {
          domElement: childDomElement,
        },
      } as VNode;

      const prevVNode: VNode = {
        tag: 'div',
        children: [prevChild],
      } as VNode;

      const nextChild: VNode = {
        tag: 'span',
        sid: 'child-sid',
      } as VNode;

      const nextVNode: VNode = {
        tag: 'div',
        children: [nextChild],
      } as VNode;

      transferMetaFromPrevToNext(prevVNode, nextVNode);

      expect(nextChild.meta?.domElement).toBe(childDomElement);
    });

    it('should recursively transfer children meta when decoratorSid matches', () => {
      const childDomElement = document.createElement('span');
      const prevChild: VNode = {
        tag: 'span',
        decoratorSid: 'deco-sid',
        meta: {
          domElement: childDomElement,
        },
      } as VNode;

      const prevVNode: VNode = {
        tag: 'div',
        children: [prevChild],
      } as VNode;

      const nextChild: VNode = {
        tag: 'span',
        decoratorSid: 'deco-sid',
      } as VNode;

      const nextVNode: VNode = {
        tag: 'div',
        children: [nextChild],
      } as VNode;

      transferMetaFromPrevToNext(prevVNode, nextVNode);

      expect(nextChild.meta?.domElement).toBe(childDomElement);
    });

    it('should not transfer if prevVNode is undefined', () => {
      const nextVNode: VNode = {
        tag: 'div',
      } as VNode;

      transferMetaFromPrevToNext(undefined, nextVNode);

      expect(nextVNode.meta).toBeUndefined();
    });

    it('should handle mismatched children lengths', () => {
      const prevVNode: VNode = {
        tag: 'div',
        children: [
          { tag: 'span' } as VNode,
          { tag: 'span' } as VNode,
        ],
      } as VNode;

      const nextVNode: VNode = {
        tag: 'div',
        children: [
          { tag: 'span' } as VNode,
        ],
      } as VNode;

      // Should not throw
      expect(() => {
        transferMetaFromPrevToNext(prevVNode, nextVNode);
      }).not.toThrow();
    });

    it('should not transfer if children are not VNodes', () => {
      const prevVNode: VNode = {
        tag: 'div',
        children: ['text', 123],
      } as VNode;

      const nextVNode: VNode = {
        tag: 'div',
        children: ['text', 123],
      } as VNode;

      // Should not throw
      expect(() => {
        transferMetaFromPrevToNext(prevVNode, nextVNode);
      }).not.toThrow();
    });
  });
});

