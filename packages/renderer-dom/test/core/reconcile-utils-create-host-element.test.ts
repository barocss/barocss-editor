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
      
      // attrs는 updateHostElement에서 설정되므로, 여기서는 attrs를 복사해야 함
      if (decoratorVNode.attrs) {
        dom.updateAttributes(host, undefined, decoratorVNode.attrs);
      }

      expect(host).toBeDefined();
      expect(host.tagName).toBe('SPAN');
      expect(host.getAttribute('data-decorator-sid')).toBe('d-highlight');
      expect(host.getAttribute('data-decorator-stype')).toBe('highlight');
      expect(host.getAttribute('data-decorator-category')).toBe('inline');
      // createHostElement는 기본 속성만 설정하고, attrs와 style은 updateHostElement에서 설정됨
      // 따라서 className과 style은 여기서 확인하지 않음
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

      // 첫 번째 요소 생성
      const host1 = createHostElement(parent, decoratorVNode1, 0, dom, components);
      if (decoratorVNode1.attrs) {
        dom.updateAttributes(host1, undefined, decoratorVNode1.attrs);
      }
      
      // 두 번째 요소 생성
      const host2 = createHostElement(parent, decoratorVNode2, 1, dom, components);
      if (decoratorVNode2.attrs) {
        dom.updateAttributes(host2, undefined, decoratorVNode2.attrs);
      }

      expect(host1).toBeDefined();
      expect(host2).toBeDefined();
      expect(host1).not.toBe(host2);
      expect(host1.getAttribute('data-decorator-sid')).toBe('d-highlight');
      expect(host2.getAttribute('data-decorator-sid')).toBe('d-highlight');
      
      // 각각 다른 DOM 요소여야 함
      expect(parent.children.length).toBe(2);
      expect(parent.children[0]).toBe(host1);
      expect(parent.children[1]).toBe(host2);
    });
  });
});

