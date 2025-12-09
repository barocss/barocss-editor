import { describe, it, expect } from 'vitest';
import { vnodeStructureMatches, normalizeClasses } from '../../src/reconcile/utils/vnode-utils';
import { VNode } from '../../src/vnode/types';

describe('vnode-utils - decorator related cases', () => {
  describe('vnodeStructureMatches - decorator VNode', () => {
    it('decoratorSid를 가진 VNode의 구조를 비교해야 함', () => {
      const prev: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        },
        children: [{ tag: undefined, text: 'text' }]
      };

      const next: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        },
        children: [{ tag: undefined, text: 'text' }]
      };

      expect(vnodeStructureMatches(prev, next)).toBe(true);
    });

    it('decoratorSid가 다른 경우 구조가 다르다고 판단해야 함', () => {
      const prev: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      const next: VNode = {
        tag: 'span',
        attrs: {
          className: 'underline-decorator',
          'data-decorator-sid': 'd-underline',
          'data-decorator-stype': 'underline'
        }
      };

      // Structure differs because class is different
      expect(vnodeStructureMatches(prev, next)).toBe(false);
    });

    it('같은 decoratorSid를 가진 여러 VNode의 구조를 비교해야 함', () => {
      const prev: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        },
        children: [{ tag: undefined, text: 'first' }]
      };

      const next: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        },
        children: [{ tag: undefined, text: 'second' }]
      };

      // Structure is same but content differs (children count is same)
      expect(vnodeStructureMatches(prev, next)).toBe(true);
    });

    it('tag가 다른 경우 구조가 다르다고 판단해야 함', () => {
      const prev: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      const next: VNode = {
        tag: 'div',
        attrs: {
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      expect(vnodeStructureMatches(prev, next)).toBe(false);
    });
  });

  describe('normalizeClasses - decorator 관련', () => {
    it('decorator className을 정규화해야 함', () => {
      const result = normalizeClasses('highlight-decorator mark-bold');
      expect(result).toEqual(['highlight-decorator', 'mark-bold']);
    });

    it('배열 형식의 className을 정규화해야 함', () => {
      const result = normalizeClasses(['highlight-decorator', 'mark-bold']);
      expect(result).toEqual(['highlight-decorator', 'mark-bold']);
    });

    it('객체 형식의 className을 정규화해야 함', () => {
      const result = normalizeClasses({
        'highlight-decorator': true,
        'mark-bold': true,
        'mark-italic': false
      });
      expect(result.sort()).toEqual(['highlight-decorator', 'mark-bold'].sort());
    });
  });
});

