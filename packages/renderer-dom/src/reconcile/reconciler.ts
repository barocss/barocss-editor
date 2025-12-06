import { RendererRegistry, ElementTemplate, ModelData } from '@barocss/dsl';
import { VNode } from '../vnode/types';
import { VNodeBuilder, VNodeBuildOptions } from '../vnode/factory';
import { DOMOperations } from '../dom-operations';
import { ComponentManager } from '../component-manager';
import { findFirstElementVNode, getVNodeId } from './utils/vnode-utils';
import { reorder } from './utils/dom-utils';
import { reconcileWithFiber, FiberReconcileDependencies } from './fiber/fiber-reconciler';
import { FiberNode } from './fiber/types';
import type { DataStore } from '../types';

type RuntimeCtx = Record<string, any> | undefined;

export class Reconciler {
  // React-style: maintain previous Fiber tree (referenced as alternate)
  private rootFiber: FiberNode | null = null;
  // Portal management: portalId → { target, host }
  private portalHostsById: Map<string, { target: HTMLElement, host: HTMLElement }> = new Map();
  // Set of visited portalIds in current render (cleanup on render end)
  private currentVisitedPortalIds: Set<string> | null = null;
  
  constructor(
    private registry: RendererRegistry,
    private builder: VNodeBuilder,
    private dom: DOMOperations,
    private components: ComponentManager,
    private domRendererInstanceId?: string,
    private dataStore?: DataStore
  ) {
    // Generate instance ID (for debugging)
    (this as any).__instanceId = `reconciler-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Reconcile VNode tree to container
   * Container is treated as root host - only attrs/style/children are reconciled
   * 
   * @param container - Root container element (fixed, never replaced)
   * @param vnode - Complete VNode tree to reconcile
   * @param model - Model data (for sid/stype to set on DOM elements)
   * @param runtime - Runtime context (optional)
   */
  reconcile(container: HTMLElement, vnode: VNode, model: ModelData, runtime?: RuntimeCtx, onComplete?: () => void): void {
    // IMPORTANT: early return if no sid (don't change DOM)
    const sid = vnode.sid || String(model?.sid || '');
    if (!sid) {
      // Don't reconcile if no sid (maintain existing DOM)
      return;
    }
    
    // Change rootVNode (promote first element to root)
    let rootVNode = vnode;
    if ((!rootVNode.tag || String(rootVNode.tag).toLowerCase() === 'div') && Array.isArray(rootVNode.children) && rootVNode.children.length > 0) {
      const firstEl = findFirstElementVNode(rootVNode);
      if (firstEl) {
        // Promote first element to root (deep copy including children)
        rootVNode = firstEl as VNode;
      }
    }
    
    // React-style: get prevVNode from previous rootFiber
    const prevRootFiber = this.rootFiber;
    const prevVNode = prevRootFiber?.vnode;
    
    // Initialize portal visit set (on root render entry)
    const isTopLevel = this.currentVisitedPortalIds === null;
    if (isTopLevel) this.currentVisitedPortalIds = new Set<string>();

    // Build reconcile context for lifecycle stubs
    const context: any = {
      registry: this.registry,
      builder: this.builder,
      parent: container, // At root level, container is parent
      dataStore: this.dataStore, // DataStore for getting model data by sid
      getComponent: (name: string) => {
        if (this.registry && typeof (this.registry as any).getComponent === 'function') {
          return (this.registry as any).getComponent(name);
        }
        if (this.registry && typeof (this.registry as any).get === 'function') {
          return (this.registry as any).get(name);
        }
        return undefined;
      },
      reconcile: (vnode: VNode, container: HTMLElement, reconcileContext: any) => {
        if (reconcileContext?.__isReconciling) {
          return;
        }
        const safeContext = {
          ...reconcileContext,
          __isReconciling: true
        };
        try {
          const fiberDeps: FiberReconcileDependencies = {
            dom: this.dom,
            components: this.components,
            currentVisitedPortalIds: this.currentVisitedPortalIds,
            portalHostsById: this.portalHostsById,
            context: safeContext
          };
          reconcileWithFiber(container, vnode, undefined, safeContext, fiberDeps);
        } finally {
          delete (safeContext as any).__isReconciling;
        }
      }
    };
    
    // Use Fiber-based reconcile (root level also processed as Fiber)
    // Process rootVNode as Fiber with container as parent
    const fiberDeps: FiberReconcileDependencies = {
      dom: this.dom,
      components: this.components,
      currentVisitedPortalIds: this.currentVisitedPortalIds,
      portalHostsById: this.portalHostsById,
      rootModel: context?.dataStore?.getNode(sid) || model, // Reference for model.text processing (dataStore takes priority)
      rootSid: sid, // rootVNode's sid
      context: context,
      prevRootFiber: prevRootFiber // React style: pass previous Fiber tree
    };
    
    // Tasks to process after Fiber completes
    reconcileWithFiber(container, rootVNode, prevVNode, context, fiberDeps, (newRootFiber) => {
      // React style: save new rootFiber (use as alternate in next render)
      if (newRootFiber) {
        this.rootFiber = newRootFiber;
      }
      
      // Perform portal cleanup at end of render
      if (isTopLevel && this.currentVisitedPortalIds) {
        const visited = this.currentVisitedPortalIds;
        for (const [pid, entry] of this.portalHostsById.entries()) {
          if (!visited.has(pid)) {
            if (entry.host.parentElement) entry.host.parentElement.removeChild(entry.host);
            this.portalHostsById.delete(pid);
          }
        }
        this.currentVisitedPortalIds = null;
      }
      
      // Call reconcile completion callback
      if (onComplete) {
        onComplete();
      }
    });
  }


  reconcileChildren(parent: HTMLElement, vnodes: VNode[], buildOpts?: VNodeBuildOptions, _runtime?: RuntimeCtx): void {
    // VNodes are already built by VNodeBuilder, just reconcile them to DOM
    
    // Wrap all VNodes in root VNode to process in order
    // This makes reconcileWithFiber process children in order
    // If tag is missing, children are directly added to parent
    const rootVNode: VNode = {
      tag: undefined, // Root has no tag (children are directly added to parent)
      children: vnodes.filter(v => v !== null && v !== undefined)
    };

    // Phase 2: VNode tree → DOM diff & apply
    // Extract context info from buildOpts (selection preservation disabled in children render path)
    const context = {
      registry: this.registry,
      builder: this.builder,
      parent,
      dataStore: this.dataStore, // DataStore for getting model data by sid
      getComponent: (name: string) => {
        if (this.registry && typeof (this.registry as any).getComponent === 'function') {
          return (this.registry as any).getComponent(name);
        }
        if (this.registry && typeof (this.registry as any).get === 'function') {
          return (this.registry as any).get(name);
        }
        return undefined;
      },
      reconcile: (vnode: VNode, container: HTMLElement, reconcileContext: any) => {
        // reconcileFunc: used when called from ComponentManager
        // Prevent recursive call if __isReconciling flag is set
        if (reconcileContext?.__isReconciling) {
          return; // Prevent recursive call if already reconciling
        }
        // Set __isReconciling on reconcileContext
        const safeContext = {
          ...reconcileContext,
          __isReconciling: true
        };
        try {
          // Fiber 기반 reconcile 사용
          const fiberDeps: FiberReconcileDependencies = {
            dom: this.dom,
            components: this.components,
            currentVisitedPortalIds: this.currentVisitedPortalIds,
            portalHostsById: this.portalHostsById,
            context: safeContext
          };
          reconcileWithFiber(container, vnode, undefined, safeContext, fiberDeps);
        } finally {
          delete (safeContext as any).__isReconciling;
        }
      },
      __isReconciling: false
    };
    
    // 모든 VNode를 루트 VNode의 children으로 처리
    // reconcileWithFiber가 children을 순서대로 처리함
    const fiberDeps: FiberReconcileDependencies = {
      dom: this.dom,
      components: this.components,
      currentVisitedPortalIds: this.currentVisitedPortalIds,
      portalHostsById: this.portalHostsById,
      context: context,
      prevRootFiber: null // reconcileRootVNode는 별도 rootFiber 유지하지 않음
    };
    
    // 루트 VNode를 reconcileWithFiber로 처리
    // 이렇게 하면 children이 순서대로 처리됨
    reconcileWithFiber(parent, rootVNode, undefined, context, fiberDeps);
  }

  private reconcileVNodesToDOM(parent: HTMLElement, newVNodes: VNode[], sidToModel: Map<string, ModelData>, context?: any): void {
    // 기존 host 수집 (VNode 식별자 보유 자식)
    const existingHosts = Array.from(parent.children).filter(
      (el): el is HTMLElement => 
        el instanceof HTMLElement && (
          !!el.getAttribute('data-bc-sid') || !!el.getAttribute('data-decorator-sid')
        )
    ) as HTMLElement[];
    
    // Fiber 완료 추적을 위한 카운터
    let completedCount = 0;
    const totalCount = newVNodes.filter(v => v.sid || v.attrs?.['data-decorator-sid']).length;
    // VNode 순서대로 host를 저장하기 위한 Map (index -> host)
    const nextHostsByIndex = new Map<number, HTMLElement>();
    
    // 모든 Fiber 작업 완료 후 실행할 작업
    const onAllComplete = () => {
      // VNode 순서대로 nextHosts 배열 구성
      const nextHosts: HTMLElement[] = [];
      for (let i = 0; i < newVNodes.length; i++) {
        const host = nextHostsByIndex.get(i);
        if (host) {
          nextHosts.push(host);
        }
      }
      
      // 순서 정렬 (host-only): nextHosts 배열의 순서대로 DOM에 배치
      reorder(parent, nextHosts);
      
      // 제거 (host-only): nextHosts에 없는 기존 host만 제거
      const keepSet = new Set(nextHosts);
      for (const el of existingHosts) {
        if (!keepSet.has(el)) {
          try { parent.removeChild(el); } catch {}
        }
      }
    };
    
    // 각 VNode를 Fiber로 처리
    for (let i = 0; i < newVNodes.length; i++) {
      const vnode = newVNodes[i];
      const sid = vnode.sid;
      if (!sid) continue; // Only process VNodes with sid (component-generated)
      // reconcile context 구성
      const reconcileContext = {
        registry: this.registry,
        builder: this.builder,
        parent: parent, // parent를 직접 사용 (Fiber에서 host를 찾거나 생성)
        getComponent: (name: string) => {
          if (this.registry && typeof (this.registry as any).getComponent === 'function') {
            return (this.registry as any).getComponent(name);
          }
          if (this.registry && typeof (this.registry as any).get === 'function') {
            return (this.registry as any).get(name);
          }
          return undefined;
        },
        __isReconciling: (context as any)?.__isReconciling || false
      };
      
      // Fiber 기반 reconcile 사용
      const fiberDeps: FiberReconcileDependencies = {
        dom: this.dom,
        components: this.components,
        currentVisitedPortalIds: this.currentVisitedPortalIds,
        portalHostsById: this.portalHostsById,
        rootModel: context?.dataStore?.getNode(sid), // model.text 처리를 위한 참조 (dataStore에서 가져옴)
        rootSid: sid, // rootVNode의 sid (model.text 처리를 위해)
        context: reconcileContext,
        prevRootFiber: null // reconcileVNodesToDOM은 별도 rootFiber 유지하지 않음
      };
      
      // VNode 인덱스 캡처
      const vnodeIndex = i;
      
      // Fiber 완료 콜백
      reconcileWithFiber(parent, vnode, undefined, reconcileContext, fiberDeps, () => {
        
        // host 찾기 (Fiber reconcile 후에 DOM에 추가됨)
        const host = vnode.meta?.domElement as HTMLElement | undefined;
        if (host) {
          // VNode 순서대로 저장
          nextHostsByIndex.set(vnodeIndex, host);
          
          // 인스턴스 동기화
          const inst = this.components.getComponentInstance(sid as any);
          if (inst) {
            inst.element = host;
          }
        }
        
        // 모든 VNode 처리 완료 확인
        completedCount++;
        if (completedCount === totalCount) {
          onAllComplete();
        }
      });
    }
    
    // VNode가 없는 경우 즉시 완료 처리
    if (totalCount === 0) {
      onAllComplete();
    }
  }

  // Note: reconcileVNodeChildren, processChildVNode, removeStale, unmountRoot, setRootContainer, reconcileRoot는 
  // Fiber reconcile로 완전히 전환되어 제거됨

}



