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
  /** Generator identifier */
  sid: string;
  
  /** Generator name (optional) */
  name?: string;
  
  /**
   * Decorator generation function
   * 
   * @param model - Current node's model data
   * @param text - Text content (if model.text exists)
   * @param context - Additional context information
   * @returns Generated decorator array
   */
  generate(
    model: ModelData,
    text: string | null,
    context?: DecoratorGeneratorContext
  ): Decorator[];
  
  /** Priority (lower value = higher priority, default: 100) */
  priority?: number;
  
  /** Enabled status (default: true) */
  enabled?: boolean;
  
  /**
   * Register change detection callback
   * 
   * Registers a callback to be called when Generator detects changes.
   * Examples: external API response, user input, etc.
   * 
   * @param callback - Callback to be called on change detection
   * @returns Callback removal function
   */
  onDidChange?(callback: () => void): () => void;
}

/**
 * Decorator Generator context
 */
export interface DecoratorGeneratorContext {
  /** Full document model (optional) */
  documentModel?: ModelData;
  
  /** Current node's parent model (optional) */
  parentModel?: ModelData;
  
  /** Sibling nodes (optional) */
  siblings?: ModelData[];
  
  /** Additional context data */
  [key: string]: any;
}

/**
 * Decorator Generator 관리자
 */
export class DecoratorGeneratorManager {
  private generators: Map<string, DecoratorGenerator> = new Map();
  private changeCallbacks: Map<string, () => void> = new Map(); // sid -> cleanup function
  
  /**
   * Register Generator
   * 
   * Registers callback if Generator has `onDidChange`.
   */
  registerGenerator(generator: DecoratorGenerator, onChangeCallback?: () => void): void {
    this.generators.set(generator.sid, generator);
    
    // Register callback if onDidChange exists
    if (generator.onDidChange && onChangeCallback) {
      const cleanup = generator.onDidChange(onChangeCallback);
      this.changeCallbacks.set(generator.sid, cleanup);
    }
  }
  
  /**
   * Unregister Generator
   */
  unregisterGenerator(sid: string): boolean {
    // Clean up change detection callback
    const cleanup = this.changeCallbacks.get(sid);
    if (cleanup) {
      cleanup();
      this.changeCallbacks.delete(sid);
    }
    
    return this.generators.delete(sid);
  }
  
  /**
   * Get Generator
   */
  getGenerator(sid: string): DecoratorGenerator | undefined {
    return this.generators.get(sid);
  }
  
  /**
   * Get all Generators
   * 
   * @param enabledOnly - If true, only return enabled ones (default: false)
   */
  getAllGenerators(enabledOnly: boolean = false): DecoratorGenerator[] {
    const generators = Array.from(this.generators.values());
    if (enabledOnly) {
      return generators.filter(g => g.enabled !== false);
    }
    return generators;
  }
  
  /**
   * Enable/disable Generator
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
   * Check if Generator is enabled
   */
  isGeneratorEnabled(sid: string): boolean {
    const generator = this.generators.get(sid);
    return generator?.enabled !== false;
  }
  
  /**
   * Initialize all Generators
   */
  clear(): void {
    // Clean up all change detection callbacks
    for (const cleanup of this.changeCallbacks.values()) {
      cleanup();
    }
    this.changeCallbacks.clear();
    this.generators.clear();
  }
  
  /**
   * Generate all decorators for model
   * 
   * @param model - Model data
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

