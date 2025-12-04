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
    
    // 중복 마운트 방지: 이미 마운트된 인스턴스가 있으면 기존 element 반환
    const existingInstanceRef = this.componentInstances.get(componentId);
    if (existingInstanceRef) {
      const existingInstance = existingInstanceRef;
      if (existingInstance && existingInstance.element) {
        // 이미 마운트된 인스턴스가 있으면 기존 element 반환 (재귀 호출 방지)
        // mounted 플래그는 나중에 설정되므로, element만 확인
        if (existingInstance.mounted) {
          return existingInstance.element;
        }
        // 마운트 중인 경우도 재귀 호출 방지
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
        // ExternalComponent에서 template 함수 추출
        if (component && component.template && typeof component.template === 'function') {
          component = component.template;
        }
      }
    }

    if (!component) {
      logger.warn(LogCategory.COMPONENT, `Component '${componentName}' not found in registry`);
      return null;
    }

    // Props 분리 (최상위 필드에서 가져옴)
    const rawProps = vnode.props || {};
    const sanitizedProps = this.sanitizeProps(rawProps);

    // 기존 인스턴스 재사용 또는 새로 생성
    // IMPORTANT: BaseComponentState는 sid 기반으로 관리되며, 기존 인스턴스 재사용 시 보존됨
    let instance: ComponentInstance;
    const existingInstanceRef2 = this.componentInstances.get(componentId);
    if (existingInstanceRef2) {
      const existingInstance2 = existingInstanceRef2;
      if (existingInstance2 && existingInstance2.element) {
        // 기존 인스턴스 재사용 (props 업데이트, BaseComponentState 보존)
        existingInstance2.props = sanitizedProps;
        // Update getModel to use current context
        existingInstance2.getModel = () => this.getModelFromDataStore(vnode.sid, context);
        // __stateInstance는 기존 것을 그대로 유지 (sid 기반으로 동일한 인스턴스)
        instance = existingInstance2;
      } else {
        
        // 기존 인스턴스가 없거나 element가 없으면 새로 생성
        instance = {
          id: componentId,
          component: component,
          props: sanitizedProps,
          state: {},
          element: undefined as any,
          mounted: false,
          getModel: () => this.getModelFromDataStore(vnode.sid, context)
        };
        // 상태 인스턴스 주입 (stype 기준으로 StateClass 찾아서 생성)
        // sid 기반으로 관리되므로, 동일 sid면 기존 인스턴스를 재사용해야 함
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
      // 새 인스턴스 생성 (sid 기반으로 관리)
      instance = {
        id: componentId,  // componentId = sid (generateComponentId가 sid를 우선 사용)
        component: component,
        props: sanitizedProps,      // 순수 props
        state: {},
        element: undefined as any,
        mounted: false,
        getModel: () => this.getModelFromDataStore(vnode.sid, context)
      };
      // 상태 인스턴스 주입 (stype 기준으로 StateClass 찾아서 생성)
      // BaseComponentState는 sid 기반으로 관리되며, ComponentManager가 관리
      // BaseComponentState 생성 시 componentManager와 sid를 전달하여 자동 emit 활성화
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
    
    // 인스턴스를 즉시 저장하여 재귀 호출 방지 (element 설정 전)
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
      
      // mountComponent는 순수 hook으로만 작동합니다
      // VNodeBuilder.build()에서 이미 전체 VNode 트리를 빌드했고,
      // Reconciler가 mountComponent 호출 후 children을 reconcile하므로,
      // 여기서는 component 함수 호출, 빌드, reconcile을 수행하지 않습니다
        
        // Use provided host container as the component root (no nested host)
        if (!instance.element) {
          instance.element = container;
      }
      
      // vnode 저장 (updateComponent에서 사용)
                    instance.vnode = vnode;
      
      // 라이프사이클 훅: BaseComponentState.mount 호출
              try {
                const stateInstHook: any = (instance as any).__stateInstance;
                if (!((instance as any).__mountHookCalled) && stateInstHook && typeof stateInstHook.mount === 'function') {
                  stateInstHook.mount(vnode, instance.element, context);
                  (instance as any).__mountHookCalled = true;
                }
              } catch {}
      
              // 마운트 완료 표시
              instance.mounted = true;
      (instance as any).lastRenderedState = { ...(instance.state || {}) };
      
      // External component 처리
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
      // mounted 보정: 호스트 엘리먼트가 존재하면 mounted=true로 일관화
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
      
      // IMPORTANT: 자동 생성 sid의 경우, stype과 index를 사용하여 instance 찾기
      // 같은 stype과 index를 가진 컴포넌트는 같은 instance를 공유
      // nextVNode에 이미 sid가 설정되어 있으면 그대로 사용
      let componentId = this.generateComponentId(nextVNode);
      let instanceRef = this.componentInstances.get(componentId);
      
      if (instanceRef) {
        const instance = instanceRef;
        if (instance && instance.mounted && instance.element) {
          // Debug: updateComponent가 정상적으로 업데이트하는 경우
          logger.debug(LogCategory.COMPONENT, 'updateComponent 정상 업데이트', {
            componentId,
            stype: nextVNode.stype,
            sid: nextVNode.sid,
            mounted: instance.mounted,
            hasElement: !!instance.element
          });
          try {
            // Props 분리 (최상위 필드에서 가져옴)
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
          // Debug: instance가 있지만 mounted가 false이거나 element가 없는 경우
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

