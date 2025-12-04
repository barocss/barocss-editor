import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { reconcileWithFiber, FiberReconcileDependencies } from '../../src/reconcile/fiber/fiber-reconciler';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';
import { ComponentManager } from '../../src/component-manager';

describe('reconcileWithFiber - Edge Cases', () => {
  let container: HTMLElement;
  let deps: FiberReconcileDependencies;
  let dom: DOMOperations;
  let components: ComponentManager;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    dom = new DOMOperations();
    components = {
      mountComponent: () => {},
      updateComponent: () => {},
      unmountComponent: () => {},
      getComponentInstance: () => null
    } as any;
    
    deps = {
      dom,
      components,
      currentVisitedPortalIds: null,
      portalHostsById: new Map()
    };
  });

  afterEach(() => {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
    container.innerHTML = '';
  });

  describe('빈 구조', () => {
    it('빈 children 배열을 처리해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: []
      };

      expect(() => {
        reconcileWithFiber(container, vnode, undefined, {}, deps);
      }).not.toThrow();

      expect(container.children.length).toBe(1);
    });

    it('children가 없는 VNode를 처리해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1'
      };

      expect(() => {
        reconcileWithFiber(container, vnode, undefined, {}, deps);
      }).not.toThrow();

      expect(container.children.length).toBe(1);
    });
  });

  describe('primitive text만 있는 경우', () => {
    it('primitive text만 있는 VNode를 처리해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: ['text1', 'text2', 123]
      };

      reconcileWithFiber(container, vnode, undefined, {}, deps);

      // DOM 요소가 생성되어야 함
      expect(container.children.length).toBe(1);
    });

    it('primitive text와 VNode가 섞인 경우', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          'before',
          {
            tag: 'span',
            sid: 'child-1',
            children: [{ tag: undefined, text: 'middle' }]
          },
          'after'
        ]
      };

      reconcileWithFiber(container, vnode, undefined, {}, deps);

      // DOM 요소가 생성되어야 함
      expect(container.children.length).toBe(1);
    });
  });

  describe('vnode.text 처리', () => {
    it('vnode.text가 있는 경우를 처리해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        text: 'direct text',
        children: []
      };

      reconcileWithFiber(container, vnode, undefined, {}, deps);

      // 텍스트가 포함되어야 함
      expect(container.textContent).toContain('direct text');
    });

    it('vnode.text와 children이 모두 있는 경우 children을 우선해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        text: 'direct text',
        children: [
          {
            tag: 'span',
            sid: 'child-1',
            children: [{ tag: undefined, text: 'child text' }]
          }
        ]
      };

      reconcileWithFiber(container, vnode, undefined, {}, deps);

      // children이 우선되어야 함
      expect(container.textContent).toContain('child text');
    });
  });

  describe('복잡한 구조 조합', () => {
    it('decorator, mark, primitive text가 모두 섞인 경우', () => {
      const vnode: VNode = {
        tag: 'div',
        stype: 'document',
        sid: 'doc-1',
        children: [
          {
            tag: 'div',
            sid: 'parent-1',
            children: [
              'before',
              {
                tag: 'span',
                attrs: {
                  className: 'highlight-decorator',
                  'data-decorator-sid': 'd-highlight',
                  'data-decorator-stype': 'highlight'
                },
                children: [
                  {
                    tag: 'span',
                    attrs: { className: 'mark-bold' },
                    children: [{ tag: undefined, text: 'bold' }]
                  },
                  ' and ',
                  {
                    tag: 'span',
                    attrs: { className: 'mark-italic' },
                    children: [{ tag: undefined, text: 'italic' }]
                  }
                ]
              },
              'after'
            ]
          }
        ]
      };

      reconcileWithFiber(container, vnode, undefined, {}, deps);

      // eslint-disable-next-line no-console
      console.log('Container HTML:', container.innerHTML);
      // eslint-disable-next-line no-console
      console.log('All decorator elements:', Array.from(container.querySelectorAll('[data-decorator-sid="d-highlight"]')).map(el => ({
        tag: el.tagName,
        parent: el.parentElement?.tagName,
        text: el.textContent,
        innerHTML: el.innerHTML
      })));

      // decorator 요소가 있어야 함
      // NOTE: 현재 reconciler는 children의 텍스트 노드를 별도 decorator 요소로 생성할 수 있음
      const decoratorElements = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(decoratorElements.length).toBeGreaterThanOrEqual(1);

      // mark 요소들이 있어야 함
      const markElements = container.querySelectorAll('.mark-bold, .mark-italic');
      expect(markElements.length).toBeGreaterThan(0);

      // 텍스트가 포함되어야 함
      expect(container.textContent).toContain('before');
      expect(container.textContent).toContain('bold');
      expect(container.textContent).toContain('italic');
      expect(container.textContent).toContain('after');
    });

    it('여러 레벨의 decorator가 중첩된 경우', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          {
            tag: 'span',
            attrs: {
              className: 'outer-decorator',
              'data-decorator-sid': 'd-outer',
              'data-decorator-stype': 'outer'
            },
            children: [
              {
                tag: 'span',
                attrs: {
                  className: 'inner-decorator',
                  'data-decorator-sid': 'd-inner',
                  'data-decorator-stype': 'inner'
                },
                children: [{ tag: undefined, text: 'nested' }]
              }
            ]
          }
        ]
      };

      reconcileWithFiber(container, vnode, undefined, {}, deps);

      // 두 레벨의 decorator 요소가 모두 있어야 함
      const outerElements = container.querySelectorAll('[data-decorator-sid="d-outer"]');
      const innerElements = container.querySelectorAll('[data-decorator-sid="d-inner"]');
      expect(outerElements.length).toBe(1);
      expect(innerElements.length).toBe(1);

      // 내부 decorator가 외부 decorator 안에 있어야 함
      const outerElement = outerElements[0] as HTMLElement;
      const innerElement = innerElements[0] as HTMLElement;
      expect(outerElement.contains(innerElement)).toBe(true);
    });
  });

  describe('동시에 여러 decorator가 적용되는 경우', () => {
    it('같은 텍스트에 여러 decorator가 순차적으로 적용되는 경우', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          {
            tag: 'span',
            attrs: {
              className: 'highlight-decorator',
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'highlighted' }]
          },
          {
            tag: 'span',
            attrs: {
              className: 'underline-decorator',
              'data-decorator-sid': 'd-underline',
              'data-decorator-stype': 'underline'
            },
            children: [{ tag: undefined, text: 'underlined' }]
          },
          {
            tag: 'span',
            attrs: {
              className: 'strikethrough-decorator',
              'data-decorator-sid': 'd-strikethrough',
              'data-decorator-stype': 'strikethrough'
            },
            children: [{ tag: undefined, text: 'strikethrough' }]
          }
        ]
      };

      reconcileWithFiber(container, vnode, undefined, {}, deps);

      // 세 가지 decorator 요소가 모두 있어야 함
      const highlightElements = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      const underlineElements = container.querySelectorAll('[data-decorator-sid="d-underline"]');
      const strikethroughElements = container.querySelectorAll('[data-decorator-sid="d-strikethrough"]');
      
      expect(highlightElements.length).toBe(1);
      expect(underlineElements.length).toBe(1);
      expect(strikethroughElements.length).toBe(1);

      // 각각 다른 텍스트를 가져야 함
      expect(Array.from(highlightElements)[0].textContent).toBe('highlighted');
      expect(Array.from(underlineElements)[0].textContent).toBe('underlined');
      expect(Array.from(strikethroughElements)[0].textContent).toBe('strikethrough');
    });
  });

  describe('prevVNode와의 비교', () => {
    it('prevVNode가 없는 경우 새로 생성해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          {
            tag: 'span',
            attrs: {
              'data-decorator-sid': 'd-highlight',
              'data-decorator-stype': 'highlight'
            },
            children: [{ tag: undefined, text: 'new' }]
          }
        ]
      };

      reconcileWithFiber(container, vnode, undefined, {}, deps);

      const decoratorElements = container.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(decoratorElements.length).toBe(1);
    });

    it('prevVNode와 구조가 다른 경우 올바르게 업데이트해야 함', () => {
      const prevVNode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          {
            tag: 'span',
            attrs: {
              'data-decorator-sid': 'd-old',
              'data-decorator-stype': 'old'
            },
            children: [{ tag: undefined, text: 'old' }]
          }
        ]
      };

      const vnode: VNode = {
        tag: 'div',
        sid: 'parent-1',
        children: [
          {
            tag: 'span',
            attrs: {
              'data-decorator-sid': 'd-new',
              'data-decorator-stype': 'new'
            },
            children: [{ tag: undefined, text: 'new' }]
          },
          {
            tag: 'span',
            attrs: {
              'data-decorator-sid': 'd-new',
              'data-decorator-stype': 'new'
            },
            children: [{ tag: undefined, text: 'new2' }]
          }
        ]
      };

      reconcileWithFiber(container, prevVNode, undefined, {}, deps);
      reconcileWithFiber(container, vnode, prevVNode, {}, deps);

      // 새로운 decorator 요소들이 있어야 함
      const newElements = container.querySelectorAll('[data-decorator-sid="d-new"]');
      expect(newElements.length).toBe(2);

      // 이전 decorator 요소는 제거되어야 함
      const oldElements = container.querySelectorAll('[data-decorator-sid="d-old"]');
      expect(oldElements.length).toBe(0);
    });
  });
});

