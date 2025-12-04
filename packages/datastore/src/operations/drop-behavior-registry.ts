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
      // priority로 정렬 (높은 우선순위가 먼저)
      this.behaviors.get(targetType)!.sort((a, b) => 
        (b.priority || 0) - (a.priority || 0)
      );
    });
  }

  /**
   * 타겟 타입과 소스 타입에 맞는 규칙을 찾아 행위를 반환합니다.
   * 
   * @param targetType 타겟 노드 타입 (stype)
   * @param sourceType 소스 노드 타입 (stype)
   * @param targetNode 타겟 노드 (선택적)
   * @param sourceNode 소스 노드 (선택적)
   * @param context 드롭 컨텍스트 (선택적)
   * @returns 드롭 행위 또는 null (매칭되는 규칙 없음)
   */
  get(
    targetType: string, 
    sourceType: string,
    targetNode?: INode,
    sourceNode?: INode,
    context?: DropContext
  ): DropBehavior | null {
    // 타겟 타입별 규칙 확인
    const behaviors = this.behaviors.get(targetType) || [];
    
    // 와일드카드 규칙도 확인
    const wildcardBehaviors = this.behaviors.get('*') || [];
    const allBehaviors = [...behaviors, ...wildcardBehaviors];
    
    // 우선순위 순서로 매칭
    for (const definition of allBehaviors) {
      // sourceType 매칭 확인
      if (definition.sourceType) {
        const sourceTypes = Array.isArray(definition.sourceType) 
          ? definition.sourceType 
          : [definition.sourceType];
        
        if (!sourceTypes.includes(sourceType) && !sourceTypes.includes('*')) {
          continue; // 매칭되지 않음
        }
      }
      
      // behavior 결정
      if (typeof definition.behavior === 'function') {
        if (targetNode && sourceNode) {
          const result = definition.behavior(targetNode, sourceNode, context || {});
          if (result !== null) {
            return result;
          }
          // null 반환 시 다음 규칙 확인
          continue;
        }
      } else {
        return definition.behavior;
      }
    }
    
    return null; // 매칭되는 규칙 없음
  }

  /**
   * 모든 규칙을 제거합니다.
   */
  clear(): void {
    this.behaviors.clear();
  }
}

export const globalDropBehaviorRegistry = new GlobalDropBehaviorRegistry();

/**
 * Drop Behavior를 정의합니다.
 * 
 * @param targetType 타겟 노드 타입 (stype 또는 group) 또는 배열
 * @param behavior 드롭 행위 또는 함수
 * @param options 옵션 (sourceType, priority)
 * 
 * @example
 * // 기본 드롭 행위 정의
 * defineDropBehavior('paragraph', 'move');
 * 
 * // 동적 드롭 행위 정의
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
 * // 특정 소스 타입에 대한 규칙
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

