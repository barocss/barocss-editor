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
          // Use Fiber-based reconcile
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
    
    // Process all VNodes as children of root VNode
    // reconcileWithFiber processes children in order
    const fiberDeps: FiberReconcileDependencies = {
      dom: this.dom,
      components: this.components,
      currentVisitedPortalIds: this.currentVisitedPortalIds,
      portalHostsById: this.portalHostsById,
      context: context,
      prevRootFiber: null // reconcileRootVNode does not maintain separate rootFiber
    };
    
    // Process root VNode with reconcileWithFiber
    // This ensures children are processed in order
    reconcileWithFiber(parent, rootVNode, undefined, context, fiberDeps);
  }

  private reconcileVNodesToDOM(parent: HTMLElement, newVNodes: VNode[], sidToModel: Map<string, ModelData>, context?: any): void {
    // Collect existing hosts (children with VNode identifiers)
    const existingHosts = Array.from(parent.children).filter(
      (el): el is HTMLElement => 
        el instanceof HTMLElement && (
          !!el.getAttribute('data-bc-sid') || !!el.getAttribute('data-decorator-sid')
        )
    ) as HTMLElement[];
    
    // Counter for tracking Fiber completion
    let completedCount = 0;
    const totalCount = newVNodes.filter(v => v.sid || v.attrs?.['data-decorator-sid']).length;
    // Map to store hosts in VNode order (index -> host)
    const nextHostsByIndex = new Map<number, HTMLElement>();
    
    // Task to execute after all Fiber work completes
    const onAllComplete = () => {
      // Build nextHosts array in VNode order
      const nextHosts: HTMLElement[] = [];
      for (let i = 0; i < newVNodes.length; i++) {
        const host = nextHostsByIndex.get(i);
        if (host) {
          nextHosts.push(host);
        }
      }
      
      // Reorder (host-only): place in DOM according to nextHosts array order
      reorder(parent, nextHosts);
      
      // Remove (host-only): remove only existing hosts not in nextHosts
      const keepSet = new Set(nextHosts);
      for (const el of existingHosts) {
        if (!keepSet.has(el)) {
          try { parent.removeChild(el); } catch {}
        }
      }
    };
    
    // Process each VNode as Fiber
    for (let i = 0; i < newVNodes.length; i++) {
      const vnode = newVNodes[i];
      const sid = vnode.sid;
      if (!sid) continue; // Only process VNodes with sid (component-generated)
      // Build reconcile context
      const reconcileContext = {
        registry: this.registry,
        builder: this.builder,
        parent: parent, // Use parent directly (Fiber finds or creates host)
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
      
      // Use Fiber-based reconcile
      const fiberDeps: FiberReconcileDependencies = {
        dom: this.dom,
        components: this.components,
        currentVisitedPortalIds: this.currentVisitedPortalIds,
        portalHostsById: this.portalHostsById,
        rootModel: context?.dataStore?.getNode(sid), // Reference for model.text processing (fetched from dataStore)
        rootSid: sid, // sid of rootVNode (for model.text processing)
        context: reconcileContext,
        prevRootFiber: null // reconcileVNodesToDOM does not maintain separate rootFiber
      };
      
      // Capture VNode index
      const vnodeIndex = i;
      
      // Fiber completion callback
      reconcileWithFiber(parent, vnode, undefined, reconcileContext, fiberDeps, () => {
        
        // Find host (added to DOM after Fiber reconcile)
        const host = vnode.meta?.domElement as HTMLElement | undefined;
        if (host) {
          // Store in VNode order
          nextHostsByIndex.set(vnodeIndex, host);
          
          // Synchronize instance
          const inst = this.components.getComponentInstance(sid as any);
          if (inst) {
            inst.element = host;
          }
        }
        
        // Verify all VNodes are processed
        completedCount++;
        if (completedCount === totalCount) {
          onAllComplete();
        }
      });
    }
    
    // If no VNodes, complete immediately
    if (totalCount === 0) {
      onAllComplete();
    }
  }

  // Note: reconcileVNodeChildren, processChildVNode, removeStale, unmountRoot, setRootContainer, reconcileRoot are 
  // completely replaced by Fiber reconcile and removed

}



