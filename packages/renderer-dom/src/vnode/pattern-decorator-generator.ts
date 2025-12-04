/**
 * 패턴 기반 Decorator 생성기
 * 
 * 텍스트에서 패턴을 검색하여 decorator를 자동으로 생성합니다.
 */

import type { Decorator } from '../vnode/decorator/types.js';

/**
 * 패턴 매칭 결과에서 추출된 데이터
 */
export interface ExtractedPatternData {
  [key: string]: any;
}

/**
 * 패턴 매처 인터페이스
 */
export interface PatternMatcher {
  /** 패턴 식별자 (sid로 통일) */
  sid: string;
  
  /** Decorator 타입 (color-picker, link 등) */
  stype: string;
  
  /** Decorator 카테고리 */
  category: 'inline' | 'block' | 'layer';
  
  /** 정규식 패턴 또는 함수 패턴 */
  pattern: RegExp | ((text: string) => Array<{
    match: string;
    index: number;
    groups?: RegExpMatchArray['groups'];
    [key: number]: string | undefined;
  }>);
  
  /** 매칭된 텍스트에서 데이터 추출 */
  extractData(match: RegExpMatchArray): ExtractedPatternData;
  
  /** Decorator 생성 함수 */
  createDecorator(
    nodeId: string,
    startOffset: number,
    endOffset: number,
    extractedData: ExtractedPatternData
  ): {
    sid: string;
    target: {
      sid: string;
      startOffset: number;
      endOffset: number;
    };
    data?: Record<string, any>;
    category?: 'inline' | 'block' | 'layer'; // createDecorator에서 지정 가능 (없으면 matcher의 category 사용)
    layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom'; // 다른 레이어에 렌더링 가능
  } | Array<{
    sid: string;
    target: {
      sid: string;
      startOffset: number;
      endOffset: number;
    };
    data?: Record<string, any>;
    category?: 'inline' | 'block' | 'layer';
    layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom';
  }>; // 배열을 반환하면 하나의 매칭에서 여러 decorator 생성 가능
  
  /** 우선순위 (낮을수록 높은 우선순위, 기본값: 100) */
  priority?: number;
}

/**
 * 패턴 기반 Decorator 생성기
 */
export class PatternDecoratorGenerator {
  private patterns: Map<string, PatternMatcher> = new Map();
  private enabled: boolean = false;
  
  /**
   * 패턴 기반 decorator 활성화/비활성화
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  /**
   * 패턴 등록
   */
  registerPattern(matcher: PatternMatcher): void {
    this.patterns.set(matcher.sid, matcher);
  }
  
  /**
   * 패턴 제거
   */
  unregisterPattern(patternSid: string): void {
    this.patterns.delete(patternSid);
  }
  
  /**
   * 텍스트 노드에서 패턴 검색 및 decorator 생성
   * 
   * ⚠️ inline-text 노드의 텍스트에서만 작동합니다.
   * 
   * @param nodeId - inline-text 노드의 ID
   * @param text - inline-text 노드의 텍스트 내용
   * @returns 생성된 decorator 배열
   */
  generateDecoratorsFromText(
    nodeId: string,
    text: string
  ): Decorator[] {
    if (!this.enabled || !text || !nodeId) {
      return [];
    }
    
    const decorators: Decorator[] = [];
    const sortedPatterns = Array.from(this.patterns.values())
      .sort((a, b) => (a.priority || 100) - (b.priority || 100));
    
    for (const matcher of sortedPatterns) {
      // pattern이 함수인지 RegExp인지 확인
      let matches: Array<{
        match: string;
        index: number;
        groups?: RegExpMatchArray['groups'];
        [key: number]: string | undefined;
      }>;
      
      if (typeof matcher.pattern === 'function') {
        // 함수 패턴: 함수를 호출하여 매칭 결과 얻기
        matches = matcher.pattern(text);
      } else {
        // RegExp 패턴: 기존 방식대로 matchAll 사용
        const regexMatches = Array.from(text.matchAll(matcher.pattern));
        matches = regexMatches.map(match => ({
          match: match[0],
          index: match.index ?? -1,
          groups: match.groups,
          ...Object.fromEntries(
            Array.from({ length: match.length }, (_, i) => [i, match[i]])
          )
        }));
      }
      
      for (const match of matches) {
        if (match.index === undefined || match.index < 0) continue;
        
        const startOffset = match.index;
        const endOffset = startOffset + match.match.length;
        
        // extractData에 RegExpMatchArray 형태로 전달하기 위해 변환
        const regexMatchArray = {
          0: match.match,
          index: match.index,
          input: text,
          groups: match.groups,
          length: 1,
          ...Object.fromEntries(
            Object.entries(match).filter(([key]) => !isNaN(Number(key)))
          )
        } as RegExpMatchArray;
        
        const extractedData = matcher.extractData(regexMatchArray);
        
        const decoratorResult = matcher.createDecorator(
          nodeId,
          startOffset,
          endOffset,
          extractedData
        );
        
        // createDecorator가 배열을 반환할 수 있음 (여러 decorator 생성)
        const decoratorArray = Array.isArray(decoratorResult) ? decoratorResult : [decoratorResult];
        
        // 각 decorator를 형식에 맞게 변환
        for (const decorator of decoratorArray) {
          // Decorator 형식으로 생성
          // createDecorator에서 반환하는 category와 layerTarget을 우선 사용
          // 없으면 matcher의 category 사용
        decorators.push({
          sid: decorator.sid,
          stype: matcher.stype,
            category: decorator.category || matcher.category,
            layerTarget: decorator.layerTarget,
          target: decorator.target,
            data: decorator.data || {},
            position: (decorator as any).position
        });
        }
      }
    }
    
    return decorators;
  }
  
  /**
   * 기존 decorator에 패턴 기반 decorator 추가
   * 
   * @param nodeId - inline-text 노드의 ID
   * @param text - 텍스트 내용
   * @param existingDecorators - 기존 decorator 배열
   * @returns 병합된 decorator 배열
   */
  mergePatternDecorators(
    nodeId: string,
    text: string,
    existingDecorators: Decorator[]
  ): Decorator[] {
    if (!this.enabled) {
      return existingDecorators;
    }
    
    // 패턴 기반 decorator 생성
    const patternDecorators = this.generateDecoratorsFromText(nodeId, text);
    
    // 기존 decorator와 병합 (중복 제거)
    const merged = [...existingDecorators];
    const existingSids = new Set(existingDecorators.map(d => d.sid));
    
    for (const patternDecorator of patternDecorators) {
      // 같은 범위의 기존 decorator가 있으면 스킵 (기존 decorator 우선)
      const hasOverlap = existingDecorators.some(existing => {
        if (existing.target.sid !== nodeId) return false;
        const existingStart = existing.target.startOffset || 0;
        const existingEnd = existing.target.endOffset || 0;
        const patternStart = patternDecorator.target.startOffset || 0;
        const patternEnd = patternDecorator.target.endOffset || 0;
        
        // 범위가 겹치는지 확인
        return !(patternEnd <= existingStart || patternStart >= existingEnd);
      });
      
      if (!hasOverlap && !existingSids.has(patternDecorator.sid)) {
        merged.push(patternDecorator);
      }
    }
    
    return merged;
  }
}

