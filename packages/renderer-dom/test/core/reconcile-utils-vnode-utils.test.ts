import { describe, it, expect } from 'vitest';
import { findFirstElementVNode, normalizeClasses, vnodeStructureMatches } from '../../src/reconcile/utils/vnode-utils';
import { VNode } from '../../src/vnode/types';

describe('reconcile-utils: vnode-utils', () => {
  describe('findFirstElementVNode', () => {
    it('should return node if it has tag', () => {
      const node: VNode = {
        tag: 'div',
        children: [],
      } as VNode;

      const result = findFirstElementVNode(node);
      expect(result).toBe(node);
    });

    it('should find first element in children', () => {
      const child1: VNode = { tag: 'span' } as VNode;
      const child2: VNode = { tag: 'div' } as VNode;
      const node: VNode = {
        children: [child1, child2],
      } as VNode;

      const result = findFirstElementVNode(node);
      expect(result).toBe(child1);
    });

    it('should find first element in nested children', () => {
      const nestedChild: VNode = { tag: 'p' } as VNode;
      const child: VNode = {
        children: [nestedChild],
      } as VNode;
      const node: VNode = {
        children: [child],
      } as VNode;

      const result = findFirstElementVNode(node);
      expect(result).toBe(nestedChild);
    });

    it('should return null if no element found', () => {
      const node: VNode = {
        children: ['text', 123],
      } as VNode;

      const result = findFirstElementVNode(node);
      expect(result).toBeNull();
    });

    it('should return null for empty node', () => {
      const node: VNode = {} as VNode;
      const result = findFirstElementVNode(node);
      expect(result).toBeNull();
    });
  });

  describe('normalizeClasses', () => {
    it('should handle string input', () => {
      const result = normalizeClasses('class1 class2 class3');
      expect(result).toEqual(['class1', 'class2', 'class3']);
    });

    it('should filter empty strings from string input', () => {
      const result = normalizeClasses('class1   class2  ');
      expect(result).toEqual(['class1', 'class2']);
    });

    it('should handle array input', () => {
      const result = normalizeClasses(['class1', 'class2', 'class3']);
      expect(result).toEqual(['class1', 'class2', 'class3']);
    });

    it('should flatten nested arrays', () => {
      const result = normalizeClasses(['class1', ['class2', 'class3']]);
      expect(result).toEqual(['class1', 'class2', 'class3']);
    });

    it('should handle object input (class-names style)', () => {
      const result = normalizeClasses({
        class1: true,
        class2: false,
        class3: true,
      });
      expect(result.sort()).toEqual(['class1', 'class3'].sort());
    });

    it('should handle mixed formats in array', () => {
      const result = normalizeClasses(['class1', { class2: true, class3: false }, 'class4']);
      expect(result.sort()).toEqual(['class1', 'class2', 'class4'].sort());
    });

    it('should return empty array for null/undefined', () => {
      expect(normalizeClasses(null)).toEqual([]);
      expect(normalizeClasses(undefined)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(normalizeClasses('')).toEqual([]);
    });
  });

  describe('vnodeStructureMatches', () => {
    it('should match VNodes with same tag, class, and children count', () => {
      const prev: VNode = {
        tag: 'span',
        attrs: { class: 'mark bold' },
        children: [{ tag: 'span' } as VNode],
      } as VNode;

      const next: VNode = {
        tag: 'span',
        attrs: { class: 'bold mark' }, // Different order, but same classes
        children: [{ tag: 'span' } as VNode],
      } as VNode;

      expect(vnodeStructureMatches(prev, next)).toBe(true);
    });

    it('should not match if tags differ', () => {
      const prev: VNode = { tag: 'span' } as VNode;
      const next: VNode = { tag: 'div' } as VNode;

      expect(vnodeStructureMatches(prev, next)).toBe(false);
    });

    it('should not match if classes differ', () => {
      const prev: VNode = {
        tag: 'span',
        attrs: { class: 'mark bold' },
      } as VNode;

      const next: VNode = {
        tag: 'span',
        attrs: { class: 'mark italic' },
      } as VNode;

      expect(vnodeStructureMatches(prev, next)).toBe(false);
    });

    it('should not match if children count differs', () => {
      const prev: VNode = {
        tag: 'span',
        children: [{ tag: 'span' } as VNode, { tag: 'span' } as VNode],
      } as VNode;

      const next: VNode = {
        tag: 'span',
        children: [{ tag: 'span' } as VNode],
      } as VNode;

      expect(vnodeStructureMatches(prev, next)).toBe(false);
    });

    it('should match VNodes with text property', () => {
      const prev: VNode = {
        tag: 'span',
        text: 'text content',
      } as VNode;

      const next: VNode = {
        tag: 'span',
        text: 'different text', // Text content doesn't matter, only presence
      } as VNode;

      expect(vnodeStructureMatches(prev, next)).toBe(true);
    });

    it('should handle className attribute', () => {
      const prev: VNode = {
        tag: 'span',
        attrs: { className: 'mark bold' },
      } as VNode;

      const next: VNode = {
        tag: 'span',
        attrs: { className: 'bold mark' },
      } as VNode;

      expect(vnodeStructureMatches(prev, next)).toBe(true);
    });

    it('should handle VNodes without classes', () => {
      const prev: VNode = { tag: 'span' } as VNode;
      const next: VNode = { tag: 'span' } as VNode;

      expect(vnodeStructureMatches(prev, next)).toBe(true);
    });
  });
});

