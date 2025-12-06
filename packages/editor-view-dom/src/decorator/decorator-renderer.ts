/**
 * DecoratorRenderer
 * 
 * Decorator의 실제 렌더링을 담당하는 시스템
 * renderer-dom의 DSL을 활용하여 일관된 렌더링 제공
 * Layer/Inline/Block별로 다른 렌더링 전략 사용
 */

import {
  Decorator,
  InlineDecorator,
  BlockDecorator
} from './types.js';
import { DecoratorRegistry } from './decorator-registry.js';
import { DecoratorManager } from './decorator-manager.js';
import { DecoratorVisibilityManager, VisibilityState } from './visibility-manager.js';
import { DOMRenderer } from '@barocss/renderer-dom';
import { RendererRegistry, renderer, element, data, when } from '@barocss/dsl';

/**
 * DOM 요소에 대한 Decorator 렌더링 정보
 */
interface DecoratorRenderInfo {
  decorator: Decorator;
  element: HTMLElement;
  rendered: boolean;
  visible: boolean;
  visibilityState?: VisibilityState;
}

/**
 * DecoratorRenderer 클래스
 * renderer-dom을 활용한 일관된 렌더링 시스템
 */
export class DecoratorRenderer {
  private manager: DecoratorManager;
  private rendererRegistry: RendererRegistry;
  private domRenderer: DOMRenderer;
  private visibilityManager: DecoratorVisibilityManager;
  private renderedDecorators = new Map<string, DecoratorRenderInfo>();
  private layerContainers = new Map<string, HTMLElement>();
  
  constructor(_registry: DecoratorRegistry, manager: DecoratorManager) {
    this.manager = manager;
    this.rendererRegistry = new RendererRegistry();
    this.domRenderer = new DOMRenderer(this.rendererRegistry);
    this.visibilityManager = new DecoratorVisibilityManager();
    
    // Register default Decorator renderers
    this.registerBuiltinRenderers();
    
    // Listen to Decorator events
    this.manager.on('decorator:added', this.handleDecoratorAdded.bind(this));
    this.manager.on('decorator:updated', this.handleDecoratorUpdated.bind(this));
    this.manager.on('decorator:removed', this.handleDecoratorRemoved.bind(this));
  }
  
  /**
   * Register default Decorator renderers (only if not in global)
   */
  private registerBuiltinRenderers(): void {
    // Layer Decorator renderers
    if (!this.rendererRegistry.has('highlight')) {
      this.rendererRegistry.register(renderer('highlight', this.createLayerDecoratorTemplate()));
    }
    
    if (!this.rendererRegistry.has('comment')) {
      this.rendererRegistry.register(renderer('comment', this.createLayerDecoratorTemplate()));
    }
    
    if (!this.rendererRegistry.has('error')) {
      this.rendererRegistry.register(renderer('error', this.createLayerDecoratorTemplate()));
    }
    
    if (!this.rendererRegistry.has('warning')) {
      this.rendererRegistry.register(renderer('warning', this.createLayerDecoratorTemplate()));
    }
    
    // Inline Decorator renderers
    if (!this.rendererRegistry.has('inline-widget')) {
      this.rendererRegistry.register(renderer('inline-widget', this.createInlineDecoratorTemplate()));
    }
    
    if (!this.rendererRegistry.has('inline-highlight')) {
      this.rendererRegistry.register(renderer('inline-highlight', this.createInlineDecoratorTemplate()));
    }
    
    // Block Decorator renderers
    if (!this.rendererRegistry.has('block-widget')) {
      this.rendererRegistry.register(renderer('block-widget', this.createBlockDecoratorTemplate()));
    }
    
    if (!this.rendererRegistry.has('block-quote')) {
      this.rendererRegistry.register(renderer('block-quote', this.createBlockDecoratorTemplate()));
    }
  }
  
  /**
   * Layer Decorator 템플릿 생성
   */
  private createLayerDecoratorTemplate() {
    return element('div', {
      className: 'barocss-decorator-layer',
      style: data('decoratorStyles'),
      'data-bc-decorator': 'layer',
      'data-bc-decorator-sid': data('decoratorId'),
      'data-bc-decorator-stype': data('decoratorType')
    }, [
      when(data('hasContent'), 
        element('div', {
          className: 'barocss-decorator-content'
        }, [
          data('content')
        ])
      )
    ]);
  }

  /**
   * Inline Decorator 템플릿 생성
   */
  private createInlineDecoratorTemplate() {
    return element('span', {
      className: 'barocss-decorator-inline',
      style: data('decoratorStyles'),
      'data-bc-decorator': 'inline',
      'data-bc-decorator-sid': data('decoratorId'),
      'data-bc-decorator-stype': data('decoratorType'),
      ...data('decoratorAttributes')
    }, [
      data('content')
    ]);
  }

  /**
   * Block Decorator 템플릿 생성
   */
  private createBlockDecoratorTemplate() {
    return element('div', {
      className: 'barocss-decorator-block',
      style: data('decoratorStyles'),
      'data-bc-decorator': 'block',
      'data-bc-decorator-sid': data('decoratorId'),
      'data-bc-decorator-stype': data('decoratorType'),
      ...data('decoratorAttributes')
    }, [
      data('content')
    ]);
  }

  /**
   * 계층 컨테이너 설정
   */
  setLayerContainers(layers: { decorator: HTMLElement; content: HTMLElement }): void {
    this.layerContainers.set('decorator', layers.decorator);
    this.layerContainers.set('content', layers.content);
  }
  
  /**
   * Decorator 추가 시 렌더링
   */
  private handleDecoratorAdded(decorator: Decorator): void {
    this.renderDecorator(decorator);
  }
  
  /**
   * Decorator 업데이트 시 재렌더링
   */
  private handleDecoratorUpdated(decorator: Decorator): void {
    this.updateDecorator(decorator);
  }
  
  /**
   * Decorator 제거 시 렌더링 제거
   */
  private handleDecoratorRemoved(decoratorId: string): void {
    this.removeDecoratorRendering(decoratorId);
    this.visibilityManager.removeDecorator(decoratorId);
  }
  
  /**
   * Render Decorator (clean like render/update functions)
   */
  renderDecorator(decorator: Decorator): void {
    console.log('[DecoratorRenderer] renderDecorator:start', { decoratorId: decorator.sid, type: decorator.stype });
    
    // Calculate visibility state
    const visibilityState = this.visibilityManager.calculateVisibility(decorator);
    
    // Remove existing rendering
    this.removeDecoratorRendering(decorator.sid);
    
    // Don't render if visibility is false
    if (!visibilityState.visible) {
      console.log(`[DecoratorRenderer] Decorator ${decorator.sid} is hidden: ${visibilityState.reason}`);
      
      // Store information as hidden state
      this.renderedDecorators.set(decorator.sid, {
        decorator,
        element: null as any, // No DOM element
        rendered: false,
        visible: false,
        visibilityState
      });
      
      return;
    }
    
    // Determine target container
    const container = this.getTargetContainer(decorator);
    if (!container) {
      console.warn(`Target container not found for decorator ${decorator.sid}`);
      return;
    }
    
    // Determine renderer name
    const rendererName = decorator.renderer || this.getDefaultRendererName(decorator);
    
    // Check if renderer exists
    if (!this.rendererRegistry.has(rendererName)) {
      console.warn(`Renderer not found: ${rendererName}`);
      return;
    }
    
    try {
      // Convert data
      const decoratorData = this.convertDecoratorData(decorator);
      
      // DOM rendering (using renderer-dom)
      this.domRenderer.render(rendererName, container, decoratorData);
      
      // Find rendered element
      const renderedElement = container.querySelector(`[data-bc-decorator-sid="${decorator.sid}"]`) as HTMLElement;
      
      if (renderedElement) {
        // Store rendering information
        this.renderedDecorators.set(decorator.sid, {
          decorator,
          element: renderedElement,
          rendered: true,
          visible: true,
          visibilityState
        });
        
        // Emit rendering complete event
        this.manager.emit('decorator:rendered', decorator.sid, renderedElement);
      }
      
      console.log('[DecoratorRenderer] renderDecorator:done', { decoratorId: decorator.sid });
    } catch (error) {
      console.warn(`Failed to render decorator ${decorator.sid}:`, error);
    }
  }
  
  /**
   * Convert Decorator data
   */
  private convertDecoratorData(decorator: Decorator): any {
    const baseData = {
      decoratorId: decorator.sid,
      decoratorType: decorator.stype,
      decoratorStyles: decorator.data.styles || {},
      decoratorAttributes: decorator.data.attributes || {},
      content: decorator.data.content || '',
      hasContent: !!(decorator.data.content && decorator.data.content.trim())
    };

    // Add position information for Layer Decorator
    if (decorator.category === 'layer' && decorator.data.position) {
      return {
        ...baseData,
        decoratorStyles: {
          ...baseData.decoratorStyles,
          position: 'absolute',
          top: `${decorator.data.position.top}px`,
          left: `${decorator.data.position.left}px`,
          width: `${decorator.data.position.width}px`,
          height: `${decorator.data.position.height}px`,
          pointerEvents: 'none'
        }
      };
    }

    return baseData;
  }

  /**
   * Update Decorator (clean like render/update functions)
   */
  updateDecorator(decorator: Decorator): void {
    console.log('[DecoratorRenderer] updateDecorator:start', { decoratorId: decorator.sid });
    
    // Remove existing rendering
    this.removeDecoratorRendering(decorator.sid);
    
    // Render again
    this.renderDecorator(decorator);
    
    console.log('[DecoratorRenderer] updateDecorator:done', { decoratorId: decorator.sid });
  }

  /**
   * Determine default renderer name
   */
  private getDefaultRendererName(decorator: Decorator): string {
    // Type-based default renderer mapping
    const defaultRenderers: Record<string, string> = {
      'highlight': 'highlight',
      'comment': 'comment',
      'error': 'error',
      'warning': 'warning',
      'inline-widget': 'inline-widget',
      'inline-highlight': 'inline-highlight',
      'block-widget': 'block-widget',
      'block-quote': 'block-quote'
    };
    
    return defaultRenderers[decorator.stype] || decorator.stype;
  }
  
  /**
   * 타겟 컨테이너 결정
   */
  private getTargetContainer(decorator: Decorator): HTMLElement | null {
    switch (decorator.category) {
      case 'layer':
        return this.layerContainers.get('decorator') || null;
      case 'inline':
        return this.getInlineTargetContainer(decorator as InlineDecorator);
      case 'block':
        return this.getBlockTargetContainer(decorator as BlockDecorator);
      default:
        return null;
    }
  }
  
  /**
   * Inline Decorator target container
   */
  private getInlineTargetContainer(decorator: InlineDecorator): HTMLElement | null {
    const targetElement = this.findTargetElement(decorator.target.nodeId);
    if (!targetElement) return null;
    
    // Insert at specific position within text node
    // Actual implementation requires more sophisticated position calculation
    return targetElement;
  }
  
  /**
   * Block Decorator target container
   */
  private getBlockTargetContainer(decorator: BlockDecorator): HTMLElement | null {
    const targetElement = this.findTargetElement(decorator.target.nodeId);
    if (!targetElement) return null;
    
    // Determine insert position based on position
    switch (decorator.target.position) {
      case 'before':
      case 'after':
        return targetElement.parentElement;
      case 'wrap':
        return targetElement;
      default:
        return targetElement.parentElement;
    }
  }
  
  /**
   * Remove rendering
   */
  private removeDecoratorRendering(decoratorId: string): void {
    const renderInfo = this.renderedDecorators.get(decoratorId);
    if (renderInfo && renderInfo.element && renderInfo.element.parentNode) {
      renderInfo.element.parentNode.removeChild(renderInfo.element);
    }
    this.renderedDecorators.delete(decoratorId);
  }
  
  /**
   * Find target element
   */
  private findTargetElement(nodeId: string): HTMLElement | null {
    // Find element by data-bc-sid attribute
    const contentContainer = this.layerContainers.get('content');
    if (!contentContainer) return null;
    
    return contentContainer.querySelector(`[data-bc-sid="${nodeId}"]`) as HTMLElement;
  }
  
  /**
   * Clear all rendering
   */
  clear(): void {
    this.renderedDecorators.forEach((_, decoratorId) => {
      this.removeDecoratorRendering(decoratorId);
    });
    this.renderedDecorators.clear();
  }
  
  /**
   * Register custom renderer (register in renderer-dom registry)
   */
  registerRenderer(rendererDef: any): void {
    this.rendererRegistry.register(rendererDef);
  }
  
  /**
   * Access renderer registry
   */
  getRendererRegistry(): RendererRegistry {
    return this.rendererRegistry;
  }
  
  /**
   * Get rendered Decorator information
   */
  getRenderedDecorator(decoratorId: string): DecoratorRenderInfo | undefined {
    return this.renderedDecorators.get(decoratorId);
  }
  
  /**
   * Get all rendered Decorators
   */
  getAllRenderedDecorators(): Map<string, DecoratorRenderInfo> {
    return new Map(this.renderedDecorators);
  }
  
  // ===== Visibility Management API =====
  
  /**
   * Access visibility manager
   */
  getVisibilityManager(): DecoratorVisibilityManager {
    return this.visibilityManager;
  }
  
  /**
   * Show/hide decorators of specific type
   */
  setTypeVisibility(type: string, visible: boolean): void {
    this.visibilityManager.setTypeVisibility(type, visible);
    this.refreshAllDecorators();
  }
  
  /**
   * 특정 작성자의 데코레이터 표시/숨김
   */
  setAuthorVisibility(author: string, visible: boolean): void {
    this.visibilityManager.setAuthorVisibility(author, visible);
    this.refreshAllDecorators();
  }
  
  /**
   * 특정 카테고리의 데코레이터 표시/숨김
   */
  setCategoryVisibility(category: string, visible: boolean): void {
    this.visibilityManager.setCategoryVisibility(category, visible);
    this.refreshAllDecorators();
  }
  
  /**
   * 전체 데코레이터 표시/숨김 토글
   */
  toggleAllDecorators(visible: boolean): void {
    this.visibilityManager.toggleAll(visible);
    this.refreshAllDecorators();
  }
  
  /**
   * 특정 ID의 데코레이터 표시/숨김
   */
  setDecoratorVisibility(decoratorId: string, visible: boolean): void {
    this.visibilityManager.setDecoratorVisibility(decoratorId, visible);
    this.refreshAllDecorators();
  }
  
  /**
   * 여러 ID의 데코레이터 일괄 표시/숨김
   */
  setMultipleDecoratorsVisibility(decoratorIds: string[], visible: boolean): void {
    this.visibilityManager.setMultipleDecoratorsVisibility(decoratorIds, visible);
    this.refreshAllDecorators();
  }
  
  /**
   * 특정 ID의 데코레이터 가시성 토글
   */
  toggleDecoratorVisibility(decoratorId: string): boolean {
    const result = this.visibilityManager.toggleDecoratorVisibility(decoratorId);
    this.refreshAllDecorators();
    return result;
  }
  
  /**
   * 특정 ID의 데코레이터가 현재 표시되는지 확인
   */
  isDecoratorVisible(decoratorId: string): boolean {
    return this.visibilityManager.isVisible(decoratorId);
  }
  
  /**
   * 가시성 설정 업데이트
   */
  updateVisibilitySettings(updates: any): void {
    this.visibilityManager.updateSettings(updates);
    this.refreshAllDecorators();
  }
  
  /**
   * 모든 데코레이터의 가시성 상태 새로고침
   */
  private refreshAllDecorators(): void {
    console.log('[DecoratorRenderer] Refreshing all decorators visibility...');
    
    for (const [decoratorId, renderInfo] of this.renderedDecorators) {
      if (renderInfo.decorator) {
        this.renderDecorator(renderInfo.decorator);
      }
    }
  }
  
  /**
   * 가시성 통계 조회
   */
  getVisibilityStats(): any {
    return this.visibilityManager.getVisibilityStats();
  }
  
  /**
   * 현재 가시성 설정 조회
   */
  getVisibilitySettings(): any {
    return this.visibilityManager.getSettings();
  }
}