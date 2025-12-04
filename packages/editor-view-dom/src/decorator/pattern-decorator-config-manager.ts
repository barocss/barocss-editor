/**
 * 패턴 기반 Decorator 설정 관리자
 * 
 * 패턴 설정을 배열로 관리하고, DOMRenderer에 전달합니다.
 */

/**
 * 패턴 기반 Decorator 설정 타입
 */
export interface PatternDecoratorConfig {
  /** 패턴 식별자 (sid로 통일) */
  sid: string;
  
  /** Decorator 타입 (stype으로 통일) */
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
  extractData: (match: RegExpMatchArray) => Record<string, any>;
  
  /** Decorator 생성 함수 */
  createDecorator: (
    nodeId: string,
    startOffset: number,
    endOffset: number,
    extractedData: Record<string, any>
  ) => {
    sid: string;
    target: {
      sid: string;
      startOffset: number;
      endOffset: number;
    };
    data?: Record<string, any>;
    category?: 'inline' | 'block' | 'layer'; // createDecorator에서 지정 가능 (없으면 config의 category 사용)
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
  
  /** 활성화 여부 (기본값: true) */
  enabled?: boolean;
}

/**
 * 패턴 기반 Decorator 설정 관리자
 * 
 * 패턴 설정을 배열로 저장하고 관리합니다.
 * 각 패턴의 enable/disable은 config.enabled로 관리됩니다.
 */
export class PatternDecoratorConfigManager {
  /** 패턴 설정 배열 */
  private configs: PatternDecoratorConfig[] = [];
  
  /**
   * 패턴 설정 배열 설정
   * 
   * @param configs - 패턴 설정 배열
   */
  setConfigs(configs: PatternDecoratorConfig[]): void {
    this.configs = [...configs];
  }
  
  /**
   * 패턴 설정 추가
   * 
   * @param config - 패턴 설정
   */
  addConfig(config: PatternDecoratorConfig): void {
    const existingIndex = this.configs.findIndex(c => c.sid === config.sid);
    if (existingIndex >= 0) {
      this.configs[existingIndex] = config;
    } else {
      this.configs.push(config);
    }
  }
  
  /**
   * 패턴 설정 제거
   * 
   * @param sid - 패턴 SID
   */
  removeConfig(sid: string): boolean {
    const index = this.configs.findIndex(c => c.sid === sid);
    if (index >= 0) {
      this.configs.splice(index, 1);
      return true;
    }
    return false;
  }
  
  /**
   * 모든 패턴 설정 가져오기
   * 
   * @param enabledOnly - true면 enabled된 것만 반환 (기본값: false)
   * @returns 패턴 설정 배열 (복사본)
   */
  getConfigs(enabledOnly: boolean = false): PatternDecoratorConfig[] {
    const configs = [...this.configs];
    if (enabledOnly) {
      return configs.filter(config => config.enabled !== false); // 기본값은 true
    }
    return configs;
  }
  
  /**
   * 패턴 설정 활성화/비활성화
   * 
   * @param sid - 패턴 SID
   * @param enabled - 활성화 여부
   */
  setConfigEnabled(sid: string, enabled: boolean): boolean {
    const config = this.configs.find(c => c.sid === sid);
    if (config) {
      config.enabled = enabled;
      return true;
    }
    return false;
  }
  
  /**
   * 패턴 설정 활성화 여부 확인
   * 
   * @param sid - 패턴 SID
   * @returns 활성화 여부 (기본값: true)
   */
  isConfigEnabled(sid: string): boolean {
    const config = this.configs.find(c => c.sid === sid);
    return config?.enabled !== false; // 기본값은 true
  }
  
  /**
   * 패턴 설정 초기화
   */
  clear(): void {
    this.configs = [];
  }
}

