import { describe, it, expect, beforeEach } from 'vitest';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { VNode } from '../../src/vnode/types';

describe('createFiberTree - 단위 테스트', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('기본 Fiber 트리 생성', () => {
    it('단일 VNode로 Fiber를 생성해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'test-1'
      };

      const fiber = createFiberTree(container, vnode, undefined, {});

      expect(fiber).toBeDefined();
      expect(fiber.vnode).toBe(vnode);
      expect(fiber.prevVNode).toBeUndefined();
      expect(fiber.parent).toBe(container);
      expect(fiber.domElement).toBeNull();
      expect(fiber.child).toBeNull();
      expect(fiber.sibling).toBeNull();
      expect(fiber.index).toBe(0);
    });

    it('자식 VNode가 있는 경우 child Fiber를 생성해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          {
            tag: 'span',
            sid: 'child-1'
          },
          {
            tag: 'span',
            sid: 'child-2'
          }
        ]
      };

      const fiber = createFiberTree(container, vnode, undefined, {});

      expect(fiber.child).toBeDefined();
      expect(fiber.child?.vnode.sid).toBe('child-1');
      expect(fiber.child?.sibling).toBeDefined();
      expect(fiber.child?.sibling?.vnode.sid).toBe('child-2');
      expect(fiber.child?.sibling?.sibling).toBeNull();
    });
  });

  describe('decoratorSid를 가진 VNode 처리', () => {
    it('decoratorSid를 가진 VNode로 Fiber를 생성해야 함', () => {
      const vnode: VNode = {
        tag: 'span',
        decoratorSid: 'd-highlight',
        decoratorStype: 'highlight'
      };

      const fiber = createFiberTree(container, vnode, undefined, {});

      expect(fiber).toBeDefined();
      expect(fiber.vnode.decoratorSid).toBe('d-highlight');
      expect(fiber.vnode.decoratorStype).toBe('highlight');
    });

    it('같은 decoratorSid를 가진 여러 VNode가 각각 Fiber로 생성되어야 함', () => {
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

      const fiber = createFiberTree(container, vnode, undefined, {});

      expect(fiber.child).toBeDefined();
      expect(fiber.child?.vnode.decoratorSid).toBe('d-highlight');
      expect(fiber.child?.sibling).toBeDefined();
      expect(fiber.child?.sibling?.vnode.decoratorSid).toBe('d-highlight');
      // 두 Fiber는 서로 다른 객체여야 함
      expect(fiber.child).not.toBe(fiber.child?.sibling);
    });
  });

  describe('prevVNode 매칭', () => {
    it('prevVNode의 children에서 sid로 매칭해야 함', () => {
      const prevVNode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          {
            tag: 'span',
            sid: 'child-1'
          },
          {
            tag: 'span',
            sid: 'child-2'
          }
        ]
      };

      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          {
            tag: 'span',
            sid: 'child-2' // 순서가 바뀜
          },
          {
            tag: 'span',
            sid: 'child-1' // 순서가 바뀜
          }
        ]
      };

      const fiber = createFiberTree(container, vnode, prevVNode, {});

      expect(fiber.child).toBeDefined();
      // child-2가 첫 번째이지만, prevVNode에서 child-2를 찾아야 함
      expect(fiber.child?.prevVNode?.sid).toBe('child-2');
      expect(fiber.child?.sibling?.prevVNode?.sid).toBe('child-1');
    });

    it('decoratorSid로도 매칭해야 함', () => {
      const prevVNode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          {
            tag: 'span',
            decoratorSid: 'd-highlight',
            decoratorStype: 'highlight'
          }
        ]
      };

      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          {
            tag: 'span',
            decoratorSid: 'd-highlight',
            decoratorStype: 'highlight'
          }
        ]
      };

      const fiber = createFiberTree(container, vnode, prevVNode, {});

      expect(fiber.child).toBeDefined();
      expect(fiber.child?.prevVNode?.decoratorSid).toBe('d-highlight');
    });
  });

  describe('primitive text children 처리', () => {
    it('primitive text는 Fiber로 생성하지 않고 정보만 저장해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          'text1',
          123,
          {
            tag: 'span',
            sid: 'child-1'
          }
        ]
      };

      const fiber = createFiberTree(container, vnode, undefined, {});

      // primitive text는 Fiber로 생성되지 않음
      expect(fiber.child).toBeDefined();
      expect(fiber.child?.vnode.sid).toBe('child-1');
      expect(fiber.child?.sibling).toBeNull();
      
      // primitive text 정보는 저장됨
      expect(fiber.primitiveTextChildren).toBeDefined();
      expect(fiber.primitiveTextChildren?.length).toBe(2);
      expect(fiber.primitiveTextChildren?.[0].text).toBe('text1');
      expect(fiber.primitiveTextChildren?.[0].index).toBe(0);
      expect(fiber.primitiveTextChildren?.[1].text).toBe(123);
      expect(fiber.primitiveTextChildren?.[1].index).toBe(1);
    });
  });

  describe('vnode.text 처리', () => {
    it('vnode.text가 있고 children이 없으면 자식 Fiber를 생성하지 않아야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        text: 'some text',
        children: []
      };

      const fiber = createFiberTree(container, vnode, undefined, {});

      expect(fiber.child).toBeNull();
      expect(fiber.primitiveTextChildren).toBeUndefined();
    });
  });
});

