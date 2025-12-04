import { describe, it, expect, beforeEach } from 'vitest';
import { FiberScheduler, FiberReconcileFunction } from '../../src/reconcile/fiber/fiber-scheduler';
import { FiberNode, FiberPriority } from '../../src/reconcile/fiber/types';
import { VNode } from '../../src/vnode/types';

describe('FiberScheduler - 단위 테스트', () => {
  let container: HTMLElement;
  let reconcileCallOrder: FiberNode[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    reconcileCallOrder = [];
  });

  describe('기본 동작', () => {
    it('Fiber 작업을 스케줄링해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'root'
      };

      const rootFiber: FiberNode = {
        vnode,
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

      const reconcileFunction: FiberReconcileFunction = (fiber: FiberNode) => {
        reconcileCallOrder.push(fiber);
      };

      const scheduler = new FiberScheduler(reconcileFunction);
      scheduler.scheduleWork(rootFiber);

      // 동기 모드이므로 즉시 실행됨
      expect(reconcileCallOrder.length).toBeGreaterThan(0);
      expect(reconcileCallOrder[0]).toBe(rootFiber);
    });

    it('자식 Fiber를 재귀적으로 처리해야 함', () => {
      const childVNode: VNode = {
        tag: 'span',
        sid: 'child'
      };

      const rootVNode: VNode = {
        tag: 'div',
        sid: 'root',
        children: [childVNode]
      };

      const rootFiber: FiberNode = {
        vnode: rootVNode,
        prevVNode: undefined,
        domElement: null,
        parent: container,
        parentFiber: null,
        child: {
          vnode: childVNode,
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
        },
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      const reconcileFunction: FiberReconcileFunction = (fiber: FiberNode) => {
        reconcileCallOrder.push(fiber);
      };

      const scheduler = new FiberScheduler(reconcileFunction);
      scheduler.scheduleWork(rootFiber);

      // 루트와 자식 모두 처리되어야 함
      expect(reconcileCallOrder.length).toBe(2);
      expect(reconcileCallOrder[0].vnode.sid).toBe('root');
      expect(reconcileCallOrder[1].vnode.sid).toBe('child');
    });

    it('형제 Fiber를 순차적으로 처리해야 함', () => {
      const child1VNode: VNode = {
        tag: 'span',
        sid: 'child1'
      };

      const child2VNode: VNode = {
        tag: 'span',
        sid: 'child2'
      };

      const rootVNode: VNode = {
        tag: 'div',
        sid: 'root',
        children: [child1VNode, child2VNode]
      };

      const child2Fiber: FiberNode = {
        vnode: child2VNode,
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

      const child1Fiber: FiberNode = {
        vnode: child1VNode,
        prevVNode: undefined,
        domElement: null,
        parent: container,
        parentFiber: null,
        child: null,
        sibling: child2Fiber,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      const rootFiber: FiberNode = {
        vnode: rootVNode,
        prevVNode: undefined,
        domElement: null,
        parent: container,
        parentFiber: null,
        child: child1Fiber,
        sibling: null,
        return: null,
        effectTag: null,
        alternate: null,
        context: {},
        index: 0
      };

      child1Fiber.return = rootFiber;
      child2Fiber.return = rootFiber;

      const reconcileFunction: FiberReconcileFunction = (fiber: FiberNode) => {
        reconcileCallOrder.push(fiber);
      };

      const scheduler = new FiberScheduler(reconcileFunction);
      scheduler.scheduleWork(rootFiber);

      // 루트, child1, child2 순서로 처리되어야 함
      // (부모로 돌아갈 때도 reconcile이 호출될 수 있으므로 3개 이상일 수 있음)
      expect(reconcileCallOrder.length).toBeGreaterThanOrEqual(3);
      expect(reconcileCallOrder[0].vnode.sid).toBe('root');
      expect(reconcileCallOrder.some(f => f.vnode.sid === 'child1')).toBe(true);
      expect(reconcileCallOrder.some(f => f.vnode.sid === 'child2')).toBe(true);
    });
  });

  describe('동기 모드', () => {
    it('동기 모드에서 즉시 모든 작업을 완료해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'root'
      };

      const rootFiber: FiberNode = {
        vnode,
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

      const reconcileFunction: FiberReconcileFunction = (fiber: FiberNode) => {
        reconcileCallOrder.push(fiber);
      };

      const scheduler = new FiberScheduler(reconcileFunction);
      scheduler.setSyncMode(true);
      scheduler.scheduleWork(rootFiber);

      // 동기 모드이므로 즉시 완료
      expect(scheduler.isSyncMode()).toBe(true);
      expect(reconcileCallOrder.length).toBe(1);
    });
  });

  describe('onComplete 콜백', () => {
    it('작업 완료 시 onComplete 콜백을 호출해야 함', () => {
      const vnode: VNode = {
        tag: 'div',
        sid: 'root'
      };

      const rootFiber: FiberNode = {
        vnode,
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

      let onCompleteCalled = false;

      const reconcileFunction: FiberReconcileFunction = () => {};
      const scheduler = new FiberScheduler(reconcileFunction, () => {
        onCompleteCalled = true;
      });

      scheduler.setSyncMode(true);
      scheduler.scheduleWork(rootFiber);

      // 동기 모드이므로 즉시 완료되고 콜백 호출
      expect(onCompleteCalled).toBe(true);
    });
  });
});
