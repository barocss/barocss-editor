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
    
    // 기본 Decorator 렌더러들 등록
    this.registerBuiltinRenderers();
    
    // Decorator 이벤트 리스닝
    this.manager.on('decorator:added', this.handleDecoratorAdded.bind(this));
    this.manager.on('decorator:updated', this.handleDecoratorUpdated.bind(this));
    this.manager.on('decorator:removed', this.handleDecoratorRemoved.bind(this));
  }
  
  /**
   * 기본 Decorator 렌더러들 등록 (글로벌에 없는 경우만)
   */
  private registerBuiltinRenderers(): void {
    // Layer Decorator 렌더러들
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
    
    // Inline Decorator 렌더러들
    if (!this.rendererRegistry.has('inline-widget')) {
      this.rendererRegistry.register(renderer('inline-widget', this.createInlineDecoratorTemplate()));
    }
    
    if (!this.rendererRegistry.has('inline-highlight')) {
      this.rendererRegistry.register(renderer('inline-highlight', this.createInlineDecoratorTemplate()));
    }
    
    // Block Decorator 렌더러들
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
   * Decorator 렌더링 (render/update 함수처럼 깔끔하게)
   */
  renderDecorator(decorator: Decorator): void {
    console.log('[DecoratorRenderer] renderDecorator:start', { decoratorId: decorator.sid, type: decorator.stype });
    
    // 가시성 상태 계산
    const visibilityState = this.visibilityManager.calculateVisibility(decorator);
    
    // 기존 렌더링 제거
    this.removeDecoratorRendering(decorator.sid);
    
    // 가시성이 false면 렌더링하지 않음
    if (!visibilityState.visible) {
      console.log(`[DecoratorRenderer] Decorator ${decorator.sid} is hidden: ${visibilityState.reason}`);
      
      // 숨김 상태로 정보 저장
      this.renderedDecorators.set(decorator.sid, {
        decorator,
        element: null as any, // DOM 요소는 없음
        rendered: false,
        visible: false,
        visibilityState
      });
      
      return;
    }
    
    // 타겟 컨테이너 결정
    const container = this.getTargetContainer(decorator);
    if (!container) {
      console.warn(`Target container not found for decorator ${decorator.sid}`);
      return;
    }
    
    // 렌더러 이름 결정
    const rendererName = decorator.renderer || this.getDefaultRendererName(decorator);
    
    // 렌더러 존재 확인
    if (!this.rendererRegistry.has(rendererName)) {
      console.warn(`Renderer not found: ${rendererName}`);
      return;
    }
    
    try {
      // 데이터 변환
      const decoratorData = this.convertDecoratorData(decorator);
      
      // DOM 렌더링 (renderer-dom 사용)
      this.domRenderer.render(rendererName, container, decoratorData);
      
      // 렌더링된 요소 찾기
      const renderedElement = container.querySelector(`[data-bc-decorator-sid="${decorator.sid}"]`) as HTMLElement;
      
      if (renderedElement) {
        // 렌더링 정보 저장
        this.renderedDecorators.set(decorator.sid, {
          decorator,
          element: renderedElement,
          rendered: true,
          visible: true,
          visibilityState
        });
        
        // 렌더링 완료 이벤트 발생
        this.manager.emit('decorator:rendered', decorator.sid, renderedElement);
      }
      
      console.log('[DecoratorRenderer] renderDecorator:done', { decoratorId: decorator.sid });
    } catch (error) {
      console.warn(`Failed to render decorator ${decorator.sid}:`, error);
    }
  }
  
  /**
   * Decorator 데이터 변환
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

    // Layer Decorator의 경우 위치 정보 추가
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
   * Decorator 업데이트 (render/update 함수처럼 깔끔하게)
   */
  updateDecorator(decorator: Decorator): void {
    console.log('[DecoratorRenderer] updateDecorator:start', { decoratorId: decorator.sid });
    
    // 기존 렌더링 제거
    this.removeDecoratorRendering(decorator.sid);
    
    // 새로 렌더링
    this.renderDecorator(decorator);
    
    console.log('[DecoratorRenderer] updateDecorator:done', { decoratorId: decorator.sid });
  }

  /**
   * 기본 렌더러 이름 결정
   */
  private getDefaultRendererName(decorator: Decorator): string {
    // 타입별 기본 렌더러 매핑
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
   * Inline Decorator 타겟 컨테이너
   */
  private getInlineTargetContainer(decorator: InlineDecorator): HTMLElement | null {
    const targetElement = this.findTargetElement(decorator.target.nodeId);
    if (!targetElement) return null;
    
    // 텍스트 노드 내의 특정 위치에 삽입
    // 실제 구현에서는 더 정교한 위치 계산이 필요
    return targetElement;
  }
  
  /**
   * Block Decorator 타겟 컨테이너
   */
  private getBlockTargetContainer(decorator: BlockDecorator): HTMLElement | null {
    const targetElement = this.findTargetElement(decorator.target.nodeId);
    if (!targetElement) return null;
    
    // position에 따라 삽입 위치 결정
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
   * 렌더링 제거
   */
  private removeDecoratorRendering(decoratorId: string): void {
    const renderInfo = this.renderedDecorators.get(decoratorId);
    if (renderInfo && renderInfo.element && renderInfo.element.parentNode) {
      renderInfo.element.parentNode.removeChild(renderInfo.element);
    }
    this.renderedDecorators.delete(decoratorId);
  }
  
  /**
   * 타겟 요소 찾기
   */
  private findTargetElement(nodeId: string): HTMLElement | null {
    // data-bc-sid 속성으로 요소 찾기
    const contentContainer = this.layerContainers.get('content');
    if (!contentContainer) return null;
    
    return contentContainer.querySelector(`[data-bc-sid="${nodeId}"]`) as HTMLElement;
  }
  
  /**
   * 모든 렌더링 정리
   */
  clear(): void {
    this.renderedDecorators.forEach((_, decoratorId) => {
      this.removeDecoratorRendering(decoratorId);
    });
    this.renderedDecorators.clear();
  }
  
  /**
   * 커스텀 렌더러 등록 (renderer-dom 레지스트리에 등록)
   */
  registerRenderer(rendererDef: any): void {
    this.rendererRegistry.register(rendererDef);
  }
  
  /**
   * 렌더러 레지스트리 접근
   */
  getRendererRegistry(): RendererRegistry {
    return this.rendererRegistry;
  }
  
  /**
   * 렌더링된 Decorator 정보 조회
   */
  getRenderedDecorator(decoratorId: string): DecoratorRenderInfo | undefined {
    return this.renderedDecorators.get(decoratorId);
  }
  
  /**
   * 모든 렌더링된 Decorator 조회
   */
  getAllRenderedDecorators(): Map<string, DecoratorRenderInfo> {
    return new Map(this.renderedDecorators);
  }
  
  // ===== 가시성 관리 API =====
  
  /**
   * 가시성 매니저 접근
   */
  getVisibilityManager(): DecoratorVisibilityManager {
    return this.visibilityManager;
  }
  
  /**
   * 특정 타입의 데코레이터 표시/숨김
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