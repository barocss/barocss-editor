/**
 * Text Change Analysis Types
 * 
 * 텍스트 변경사항 분석에 필요한 타입 정의들
 */

/**
 * 텍스트 변경사항을 나타내는 인터페이스
 * 
 * @interface TextChange
 */
export interface TextChange {
  /** 변경 타입: insert(삽입), delete(삭제), replace(교체) */
  type: 'insert' | 'delete' | 'replace';
  
  /** 변경 시작 위치 (oldText 기준) */
  start: number;
  
  /** 변경 끝 위치 (oldText 기준) */
  end: number;
  
  /** 변경할 텍스트 
   * - insert: 삽입할 텍스트
   * - delete: 빈 문자열
   * - replace: 교체할 텍스트
   */
  text: string;
  
  /** 분석 신뢰도 (0-1) */
  confidence: number;
}

/**
 * 텍스트 변경사항 분석 옵션
 * 
 * @interface TextChangeAnalysisOptions
 */
export interface TextChangeAnalysisOptions {
  /** 변경 전 텍스트 */
  oldText: string;
  
  /** 변경 후 텍스트 */
  newText: string;
  
  /** 사용자 Selection 시작 위치 */
  selectionOffset: number;
  
  /** 선택된 텍스트 길이 (0이면 커서) */
  selectionLength?: number;
  
  /** 추가 컨텍스트 정보 (선택사항) */
  context?: {
    /** 앞쪽 컨텍스트 */
    beforeText?: string;
    
    /** 뒤쪽 컨텍스트 */
    afterText?: string;
  };
}

/**
 * LCP/LCS 알고리즘 결과
 * 
 * @interface TextDifference
 */
export interface TextDifference {
  /** 변경 종류 */
  kind: 'none' | 'insert' | 'delete' | 'replace';
  
  /** 변경 시작 위치 */
  start: number;
  
  /** 변경 끝 위치 */
  end: number;
  
  /** 삽입된 텍스트 */
  inserted: string;
  
  /** 삭제된 텍스트 */
  deleted: string;
}
