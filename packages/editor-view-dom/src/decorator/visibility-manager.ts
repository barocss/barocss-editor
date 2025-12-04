/**
 * DecoratorVisibilityManager
 * 
 * 데코레이터의 가시성(visibility) 상태를 관리하는 시스템
 * 사용자 설정, 권한, 필터링 등을 통해 데코레이터 표시/숨김 제어
 */

export interface VisibilityRule {
  id: string;
  name: string;
  condition: (decorator: any) => boolean;
  priority: number; // 높을수록 우선순위 높음
}

export interface VisibilityState {
  decoratorId: string;
  visible: boolean;
  reason?: string; // 숨김/표시 이유
  overriddenBy?: string; // 어떤 규칙에 의해 오버라이드되었는지
}

export interface VisibilitySettings {
  showAll: boolean;
  showByType: Record<string, boolean>;
  showByAuthor: Record<string, boolean>;
  showByCategory: Record<string, boolean>;
  showById: Record<string, boolean>; // 개별 ID별 표시/숨김
  customRules: VisibilityRule[];
}

/**
 * 데코레이터 가시성 관리자
 */
export class DecoratorVisibilityManager {
  private visibilityStates = new Map<string, VisibilityState>();
  private settings: VisibilitySettings;
  private rules: VisibilityRule[] = [];
  
  constructor(initialSettings?: Partial<VisibilitySettings>) {
    this.settings = {
      showAll: true,
      showByType: {},
      showByAuthor: {},
      showByCategory: {
        layer: true,
        inline: true,
        block: true
      },
      showById: {}, // 개별 ID별 설정
      customRules: [],
      ...initialSettings
    };
    
    // 기본 규칙들 등록
    this.registerDefaultRules();
  }
  
  /**
   * 기본 가시성 규칙들 등록
   */
  private registerDefaultRules(): void {
    // 1. 전체 표시/숨김 규칙
    this.addRule({
      id: 'global-toggle',
      name: '전체 표시/숨김',
      condition: () => this.settings.showAll,
      priority: 1000
    });
    
    // 2. 타입별 표시/숨김 규칙
    this.addRule({
      id: 'type-filter',
      name: '타입별 필터',
      condition: (decorator) => {
        const typeSetting = this.settings.showByType[decorator.stype];
        return typeSetting !== false; // 명시적으로 false가 아니면 표시
      },
      priority: 900
    });
    
    // 3. 작성자별 표시/숨김 규칙
    this.addRule({
      id: 'author-filter',
      name: '작성자별 필터',
      condition: (decorator) => {
        const author = decorator.data?.author;
        if (!author) return true;
        
        const authorSetting = this.settings.showByAuthor[author];
        return authorSetting !== false;
      },
      priority: 800
    });
    
    // 4. 카테고리별 표시/숨김 규칙
    this.addRule({
      id: 'category-filter',
      name: '카테고리별 필터',
      condition: (decorator) => {
        const categorySetting = this.settings.showByCategory[decorator.category];
        return categorySetting !== false;
      },
      priority: 700
    });
    
    // 5. 개별 ID별 표시/숨김 규칙 (최고 우선순위)
    this.addRule({
      id: 'id-filter',
      name: '개별 ID 필터',
      condition: (decorator) => {
        const idSetting = this.settings.showById[decorator.sid];
        return idSetting !== false; // 명시적으로 false가 아니면 표시
      },
      priority: 1100 // 가장 높은 우선순위
    });
  }
  
  /**
   * 가시성 규칙 추가
   */
  addRule(rule: VisibilityRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority); // 우선순위 순으로 정렬
  }
  
  /**
   * 가시성 규칙 제거
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(rule => rule.sid !== ruleId);
  }
  
  /**
   * 데코레이터의 가시성 상태 계산
   */
  calculateVisibility(decorator: any): VisibilityState {
    // 기존 상태 확인
    const existingState = this.visibilityStates.get(decorator.sid);
    
    // 규칙들을 우선순위 순으로 적용
    for (const rule of this.rules) {
      try {
        const isVisible = rule.condition(decorator);
        
        // 첫 번째로 적용되는 규칙이 최종 결정
        const newState: VisibilityState = {
          decoratorId: decorator.sid,
          visible: isVisible,
          reason: `${rule.name}: ${isVisible ? '표시' : '숨김'}`,
          overriddenBy: rule.sid
        };
        
        this.visibilityStates.set(decorator.sid, newState);
        return newState;
      } catch (error) {
        console.warn(`Visibility rule ${rule.sid} failed for decorator ${decorator.sid}:`, error);
      }
    }
    
    // 기본값: 표시
    const defaultState: VisibilityState = {
      decoratorId: decorator.sid,
      visible: true,
      reason: '기본값: 표시'
    };
    
    this.visibilityStates.set(decorator.sid, defaultState);
    return defaultState;
  }
  
  /**
   * 데코레이터가 표시되어야 하는지 확인
   */
  isVisible(decoratorId: string): boolean {
    const state = this.visibilityStates.get(decoratorId);
    return state?.visible ?? true;
  }
  
  /**
   * 데코레이터 가시성 상태 조회
   */
  getVisibilityState(decoratorId: string): VisibilityState | undefined {
    return this.visibilityStates.get(decoratorId);
  }
  
  /**
   * 모든 가시성 상태 조회
   */
  getAllVisibilityStates(): Map<string, VisibilityState> {
    return new Map(this.visibilityStates);
  }
  
  /**
   * 설정 업데이트
   */
  updateSettings(updates: Partial<VisibilitySettings>): void {
    this.settings = { ...this.settings, ...updates };
    
    // 모든 데코레이터의 가시성 재계산
    this.recalculateAllVisibility();
  }
  
  /**
   * 특정 타입의 데코레이터 표시/숨김
   */
  setTypeVisibility(type: string, visible: boolean): void {
    this.settings.showByType[type] = visible;
    this.recalculateAllVisibility();
  }
  
  /**
   * 특정 작성자의 데코레이터 표시/숨김
   */
  setAuthorVisibility(author: string, visible: boolean): void {
    this.settings.showByAuthor[author] = visible;
    this.recalculateAllVisibility();
  }
  
  /**
   * 특정 카테고리의 데코레이터 표시/숨김
   */
  setCategoryVisibility(category: string, visible: boolean): void {
    this.settings.showByCategory[category] = visible;
    this.recalculateAllVisibility();
  }
  
  /**
   * 특정 ID의 데코레이터 표시/숨김
   */
  setDecoratorVisibility(decoratorId: string, visible: boolean): void {
    this.settings.showById[decoratorId] = visible;
    this.recalculateAllVisibility();
  }
  
  /**
   * 여러 ID의 데코레이터 일괄 표시/숨김
   */
  setMultipleDecoratorsVisibility(decoratorIds: string[], visible: boolean): void {
    decoratorIds.forEach(id => {
      this.settings.showById[id] = visible;
    });
    this.recalculateAllVisibility();
  }
  
  /**
   * 특정 ID의 데코레이터 가시성 토글
   */
  toggleDecoratorVisibility(decoratorId: string): boolean {
    const currentVisible = this.settings.showById[decoratorId] !== false;
    const newVisible = !currentVisible;
    this.settings.showById[decoratorId] = newVisible;
    this.recalculateAllVisibility();
    return newVisible;
  }
  
  /**
   * 전체 표시/숨김 토글
   */
  toggleAll(visible: boolean): void {
    this.settings.showAll = visible;
    this.recalculateAllVisibility();
  }
  
  /**
   * 모든 데코레이터의 가시성 재계산
   */
  private recalculateAllVisibility(): void {
    // 실제 구현에서는 데코레이터 매니저에서 모든 데코레이터를 가져와야 함
    // 여기서는 기존 상태만 초기화
    this.visibilityStates.clear();
  }
  
  /**
   * 데코레이터 제거 시 상태 정리
   */
  removeDecorator(decoratorId: string): void {
    this.visibilityStates.delete(decoratorId);
  }
  
  /**
   * 현재 설정 조회
   */
  getSettings(): VisibilitySettings {
    return { ...this.settings };
  }
  
  /**
   * 현재 규칙들 조회
   */
  getRules(): VisibilityRule[] {
    return [...this.rules];
  }
  
  /**
   * 가시성 통계 조회
   */
  getVisibilityStats(): {
    total: number;
    visible: number;
    hidden: number;
    byType: Record<string, { total: number; visible: number; hidden: number }>;
    byCategory: Record<string, { total: number; visible: number; hidden: number }>;
  } {
    const stats = {
      total: this.visibilityStates.size,
      visible: 0,
      hidden: 0,
      byType: {} as Record<string, { total: number; visible: number; hidden: number }>,
      byCategory: {} as Record<string, { total: number; visible: number; hidden: number }>
    };
    
    for (const [decoratorId, state] of this.visibilityStates) {
      if (state.visible) {
        stats.visible++;
      } else {
        stats.hidden++;
      }
      
      // 타입별 통계는 실제 데코레이터 데이터가 필요하므로 여기서는 생략
      // 실제 구현에서는 데코레이터 매니저와 연동 필요
    }
    
    return stats;
  }
}
