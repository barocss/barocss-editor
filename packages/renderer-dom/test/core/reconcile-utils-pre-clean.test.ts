import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { removeStaleEarly } from '../../src/reconcile/utils/pre-clean';
import { VNode } from '../../src/vnode/types';
import { ComponentManager } from '../../src/component-manager';

describe('reconcile-utils: pre-clean', () => {
  let parent: HTMLElement;
  let mockComponents: ComponentManager;
  let unmountSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    
    unmountSpy = vi.fn();
    mockComponents = {
      unmountComponent: unmountSpy,
    } as any;
  });

  afterEach(() => {
    document.body.removeChild(parent);
  });

  describe('removeStaleEarly', () => {
    it('should remove elements with data-bc-sid that are not in expected children', () => {
      // Setup: Create elements with SIDs
      const el1 = document.createElement('div');
      el1.setAttribute('data-bc-sid', 'sid1');
      parent.appendChild(el1);

      const el2 = document.createElement('div');
      el2.setAttribute('data-bc-sid', 'sid2');
      parent.appendChild(el2);

      const el3 = document.createElement('div');
      el3.setAttribute('data-bc-sid', 'sid3');
      parent.appendChild(el3);

      // Expected children: only sid1 and sid3
      const childVNodes: VNode[] = [
        { tag: 'div', sid: 'sid1' } as VNode,
        { tag: 'div', sid: 'sid3' } as VNode,
      ];

      const prevChildVNodes: VNode[] = [
        { tag: 'div', sid: 'sid1' } as VNode,
        { tag: 'div', sid: 'sid2' } as VNode,
        { tag: 'div', sid: 'sid3' } as VNode,
      ];

      // Execute
      removeStaleEarly(parent, childVNodes, prevChildVNodes, mockComponents, {});

      // Verify: sid2 should be removed
      expect(parent.children.length).toBe(2);
      expect(parent.querySelector('[data-bc-sid="sid1"]')).toBeTruthy();
      expect(parent.querySelector('[data-bc-sid="sid2"]')).toBeNull();
      expect(parent.querySelector('[data-bc-sid="sid3"]')).toBeTruthy();
    });

    it('should call unmountComponent for removed elements with prevChildVNode', () => {
      const el1 = document.createElement('div');
      el1.setAttribute('data-bc-sid', 'sid-to-remove');
      parent.appendChild(el1);

      const el2 = document.createElement('div');
      el2.setAttribute('data-bc-sid', 'sid-to-keep');
      parent.appendChild(el2);

      const prevChildVNode: VNode = { tag: 'div', sid: 'sid-to-remove', stype: 'test' } as VNode;
      const prevChildVNodes: VNode[] = [prevChildVNode];
      // Expected children: only sid-to-keep (so sid-to-remove should be removed)
      const childVNodes: VNode[] = [
        { tag: 'div', sid: 'sid-to-keep' } as VNode,
      ];

      removeStaleEarly(parent, childVNodes, prevChildVNodes, mockComponents, {});

      expect(unmountSpy).toHaveBeenCalledWith(prevChildVNode, {});
      expect(parent.children.length).toBe(1);
      expect(parent.querySelector('[data-bc-sid="sid-to-keep"]')).toBeTruthy();
    });

    it('should create temp VNode and unmount if prevChildVNode not found', () => {
      const el1 = document.createElement('div');
      el1.setAttribute('data-bc-sid', 'sid-to-remove');
      el1.setAttribute('data-bc-stype', 'test-stype');
      parent.appendChild(el1);

      const el2 = document.createElement('div');
      el2.setAttribute('data-bc-sid', 'sid-to-keep');
      parent.appendChild(el2);

      // Expected children: only sid-to-keep (so sid-to-remove should be removed)
      const childVNodes: VNode[] = [
        { tag: 'div', sid: 'sid-to-keep' } as VNode,
      ];
      const prevChildVNodes: VNode[] = []; // No prevChildVNode for sid-to-remove

      removeStaleEarly(parent, childVNodes, prevChildVNodes, mockComponents, {});

      // Should create temp VNode and unmount
      expect(unmountSpy).toHaveBeenCalled();
      const callArg = unmountSpy.mock.calls[0][0] as VNode;
      expect(callArg.sid).toBe('sid-to-remove');
      expect(callArg.stype).toBe('test-stype');
      expect(callArg.tag).toBe('div');
      expect(parent.children.length).toBe(1);
    });

    it('should skip pre-clean if no desired SIDs', () => {
      const el = document.createElement('div');
      el.setAttribute('data-bc-sid', 'sid1');
      parent.appendChild(el);

      const childVNodes: (VNode | string | number)[] = ['text', 123]; // No SIDs
      const prevChildVNodes: VNode[] = [];

      removeStaleEarly(parent, childVNodes, prevChildVNodes, mockComponents, {});

      // Should not remove anything
      expect(parent.children.length).toBe(1);
      expect(unmountSpy).not.toHaveBeenCalled();
    });

    it('should ignore text nodes and only process element nodes', () => {
      const el1 = document.createElement('div');
      el1.setAttribute('data-bc-sid', 'sid1');
      parent.appendChild(el1);

      const el2 = document.createElement('div');
      el2.setAttribute('data-bc-sid', 'sid2');
      parent.appendChild(el2);

      const textNode = document.createTextNode('text');
      parent.appendChild(textNode);

      // Expected children: only sid2 (so sid1 should be removed, but text node should remain)
      const childVNodes: VNode[] = [
        { tag: 'div', sid: 'sid2' } as VNode,
      ];
      const prevChildVNodes: VNode[] = [
        { tag: 'div', sid: 'sid1' } as VNode,
      ];

      removeStaleEarly(parent, childVNodes, prevChildVNodes, mockComponents, {});

      // Text node should remain, sid1 should be removed, sid2 should remain
      expect(parent.childNodes.length).toBe(2); // sid2 element + text node
      expect(parent.children.length).toBe(1); // Only sid2 element
      expect(parent.querySelector('[data-bc-sid="sid2"]')).toBeTruthy();
      expect(parent.querySelector('[data-bc-sid="sid1"]')).toBeNull();
    });

    it('should handle errors during unmount gracefully', () => {
      const el1 = document.createElement('div');
      el1.setAttribute('data-bc-sid', 'sid1');
      parent.appendChild(el1);

      const el2 = document.createElement('div');
      el2.setAttribute('data-bc-sid', 'sid2');
      parent.appendChild(el2);

      const errorComponents = {
        unmountComponent: vi.fn(() => {
          throw new Error('Unmount error');
        }),
      } as any;

      const prevChildVNode: VNode = { tag: 'div', sid: 'sid1' } as VNode;
      // Expected children: only sid2 (so sid1 should be removed)
      const childVNodes: VNode[] = [
        { tag: 'div', sid: 'sid2' } as VNode,
      ];
      const prevChildVNodes: VNode[] = [prevChildVNode];

      // Should not throw
      expect(() => {
        removeStaleEarly(parent, childVNodes, prevChildVNodes, errorComponents, {});
      }).not.toThrow();

      // unmountComponent should be called (even though it throws)
      expect(errorComponents.unmountComponent).toHaveBeenCalled();
      // Element should still be removed (removeChild is in try-catch)
      expect(parent.children.length).toBe(1);
      expect(parent.querySelector('[data-bc-sid="sid2"]')).toBeTruthy();
    });
  });
});

