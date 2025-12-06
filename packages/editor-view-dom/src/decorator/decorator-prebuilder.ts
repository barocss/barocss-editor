/**
 * DecoratorPrebuilder
 * 
 * Convert all decorators (target, pattern, custom) to DecoratorModel
 * Executed after Content rendering completes (DOM position calculation possible)
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
  stype: string; // Type defined with defineDecorator
  category: 'layer' | 'inline' | 'block';
  layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
  position?: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  data?: Record<string, any>;
  // Properties for position style (used in templates)
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
   * Convert all decorators to DecoratorModel
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
   * Convert single decorator to DecoratorModel
   */
  private buildDecorator(
    decorator: Decorator,
    modelData: ModelData
  ): DecoratorModel[] {
    // 1. Handle custom decorator
    if (decorator.decoratorType === 'custom' && decorator.generate) {
      // Custom decorator generates other decorators through generate function
      // This function is managed in DecoratorGeneratorManager
      // Here only process already generated decorators
      // generate call is already performed in DecoratorGeneratorManager
    }
    
    // 2. Handle target decorator
    return [this.buildTargetDecorator(decorator, modelData)];
  }
  
  /**
   * Convert target decorator to DecoratorModel
   */
  private buildTargetDecorator(
    decorator: Decorator,
    modelData: ModelData
  ): DecoratorModel {
    // Calculate position (for layer decorator)
    let position: DecoratorModel['position'];
    const layerTarget = decorator.layerTarget || this.getDefaultLayerTarget(decorator);
    
    if (decorator.category === 'layer' || layerTarget !== 'content') {
      // If data.position is directly specified, use it first
      if (decorator.data?.position) {
        position = decorator.data.position as DecoratorModel['position'];
      } else {
        // Try target-based position calculation
        const calculatedPosition = this.positionCalculator.calculatePosition(decorator);
        if (calculatedPosition) {
          position = calculatedPosition;
        }
      }
    }
    
    // Create DecoratorModel
    // Template rendering is handled by DOMRenderer, so only include basic information
    const decoratorModel: DecoratorModel = {
      sid: decorator.sid,
      stype: decorator.stype, // Type defined with defineDecorator
      category: decorator.category,
      layerTarget,
      data: decorator.data ? { ...decorator.data } : {} // Decorator data (used in template)
    };
    
    // If position exists, add to data and also store as separate field
    if (position) {
      decoratorModel.position = position;
      // Also include position in data (so it can be used in template)
      decoratorModel.data = decoratorModel.data || {};
      decoratorModel.data.position = position;
      
      // Add position style to style attribute (for layer decorator)
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

