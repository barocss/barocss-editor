/**
 * Custom Decorator Generator 인터페이스
 * 
 * renderer-dom 패키지에서 사용하는 간단한 인터페이스
 * editor-view-dom에서 이 인터페이스를 구현하여 사용할 수 있습니다.
 */

import type { Decorator } from '../types';
import type { ModelData } from '@barocss/editor-core';

/**
 * Custom Decorator Generator 인터페이스
 * 
 * 텍스트 노드나 모델 전체를 분석하여 decorator를 동적으로 생성합니다.
 */
export interface CustomDecoratorGenerator {
  /**
   * Decorator 생성 함수
   * 
   * @param model - 현재 노드의 모델 데이터
   * @param text - 텍스트 내용 (model.text가 있는 경우)
   * @returns 생성된 decorator 배열
   */
  generate(
    model: ModelData,
    text: string | null
  ): Decorator[];
  
  /** 활성화 여부 */
  enabled?: boolean;
}

/**
 * Custom Decorator Generator 관리자
 * 
 * 여러 generator를 관리하고 순차적으로 실행합니다.
 */
export class CustomDecoratorGeneratorManager {
  private generators: CustomDecoratorGenerator[] = [];
  
  /**
   * Generator 추가
   */
  addGenerator(generator: CustomDecoratorGenerator): void {
    this.generators.push(generator);
  }
  
  /**
   * Generator 제거
   */
  removeGenerator(generator: CustomDecoratorGenerator): void {
    const index = this.generators.indexOf(generator);
    if (index > -1) {
      this.generators.splice(index, 1);
    }
  }
  
  /**
   * 모든 Generator 제거
   */
  clear(): void {
    this.generators = [];
  }
  
  /**
   * 모델에 대한 모든 decorator 생성
   * 
   * @param model - 모델 데이터
   * @param text - 텍스트 내용 (model.text가 있는 경우)
   * @returns 생성된 decorator 배열
   */
  generateDecorators(
    model: ModelData,
    text: string | null
  ): Decorator[] {
    const enabledGenerators = this.generators.filter(g => g.enabled !== false);
    
    const allDecorators: Decorator[] = [];
    
    for (const generator of enabledGenerators) {
      try {
        const result = generator.generate(model, text);
        allDecorators.push(...result);
      } catch (error) {
        console.error('[CustomDecoratorGeneratorManager] Error in generator:', error);
      }
    }
    
    return allDecorators;
  }
}

