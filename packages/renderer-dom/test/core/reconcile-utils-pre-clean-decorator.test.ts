import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { removeStaleEarly } from '../../src/reconcile/utils/pre-clean';
import { VNode } from '../../src/vnode/types';
import { ComponentManager } from '../../src/component-manager';

describe('removeStaleEarly - decorator 관련 케이스', () => {
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
    if (parent.parentNode) {
      document.body.removeChild(parent);
    }
    parent.innerHTML = '';
  });

  describe('decoratorSid를 가진 요소 처리', () => {
    it('decoratorSid를 가진 요소는 removeStaleEarly에서 제거하지 않아야 함', () => {
      // removeStaleEarly는 data-bc-sid만 확인하므로 decoratorSid는 제거하지 않음
      const decoratorEl = document.createElement('span');
      decoratorEl.setAttribute('data-decorator-sid', 'd-highlight');
      parent.appendChild(decoratorEl);

      const childVNodes: VNode[] = [
        {
          tag: 'span',
          decoratorSid: 'd-highlight',
          decoratorStype: 'highlight'
        } as VNode
      ];

      removeStaleEarly(parent, childVNodes, [], mockComponents, {});

      // decorator 요소는 제거되지 않아야 함 (removeStaleEarly는 sid만 확인)
      const decoratorElements = parent.querySelectorAll('[data-decorator-sid="d-highlight"]');
      expect(decoratorElements.length).toBe(1);
    });

    it('sid를 가진 요소는 removeStaleEarly에서 제거되어야 함', () => {
      const el1 = document.createElement('div');
      el1.setAttribute('data-bc-sid', 'sid1');
      parent.appendChild(el1);

      const el2 = document.createElement('div');
      el2.setAttribute('data-bc-sid', 'sid2');
      parent.appendChild(el2);

      const childVNodes: VNode[] = [
        { tag: 'div', sid: 'sid1' } as VNode
      ];

      const prevChildVNodes: VNode[] = [
        { tag: 'div', sid: 'sid1' } as VNode,
        { tag: 'div', sid: 'sid2' } as VNode
      ];

      removeStaleEarly(parent, childVNodes, prevChildVNodes, mockComponents, {});

      // sid2는 제거되어야 함
      const remainingElements = parent.querySelectorAll('[data-bc-sid]');
      expect(remainingElements.length).toBe(1);
      expect(remainingElements[0].getAttribute('data-bc-sid')).toBe('sid1');
    });
  });
});

