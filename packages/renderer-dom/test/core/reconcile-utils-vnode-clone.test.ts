import { describe, it, expect } from 'vitest';
import { cloneVNodeTree } from '../../src/reconcile/utils/vnode-clone';
import { VNode } from '../../src/vnode/types';

describe('cloneVNodeTree - Unit Test', () => {
  describe('기본 복제', () => {
    it('단일 VNode를 복제해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'test-1',
        attrs: {
          className: 'test-class'
        }
      };

      const cloned = cloneVNodeTree(vnode);

      expect(cloned).not.toBe(vnode);
      expect(cloned.tag).toBe(vnode.tag);
      expect(cloned.sid).toBe(vnode.sid);
      expect(cloned.attrs).toEqual(vnode.attrs);
    });

    it('meta를 복제해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'test-1',
        meta: {
          domElement: document.createElement('div')
        }
      };

      const cloned = cloneVNodeTree(vnode);

      expect(cloned.meta).not.toBe(vnode.meta);
      expect(cloned.meta?.domElement).toBe(vnode.meta?.domElement);
    });
  });

  describe('자식 VNode 복제', () => {
    it('자식 VNode를 재귀적으로 복제해야 함', () => {
      const childVNode: VNode = {
        tag: 'span',
        sid: 'child-1'
      };

      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [childVNode]
      };

      const cloned = cloneVNodeTree(vnode);

      expect(cloned.children).toBeDefined();
      expect(cloned.children?.length).toBe(1);
      expect(cloned.children?.[0]).not.toBe(childVNode);
      expect((cloned.children?.[0] as VNode).sid).toBe('child-1');
    });

    it('primitive text children를 그대로 유지해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          'text1',
          {
            tag: 'span',
            sid: 'child-1'
          },
          'text2',
          123
        ]
      };

      const cloned = cloneVNodeTree(vnode);

      expect(cloned.children).toBeDefined();
      expect(cloned.children?.length).toBe(4);
      expect(cloned.children?.[0]).toBe('text1');
      expect(cloned.children?.[2]).toBe('text2');
      expect(cloned.children?.[3]).toBe(123);
      expect((cloned.children?.[1] as VNode).sid).toBe('child-1');
    });
  });

  describe('decoratorSid를 가진 VNode 복제', () => {
    it('decoratorSid를 가진 VNode를 복제해야 함', () => {
      const vnode: VNode = {
        tag: 'span',
        decoratorSid: 'd-highlight',
        decoratorStype: 'highlight'
      };

      const cloned = cloneVNodeTree(vnode);

      expect(cloned.decoratorSid).toBe('d-highlight');
      expect(cloned.decoratorStype).toBe('highlight');
    });

    it('같은 decoratorSid를 가진 여러 VNode를 복제해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          {
            tag: 'span',
            decoratorSid: 'd-highlight',
            decoratorStype: 'highlight'
          },
          {
            tag: 'span',
            decoratorSid: 'd-highlight',
            decoratorStype: 'highlight'
          }
        ]
      };

      const cloned = cloneVNodeTree(vnode);

      expect(cloned.children).toBeDefined();
      expect(cloned.children?.length).toBe(2);
      expect((cloned.children?.[0] as VNode).decoratorSid).toBe('d-highlight');
      expect((cloned.children?.[1] as VNode).decoratorSid).toBe('d-highlight');
      // Should be different objects
      expect(cloned.children?.[0]).not.toBe(cloned.children?.[1]);
    });
  });

  describe('깊은 중첩 구조 복제', () => {
    it('깊게 중첩된 VNode 트리를 복제해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'level-1',
        children: [
          {
            tag: 'div',
            sid: 'level-2',
            children: [
              {
                tag: 'span',
                sid: 'level-3'
              }
            ]
          }
        ]
      };

      const cloned = cloneVNodeTree(vnode);

      expect(cloned.sid).toBe('level-1');
      expect((cloned.children?.[0] as VNode).sid).toBe('level-2');
      expect(((cloned.children?.[0] as VNode).children?.[0] as VNode).sid).toBe('level-3');
      
      // All levels should be different objects
      expect(cloned).not.toBe(vnode);
      expect(cloned.children?.[0]).not.toBe(vnode.children?.[0]);
      expect((cloned.children?.[0] as VNode).children?.[0]).not.toBe((vnode.children?.[0] as VNode).children?.[0]);
    });
  });
});

