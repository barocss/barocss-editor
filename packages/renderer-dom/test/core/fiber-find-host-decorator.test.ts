import { describe, it, expect, beforeEach } from 'vitest';
import { findHostForChildVNode } from '../../src/reconcile/utils/host-finding';
import { VNode } from '../../src/vnode/types';

describe('findHostForChildVNode - Decorator VNode 처리', () => {
  let parent: HTMLElement;
  let prevChildVNodes: (VNode | string | number)[];
  let prevChildToElement: Map<VNode | string | number, HTMLElement | Text>;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    prevChildVNodes = [];
    prevChildToElement = new Map();
  });

  describe('같은 decoratorSid를 가진 여러 VNode 처리', () => {
    it('같은 decoratorSid를 가진 여러 VNode가 각각 고유한 DOM 요소를 찾아야 함', () => {
      // 초기 DOM 구조: 3개의 highlight-decorator 요소
      const decorator1 = document.createElement('span');
      decorator1.setAttribute('data-decorator-sid', 'd-highlight');
      decorator1.setAttribute('class', 'highlight-decorator');
      decorator1.textContent = 'first';
      parent.appendChild(decorator1);

      const decorator2 = document.createElement('span');
      decorator2.setAttribute('data-decorator-sid', 'd-highlight');
      decorator2.setAttribute('class', 'highlight-decorator');
      decorator2.textContent = 'second';
      parent.appendChild(decorator2);

      const decorator3 = document.createElement('span');
      decorator3.setAttribute('data-decorator-sid', 'd-highlight');
      decorator3.setAttribute('class', 'highlight-decorator');
      decorator3.textContent = 'third';
      parent.appendChild(decorator3);

      // 첫 번째 VNode: 첫 번째 decorator 요소를 찾아야 함
      const prevVNode1: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'd-highlight'
        },
        meta: { domElement: decorator1 }
      };
      prevChildVNodes = [prevVNode1];
      prevChildToElement.set(prevVNode1, decorator1);

      const vnode1: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      const host1 = findHostForChildVNode(
        parent,
        vnode1,
        0,
        prevChildVNodes,
        prevChildToElement
      );

      expect(host1).toBeDefined();
      expect(host1).toBe(decorator1);
      expect(host1?.textContent).toBe('first');

      // 두 번째 VNode: 두 번째 decorator 요소를 찾아야 함 (첫 번째는 이미 사용됨)
      const prevVNode2: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'd-highlight'
        },
        meta: { domElement: decorator2 }
      };
      prevChildVNodes = [prevVNode1, prevVNode2];
      prevChildToElement.set(prevVNode2, decorator2);

      const vnode2: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      const host2 = findHostForChildVNode(
        parent,
        vnode2,
        1,
        prevChildVNodes,
        prevChildToElement
      );

      expect(host2).toBeDefined();
      expect(host2).toBe(decorator2);
      expect(host2?.textContent).toBe('second');
      expect(host2).not.toBe(decorator1);

      // 세 번째 VNode: 세 번째 decorator 요소를 찾아야 함 (첫 번째, 두 번째는 이미 사용됨)
      const prevVNode3: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'd-highlight'
        },
        meta: { domElement: decorator3 }
      };
      prevChildVNodes = [prevVNode1, prevVNode2, prevVNode3];
      prevChildToElement.set(prevVNode3, decorator3);

      const vnode3: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      const host3 = findHostForChildVNode(
        parent,
        vnode3,
        2,
        prevChildVNodes,
        prevChildToElement
      );

      expect(host3).toBeDefined();
      expect(host3).toBe(decorator3);
      expect(host3?.textContent).toBe('third');
      expect(host3).not.toBe(decorator1);
      expect(host3).not.toBe(decorator2);
    });

    it('인덱스 기반 매칭이 우선되어야 함', () => {
      // 초기 DOM 구조: 3개의 highlight-decorator 요소
      const decorator1 = document.createElement('span');
      decorator1.setAttribute('data-decorator-sid', 'd-highlight');
      parent.appendChild(decorator1);

      const decorator2 = document.createElement('span');
      decorator2.setAttribute('data-decorator-sid', 'd-highlight');
      parent.appendChild(decorator2);

      const decorator3 = document.createElement('span');
      decorator3.setAttribute('data-decorator-sid', 'd-highlight');
      parent.appendChild(decorator3);

      // prevChildVNodes에 같은 인덱스의 VNode가 있으면 그것을 우선 매칭
      const prevVNode1: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'd-highlight'
        },
        meta: { domElement: decorator1 }
      };
      const prevVNode2: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'd-highlight'
        },
        meta: { domElement: decorator2 }
      };
      const prevVNode3: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'd-highlight'
        },
        meta: { domElement: decorator3 }
      };

      prevChildVNodes = [prevVNode1, prevVNode2, prevVNode3];
      prevChildToElement.set(prevVNode1, decorator1);
      prevChildToElement.set(prevVNode2, decorator2);
      prevChildToElement.set(prevVNode3, decorator3);

      // 첫 번째 VNode (인덱스 0)
      const vnode1: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      const host1 = findHostForChildVNode(
        parent,
        vnode1,
        0,
        prevChildVNodes,
        prevChildToElement
      );

      expect(host1).toBe(decorator1);

      // 두 번째 VNode (인덱스 1)
      const vnode2: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      const host2 = findHostForChildVNode(
        parent,
        vnode2,
        1,
        prevChildVNodes,
        prevChildToElement
      );

      expect(host2).toBe(decorator2);

      // 세 번째 VNode (인덱스 2)
      const vnode3: VNode = {
        tag: 'span',
        attrs: {
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      const host3 = findHostForChildVNode(
        parent,
        vnode3,
        2,
        prevChildVNodes,
        prevChildToElement
      );

      expect(host3).toBe(decorator3);
    });
  });

  describe('decoratorSid가 없는 VNode와 구분', () => {
    it('decoratorSid가 있는 VNode는 일반 span을 재사용하지 않아야 함', () => {
      // 일반 span 요소 (decoratorSid 없음)
      const normalSpan = document.createElement('span');
      normalSpan.textContent = 'normal';
      parent.appendChild(normalSpan);

      // decorator VNode
      const decoratorVNode: VNode = {
        tag: 'span',
        attrs: {
          className: 'highlight-decorator',
          'data-decorator-sid': 'd-highlight',
          'data-decorator-stype': 'highlight'
        }
      };

      const host = findHostForChildVNode(
        parent,
        decoratorVNode,
        0,
        prevChildVNodes,
        prevChildToElement
      );

      // decoratorSid가 있는 VNode는 일반 span을 재사용하지 않아야 함
      expect(host).not.toBe(normalSpan);
      // host가 없거나, decoratorSid를 가진 요소여야 함 (일반 span이 아니어야 함)
      if (host) {
        expect(host.hasAttribute('data-decorator-sid') || host.hasAttribute('data-bc-sid')).toBe(true);
        expect(host).not.toBe(normalSpan);
      }
    });

    it('decoratorSid가 없는 VNode는 일반 span을 재사용할 수 있어야 함', () => {
      // 일반 span 요소
      const normalSpan = document.createElement('span');
      normalSpan.textContent = 'normal';
      parent.appendChild(normalSpan);

      // decoratorSid가 없는 VNode
      const normalVNode: VNode = {
        tag: 'span',
        attrs: { className: 'text' }
      };

      const prevVNode: VNode = {
        tag: 'span',
        meta: { domElement: normalSpan }
      };
      prevChildVNodes = [prevVNode];
      prevChildToElement.set(prevVNode, normalSpan);

      const host = findHostForChildVNode(
        parent,
        normalVNode,
        0,
        prevChildVNodes,
        prevChildToElement
      );

      // decoratorSid가 없는 VNode는 일반 span을 재사용할 수 있어야 함
      expect(host).toBe(normalSpan);
    });
  });
});

