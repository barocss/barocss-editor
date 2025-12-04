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
  // React 방식: 이전 Fiber tree 유지 (alternate로 참조)
  private rootFiber: FiberNode | null = null;
  // portal 관리: portalId → { target, host }
  private portalHostsById: Map<string, { target: HTMLElement, host: HTMLElement }> = new Map();
  // 현재 렌더에서 방문된 portalId 집합 (렌더 종료 시 클린업)
  private currentVisitedPortalIds: Set<string> | null = null;
  
  constructor(
    private registry: RendererRegistry,
    private builder: VNodeBuilder,
    private dom: DOMOperations,
    private components: ComponentManager,
    private domRendererInstanceId?: string,
    private dataStore?: DataStore
  ) {
    // 인스턴스 ID 생성 (디버깅용)
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
    // IMPORTANT: sid가 없으면 early return (DOM 변경하지 않음)
    const sid = vnode.sid || String(model?.sid || '');
    if (!sid) {
      // sid가 없으면 reconcile하지 않음 (기존 DOM 유지)
      return;
    }
    
    // rootVNode 변경 (첫 엘리먼트를 루트로 승격)
    let rootVNode = vnode;
    if ((!rootVNode.tag || String(rootVNode.tag).toLowerCase() === 'div') && Array.isArray(rootVNode.children) && rootVNode.children.length > 0) {
      const firstEl = findFirstElementVNode(rootVNode);
      if (firstEl) {
        // 첫 엘리먼트를 루트로 승격 (children 포함 깊은 복사)
        rootVNode = firstEl as VNode;
      }
    }
    
    // React 방식: 이전 rootFiber에서 prevVNode 가져오기
    const prevRootFiber = this.rootFiber;
    const prevVNode = prevRootFiber?.vnode;
    
    // 포털 방문 집합 초기화 (루트 렌더 진입 시)
    const isTopLevel = this.currentVisitedPortalIds === null;
    if (isTopLevel) this.currentVisitedPortalIds = new Set<string>();

    // Build reconcile context for lifecycle stubs
    const context: any = {
      registry: this.registry,
      builder: this.builder,
      parent: container, // Root 레벨에서는 container가 parent
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
    
    // Fiber 기반 reconcile 사용 (root 레벨도 Fiber로 처리)
    // rootVNode를 container를 parent로 해서 Fiber로 처리
    const fiberDeps: FiberReconcileDependencies = {
      dom: this.dom,
      components: this.components,
      currentVisitedPortalIds: this.currentVisitedPortalIds,
      portalHostsById: this.portalHostsById,
      rootModel: context?.dataStore?.getNode(sid) || model, // model.text 처리를 위한 참조 (dataStore 우선)
      rootSid: sid, // rootVNode의 sid
      context: context,
      prevRootFiber: prevRootFiber // React 방식: 이전 Fiber tree 전달
    };
    
    // Fiber 완료 후 처리할 작업들
    reconcileWithFiber(container, rootVNode, prevVNode, context, fiberDeps, (newRootFiber) => {
      // React 방식: 새로운 rootFiber 저장 (다음 렌더에서 alternate로 사용)
      if (newRootFiber) {
        this.rootFiber = newRootFiber;
      }
      
      // 렌더 종료 시 포털 클린업 수행
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
      
      // Reconcile 완료 콜백 호출
      if (onComplete) {
        onComplete();
      }
    });
  }


  reconcileChildren(parent: HTMLElement, vnodes: VNode[], buildOpts?: VNodeBuildOptions, _runtime?: RuntimeCtx): void {
    // VNodes are already built by VNodeBuilder, just reconcile them to DOM
    
    // 모든 VNode를 순서대로 처리하기 위해 루트 VNode로 감싸기
    // 이렇게 하면 reconcileWithFiber가 children을 순서대로 처리함
    // tag가 없으면 children을 직접 parent에 추가하도록 처리됨
    const rootVNode: VNode = {
      tag: undefined, // 루트는 tag가 없음 (children을 직접 parent에 추가)
      children: vnodes.filter(v => v !== null && v !== undefined)
    };

    // Phase 2: VNode 트리 → DOM diff & 적용
    // buildOpts에서 context 정보 추출 (children 렌더 경로에서는 selection 보존 비활성)
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
        // reconcileFunc: ComponentManager에서 호출될 때 사용
        // __isReconciling 플래그가 설정되어 있으면 재귀 호출 방지
        if (reconcileContext?.__isReconciling) {
          return; // 이미 reconciling 중이면 재귀 호출 방지
        }
        // reconcileContext에 __isReconciling 설정
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



