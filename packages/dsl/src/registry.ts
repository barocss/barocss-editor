import { RendererDefinition, TNodeType, ExternalComponent, ContextualComponent, RenderTemplate } from './types';
import { getGlobalRegistry } from './template-builders';

/** RendererRegistry options */
export interface RendererRegistryOptions {
  /** Whether to link with the global registry (default: true) */
  global?: boolean;
}

export class RendererRegistry {
  private _renderers = new Map<TNodeType, RendererDefinition>();
  private _components = new Map<string, ExternalComponent>();
  private _options: RendererRegistryOptions;
  
  constructor(options: RendererRegistryOptions = {}) {
    this._options = {
      global: true,
      ...options
    };
  }
  
  // Register a renderer
  register(renderer: RendererDefinition): void {
    // If template is an ExternalComponent, register as component only
    if (renderer.template && typeof renderer.template === 'object' && 'managesDOM' in renderer.template) {
      this.registerComponent(renderer.nodeType, renderer.template as ExternalComponent);
      return; // do not store in _renderers
    }
    
    // If template is a ContextComponent, register via registerContextComponent
    if (renderer.template && typeof renderer.template === 'object' && 'type' in renderer.template && renderer.template.type === 'component') {
      const componentTemplate = renderer.template as any;
      if (componentTemplate.component && typeof componentTemplate.component === 'function') {
        this.registerContextComponent(renderer.nodeType, componentTemplate.component);
        // Also store in _renderers so build() can find it
        this._renderers.set(renderer.nodeType, renderer);
        return;
      }
    }
    
    // Only ElementTemplate is stored in _renderers (legacy - not used anymore)
    this._renderers.set(renderer.nodeType, renderer);
  }
  
  // get() is removed - use getComponent() instead
  // Everything defined with define() is component-only, so only use getComponent()
  
  // Get all renderers (deprecated - use getComponent instead)
  getAll(): RendererDefinition[] {
    return Array.from(this._renderers.values());
  }
  
  // Remove a renderer (deprecated - use removeComponent instead)
  remove(nodeType: TNodeType): boolean {
    return this._renderers.delete(nodeType);
  }
  
  // Check renderer existence (deprecated - use hasComponent instead)
  has(nodeType: TNodeType): boolean {
    // 1) local check
    if (this._renderers.has(nodeType)) {
      return true;
    }
    
    // 2) then global if allowed
    if (this._options.global) {
      // Avoid recursion when already global
      return false;
    } else {
      // When not global, check the global registry
      const globalRegistry = getGlobalRegistry();
      return globalRegistry.has(nodeType);
    }
  }

  // Clear all renderers (deprecated)
  clear(): void {
    this._renderers.clear();
  }

  // Register an external component
  registerComponent(name: string, component: ExternalComponent): void {
    this._components.set(name, component);
  }

  // Get an external component
  getComponent(name: string): ExternalComponent | undefined {
    const local = this._components.get(name);
    if (local) return local;
    
    if (this._options.global === false) {
      const globalRegistry = getGlobalRegistry();
      return globalRegistry.getComponent(name);
    }
    return undefined;
  }

  // Remove an external component
  removeComponent(name: string): boolean {
    return this._components.delete(name);
  }

  // Check existence of an external component (local → global fallback)
  hasComponent(name: string): boolean {
    if (this._components.has(name)) return true;
    if (this._options.global === false) {
      const globalRegistry = getGlobalRegistry();
      return globalRegistry.hasComponent(name);
    }
    return false;
  }

  // Clear all external components
  clearComponents(): void {
    this._components.clear();
  }

  getMarkRenderer(type: string): RenderTemplate | undefined {
    // Getting directly from _renderers can return ComponentTemplate
    const renderer = this._renderers.get(`mark:${type}`);
    if (renderer && renderer.template) {
      return renderer.template as RenderTemplate;
    }
    // Fallback: get from getComponent() (legacy support)
    const component = this.getComponent(`mark:${type}`);
    if (component && component.template) {
      // If component.template is ContextualComponent function, return execution result
      // Or return template property of ExternalComponent
      return component.template as any;
    }
    return undefined;
  }

  // Register contextual component
  // Note: Component lifecycle is implemented by renderer-dom's ComponentManager
  registerContextComponent(
    name: string, 
    component: ContextualComponent
  ): void {
    const wrappedComponent: ExternalComponent = {
      template: component,
      managesDOM: false,
      // Stub implementations - actual logic is in renderer-dom's ComponentManager
      mount: (_props: any, container: HTMLElement) => container,
      update: () => {},
      unmount: () => {}
    };
    
    this._components.set(name, wrappedComponent);
  }
}
