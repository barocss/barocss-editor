/**
 * Component Manager: Component lifecycle and management utilities
 * - Component mounting and unmounting
 * - Component updates and reconciliation
 * - Component instance management
 * - Component processing and scheduling
 */
import { VNode, DOMAttribute } from './vnode/types';
import { isExternalComponent, isContextualComponent } from './vnode/utils/vnode-guards';
import { ComponentStateProvider } from './vnode/factory';
import { ReconcileContext, ComponentInstance, ComponentProps } from './types';
import { StateRegistry } from './state/state-registry';
import { BaseComponentState } from './state/base-component-state';
import { logger, LogCategory } from './utils/logger';
export class ComponentManager implements ComponentStateProvider {
  private componentInstances: Map<string, ComponentInstance> = new Map();
  private context?: ReconcileContext;
  
  // Event system for component state changes
  private eventListeners: Map<string, Array<(sid: string, data: any) => void>> = new Map();
  
  // Reconcile in progress flag (prevents setState during updateComponent)
  private isReconciling: boolean = false;

  constructor() {}
  
  /**
   * Get model data from dataStore by sid
   */
  private getModelFromDataStore(sid: string | undefined, context?: ReconcileContext): ModelData | undefined {
    if (sid && context?.dataStore) {
      return context.dataStore.getNode(sid) as ModelData | undefined;
    }
    return undefined;
  }
  
  /**
   * Check if reconciliation is in progress
   * This flag prevents setState calls during updateComponent to avoid infinite loops
   */
  getReconciling(): boolean {
    return this.isReconciling;
  }
  
  /**
   * Set reconciliation flag
   * Should be called before updateComponent and cleared after
   */
  setReconciling(value: boolean): void {
    this.isReconciling = value;
  }
  
  /**
   * Register event listener
   * @param event - Event name (e.g., 'changeState')
   * @param handler - Event handler function
   */
  on(event: string, handler: (sid: string, data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(handler);
  }
  
  /**
   * Remove event listener
   * @param event - Event name
   * @param handler - Event handler function to remove
   */
  off(event: string, handler?: (sid: string, data: any) => void): void {
    if (!handler) {
      this.eventListeners.delete(event);
      return;
    }
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(handler);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }
  
  /**
   * Emit event
   * @param event - Event name
   * @param sid - Component sid
   * @param data - Event data
   */
  emit(event: string, sid: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(handler => {
        try {
          handler(sid, data);
        } catch (error) {
          logger.error(LogCategory.COMPONENT, `Error in event handler for ${event}`, error);
        }
      });
    }
  }
  

  /**
   * Props에서 모델 메타데이터 제거 (stype/sid/type)
   * 순수 전달 데이터만 반환
   */
  private sanitizeProps(props: any): ComponentProps {
    if (!props || typeof props !== 'object') return {};
    const { stype, sid, type, ...sanitized } = props;
    return sanitized;
  }

  /**
   * Model 데이터에서 decorator 정보 추출
   * 현재 노드에 적용된 decorator 목록 반환
   */
  // decorator filtering handled elsewhere

  /**
   * Mount a component
   */
  public mountComponent(vnode: VNode, container: HTMLElement, context: ReconcileContext): HTMLElement | null {
    // Store context for later use
    this.context = context;
    
    if (!vnode.stype) {
      return null;
    }

    const componentId = this.generateComponentId(vnode);
    const componentName = vnode.stype;
    
    // Prevent duplicate mount: if already mounted instance exists, return existing element
    const existingInstanceRef = this.componentInstances.get(componentId);
    if (existingInstanceRef) {
      const existingInstance = existingInstanceRef;
      if (existingInstance && existingInstance.element) {
        // If already mounted instance exists, return existing element (prevent recursive call)
        // mounted flag is set later, so only check element
        if (existingInstance.mounted) {
          return existingInstance.element;
        }
        // Also prevent recursive call if mounting
        return existingInstance.element;
      }
    }

    // Try to get component from context first, then from registry
    let component: any = null;
    
    if (context.getComponent) {
      component = context.getComponent(componentName);
    }
    
    if (!component && context.registry) {
      if (typeof context.registry.getComponent === 'function') {
        component = context.registry.getComponent(componentName);
        // Extract template function from ExternalComponent
        if (component && component.template && typeof component.template === 'function') {
          component = component.template;
        }
      }
    }

    if (!component) {
      logger.warn(LogCategory.COMPONENT, `Component '${componentName}' not found in registry`);
      return null;
    }

    // Separate props (get from top-level fields)
    const rawProps = vnode.props || {};
    const sanitizedProps = this.sanitizeProps(rawProps);

    // Reuse existing instance or create new one
    // IMPORTANT: BaseComponentState is managed by sid, and preserved when reusing existing instance
    let instance: ComponentInstance;
    const existingInstanceRef2 = this.componentInstances.get(componentId);
    if (existingInstanceRef2) {
      const existingInstance2 = existingInstanceRef2;
      if (existingInstance2 && existingInstance2.element) {
        // Reuse existing instance (update props, preserve BaseComponentState)
        existingInstance2.props = sanitizedProps;
        // Update getModel to use current context
        existingInstance2.getModel = () => this.getModelFromDataStore(vnode.sid, context);
        // __stateInstance is kept as is (same instance based on sid)
        instance = existingInstance2;
      } else {
        
        // Create new if existing instance doesn't exist or has no element
        instance = {
          id: componentId,
          component: component,
          props: sanitizedProps,
          state: {},
          element: undefined as any,
          mounted: false,
          getModel: () => this.getModelFromDataStore(vnode.sid, context)
        };
        // Inject state instance (find StateClass by stype and create)
        // Managed by sid, so reuse existing instance if same sid
        const stypeFromVNode: string | undefined = vnode.stype;
        const StateClass: any = stypeFromVNode ? StateRegistry.get(stypeFromVNode) : undefined;
        if (StateClass) {
        try {
          const stateObj = new StateClass(undefined, {
            componentManager: this,
            sid: componentId
          });
          if (typeof (stateObj as any).initState === 'function') {
            try {
              const initial = (stateObj as any).initState();
              if (initial && typeof initial === 'object') {
                (stateObj as any).init(initial);
              }
            } catch {}
          }
            if (stateObj && typeof stateObj.snapshot === 'function') {
              instance.state = stateObj.snapshot();
              (instance as any).__stateInstance = stateObj as BaseComponentState;
            }
          } catch {}
        }
      }
    } else {
      // Create new instance (managed by sid)
      instance = {
        id: componentId,  // componentId = sid (generateComponentId prioritizes sid)
        component: component,
        props: sanitizedProps,      // Pure props
        state: {},
        element: undefined as any,
        mounted: false,
        getModel: () => this.getModelFromDataStore(vnode.sid, context)
      };
      // Inject state instance (find StateClass by stype and create)
      // BaseComponentState is managed by sid, and managed by ComponentManager
      // Pass componentManager and sid when creating BaseComponentState to enable auto emit
      const stypeFromVNode: string | undefined = vnode.stype;
      const StateClass: any = stypeFromVNode ? StateRegistry.get(stypeFromVNode) : undefined;
      if (StateClass) {
        try {
          const stateObj = new StateClass(undefined, {
            componentManager: this,
            sid: componentId
          });
          if (typeof (stateObj as any).initState === 'function') {
            try {
              const initial = (stateObj as any).initState();
              if (initial && typeof initial === 'object') {
                (stateObj as any).init(initial);
              }
            } catch {}
          }
          if (stateObj) {
            (instance as any).__stateInstance = stateObj as any;
            if (typeof (stateObj as any).snapshot === 'function') {
              instance.state = (stateObj as any).snapshot();
            } else {
              // Fallback: shallow copy enumerable fields as state
              try { instance.state = { ...(stateObj as any) }; } catch { instance.state = {}; }
            }
          }
          if (stateObj) {
            (instance as any).__stateInstance = stateObj as any;
            if (typeof (stateObj as any).snapshot === 'function') {
              instance.state = (stateObj as any).snapshot();
            } else {
              try { instance.state = { ...(stateObj as any) }; } catch { instance.state = {}; }
            }
          }
        } catch {}
      }
    }
    
    // Save instance immediately to prevent recursive calls (before setting element)
    if (!this.componentInstances.has(componentId)) {
      // Ensure initState applied if available
      try {
        const si: any = (instance as any).__stateInstance;
        if (si && typeof si.initState === 'function') {
          const init = si.initState();
          if (init && typeof init === 'object') {
            si.init(init);
            instance.state = si.snapshot();
          }
        }
      } catch {}
      this.componentInstances.set(componentId, instance);
    }

    // Mount the component
    try {
      // Check component type using VNode guards
      const isExternal = isExternalComponent(vnode);
      const isContextual = isContextualComponent(vnode);
      
      // mountComponent works purely as a hook
      // VNodeBuilder.build() already built the entire VNode tree,
      // and Reconciler reconciles children after calling mountComponent,
      // so we don't call component function, build, or reconcile here
        
        // Use provided host container as the component root (no nested host)
        if (!instance.element) {
          instance.element = container;
        }
      
      // Save vnode (used in updateComponent)
                    instance.vnode = vnode;
      
      // Lifecycle hook: call BaseComponentState.mount
              try {
                const stateInstHook: any = (instance as any).__stateInstance;
                if (!((instance as any).__mountHookCalled) && stateInstHook && typeof stateInstHook.mount === 'function') {
                  stateInstHook.mount(vnode, instance.element, context);
                  (instance as any).__mountHookCalled = true;
                }
              } catch {}
      
              // Mark mount complete
              instance.mounted = true;
      (instance as any).lastRenderedState = { ...(instance.state || {}) };
      
      // Handle external component
      if (isExternal || typeof component.mount === 'function') {
        // External component with mount function
        // Try multiple mount signatures for compatibility
        
        // Check if this is a managesDOM component (mount(element, props) signature)
        // Check if managesDOM exists and is true
        const hasManagesDOM = component && typeof component === 'object' && 'managesDOM' in component && component.managesDOM === true;
        const isManagesDOMComponent = hasManagesDOM || component.tag !== undefined;
        
        if (isManagesDOMComponent) {
          // managesDOM pattern: mount(props, container) - component manages its own DOM
          try {
            // Call mount(props, container) to let component create and manage its own DOM
            const propsWithId = { ...instance.props, id: componentId };
            instance.element = component.mount(propsWithId, container);
            
            // Ensure element has component ID attribute
            // Skip data-component-* markers
            if (instance.element) {
              try {
                const stateInstHook: any = (instance as any).__stateInstance;
                if (!((instance as any).__mountHookCalled) && stateInstHook && typeof stateInstHook.mount === 'function') {
                  stateInstHook.mount(vnode, instance.element, context);
                  (instance as any).__mountHookCalled = true;
                }
              } catch {}
              instance.mounted = true;
              this.componentInstances.set(componentId, instance as any);
            }
          } catch (err) {
            logger.error(LogCategory.COMPONENT, 'Failed to mount managesDOM component', err);
            instance.element = null;
          }
        } else {
          // Standard external component: mount(props, container)
          try {
            // Try (props, container) signature first (most common)
            const propsWithId = { ...instance.props, id: componentId };
            instance.element = component.mount(propsWithId, container);
            
            // Ensure element has component ID attribute
            // Skip data-component-* markers
            if (instance.element) {
              try {
                const stateInstHook: any = (instance as any).__stateInstance;
                if (!((instance as any).__mountHookCalled) && stateInstHook && typeof stateInstHook.mount === 'function') {
                  stateInstHook.mount(vnode, instance.element, context);
                  (instance as any).__mountHookCalled = true;
                }
              } catch {}
              instance.mounted = true;
              this.componentInstances.set(componentId, instance as any);
            }
          } catch (err) {
            logger.error(LogCategory.COMPONENT, `Error mounting component '${componentName}'`, err);
            instance.element = null;
          }
        }
      }
    } catch (error) {
      logger.error(LogCategory.COMPONENT, `Error mounting component '${componentName}'`, error);
      return null;
    }

    instance.mounted = !!instance.element;
    if (instance.element) {
      // Ensure stored
      this.componentInstances.set(componentId, instance);
    }
    return instance.element!;
  }

  /**
   * Unmount a component
   */
  public unmountComponent(vnode: VNode, context: ReconcileContext): void {
    if (!vnode.stype) {
      return;
    }

    const componentId = this.generateComponentId(vnode);
    const instanceRef = this.componentInstances.get(componentId);
    
    if (instanceRef) {
      const instance = instanceRef;
      if (instance && instance.mounted) {
        try {
          // Call component's unmount if it exists
          if (instance.component && typeof instance.component.unmount === 'function') {
            instance.component.unmount(instance);
          }
          // State unmount hook
          try {
            const stateInstHook: any = (instance as any).__stateInstance;
            if (stateInstHook && typeof stateInstHook.unmount === 'function') {
              stateInstHook.unmount();
            }
          } catch {}
          
          // Remove element from DOM if it exists
          if (instance.element && instance.element.parentNode) {
            instance.element.parentNode.removeChild(instance.element);
          }
          
          instance.mounted = false;
        } catch (error) {
          logger.error(LogCategory.COMPONENT, `Error unmounting component '${vnode.stype}'`, error);
        }
      }
      this.componentInstances.delete(componentId);
    }
    else {
      // Fallback: try to find by component name when instance id mapping is not available
      const name = vnode.stype;
      const scope: ParentNode = document;
      const el = vnode.sid ? scope.querySelector(`[${DOMAttribute.BC_SID}="${this.generateComponentId(vnode)}"]`) : null;
      if (el && el.parentNode) {
        try { el.parentNode.removeChild(el); } catch {}
      }
    }
  }



  /**
   * Get component instance by ID (alias for getComponentInstance)
   */
  public getInstance(sid: string): ComponentInstance | undefined {
    return this.getComponentInstance(sid);
  }

  /**
   * Get component instance by ID
   */
  public getComponentInstance(componentId: string): ComponentInstance | undefined {
    // Note: Instance management is now handled internally by ComponentManager
    // No need to sync with registry as DSL no longer manages instances
    // Try to get from internal storage
    
    // Fallback to local instances
    const instanceRef = this.componentInstances.get(componentId);
    if (instanceRef) {
      // mounted correction: if host element exists, set mounted=true for consistency
      if (instanceRef.element && !instanceRef.mounted) {
        instanceRef.mounted = true;
      }
      return instanceRef;
    }
    return undefined;
  }

  /**
   * Clear all component instances
   */
  public clearComponentInstances(): void {
    this.componentInstances.clear();
  }

  /**
   * Check if component props have changed
   */
  private hasPropsChanged(prevProps: Record<string, any>, nextProps: Record<string, any>): boolean {
    const prevKeys = Object.keys(prevProps);
    const nextKeys = Object.keys(nextProps);
    
    if (prevKeys.length !== nextKeys.length) return true;
    
    for (const key of prevKeys) {
      if (prevProps[key] !== nextProps[key]) return true;
    }
    
    return false;
  }


  /**
   * Generate component ID from VNode
   * Used by VNodeBuilder to get component state during build
   * 
   * Priority: sid > attrs['data-bc-sid'] > stype + index (if available) > stype + props hash > random
   * 
   * IMPORTANT: sid is the primary identifier for component instances.
   * ComponentInstance.id should equal sid for proper lifecycle management.
   * 
   * For auto-generated sid: if index is provided, use stype-index format for consistent ID generation.
   * This ensures that components with the same stype at the same position share the same instance.
   */
  public generateComponentId(vnode: VNode, index?: number): string {
    // 1. Use sid directly from VNode (highest priority)
    if (vnode.sid) {
      return String(vnode.sid);
    }
    
    // 2. Fallback to data-bc-sid from attrs (if present, but should not be in VNode)
    if (vnode.attrs?.[DOMAttribute.BC_SID]) {
      return vnode.attrs[DOMAttribute.BC_SID];
    }
    
    // 3. Use stype + index for consistent ID generation when sid is not available and index is provided
    // This ensures that components with the same stype at the same position share the same instance
    if (vnode.stype && index !== undefined) {
      return `${vnode.stype}-${index}`;
    }
    
    // 4. Use stype + props hash for consistent ID generation when sid is not available (fallback)
    if (vnode.stype) {
      // Use props hash for consistent ID generation (if props available)
      const propsHash = vnode.props ? JSON.stringify(vnode.props) : '';
      const hash = propsHash ? Array.from(propsHash).reduce((acc, char) => {
        const hash = ((acc << 5) - acc) + char.charCodeAt(0);
        return hash & hash;
      }, 0).toString(36) : Math.random().toString(36).substr(2, 9);
      return `${vnode.stype}-${hash}`;
    }
    
    // 5. Fallback to random ID (should rarely happen)
    return `component-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get component state by component ID
   * Used by VNodeBuilder during build to access existing component state
   */
  public getComponentState(componentId: string): Record<string, any> {
    const instanceRef = this.componentInstances.get(componentId);
    if (instanceRef) {
      const instance = instanceRef;
      if (instance) {
        return instance.state || {};
      }
    }
    return {};
  }

  /**
   * Get component state by VNode
   * Convenience method for VNodeBuilder
   */
  public getComponentStateByVNode(vnode: VNode): Record<string, any> {
    const componentId = this.generateComponentId(vnode);
    return this.getComponentState(componentId);
  }

  /**
   * 컴포넌트 업데이트 (순수 lifecycle hook)
   * 
   * @param prevVNode - 이전 VNode (비교용)
   * @param nextVNode - 다음 VNode (이미 빌드된 VNode)
   * @param container - DOM 컨테이너
   * @param context - Reconcile 컨텍스트
   */
  public updateComponent(prevVNode: VNode, nextVNode: VNode, container: HTMLElement, context: ReconcileContext): void {
    if (!nextVNode.stype) {
      return;
    }

    // Set reconciling flag to prevent setState calls during updateComponent
    const wasReconciling = this.isReconciling;
    this.isReconciling = true;
    
    try {
      // Check if component name (stype) changed - if so, unmount and mount
      if (prevVNode.stype !== nextVNode.stype) {
        this.unmountComponent(prevVNode, context);
        this.mountComponent(nextVNode, container, context);
        return;
      }
      
      // IMPORTANT: For auto-generated sid, find instance using stype and index
      // Components with same stype and index share the same instance
      // If sid is already set in nextVNode, use it as-is
      let componentId = this.generateComponentId(nextVNode);
      let instanceRef = this.componentInstances.get(componentId);
      
      if (instanceRef) {
        const instance = instanceRef;
        if (instance && instance.mounted && instance.element) {
          // Debug: when updateComponent updates normally
          logger.debug(LogCategory.COMPONENT, 'updateComponent 정상 업데이트', {
            componentId,
            stype: nextVNode.stype,
            sid: nextVNode.sid,
            mounted: instance.mounted,
            hasElement: !!instance.element
          });
          try {
            // Extract props (from top-level fields)
            const nextRawProps = nextVNode.props || {};
            const nextSanitizedProps = this.sanitizeProps(nextRawProps);
            
            // Update component instance
            instance.props = nextSanitizedProps;
            // Update getModel to use current context
            instance.getModel = () => this.getModelFromDataStore(nextVNode.sid, context);
            instance.vnode = nextVNode;
              
            // Get component for external component update check
            const component = context.getComponent?.(nextVNode.stype!);
            
              // External component: call component.update if it exists
            if (component && typeof component.update === 'function') {
              if (this.hasPropsChanged(prevVNode.props || {}, nextVNode.props || {})) {
                component.update(
                  instance.element,
                  prevVNode.props || {},
                  nextVNode.props || {}
                );
              }
              }
            
            (instance as any).lastRenderedState = { ...(instance.state || {}) };
          } catch (error) {
            logger.error(LogCategory.COMPONENT, `Failed to update component ${nextVNode.stype}`, error);
            // Fallback: unmount and remount
              this.unmountComponent(prevVNode, context);
              this.mountComponent(nextVNode, container, context);
          }
        } else {
          // Instance not mounted, need to mount
          // Debug: instance exists but mounted is false or element is missing
          logger.warn(LogCategory.COMPONENT, 'instance가 있지만 mounted가 false이거나 element가 없음, mountComponent 호출', {
            componentId,
            stype: nextVNode.stype,
            sid: nextVNode.sid,
            instanceExists: !!instance,
            mounted: instance?.mounted,
            hasElement: !!instance?.element
          });
          this.mountComponent(nextVNode, container, context);
        }
      } else {
        // Instance not found, need to mount
          this.mountComponent(nextVNode, container, context);
      }
    } finally {
      // Restore reconciling flag
      this.isReconciling = wasReconciling;
    }
  }
}

