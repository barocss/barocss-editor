/**
 * Text Collapse Functions 테스트
 * 
 * VNodeBuilder가 텍스트를 collapse하는 로직을 검증
 */

import { describe, it, expect } from 'vitest';
import { shouldCollapseTextChild, applyTextCollapse } from '../../src/vnode/utils/text-collapse';
import { createTextVNode, createSpanWrapper } from '../../src/vnode/utils/vnode-creators';
import { VNode } from '../../src/vnode/types';

describe('Text Collapse Functions', () => {
  describe('shouldCollapseTextChild', () => {
    it('should collapse single text child when data(text) was not processed', () => {
      const textVNode = createTextVNode('Hello');
      const orderedChildren: VNode[] = [textVNode];
      const hasDataTextProcessed = { value: false };
      
      const shouldCollapse = shouldCollapseTextChild(orderedChildren, hasDataTextProcessed);
      
      expect(shouldCollapse).toBe(true);
    });

    it('should not collapse when data(text) was processed', () => {
      const textVNode = createTextVNode('Hello');
      const orderedChildren: VNode[] = [textVNode];
      const hasDataTextProcessed = { value: true };
      
      const shouldCollapse = shouldCollapseTextChild(orderedChildren, hasDataTextProcessed);
      
      expect(shouldCollapse).toBe(false);
    });

    it('should not collapse when multiple children exist', () => {
      const textVNode1 = createTextVNode('Hello');
      const textVNode2 = createTextVNode('World');
      const orderedChildren: VNode[] = [textVNode1, textVNode2];
      const hasDataTextProcessed = { value: false };
      
      const shouldCollapse = shouldCollapseTextChild(orderedChildren, hasDataTextProcessed);
      
      expect(shouldCollapse).toBe(false);
    });

    it('should not collapse when child has tag', () => {
      const spanVNode = createSpanWrapper([createTextVNode('Hello')]);
      const orderedChildren: VNode[] = [spanVNode];
      const hasDataTextProcessed = { value: false };
      
      const shouldCollapse = shouldCollapseTextChild(orderedChildren, hasDataTextProcessed);
      
      expect(shouldCollapse).toBe(false);
    });
  });

  describe('applyTextCollapse', () => {
    it('should collapse text child into parent.text', () => {
      const vnode: VNode = {
        tag: 'span',
        attrs: {},
        children: []
      } as VNode;
      
      const textVNode = createTextVNode('Hello');
      const orderedChildren: VNode[] = [textVNode];
      
      applyTextCollapse(vnode, orderedChildren, true);
      
      expect(vnode.text).toBe('Hello');
      expect(vnode.children).toEqual([]);
    });

    it('should keep children when shouldCollapse is false', () => {
      const vnode: VNode = {
        tag: 'span',
        attrs: {},
        children: []
      } as VNode;
      
      const textVNode = createTextVNode('Hello');
      const orderedChildren: VNode[] = [textVNode];
      
      applyTextCollapse(vnode, orderedChildren, false);
      
      expect(vnode.text).toBeUndefined();
      expect(vnode.children).toEqual([textVNode]);
    });

    it('should handle empty children', () => {
      const vnode: VNode = {
        tag: 'span',
        attrs: {},
        children: []
      } as VNode;
      
      const orderedChildren: VNode[] = [];
      
      applyTextCollapse(vnode, orderedChildren, false);
      
      expect(vnode.children).toEqual([]);
    });
  });
});

