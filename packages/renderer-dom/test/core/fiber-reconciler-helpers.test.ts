/**
 * Fiber Reconciler Helpers Test
 * 
 * Unit tests for helper functions separated from reconcileFiberNode
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  transferVNodeIdFromPrev,
  generateVNodeIdIfNeeded,
  findHostFromPrevVNode,
  buildPrevChildToElementMap,
  updateExistingHost,
  findOrCreateHost,
  updateChildFiberParents,
  saveVNodeToTree
} from '../../src/reconcile/fiber/fiber-reconciler-helpers';
import { VNode } from '../../src/vnode/types';
import { FiberNode } from '../../src/reconcile/fiber/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

describe('Fiber Reconciler Helpers', () => {
  describe('transferVNodeIdFromPrev', () => {
    it('should transfer sid from prevVNode to vnode when vnode has no id', () => {
      const vnode: VNode = {
        tag: 'div',
        stype: 'paragraph'
      };

      const prevVNode: VNode = {
        tag: 'div',
        stype: 'paragraph',
        sid: 'p-1'
      };

      transferVNodeIdFromPrev(vnode, prevVNode);

      expect(vnode.sid).toBe('p-1');
    });

    it('should transfer decoratorSid from prevVNode to vnode when vnode has no id', () => {
      const vnode: VNode = {
        tag: 'span',
        stype: 'highlight-decorator'
      };

      const prevVNode: VNode = {
        tag: 'span',
        stype: 'highlight-decorator',
        attrs: {
          'data-decorator-sid': 'decorator-1'
        }
      };

      transferVNodeIdFromPrev(vnode, prevVNode);

      expect(vnode.attrs?.['data-decorator-sid']).toBe('decorator-1');
    });

    it('should not transfer id when vnode already has id', () => {
      const vnode: VNode = {
        tag: 'div',
        stype: 'paragraph',
        sid: 'p-2'
      };

      const prevVNode: VNode = {
        tag: 'div',
        stype: 'paragraph',
        sid: 'p-1'
      };

      transferVNodeIdFromPrev(vnode, prevVNode);

      expect(vnode.sid).toBe('p-2'); // Keep existing id
    });

    it('should not transfer id when stype does not match', () => {
      const vnode: VNode = {
        tag: 'div',
        stype: 'paragraph'
      };

      const prevVNode: VNode = {
        tag: 'div',
        stype: 'heading',
        sid: 'h-1'
      };

      transferVNodeIdFromPrev(vnode, prevVNode);

      expect(vnode.sid).toBeUndefined();
    });

    it('should not transfer id when prevVNode has no id', () => {
      const vnode: VNode = {
        tag: 'div',
        stype: 'paragraph'
      };

      const prevVNode: VNode = {
        tag: 'div',
        stype: 'paragraph'
      };

      transferVNodeIdFromPrev(vnode, prevVNode);

      expect(vnode.sid).toBeUndefined();
      expect(vnode.attrs?.['data-decorator-sid']).toBeUndefined();
    });

    it('should handle undefined prevVNode', () => {
      const vnode: VNode = {
        tag: 'div',
        stype: 'paragraph'
      };

      transferVNodeIdFromPrev(vnode, undefined);

      expect(vnode.sid).toBeUndefined();
    });
  });

  describe('generateVNodeIdIfNeeded', () => {
    it('should generate sid when vnode has stype but no sid', () => {
      const vnode: VNode = {
        tag: 'div',
        stype: 'paragraph'
      };

      const fiber: FiberNode = {
        vnode,
        prevVNode: undefined,
        domElement: null,
        parent: document.createElement('div'),
        parentFiber: null,
        child: null,
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      const components = new ComponentManager();
      (components as any).generateComponentId = (vnode: VNode, index: number) => {
        return `generated-${vnode.stype}-${index}`;
      };

      generateVNodeIdIfNeeded(vnode, fiber, components);

      expect(vnode.sid).toBe('generated-paragraph-0');
    });

    it('should not generate sid when vnode already has sid', () => {
      const vnode: VNode = {
        tag: 'div',
        stype: 'paragraph',
        sid: 'p-1'
      };

      const fiber: FiberNode = {
        vnode,
        prevVNode: undefined,
        domElement: null,
        parent: document.createElement('div'),
        parentFiber: null,
        child: null,
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      const components = new ComponentManager();
      (components as any).generateComponentId = () => 'generated-id';

      generateVNodeIdIfNeeded(vnode, fiber, components);

      expect(vnode.sid).toBe('p-1'); // Keep existing id
    });

    it('should not generate sid when vnode has no stype', () => {
      const vnode: VNode = {
        tag: 'div'
      };

      const fiber: FiberNode = {
        vnode,
        prevVNode: undefined,
        domElement: null,
        parent: document.createElement('div'),
        parentFiber: null,
        child: null,
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      const components = new ComponentManager();
      (components as any).generateComponentId = () => 'generated-id';

      generateVNodeIdIfNeeded(vnode, fiber, components);

      expect(vnode.sid).toBeUndefined();
    });
  });

  describe('findHostFromPrevVNode', () => {
    it('should return host when vnode and prevVNode have same id', () => {
      const host = document.createElement('div');
      
      const vnode: VNode = {
        tag: 'div',
        sid: 'p-1'
      };

      const prevVNode: VNode = {
        tag: 'div',
        sid: 'p-1',
        meta: {
          domElement: host
        }
      };

      const result = findHostFromPrevVNode(vnode, prevVNode);

      expect(result).toBe(host);
    });

    it('should return host when vnode and prevVNode have same decoratorSid', () => {
      const host = document.createElement('span');
      
      const vnode: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'decorator-1'
        }
      };

      const prevVNode: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'decorator-1'
        },
        meta: {
          domElement: host
        }
      };

      const result = findHostFromPrevVNode(vnode, prevVNode);

      expect(result).toBe(host);
    });

    it('should return host when both have no id but same tag and class (structural matching)', () => {
      const host = document.createElement('span');
      
      const vnode: VNode = {
        tag: 'span',
        attrs: {
          className: 'mark-bold'
        }
      };

      const prevVNode: VNode = {
        tag: 'span',
        attrs: {
          className: 'mark-bold'
        },
        meta: {
          domElement: host
        }
      };

      const result = findHostFromPrevVNode(vnode, prevVNode);

      expect(result).toBe(host);
    });

    it('should return null when ids do not match', () => {
      const host = document.createElement('div');
      
      const vnode: VNode = {
        tag: 'div',
        sid: 'p-2'
      };

      const prevVNode: VNode = {
        tag: 'div',
        sid: 'p-1',
        meta: {
          domElement: host
        }
      };

      const result = findHostFromPrevVNode(vnode, prevVNode);

      expect(result).toBeNull();
    });

    it('should return null when tags do not match', () => {
      const host = document.createElement('div');
      
      const vnode: VNode = {
        tag: 'span'
      };

      const prevVNode: VNode = {
        tag: 'div',
        meta: {
          domElement: host
        }
      };

      const result = findHostFromPrevVNode(vnode, prevVNode);

      expect(result).toBeNull();
    });

    it('should return null when classes do not match', () => {
      const host = document.createElement('span');
      
      const vnode: VNode = {
        tag: 'span',
        attrs: {
          className: 'mark-bold'
        }
      };

      const prevVNode: VNode = {
        tag: 'span',
        attrs: {
          className: 'mark-italic'
        },
        meta: {
          domElement: host
        }
      };

      const result = findHostFromPrevVNode(vnode, prevVNode);

      expect(result).toBeNull();
    });

    it('should return null when prevVNode has no meta.domElement', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'p-1'
      };

      const prevVNode: VNode = {
        tag: 'div',
        sid: 'p-1'
      };

      const result = findHostFromPrevVNode(vnode, prevVNode);

      expect(result).toBeNull();
    });

    it('should handle undefined prevVNode', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'p-1'
      };

      const result = findHostFromPrevVNode(vnode, undefined);

      expect(result).toBeNull();
    });
  });

  describe('buildPrevChildToElementMap', () => {
    it('should build map from prevChildVNodes with meta.domElement', () => {
      const el1 = document.createElement('div');
      const el2 = document.createElement('span');
      
      const prevChild1: VNode = {
        tag: 'div',
        sid: 'child-1',
        meta: {
          domElement: el1
        }
      };

      const prevChild2: VNode = {
        tag: 'span',
        sid: 'child-2',
        meta: {
          domElement: el2
        }
      };

      const prevChildVNodes: (VNode | string | number)[] = [prevChild1, prevChild2];

      const result = buildPrevChildToElementMap(prevChildVNodes);

      expect(result.size).toBe(2);
      expect(result.get(prevChild1)).toBe(el1);
      expect(result.get(prevChild2)).toBe(el2);
    });

    it('should skip children without meta.domElement', () => {
      const prevChild1: VNode = {
        tag: 'div',
        sid: 'child-1'
      };

      const prevChild2: VNode = {
        tag: 'span',
        sid: 'child-2',
        meta: {
          domElement: document.createElement('span')
        }
      };

      const prevChildVNodes: (VNode | string | number)[] = [prevChild1, prevChild2, 'text', 123];

      const result = buildPrevChildToElementMap(prevChildVNodes);

      expect(result.size).toBe(1);
      expect(result.get(prevChild2)).toBeInstanceOf(HTMLElement);
    });

    it('should handle empty array', () => {
      const result = buildPrevChildToElementMap([]);

      expect(result.size).toBe(0);
    });
  });

  describe('updateChildFiberParents', () => {
    it('should update all child fiber parents to host', () => {
      const host = document.createElement('div');
      const container = document.createElement('div');

      const child1: FiberNode = {
        vnode: { tag: 'span' },
        prevVNode: undefined,
        domElement: null,
        parent: container,
        parentFiber: null,
        child: null,
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      const child2: FiberNode = {
        vnode: { tag: 'span' },
        prevVNode: undefined,
        domElement: null,
        parent: container,
        parentFiber: null,
        child: null,
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 1
      };

      child1.sibling = child2;

      const fiber: FiberNode = {
        vnode: { tag: 'div' },
        prevVNode: undefined,
        domElement: host,
        parent: container,
        parentFiber: null,
        child: child1,
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      updateChildFiberParents(fiber, host);

      expect(child1.parent).toBe(host);
      expect(child2.parent).toBe(host);
    });

    it('should handle fiber with no children', () => {
      const host = document.createElement('div');
      const container = document.createElement('div');

      const fiber: FiberNode = {
        vnode: { tag: 'div' },
        prevVNode: undefined,
        domElement: host,
        parent: container,
        parentFiber: null,
        child: null,
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      updateChildFiberParents(fiber, host);

      // No error should occur
      expect(fiber.child).toBeNull();
    });
  });

  describe('saveVNodeToTree', () => {
    it('should save vnode to prevVNodeTree when vnode has sid', () => {
      const prevVNodeTree = new Map<string, VNode>();
      
      const vnode: VNode = {
        tag: 'div',
        sid: 'p-1',
        stype: 'paragraph'
      };

      saveVNodeToTree(vnode, prevVNodeTree);

      expect(prevVNodeTree.has('p-1')).toBe(true);
      const saved = prevVNodeTree.get('p-1');
      expect(saved).toBeTruthy();
      expect(saved?.sid).toBe('p-1');
      expect(saved?.stype).toBe('paragraph');
    });

    it('should not save when vnode has no sid', () => {
      const prevVNodeTree = new Map<string, VNode>();
      
      const vnode: VNode = {
        tag: 'div',
        stype: 'paragraph'
      };

      saveVNodeToTree(vnode, prevVNodeTree);

      expect(prevVNodeTree.size).toBe(0);
    });

    it('should not save when prevVNodeTree is undefined', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'p-1'
      };

      // Should not throw error
      saveVNodeToTree(vnode, undefined);
    });

    it('should handle errors gracefully', () => {
      const prevVNodeTree = new Map<string, VNode>();
      
      // Mock cloneVNodeTree to throw error
      const vnode: VNode = {
        tag: 'div',
        sid: 'p-1'
      } as any;

      // Should not throw error
      saveVNodeToTree(vnode, prevVNodeTree);
    });
  });
});

