import { describe, it, expect, beforeEach } from 'vitest';
import { createHostElement, ComponentLifecycleManager } from '../../src/reconcile/utils/host-management';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';

describe('createHostElement - 단위 테스트', () => {
  let parent: HTMLElement;
  let dom: DOMOperations;
  let components: ComponentLifecycleManager;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    
    dom = new DOMOperations();
    components = {
      mountComponent: () => {},
      updateComponent: () => {}
    };
  });

  describe('decoratorSid를 가진 VNode 처리', () => {
    it('decoratorSid를 가진 VNode로 DOM 요소를 생성해야 함', () => {
      const decoratorVNode: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight',
          'data-decorator-category': 'inline'
        },
        style: {
          backgroundColor: 'yellow'
        }
      };

      const host = createHostElement(parent, decoratorVNode, 0, dom, components);
      
      // attrs are set in updateHostElement, so we need to copy attrs here
      if (decoratorVNode.attrs) {
        dom.updateAttributes(host, undefined, decoratorVNode.attrs);
      }

      expect(host).toBeDefined();
      expect(host.tagName).toBe('SPAN');
      expect(host.getAttribute('data-decorator-sid')).toBe('d-highlight');
      expect(host.getAttribute('data-decorator-stype')).toBe('highlight');
      expect(host.getAttribute('data-decorator-category')).toBe('inline');
      // createHostElement only sets basic attributes, attrs and style are set in updateHostElement
      // Therefore, className and style are not checked here
    });

    it('같은 decoratorSid를 가진 여러 VNode로 각각 고유한 DOM 요소를 생성해야 함', () => {
      const decoratorVNode1: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      const decoratorVNode2: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      // Create first element
      const host1 = createHostElement(parent, decoratorVNode1, 0, dom, components);
      if (decoratorVNode1.attrs) {
        dom.updateAttributes(host1, undefined, decoratorVNode1.attrs);
      }
      
      // Create second element
      const host2 = createHostElement(parent, decoratorVNode2, 1, dom, components);
      if (decoratorVNode2.attrs) {
        dom.updateAttributes(host2, undefined, decoratorVNode2.attrs);
      }

      expect(host1).toBeDefined();
      expect(host2).toBeDefined();
      expect(host1).not.toBe(host2);
      expect(host1.getAttribute('data-decorator-sid')).toBe('d-highlight');
      expect(host2.getAttribute('data-decorator-sid')).toBe('d-highlight');
      
      // Should be different DOM elements
      expect(parent.children.length).toBe(2);
      expect(parent.children[0]).toBe(host1);
      expect(parent.children[1]).toBe(host2);
    });
  });
});

