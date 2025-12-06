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
  priority: number; // Higher value = higher priority
}

export interface VisibilityState {
  decoratorId: string;
  visible: boolean;
  reason?: string; // Reason for hide/show
  overriddenBy?: string; // Which rule overrode it
}

export interface VisibilitySettings {
  showAll: boolean;
  showByType: Record<string, boolean>;
  showByAuthor: Record<string, boolean>;
  showByCategory: Record<string, boolean>;
  showById: Record<string, boolean>; // Show/hide by individual ID
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
      showById: {}, // Settings by individual ID
      customRules: [],
      ...initialSettings
    };
    
    // Register default rules
    this.registerDefaultRules();
  }
  
  /**
   * Register default visibility rules
   */
  private registerDefaultRules(): void {
    // 1. Global show/hide rule
    this.addRule({
      id: 'global-toggle',
      name: 'Global Show/Hide',
      condition: () => this.settings.showAll,
      priority: 1000
    });
    
    // 2. Type-based show/hide rule
    this.addRule({
      id: 'type-filter',
      name: 'Type Filter',
      condition: (decorator) => {
        const typeSetting = this.settings.showByType[decorator.stype];
        return typeSetting !== false; // Show if not explicitly false
      },
      priority: 900
    });
    
    // 3. Author-based show/hide rule
    this.addRule({
      id: 'author-filter',
      name: 'Author Filter',
      condition: (decorator) => {
        const author = decorator.data?.author;
        if (!author) return true;
        
        const authorSetting = this.settings.showByAuthor[author];
        return authorSetting !== false;
      },
      priority: 800
    });
    
    // 4. Category-based show/hide rule
    this.addRule({
      id: 'category-filter',
      name: 'Category Filter',
      condition: (decorator) => {
        const categorySetting = this.settings.showByCategory[decorator.category];
        return categorySetting !== false;
      },
      priority: 700
    });
    
    // 5. Individual ID-based show/hide rule (highest priority)
    this.addRule({
      id: 'id-filter',
      name: 'Individual ID Filter',
      condition: (decorator) => {
        const idSetting = this.settings.showById[decorator.sid];
        return idSetting !== false; // Show if not explicitly false
      },
      priority: 1100 // Highest priority
    });
  }
  
  /**
   * Add visibility rule
   */
  addRule(rule: VisibilityRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority); // Sort by priority
  }
  
  /**
   * 가시성 규칙 제거
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(rule => rule.sid !== ruleId);
  }
  
  /**
   * Calculate visibility state of decorator
   */
  calculateVisibility(decorator: any): VisibilityState {
    // Check existing state
    const existingState = this.visibilityStates.get(decorator.sid);
    
    // Apply rules in priority order
    for (const rule of this.rules) {
      try {
        const isVisible = rule.condition(decorator);
        
        // First rule that applies is final decision
        const newState: VisibilityState = {
          decoratorId: decorator.sid,
          visible: isVisible,
          reason: `${rule.name}: ${isVisible ? 'Show' : 'Hide'}`,
          overriddenBy: rule.sid
        };
        
        this.visibilityStates.set(decorator.sid, newState);
        return newState;
      } catch (error) {
        console.warn(`Visibility rule ${rule.sid} failed for decorator ${decorator.sid}:`, error);
      }
    }
    
    // Default: show
    const defaultState: VisibilityState = {
      decoratorId: decorator.sid,
      visible: true,
      reason: 'Default: Show'
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
   * Update settings
   */
  updateSettings(updates: Partial<VisibilitySettings>): void {
    this.settings = { ...this.settings, ...updates };
    
    // Recalculate visibility of all decorators
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
   * Recalculate visibility of all decorators
   */
  private recalculateAllVisibility(): void {
    // In actual implementation, should get all decorators from decorator manager
    // Here, only initialize existing states
    this.visibilityStates.clear();
  }
  
  /**
   * Clean up state when decorator is removed
   */
  removeDecorator(decoratorId: string): void {
    this.visibilityStates.delete(decoratorId);
  }
  
  /**
   * Get current settings
   */
  getSettings(): VisibilitySettings {
    return { ...this.settings };
  }
  
  /**
   * Get current rules
   */
  getRules(): VisibilityRule[] {
    return [...this.rules];
  }
  
  /**
   * Get visibility statistics
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
      
      // Type-based statistics require actual decorator data, so omitted here
      // In actual implementation, integration with decorator manager is needed
    }
    
    return stats;
  }
}
