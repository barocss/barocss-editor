/**
 * DecoratorManager
 * 
 * Manager responsible for Decorator CRUD operations, event emission, and queries
 */

import {
  Decorator,
  DecoratorEvents,
  DecoratorQueryOptions,
  DecoratorUpdateOptions,
  LayerDecorator,
  InlineDecorator,
  BlockDecorator
} from './types.js';
import { DecoratorRegistry } from './decorator-registry.js';

/**
 * Simple EventEmitter implementation
 */
class EventEmitter<T extends Record<string, (...args: any[]) => void>> {
  private listeners = new Map<keyof T, Array<T[keyof T]>>();
  
  on<K extends keyof T>(event: K, listener: T[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }
  
  off<K extends keyof T>(event: K, listener: T[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    }
  }
  
  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${String(event)}:`, error);
        }
      });
    }
  }
  
  removeAllListeners(): void {
    this.listeners.clear();
  }
}

/**
 * DecoratorManager 클래스
 */
export class DecoratorManager extends EventEmitter<DecoratorEvents> {
  private decorators = new Map<string, Decorator>();
  private registry: DecoratorRegistry;
  
  constructor(registry: DecoratorRegistry) {
    super();
    this.registry = registry;
  }
  
  /**
   * Add decorator
   */
  add(decorator: Decorator): void {
    // Validate (validate if type is registered, pass if not)
    const validation = this.registry.validateDecorator(decorator);
    if (!validation.valid) {
      throw new Error(`Invalid decorator: ${validation.errors.join(', ')}`);
    }
    
    // Apply defaults (apply defaults if type is registered)
    const decoratorWithDefaults = this.registry.applyDefaults(decorator);
    
    // Check duplicate ID
    if (this.decorators.has(decorator.sid)) {
      throw new Error(`Decorator with id '${decorator.sid}' already exists`);
    }
    
    // Store
    this.decorators.set(decorator.sid, decoratorWithDefaults);
    
    // Emit event
    this.emit('decorator:added', decoratorWithDefaults);
  }
  
  /**
   * Update decorator
   */
  update(id: string, updates: Partial<Decorator>, options: DecoratorUpdateOptions = {}): void {
    const existing = this.decorators.get(id);
    if (!existing) {
      throw new Error(`Decorator with id '${id}' not found`);
    }
    
    // Partial update or full replacement
    const updated = options.partial !== false 
      ? { ...existing, ...updates }
      : { ...updates } as Decorator;
    
    // ID cannot be changed
    updated.sid = existing.sid;
    
    // Validate
    const validation = this.registry.validateDecorator(updated as Decorator);
    if (!validation.valid) {
      throw new Error(`Invalid decorator update: ${validation.errors.join(', ')}`);
    }
    
    // Apply defaults
    const updatedWithDefaults = this.registry.applyDefaults(updated as Decorator);
    
    // Store
    this.decorators.set(id, updatedWithDefaults);
    
    // Emit event
    this.emit('decorator:updated', updatedWithDefaults);
  }
  
  /**
   * Remove decorator
   */
  remove(id: string): void {
    const decorator = this.decorators.get(id);
    if (!decorator) {
      throw new Error(`Decorator with id '${id}' not found`);
    }
    
    // Remove
    this.decorators.delete(id);
    
    // Emit event
    this.emit('decorator:removed', id);
  }
  
  /**
   * Enable/disable decorator
   */
  setEnabled(id: string, enabled: boolean): boolean {
    const decorator = this.decorators.get(id);
    if (!decorator) {
      return false;
    }
    
    this.update(id, { enabled }, { partial: true });
    return true;
  }
  
  /**
   * Check if decorator is enabled
   */
  isEnabled(id: string): boolean {
    const decorator = this.decorators.get(id);
    return decorator?.enabled !== false; // Default is true
  }
  
  /**
   * Query specific decorator
   */
  get(id: string): Decorator | undefined {
    return this.decorators.get(id);
  }
  
  /**
   * Query all decorators
   * Return only enabled ones (default: true)
   */
  getAll(options: DecoratorQueryOptions = {}): Decorator[] {
    let decorators = Array.from(this.decorators.values());
    
    // Filter by enable (default is true, so only enabled !== false)
    if (options.enabledOnly !== false) {
      decorators = decorators.filter(d => d.enabled !== false);
    }
    
    // Filter
    if (options.type) {
      decorators = decorators.filter(d => d.stype === options.type);
    }
    
    if (options.category) {
      decorators = decorators.filter(d => d.category === options.category);
    }
    
    if (options.nodeId) {
      decorators = decorators.filter(d => {
        if (d.target && 'sid' in d.target) {
          return d.target.sid === options.nodeId;
        }
        return false;
      });
    }
    
    // Sort
    if (options.sortBy) {
      const sortOrder = options.sortOrder || 'asc';
      decorators.sort((a, b) => {
        let aValue: any, bValue: any;
        
        switch (options.sortBy) {
          case 'id':
            aValue = a.sid;
            bValue = b.sid;
            break;
          case 'type':
            aValue = a.stype;
            bValue = b.stype;
            break;
          case 'category':
            aValue = a.category;
            bValue = b.category;
            break;
          default:
            return 0;
        }
        
        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return decorators;
  }
  
  /**
   * 타입별 Decorator 조회
   */
  getByType(type: string): Decorator[] {
    return this.getAll({ type });
  }
  
  /**
   * 카테고리별 Decorator 조회
   */
  getByCategory(category: 'layer' | 'inline' | 'block'): Decorator[] {
    return this.getAll({ category });
  }
  
  /**
   * 노드별 Decorator 조회
   */
  getByNode(nodeId: string): Decorator[] {
    return this.getAll({ nodeId });
  }
  
  /**
   * Layer Decorator만 조회
   */
  getLayerDecorators(): LayerDecorator[] {
    return this.getByCategory('layer') as LayerDecorator[];
  }
  
  /**
   * Inline Decorator만 조회
   */
  getInlineDecorators(): InlineDecorator[] {
    return this.getByCategory('inline') as InlineDecorator[];
  }
  
  /**
   * Block Decorator만 조회
   */
  getBlockDecorators(): BlockDecorator[] {
    return this.getByCategory('block') as BlockDecorator[];
  }
  
  /**
   * 특정 노드의 특정 범위에 있는 Layer Decorator 조회
   */
  getLayerDecoratorsInRange(
    nodeId: string, 
    startOffset: number, 
    endOffset: number
  ): LayerDecorator[] {
    return this.getLayerDecorators().filter(decorator => {
      // Layer decorator target is optional, so cannot check range if target is missing
      if (!decorator.target) return false;
      
      if ('sid' in decorator.target && decorator.target.sid !== nodeId) return false;
      if (!('sid' in decorator.target)) return false;
      
      // Check range overlap
      const decoratorStart = decorator.target.startOffset ?? 0;
      const decoratorEnd = decorator.target.endOffset ?? 0;
      
      return !(decoratorEnd <= startOffset || decoratorStart >= endOffset);
    });
  }
  
  /**
   * 특정 노드의 특정 위치에 있는 Inline Decorator 조회
   */
  getInlineDecoratorsAtPosition(
    nodeId: string, 
    offset: number
  ): InlineDecorator[] {
    return this.getInlineDecorators().filter(decorator => {
      if ('sid' in decorator.target && decorator.target.sid !== nodeId) return false;
      if (!('sid' in decorator.target)) return false;
      
      const startOffset = decorator.target.startOffset ?? 0;
      const endOffset = decorator.target.endOffset ?? 0;
      return offset >= startOffset && offset <= endOffset;
    });
  }
  
  /**
   * 특정 노드의 Block Decorator 조회
   */
  getBlockDecoratorsForNode(nodeId: string): BlockDecorator[] {
    return this.getBlockDecorators().filter(decorator => 
      decorator.target && 'sid' in decorator.target && decorator.target.sid === nodeId
    );
  }
  
  /**
   * Decorator 존재 여부 확인
   */
  has(id: string): boolean {
    return this.decorators.has(id);
  }
  
  /**
   * 전체 Decorator 개수
   */
  size(): number {
    return this.decorators.size;
  }
  
  /**
   * 모든 Decorator 제거
   */
  clear(): void {
    const decoratorIds = Array.from(this.decorators.keys());
    
    this.decorators.clear();
    
    // Emit remove event for each Decorator
    decoratorIds.forEach(id => {
      this.emit('decorator:removed', id);
    });
  }
  
  /**
   * 특정 노드의 모든 Decorator 제거
   */
  clearByNode(nodeId: string): void {
    const nodeDecorators = this.getByNode(nodeId);
    
    nodeDecorators.forEach(decorator => {
      this.remove(decorator.sid);
    });
  }
  
  /**
   * 특정 타입의 모든 Decorator 제거
   */
  clearByType(type: string): void {
    const typeDecorators = this.getByType(type);
    
    typeDecorators.forEach(decorator => {
      this.remove(decorator.sid);
    });
  }
  
  /**
   * 특정 카테고리의 모든 Decorator 제거
   */
  clearByCategory(category: 'layer' | 'inline' | 'block'): void {
    const categoryDecorators = this.getByCategory(category);
    
    categoryDecorators.forEach(decorator => {
      this.remove(decorator.sid);
    });
  }
  
  /**
   * Decorator 데이터만 업데이트 (부분 업데이트)
   */
  updateData(id: string, dataUpdates: Record<string, any>): void {
    const existing = this.decorators.get(id);
    if (!existing) {
      throw new Error(`Decorator with id '${id}' not found`);
    }
    
    this.update(id, {
      data: { ...existing.data, ...dataUpdates }
    });
  }
  
  /**
   * 여러 Decorator를 한 번에 추가
   */
  addMany(decorators: Decorator[]): void {
    decorators.forEach(decorator => {
      this.add(decorator);
    });
  }
  
  /**
   * 여러 Decorator를 한 번에 제거
   */
  removeMany(ids: string[]): void {
    ids.forEach(id => {
      this.remove(id);
    });
  }
  
  /**
   * 디버깅용 정보 출력
   */
  debug(): void {
    console.group('DecoratorManager Debug Info');
    console.log('Total decorators:', this.size());
    
    const byCategory = {
      layer: this.getByCategory('layer').length,
      inline: this.getByCategory('inline').length,
      block: this.getByCategory('block').length
    };
    console.log('By category:', byCategory);
    
    const allDecorators = this.getAll();
    console.table(allDecorators.map(d => ({
      id: d.sid,
      category: d.category,
      type: d.stype,
      target: JSON.stringify(d.target),
      dataKeys: d.data ? Object.keys(d.data).join(', ') : ''
    })));
    
    console.groupEnd();
  }
}
