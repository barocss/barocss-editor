import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handlePortalVNode } from '../../src/reconcile/utils/portal-handler';
import { VNode } from '../../src/vnode/types';
import { DOMOperations } from '../../src/dom-operations';

describe('reconcile-utils: portal-handler', () => {
  let target: HTMLElement;
  let mockDom: DOMOperations;
  let reconcileFunc: ReturnType<typeof vi.fn>;
  let currentVisitedPortalIds: Set<string>;
  let portalHostsById: Map<string, { target: HTMLElement; host: HTMLElement }>;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);

    mockDom = {
      createSimpleElement: vi.fn((tag: string) => document.createElement(tag)),
      setAttribute: vi.fn((el: HTMLElement, name: string, value: string) => {
        el.setAttribute(name, value);
      }),
    } as any;

    reconcileFunc = vi.fn();
    currentVisitedPortalIds = new Set();
    portalHostsById = new Map();
  });

  afterEach(() => {
    document.body.removeChild(target);
  });

  describe('handlePortalVNode', () => {
    it('should return false for non-portal VNode', () => {
      const childVNode: VNode = {
        tag: 'div',
      } as VNode;

      const result = handlePortalVNode(
        childVNode,
        mockDom,
        reconcileFunc,
        currentVisitedPortalIds,
        portalHostsById
      );

      expect(result).toBe(false);
    });

    it('should return true for portal VNode without content', () => {
      const childVNode: VNode = {
        tag: 'portal',
        portal: {
          target: target,
        },
        children: [],
      } as any;

      const result = handlePortalVNode(
        childVNode,
        mockDom,
        reconcileFunc,
        currentVisitedPortalIds,
        portalHostsById
      );

      expect(result).toBe(true);
      expect(reconcileFunc).not.toHaveBeenCalled();
    });

    it('should create portal host if not exists', () => {
      const contentVNode: VNode = {
        tag: 'div',
        text: 'portal content',
      } as VNode;

      const childVNode: VNode = {
        tag: 'portal',
        portal: {
          target: target,
          portalId: 'test-portal',
        },
        children: [contentVNode],
      } as any;

      const result = handlePortalVNode(
        childVNode,
        mockDom,
        reconcileFunc,
        currentVisitedPortalIds,
        portalHostsById
      );

      expect(result).toBe(true);
      expect(target.children.length).toBe(1);
      const portalHost = target.children[0] as HTMLElement;
      expect(portalHost.getAttribute('data-bc-sid')).toBe('test-portal');
      expect(reconcileFunc).toHaveBeenCalledWith(
        portalHost,
        undefined,
        contentVNode,
        expect.objectContaining({ __isReconciling: true })
      );
    });

    it('should reuse existing portal host', () => {
      const existingHost = document.createElement('div');
      existingHost.setAttribute('data-bc-sid', 'test-portal');
      target.appendChild(existingHost);

      const contentVNode: VNode = {
        tag: 'div',
        text: 'portal content',
      } as VNode;

      const childVNode: VNode = {
        tag: 'portal',
        portal: {
          target: target,
          portalId: 'test-portal',
        },
        children: [contentVNode],
      } as any;

      const result = handlePortalVNode(
        childVNode,
        mockDom,
        reconcileFunc,
        currentVisitedPortalIds,
        portalHostsById
      );

      expect(result).toBe(true);
      expect(target.children.length).toBe(1);
      expect(target.children[0]).toBe(existingHost);
      expect(reconcileFunc).toHaveBeenCalledWith(
        existingHost,
        undefined,
        contentVNode,
        expect.objectContaining({ __isReconciling: true })
      );
    });

    it('should track visited portal IDs', () => {
      const contentVNode: VNode = {
        tag: 'div',
      } as VNode;

      const childVNode: VNode = {
        tag: 'portal',
        portal: {
          target: target,
          portalId: 'test-portal',
        },
        children: [contentVNode],
      } as any;

      handlePortalVNode(
        childVNode,
        mockDom,
        reconcileFunc,
        currentVisitedPortalIds,
        portalHostsById
      );

      expect(currentVisitedPortalIds.has('test-portal')).toBe(true);
    });

    it('should update portalHostsById map', () => {
      const contentVNode: VNode = {
        tag: 'div',
      } as VNode;

      const childVNode: VNode = {
        tag: 'portal',
        portal: {
          target: target,
          portalId: 'test-portal',
        },
        children: [contentVNode],
      } as any;

      handlePortalVNode(
        childVNode,
        mockDom,
        reconcileFunc,
        currentVisitedPortalIds,
        portalHostsById
      );

      const entry = portalHostsById.get('test-portal');
      expect(entry).toBeDefined();
      expect(entry?.target).toBe(target);
      expect(entry?.host).toBeInstanceOf(HTMLElement);
    });

    it('should remove old host if portal moved to different target', () => {
      const oldTarget = document.createElement('div');
      document.body.appendChild(oldTarget);
      const oldHost = document.createElement('div');
      oldHost.setAttribute('data-bc-sid', 'test-portal');
      oldTarget.appendChild(oldHost);

      portalHostsById.set('test-portal', { target: oldTarget, host: oldHost });

      const contentVNode: VNode = {
        tag: 'div',
      } as VNode;

      const childVNode: VNode = {
        tag: 'portal',
        portal: {
          target: target,
          portalId: 'test-portal',
        },
        children: [contentVNode],
      } as any;

      handlePortalVNode(
        childVNode,
        mockDom,
        reconcileFunc,
        currentVisitedPortalIds,
        portalHostsById
      );

      expect(oldTarget.children.length).toBe(0);
      expect(target.children.length).toBe(1);

      document.body.removeChild(oldTarget);
    });

    it('should use default portalId if not provided', () => {
      const contentVNode: VNode = {
        tag: 'div',
      } as VNode;

      const childVNode: VNode = {
        tag: 'portal',
        portal: {
          target: target,
        },
        children: [contentVNode],
      } as any;

      handlePortalVNode(
        childVNode,
        mockDom,
        reconcileFunc,
        currentVisitedPortalIds,
        portalHostsById
      );

      expect(currentVisitedPortalIds.has('portal-default')).toBe(true);
      const portalHost = target.children[0] as HTMLElement;
      expect(portalHost.getAttribute('data-bc-sid')).toBe('portal-default');
    });
  });
});

