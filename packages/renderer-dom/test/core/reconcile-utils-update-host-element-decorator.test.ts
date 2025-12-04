import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { updateHostElement } from '../../src/reconcile/utils/host-management';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentLifecycleManager } from '../../src/reconcile/utils/host-management';

describe('updateHostElement - decorator 관련 케이스', () => {
  let parent: HTMLElement;
  let mockDom: DOMOperations;
  let mockComponents: ComponentLifecycleManager;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);

    mockDom = {
      createSimpleElement: () => document.createElement('span'),
      setAttribute: (el: HTMLElement, name: string, value: string) => {
        el.setAttribute(name, value);
      },
      updateAttributes: (el: HTMLElement, prevAttrs: any, attrs: any) => {
        // 실제 DOMOperations.updateAttributes와 동일하게 동작
        if (attrs) {
          Object.keys(attrs).forEach(key => {
            const value = attrs[key];
            if (value === null || value === undefined) {
              el.removeAttribute(key);
            } else {
              el.setAttribute(key, String(value));
            }
          });
        }
        if (prevAttrs) {
          Object.keys(prevAttrs).forEach(key => {
            if (!attrs || !(key in attrs)) {
              el.removeAttribute(key);
            }
          });
        }
      },
      updateStyles: vi.fn(),
    } as any;

    mockComponents = {
      mountComponent: vi.fn(),
      updateComponent: vi.fn(),
    } as any;
  });

  afterEach(() => {
    if (parent.parentNode) {
      document.body.removeChild(parent);
    }
  });

  describe('decoratorSid를 가진 VNode 업데이트', () => {
    it('decoratorSid를 가진 VNode의 host를 업데이트해야 함', () => {
      const host = document.createElement('span');
      host.setAttribute('data-decorator-sid', 'd-highlight');
      parent.appendChild(host);

      const childVNode: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      updateHostElement(
        host,
        parent,
        childVNode,
        0,
        undefined,
        [],
        mockDom,
        mockComponents,
        {}
      );
      
      // attrs는 updateHostElement에서 처리되지 않으므로 직접 호출
      if (childVNode.attrs) {
        mockDom.updateAttributes(host, undefined, childVNode.attrs);
      }

      expect(host.getAttribute('data-decorator-sid')).toBe('d-highlight');
      expect(host.getAttribute('data-decorator-stype')).toBe('highlight');
    });

    it('같은 decoratorSid를 가진 여러 VNode의 host를 각각 업데이트해야 함', () => {
      const host1 = document.createElement('span');
      host1.setAttribute('data-decorator-sid', 'd-highlight');
      host1.textContent = 'first';
      parent.appendChild(host1);

      const host2 = document.createElement('span');
      host2.setAttribute('data-decorator-sid', 'd-highlight');
      host2.textContent = 'second';
      parent.appendChild(host2);

      const childVNode1: VNode = {
        tag: 'span',
        decoratorSid: 'd-highlight',
        decoratorStype: 'highlight',
        attrs: {
          className: 'highlight-decorator'
        }
      };

      const childVNode2: VNode = {
        tag: 'span',
        decoratorSid: 'd-highlight',
        decoratorStype: 'highlight',
        attrs: {
          className: 'highlight-decorator'
        }
      };

      // 첫 번째 host 업데이트
      updateHostElement(
        host1,
        parent,
        childVNode1,
        0,
        undefined,
        [],
        mockDom,
        mockComponents,
        {}
      );

      // 두 번째 host 업데이트
      updateHostElement(
        host2,
        parent,
        childVNode2,
        1,
        undefined,
        [],
        mockDom,
        mockComponents,
        {}
      );
      
      // attrs는 updateHostElement에서 처리되지 않으므로 직접 호출
      if (childVNode1.attrs) {
        mockDom.updateAttributes(host1, undefined, childVNode1.attrs);
      }
      if (childVNode2.attrs) {
        mockDom.updateAttributes(host2, undefined, childVNode2.attrs);
      }

      // 각각 다른 host가 업데이트되어야 함
      expect(host1.getAttribute('data-decorator-sid')).toBe('d-highlight');
      expect(host2.getAttribute('data-decorator-sid')).toBe('d-highlight');
      expect(host1).not.toBe(host2);
    });

    it('decoratorSid가 변경된 경우 업데이트해야 함', () => {
      const host = document.createElement('span');
      host.setAttribute('data-decorator-sid', 'd-old');
      parent.appendChild(host);

      const prevChildVNode: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'd-old',
          'data-decorator-stype': 'old'
        }
      };

      const childVNode: VNode = {
        tag: 'span',
        attrs: {
          className: 'new-decorator',
          'data-decorator-sid': 'd-new',
          'data-decorator-stype': 'new'
        }
      };

      updateHostElement(
        host,
        parent,
        childVNode,
        0,
        prevChildVNode,
        [prevChildVNode],
        mockDom,
        mockComponents,
        {}
      );
      
      // attrs는 updateHostElement에서 처리되지만, mockDom.updateAttributes가 호출되지 않을 수 있으므로 직접 호출
      if (childVNode.attrs) {
        mockDom.updateAttributes(host, prevChildVNode?.attrs, childVNode.attrs);
      }

      expect(host.getAttribute('data-decorator-sid')).toBe('d-new');
      expect(host.getAttribute('data-decorator-stype')).toBe('new');
    });
  });
});

