import type { INode } from '../types';
import type { DropBehavior, DropContext, DropBehaviorDefinition } from '../types/drop-behavior';

/**
 * Global Drop Behavior Registry
 * 
 * defineDropBehavior로 등록된 규칙을 관리합니다.
 */
class GlobalDropBehaviorRegistry {
  private behaviors = new Map<string, DropBehaviorDefinition[]>();

  /**
   * Drop Behavior 규칙을 등록합니다.
   * 
   * @param definition 규칙 정의
   */
  register(definition: DropBehaviorDefinition): void {
    const targetTypes = Array.isArray(definition.targetType) 
      ? definition.targetType 
      : [definition.targetType];
    
    targetTypes.forEach(targetType => {
      if (!this.behaviors.has(targetType)) {
        this.behaviors.set(targetType, []);
      }
      this.behaviors.get(targetType)!.push(definition);
      // Sort by priority (higher priority first)
      this.behaviors.get(targetType)!.sort((a, b) => 
        (b.priority || 0) - (a.priority || 0)
      );
    });
  }

  /**
   * Find rule matching target type and source type and return behavior.
   * 
   * @param targetType Target node type (stype)
   * @param sourceType Source node type (stype)
   * @param targetNode Target node (optional)
   * @param sourceNode Source node (optional)
   * @param context Drop context (optional)
   * @returns Drop behavior or null (no matching rule)
   */
  get(
    targetType: string, 
    sourceType: string,
    targetNode?: INode,
    sourceNode?: INode,
    context?: DropContext
  ): DropBehavior | null {
    // Check rules by target type
    const behaviors = this.behaviors.get(targetType) || [];
    
    // Also check wildcard rules
    const wildcardBehaviors = this.behaviors.get('*') || [];
    const allBehaviors = [...behaviors, ...wildcardBehaviors];
    
    // Match in priority order
    for (const definition of allBehaviors) {
      // Check sourceType match
      if (definition.sourceType) {
        const sourceTypes = Array.isArray(definition.sourceType) 
          ? definition.sourceType 
          : [definition.sourceType];
        
        if (!sourceTypes.includes(sourceType) && !sourceTypes.includes('*')) {
          continue; // Not matched
        }
      }
      
      // Determine behavior
      if (typeof definition.behavior === 'function') {
        if (targetNode && sourceNode) {
          const result = definition.behavior(targetNode, sourceNode, context || {});
          if (result !== null) {
            return result;
          }
          // Check next rule if null returned
          continue;
        }
      } else {
        return definition.behavior;
      }
    }
    
    return null; // No matching rule
  }

  /**
   * Remove all rules.
   */
  clear(): void {
    this.behaviors.clear();
  }
}

export const globalDropBehaviorRegistry = new GlobalDropBehaviorRegistry();

/**
 * Define Drop Behavior.
 * 
 * @param targetType Target node type (stype or group) or array
 * @param behavior Drop behavior or function
 * @param options Options (sourceType, priority)
 * 
 * @example
 * // Define default drop behavior
 * defineDropBehavior('paragraph', 'move');
 * 
 * // Define dynamic drop behavior
 * defineDropBehavior(
 *   'paragraph',
 *   (target, source, context) => {
 *     if (source.stype === 'inline-text') {
 *       return 'merge';
 *     }
 *     return 'move';
 *   },
 *   { priority: 100 }
 * );
 * 
 * // Rule for specific source type
 * defineDropBehavior(
 *   'paragraph',
 *   'merge',
 *   { sourceType: 'inline-text', priority: 200 }
 * );
 */
export function defineDropBehavior(
  targetType: string | string[],
  behavior: DropBehavior | 
    ((targetNode: INode, sourceNode: INode, context: DropContext) => DropBehavior | null),
  options?: {
    sourceType?: string | string[];
    priority?: number;
  }
): void {
  globalDropBehaviorRegistry.register({
    targetType,
    sourceType: options?.sourceType,
    behavior,
    priority: options?.priority || 0
  });
}

