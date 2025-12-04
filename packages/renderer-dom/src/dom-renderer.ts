/**
 * DOMRenderer: high-level convenience wrapper (extend when needed)
 * - The core exposes reconcile directly; this class provides minimal wrapping
 * - Use this class if a consistent entry-point is desired across the project
 */
import { VNode, DOMAttribute } from './vnode/types';
import { VNodeBuilder, ComponentStateProvider, VNodeBuildOptions } from './vnode/factory';
import type { Decorator } from './vnode/decorator';
import { PatternDecoratorGenerator } from './vnode/pattern-decorator-generator';
import { NodeCache } from './node-cache';
import { RendererRegistry, ModelData } from '@barocss/dsl';
import { Reconciler } from './reconcile/reconciler';
import { DOMOperations } from './dom-operations';
import { ComponentManager } from './component-manager';
import { ComponentInstance } from './types';
import { logger, LogCategory } from './utils/logger';
import type { BaseComponentState } from './state/base-component-state';
import type { DataStore } from './types';

/**
 * DOMRenderer options
 */
export interface DOMRendererOptions {
  /**
   * Enable selection-preserving TextNodePool usage for content rendering.
   * When enabled, use renderContent(...) to pass selection context and the pool
   * will be injected into Reconciler only for that render call.
   */
  enableSelectionPreservation?: boolean;
  /**
   * Renderer name for debugging (e.g., "content", "decorator", "selection")
   */
  name?: string;
  /**
   * DataStore instance for getting model data by sid
   */
  dataStore?: DataStore;
}

/**
 * DOMRenderer - main class responsible for reconcile-based DOM rendering
 */
export class DOMRenderer {
  private cache: NodeCache;
  private builder: VNodeBuilder;
  private componentManager: ComponentManager;
  private patternDecoratorGenerator: PatternDecoratorGenerator;
  private rootElement: HTMLElement | null = null;
  private currentVNode: VNode | null = null;
  // Snapshot store for partial updates: sid -> last VNode
  private sidToVNodeSnapshot: Map<string, VNode> = new Map();
  
  // 마지막 빌드 시점의 입력 저장 (자동 재빌드용)
  private lastModel: ModelData | null = null;
  private lastDecorators: Decorator[] | null = null;
  private lastRuntime: Record<string, any> | null = null;
  private renderScheduled = false;
  
  // Simple reconcile pipeline (VNode-DOM 1:1 매칭)
  private domOperations: DOMOperations;
  private reconciler: Reconciler;
  private dataStore?: DataStore;
  
  // 인스턴스 ID (디버깅용)
  private readonly __instanceId: string;
  
  
  constructor(registry?: RendererRegistry, _options?: DOMRendererOptions) {
    this.dataStore = _options?.dataStore;
    // 인스턴스 ID 생성 (디버깅용: 이름 포함)
    const name = _options?.name || 'unknown';
    this.__instanceId = `domrenderer-${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.cache = new NodeCache();
    
    // Simple reconcile pipeline (VNode-DOM 1:1 매칭 기반)
    this.domOperations = new DOMOperations();
    const componentManager = new ComponentManager();
    this.componentManager = componentManager;
    
    // Create pattern decorator generator
    // 패턴은 EditorViewDOM에서 데이터로 관리하고 전달받음
    this.patternDecoratorGenerator = new PatternDecoratorGenerator();
    
    // Create VNodeBuilder first
    this.builder = new VNodeBuilder(registry, {
      componentStateProvider: componentManager as unknown as ComponentStateProvider,
      componentManager: componentManager,
      patternDecoratorGenerator: this.patternDecoratorGenerator
    });
    // Reconciler owns the flow (root→children)
    this.reconciler = new Reconciler(this.builder.getRegistry(), this.builder, this.domOperations, this.componentManager, this.__instanceId, this.dataStore);

    // 상태 변경 이벤트 수신 → 전체 재렌더 (모델은 동일, 상태만 변경됨)
    this.componentManager.on('changeState', (_sid: string) => {
      if (!this.rootElement || !this.lastModel) return;
      if (this.renderScheduled) return;
      this.renderScheduled = true;
      queueMicrotask(() => {
        this.renderScheduled = false;
        try {
          this.render(this.rootElement as HTMLElement, this.lastModel as ModelData, this.lastDecorators || [], this.lastRuntime || undefined);
        } catch {}
      });
    });
  }
  
  // Full re-render callback API removed; components update locally via ComponentManager
  
  getRegistry(): RendererRegistry {
    return this.builder.getRegistry();
  }
  
  /**
   * Get DOMRenderer instance ID (for debugging)
   */
  getInstanceId(): string {
    return this.__instanceId;
  }
  
  /**
   * Get Reconciler instance ID (for debugging)
   */
  getReconcilerInstanceId(): string {
    return (this.reconciler as any).__instanceId || 'unknown';
  }
  
  /**
   * Get pattern decorator generator (for external configuration)
   * 
   * EditorViewDOM에서 패턴을 등록할 때 사용합니다.
   */
  getPatternDecoratorGenerator(): PatternDecoratorGenerator {
    return this.patternDecoratorGenerator;
  }

  /**
   * Get component instance by sid
   * 
   * @param sid - Component sid (Model ID)
   * @returns ComponentInstance or undefined if not found
   */
  getInstance(sid: string): ComponentInstance | undefined {
    const instance = this.componentManager.getInstance(sid);
    if (!instance) return undefined;
    
    // Add setState method to instance if not already present
    if (!instance.setState) {
      instance.setState = (newState: Record<string, any>) => {
        // Prevent setState during updateComponent to avoid infinite loops
        if (this.componentManager.getReconciling()) {
          logger.warn(LogCategory.COMPONENT, 'setState called during reconciliation, ignoring', {
            sid,
            newState
          });
          return;
        }
        // Use ComponentContext.setState if available (from __stateInstance)
        const stateInstance = (instance as any).__stateInstance as BaseComponentState | undefined;
        if (stateInstance) {
          stateInstance.set(newState);
        } else {
          // Fallback: update state directly and emit changeState
          const prevState = { ...(instance.state || {}) };
          instance.state = { ...(instance.state || {}), ...newState };
          this.componentManager.emit('changeState', sid, {
            state: instance.state,
            patch: newState
          });
        }
      };
    }
    
    return instance;
  }

  /**
   * Register event listener for changeState events
   * 
   * @param event - Event name (currently only 'changeState' is supported)
   * @param handler - Event handler function
   */
  on(event: 'changeState', handler: (sid: string, data: { state: Record<string, any>; patch: Record<string, any> }) => void): void {
    this.componentManager.on(event, handler);
  }

  /**
   * Remove event listener
   * 
   * @param event - Event name
   * @param handler - Event handler function to remove (optional, if not provided, all listeners for the event are removed)
   */
  off(event: 'changeState', handler?: (sid: string, data: { state: Record<string, any>; patch: Record<string, any> }) => void): void {
    this.componentManager.off(event, handler);
  }

  /**
   * Build VNode from model and decorators
   * This is the main entry point for building VNodes with component state support
   * 
   * @param model - Model data (must have stype property)
   * @param decorators - Array of decorators to apply
   * @returns Built VNode ready for rendering
   */
  build(model: ModelData, decorators: Decorator[] = []): VNode {
    if (!model || !model.stype) {
      throw new Error('[DOMRenderer] build: model must have stype property');
    }
    
    // Store for automatic re-render
    this.lastModel = model;
    this.lastDecorators = decorators;
    
    // Build content VNode using VNodeBuilder
    // 패턴 decorator는 VNodeBuilder에서 inline-text 처리 시점에 자동 생성됨
    const content = this.builder.build(model.stype, model, { decorators });
    return content;
  }
  

  /**
   * Render model to container (main entry point)
   * Creates a complete VNode tree from model and reconciles it to container
   * 
   * @param container - Root container element
   * @param model - Model data (must have stype property)
   * @param decorators - Array of decorators to apply
   * @param runtime - Runtime context (e.g., { dataStore })
   * @param selection - Selection context for text node preservation
   * @param options - Render options
   */
  render(
    container: HTMLElement,
    model: ModelData,
    decorators: Decorator[] = [],
    runtime?: Record<string, any>,
    selection?: { 
      textNode?: Text; 
      restoreSelection?: (textNode: Text, offset: number) => void;
      model?: { sid: string; modelOffset: number };
    },
    options?: { onComplete?: () => void }
  ): void {
    if (!model || !model.stype) {
      throw new Error('[DOMRenderer] render: model must have stype property');
      }
    
    // Store for later use
    this.rootElement = container;
    this.lastModel = model;
    this.lastDecorators = decorators;
    this.lastRuntime = runtime || null;
    
    // Build complete VNode tree from model
    // 패턴 decorator는 VNodeBuilder에서 inline-text 처리 시점에 자동 생성됨
    const vnode = this.builder.build(model.stype, model, { 
      decorators,
      selectionContext: selection?.model,
    } as unknown as VNodeBuildOptions);
    
    logger.debug(LogCategory.RECONCILE, 'render: VNode built, starting reconcile', {
      modelSid: model.sid,
      modelStype: model.stype,
      vnodeSid: vnode.sid,
      vnodeStype: vnode.stype,
      vnodeTag: vnode.tag,
      childrenCount: Array.isArray(vnode.children) ? vnode.children.length : 0
    });
    
    // Reconcile VNode tree to container (model도 전달하여 sid/stype를 DOM에 설정)
    this.reconciler.reconcile(container, vnode, model, runtime, options?.onComplete);
      }

  /**
   * Render content area with optional selection preservation.
   * This method injects the selection context and the pool only when the renderer was
   * constructed with enableSelectionPreservation=true.
   *
   * @param container Root container
   * @param model Content model
   * @param decorators Decorators for content
   * @param runtime Runtime context
   * @param selection Selection context { textNode, restoreSelection }
   */
  renderContent(
    container: HTMLElement,
    model: ModelData,
    decorators: Decorator[] = [],
    runtime?: Record<string, any>,
    selection?: { 
      textNode?: Text; 
      restoreSelection?: (textNode: Text, offset: number) => void;
      model?: { sid: string; modelOffset: number };
    }
  ): void {
    if (!model || !model.stype) {
      throw new Error('[DOMRenderer] renderContent: model must have stype property');
    }
    this.rootElement = container;
    this.lastModel = model;
    this.lastDecorators = decorators;
    this.lastRuntime = runtime || null;

    const vnode = this.builder.build(model.stype, model, { 
      decorators,
      selectionContext: selection?.model
    } as unknown as VNodeBuildOptions);
    this.reconciler.reconcile(container, vnode, model, runtime);
  }


  // (구) updateBySid 제거: Reconciler에 위임

  // Update decorators for a specific sid
  updateDecoratorsBySid(sid: string, decorators: Decorator[]): boolean {
    try {
      let instance = this.componentManager.getComponentInstance(sid as any);
      let hostEl: HTMLElement | null = instance?.element || null;
      if (!hostEl) {
        const doc = (this.rootElement?.ownerDocument || document);
        hostEl = doc.querySelector(`[${DOMAttribute.BC_SID}="${sid}"]`) as HTMLElement | null;
      }
      if (!hostEl) return false;
      // Decorator 변경은 VNodeBuilder에서 처리되므로 인스턴스에 저장하지 않음
      return true;
    } catch (e) {
      try { logger.error(LogCategory.RECONCILE, 'updateDecoratorsBySid failed', e); } catch {}
      // Fallback: host exists, treat as success to not break siblings
      return true;
    }
  }

  // Unmount a specific sid host and its component
  unmountBySid(sid: string): boolean {
    try {
      const instance = this.componentManager.getComponentInstance(sid as any);
      if (!instance || !instance.element) return false;
      if (instance.element.parentNode) {
        try { instance.element.parentNode.removeChild(instance.element); } catch {}
      }
      return true;
    } catch {
      return false;
    }
  }

  // Move a component host by sid under a new parent host (DOM-level move with minimal reconcile)
  moveBySid(sid: string, newParentSid: string, targetIndex: number = -1): boolean {
    try {
      const doc = (this.rootElement?.ownerDocument || document);
      const node = doc.querySelector(`[${DOMAttribute.BC_SID}="${sid}"]`) as HTMLElement | null;
      const newParent = doc.querySelector(`[${DOMAttribute.BC_SID}="${newParentSid}"]`) as HTMLElement | null;
      if (!node || !newParent) return false;

      // If node is already the correct child, optionally reorder
      const children = Array.from(newParent.children) as HTMLElement[];
      const ref = (targetIndex >= 0 && targetIndex < children.length) ? children[targetIndex] : null;

      // Avoid cycles
      if (node.contains(newParent)) return false;

      if (ref) {
        if (node !== ref) {
          if (node.parentElement !== newParent) {
            newParent.insertBefore(node, ref);
          } else if (node.nextElementSibling !== ref) {
            newParent.insertBefore(node, ref);
          }
        }
      } else {
        if (node.parentElement !== newParent) {
          newParent.appendChild(node);
        } else {
          newParent.appendChild(node); // move to end
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Render children models directly into container (no root element)
   * Used for layer rendering (decorator, selection, context, custom)
   * 
   * @param container - Parent container element
   * @param models - Array of ModelData to render as children
   * @param runtime - Runtime context (optional)
   */
  renderChildren(
    container: HTMLElement,
    models: ModelData[],
    runtime?: Record<string, any>,
    selection?: { textNode?: Text; restoreSelection?: (textNode: Text, offset: number) => void }
  ): void {
    if (!Array.isArray(models)) {
      throw new Error('[DOMRenderer] renderChildren: models must be an array');
    }
    
    // Store for later use
    this.rootElement = container;
    this.lastRuntime = runtime || null;
    
    // Build VNodes from models before passing to reconcileChildren
    // VNodeBuilder가 전체 트리를 한 번에 빌드해야 하므로, 여기서 먼저 빌드
    const vnodes: VNode[] = [];
    for (const model of models) {
      if (!model || !model.stype) continue;
      if (!model.sid) continue;
      try {
        const vnode = this.builder.build(model.stype, model, {});
        vnodes.push(vnode);
      } catch (error) {
        logger.error(LogCategory.RECONCILE, `Failed to build VNode for stype='${model.stype}', sid='${model.sid}'`, error);
        throw error;
      }
    }
    // Use Reconciler's reconcileChildren to render already-built VNodes
    this.reconciler.reconcileChildren(container, vnodes, undefined, runtime);
  }

  /**
   * Get ComponentManager (for DOM Query optimization)
   */
  getComponentManager(): ComponentManager {
    return this.componentManager;
  }
  
  
  // Get current VNode
  getCurrentVNode(): VNode | null {
    return this.currentVNode;
  }

  // Expose snapshot for testing/diagnostics
  getVNodeSnapshotBySid(sid: string): VNode | undefined {
    return this.sidToVNodeSnapshot.get(sid);
  }

  private rebuildSidSnapshot(vnode: VNode | null): void {
    this.sidToVNodeSnapshot.clear();
    if (!vnode) return;
    const stack: (VNode | string | number)[] = [vnode];
    while (stack.length) {
      const node = stack.pop() as any;
      if (node && typeof node === 'object' && 'tag' in node) {
        const sid = node.attrs?.[DOMAttribute.BC_SID];
        if (sid) this.sidToVNodeSnapshot.set(String(sid), node as VNode);
        const children = (node.children || []) as (VNode | string | number)[];
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i] as any);
      }
    }
  }

  // (Selection-related Text Run helpers were removed; use renderer-dom utils directly where needed.)
    
  // Clear caches
  clearCache(): void {
    this.cache.clear();
   }
  
  // Dispose renderer
  destroy(): void {
    this.currentVNode = null;
    this.rootElement = null;
    this.clearCache();
  }

  // Deprecated helpers for full re-render were removed

  // Internal component instance registry removed; handled by ComponentManager

}
