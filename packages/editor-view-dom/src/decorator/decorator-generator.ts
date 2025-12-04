/**
 * Decorator Generator 인터페이스
 * 
 * 함수 기반 decorator 생성 시스템
 * 복잡한 로직이나 동적 decorator 생성에 사용됩니다.
 */

import type { Decorator } from './types.js';
import type { ModelData } from '@barocss/editor-core';

/**
 * Decorator Generator 인터페이스
 * 
 * 텍스트 노드나 모델 전체를 분석하여 decorator를 동적으로 생성합니다.
 * 패턴 기반 decorator보다 복잡한 로직에 적합합니다.
 */
export interface DecoratorGenerator {
  /** Generator 식별자 */
  sid: string;
  
  /** Generator 이름 (선택사항) */
  name?: string;
  
  /**
   * Decorator 생성 함수
   * 
   * @param model - 현재 노드의 모델 데이터
   * @param text - 텍스트 내용 (model.text가 있는 경우)
   * @param context - 추가 컨텍스트 정보
   * @returns 생성된 decorator 배열
   */
  generate(
    model: ModelData,
    text: string | null,
    context?: DecoratorGeneratorContext
  ): Decorator[];
  
  /** 우선순위 (낮을수록 높은 우선순위, 기본값: 100) */
  priority?: number;
  
  /** 활성화 여부 (기본값: true) */
  enabled?: boolean;
  
  /**
   * 변경 감지 콜백 등록
   * 
   * Generator가 변경을 감지했을 때 호출할 콜백을 등록합니다.
   * 예: 외부 API 응답, 사용자 입력 등
   * 
   * @param callback - 변경 감지 시 호출될 콜백
   * @returns 콜백 제거 함수
   */
  onDidChange?(callback: () => void): () => void;
}

/**
 * Decorator Generator 컨텍스트
 */
export interface DecoratorGeneratorContext {
  /** 전체 문서 모델 (선택사항) */
  documentModel?: ModelData;
  
  /** 현재 노드의 부모 모델 (선택사항) */
  parentModel?: ModelData;
  
  /** 형제 노드들 (선택사항) */
  siblings?: ModelData[];
  
  /** 추가 컨텍스트 데이터 */
  [key: string]: any;
}

/**
 * Decorator Generator 관리자
 */
export class DecoratorGeneratorManager {
  private generators: Map<string, DecoratorGenerator> = new Map();
  private changeCallbacks: Map<string, () => void> = new Map(); // sid -> cleanup function
  
  /**
   * Generator 등록
   * 
   * Generator에 `onDidChange`가 있으면 콜백을 등록합니다.
   */
  registerGenerator(generator: DecoratorGenerator, onChangeCallback?: () => void): void {
    this.generators.set(generator.sid, generator);
    
    // onDidChange가 있으면 콜백 등록
    if (generator.onDidChange && onChangeCallback) {
      const cleanup = generator.onDidChange(onChangeCallback);
      this.changeCallbacks.set(generator.sid, cleanup);
    }
  }
  
  /**
   * Generator 제거
   */
  unregisterGenerator(sid: string): boolean {
    // 변경 감지 콜백 정리
    const cleanup = this.changeCallbacks.get(sid);
    if (cleanup) {
      cleanup();
      this.changeCallbacks.delete(sid);
    }
    
    return this.generators.delete(sid);
  }
  
  /**
   * Generator 가져오기
   */
  getGenerator(sid: string): DecoratorGenerator | undefined {
    return this.generators.get(sid);
  }
  
  /**
   * 모든 Generator 가져오기
   * 
   * @param enabledOnly - true면 enabled된 것만 반환 (기본값: false)
   */
  getAllGenerators(enabledOnly: boolean = false): DecoratorGenerator[] {
    const generators = Array.from(this.generators.values());
    if (enabledOnly) {
      return generators.filter(g => g.enabled !== false);
    }
    return generators;
  }
  
  /**
   * Generator 활성화/비활성화
   */
  setGeneratorEnabled(sid: string, enabled: boolean): boolean {
    const generator = this.generators.get(sid);
    if (generator) {
      generator.enabled = enabled;
      return true;
    }
    return false;
  }
  
  /**
   * Generator 활성화 여부 확인
   */
  isGeneratorEnabled(sid: string): boolean {
    const generator = this.generators.get(sid);
    return generator?.enabled !== false;
  }
  
  /**
   * 모든 Generator 초기화
   */
  clear(): void {
    // 모든 변경 감지 콜백 정리
    for (const cleanup of this.changeCallbacks.values()) {
      cleanup();
    }
    this.changeCallbacks.clear();
    this.generators.clear();
  }
  
  /**
   * 모델에 대한 모든 decorator 생성
   * 
   * @param model - 모델 데이터
   * @param text - 텍스트 내용 (model.text가 있는 경우)
   * @param context - 추가 컨텍스트
   * @returns 생성된 decorator 배열
   */
  generateDecorators(
    model: ModelData,
    text: string | null,
    context?: DecoratorGeneratorContext
  ): Decorator[] {
    const generators = this.getAllGenerators(true)
      .sort((a, b) => (a.priority || 100) - (b.priority || 100));
    
    const allDecorators: Decorator[] = [];
    
    for (const generator of generators) {
      try {
        const decorators = generator.generate(model, text, context);
        allDecorators.push(...decorators);
      } catch (error) {
        console.error(`[DecoratorGeneratorManager] Error in generator '${generator.sid}':`, error);
      }
    }
    
    return allDecorators;
  }
}

