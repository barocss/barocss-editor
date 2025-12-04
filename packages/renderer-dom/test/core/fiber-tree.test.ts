import { describe, it, expect, beforeEach } from 'vitest';
import { createFiberTree } from '../../src/reconcile/fiber/fiber-tree';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { VNode } from '../../src/vnode/types';

describe('Fiber Tree', () => {
  let container: HTMLElement;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  
  describe('createFiberTree', () => {
    it('should create a single fiber node for a simple VNode', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'test-1',
        stype: 'test',
        children: []
      };
      
      const fiber = createFiberTree(container, vnode, undefined, {});
      
      expect(fiber).toBeDefined();
      expect(fiber.vnode).toBe(vnode);
      expect(fiber.prevVNode).toBeUndefined();
      expect(fiber.parent).toBe(container);
      expect(fiber.child).toBeNull();
      expect(fiber.sibling).toBeNull();
      expect(fiber.parentFiber).toBeNull();
      expect(fiber.return).toBeNull();
      expect(fiber.index).toBe(0);
    });
    
    it('should create fiber tree with children', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent',
        stype: 'parent',
        children: [
          {
            tag: 'span',
            sid: 'child-1',
            stype: 'child',
            children: []
          } as VNode,
          {
            tag: 'span',
            sid: 'child-2',
            stype: 'child',
            children: []
          } as VNode
        ]
      };
      
      const fiber = createFiberTree(container, vnode, undefined, {});
      
      expect(fiber.child).toBeDefined();
      expect(fiber.child?.vnode.sid).toBe('child-1');
      expect(fiber.child?.sibling).toBeDefined();
      expect(fiber.child?.sibling?.vnode.sid).toBe('child-2');
      expect(fiber.child?.sibling?.sibling).toBeNull();
    });
    
    it('should create nested fiber tree', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'root',
        stype: 'root',
        children: [
          {
            tag: 'div',
            sid: 'parent',
            stype: 'parent',
            children: [
              {
                tag: 'span',
                sid: 'child',
                stype: 'child',
                children: []
              } as VNode
            ]
          } as VNode
        ]
      };
      
      const fiber = createFiberTree(container, vnode, undefined, {});
      
      expect(fiber.child).toBeDefined();
      expect(fiber.child?.vnode.sid).toBe('parent');
      expect(fiber.child?.child).toBeDefined();
      expect(fiber.child?.child?.vnode.sid).toBe('child');
    });
    
    it('should set parentFiber and return correctly', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent',
        stype: 'parent',
        children: [
          {
            tag: 'span',
            sid: 'child',
            stype: 'child',
            children: []
          } as VNode
        ]
      };
      
      const fiber = createFiberTree(container, vnode, undefined, {});
      const childFiber = fiber.child;
      
      expect(childFiber).toBeDefined();
      expect(childFiber?.parentFiber).toBe(fiber);
      expect(childFiber?.return).toBe(fiber);
    });
    
    it('should set index correctly for children', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent',
        stype: 'parent',
        children: [
          {
            tag: 'span',
            sid: 'child-1',
            stype: 'child',
            children: []
          } as VNode,
          {
            tag: 'span',
            sid: 'child-2',
            stype: 'child',
            children: []
          } as VNode,
          {
            tag: 'span',
            sid: 'child-3',
            stype: 'child',
            children: []
          } as VNode
        ]
      };
      
      const fiber = createFiberTree(container, vnode, undefined, {});
      
      expect(fiber.index).toBe(0);
      expect(fiber.child?.index).toBe(0);
      expect(fiber.child?.sibling?.index).toBe(1);
      expect(fiber.child?.sibling?.sibling?.index).toBe(2);
    });
    
    it('should skip primitive text children', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent',
        stype: 'parent',
        children: [
          'text1',
          {
            tag: 'span',
            sid: 'child',
            stype: 'child',
            children: []
          } as VNode,
          'text2',
          123
        ]
      };
      
      const fiber = createFiberTree(container, vnode, undefined, {});
      
      // Primitive text는 Fiber로 변환하지 않음
      expect(fiber.child).toBeDefined();
      expect(fiber.child?.vnode.sid).toBe('child');
      expect(fiber.child?.sibling).toBeNull(); // text는 Fiber로 변환되지 않음
    });
    
    it('should preserve prevVNode reference', () => {
      const prevVNode: VNode = {
        tag: 'div',
        sid: 'test',
        stype: 'test',
        children: []
      };
      
      const vnode: VNode = {
        tag: 'div',
        sid: 'test',
        stype: 'test',
        children: []
      };
      
      const fiber = createFiberTree(container, vnode, prevVNode, {});
      
      expect(fiber.prevVNode).toBe(prevVNode);
    });
    
    it('should preserve context', () => {
      const context = { test: 'value', registry: {} };
      
      const vnode: VNode = {
        tag: 'div',
        sid: 'test',
        stype: 'test',
        children: []
      };
      
      const fiber = createFiberTree(container, vnode, undefined, context);
      
      expect(fiber.context).toBe(context);
    });
    
    it('should handle empty children array', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'test',
        stype: 'test',
        children: []
      };
      
      const fiber = createFiberTree(container, vnode, undefined, {});
      
      expect(fiber.child).toBeNull();
    });
    
    it('should handle undefined children', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'test',
        stype: 'test'
      };
      
      const fiber = createFiberTree(container, vnode, undefined, {});
      
      expect(fiber.child).toBeNull();
    });
  });
});

