/**
 * DecoratorPrebuilder
 * 
 * 모든 decorator (target, pattern, custom)를 DecoratorModel로 변환
 * Content 렌더링 완료 후 실행 (DOM 위치 계산 가능)
 */
import { RendererRegistry, ModelData } from '@barocss/dsl';
import { DOMRenderer } from '@barocss/renderer-dom';
import type { Decorator } from './types';
import { DOMQuery } from './dom-query';
import { PositionCalculator, type DecoratorPosition } from './position-calculator';

/**
 * DecoratorModel: Decorator를 ModelData 형태로 변환한 구조
 */
export interface DecoratorModel extends ModelData {
  sid: string;
  stype: string; // defineDecorator로 정의된 타입
  category: 'layer' | 'inline' | 'block';
  layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
  position?: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  data?: Record<string, any>;
  // position 스타일을 위한 속성들 (템플릿에서 사용)
  style?: Record<string, string | number>;
}

export class DecoratorPrebuilder {
  private positionCalculator: PositionCalculator;
  private domQuery: DOMQuery;
  
  constructor(
    registry: RendererRegistry,
    contentLayer: HTMLElement,
    contentRenderer: DOMRenderer
  ) {
    this.domQuery = new DOMQuery(contentLayer, contentRenderer);
    this.positionCalculator = new PositionCalculator(this.domQuery);
  }
  
  /**
   * 모든 decorator를 DecoratorModel로 변환
   */
  buildAll(
    decorators: Decorator[],
    modelData: ModelData
  ): DecoratorModel[] {
    const decoratorModels: DecoratorModel[] = [];
    
    for (const decorator of decorators) {
      const models = this.buildDecorator(decorator, modelData);
      decoratorModels.push(...models);
    }
    
    return decoratorModels;
  }
  
  /**
   * 단일 decorator를 DecoratorModel로 변환
   */
  private buildDecorator(
    decorator: Decorator,
    modelData: ModelData
  ): DecoratorModel[] {
    // 1. Custom decorator 처리
    if (decorator.decoratorType === 'custom' && decorator.generate) {
      // Custom decorator는 generate 함수를 통해 다른 decorator들을 생성
      // 이 함수는 DecoratorGeneratorManager에서 관리됨
      // 여기서는 이미 생성된 decorator만 처리
      // generate 호출은 DecoratorGeneratorManager에서 이미 수행됨
    }
    
    // 2. Target decorator 처리
    return [this.buildTargetDecorator(decorator, modelData)];
  }
  
  /**
   * Target decorator를 DecoratorModel로 변환
   */
  private buildTargetDecorator(
    decorator: Decorator,
    modelData: ModelData
  ): DecoratorModel {
    // 위치 계산 (layer decorator인 경우)
    let position: DecoratorModel['position'];
    const layerTarget = decorator.layerTarget || this.getDefaultLayerTarget(decorator);
    
    if (decorator.category === 'layer' || layerTarget !== 'content') {
      // data.position이 직접 지정된 경우 우선 사용
      if (decorator.data?.position) {
        position = decorator.data.position as DecoratorModel['position'];
      } else {
        // target 기반 위치 계산 시도
        const calculatedPosition = this.positionCalculator.calculatePosition(decorator);
        if (calculatedPosition) {
          position = calculatedPosition;
        }
      }
    }
    
    // DecoratorModel 생성
    // 템플릿 렌더링은 DOMRenderer가 처리하므로 기본 정보만 포함
    const decoratorModel: DecoratorModel = {
      sid: decorator.sid,
      stype: decorator.stype, // defineDecorator로 정의된 타입
      category: decorator.category,
      layerTarget,
      data: decorator.data ? { ...decorator.data } : {} // decorator 데이터 (템플릿에서 사용)
    };
    
    // position이 있으면 data에 추가하고, 별도 필드로도 저장
    if (position) {
      decoratorModel.position = position;
      // data에도 position 포함 (템플릿에서 사용 가능하도록)
      decoratorModel.data = decoratorModel.data || {};
      decoratorModel.data.position = position;
      
      // style 속성에 position 스타일 추가 (layer decorator용)
      if (layerTarget !== 'content') {
        decoratorModel.style = {
          position: 'absolute',
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: `${position.width}px`,
          height: `${position.height}px`
        };
      }
    }
    
    return decoratorModel;
  }
  
  /**
   * category에 따른 기본 layerTarget 결정
   */
  private getDefaultLayerTarget(decorator: Decorator): 'content' | 'decorator' | 'selection' | 'context' | 'custom' {
    if (decorator.category === 'layer') {
      return 'decorator';
    }
    return 'content';
  }
}

