# Drop Behavior 구현 계획

## 개요

이 문서는 Drop Behavior의 기본 규칙 구현과 `defineDropBehavior` 함수, 스키마 룰 적용 방법을 정리합니다.

---

## 1. 구현 목표

1. **기본 드롭 규칙 구현**: 내부/외부 드래그에 대한 기본 행위 정의
2. **defineDropBehavior 함수**: 동적 드롭 행위 정의
3. **스키마 dropBehaviorRules**: 정적 드롭 행위 정의
4. **우선순위 기반 규칙 매칭**: 여러 규칙 중 적절한 규칙 선택

---

## 2. 아키텍처 설계

> **중요**: 아키텍처 설계에 대한 자세한 논의는 `drop-behavior-architecture.md`를 참고하세요.

### 2.1 계층 구조

```
UI Layer (EditorViewDOM)
  ↓ DropContext 생성 (Ctrl/Cmd 키, 드래그 위치 등)
DataStore Layer (getDropBehavior)
  ↓ 규칙 매칭 및 행위 결정
Rule Engine Layer
  ├── defineDropBehavior Registry (동적 규칙)
  ├── Schema dropBehaviorRules (기본 규칙 힌트)
  └── Default Rules (내장 규칙)
```

### 2.2 규칙 우선순위

1. **UI 컨텍스트** (최우선)
   - Ctrl/Cmd + 드래그: `copy`
   - Shift + 드래그: 특별한 행위

2. **defineDropBehavior 규칙** (동적 규칙)
   - 함수로 정의된 규칙
   - 우선순위(priority) 기반 매칭
   - EditorViewDOM, Extension, 애플리케이션 레벨에서 정의 가능

3. **스키마 dropBehaviorRules** (기본 규칙 힌트)
   - 스키마에 정의된 소스 타입별 기본 규칙
   - 스키마 재사용 시 기본 동작 보장
   - `defineDropBehavior`로 오버라이드 가능

4. **타입 조합 기본 규칙** (내장 규칙)
   - 텍스트 노드 → 텍스트 노드: `merge`
   - 같은 타입의 block: `move`

5. **기본값** (폴백)
   - 내부 드래그: `move`
   - 외부 드래그: `insert`

### 2.3 스키마 vs defineDropBehavior 역할

**스키마 (`dropBehaviorRules`):**
- 기본 규칙 힌트 제공 (선택적)
- 스키마 정의 시 "이 노드 타입은 이런 기본 동작을 가진다"는 힌트
- 스키마 재사용 시 기본 동작 보장
- `editable`, `selectable`, `draggable`, `droppable` 같은 속성과 일관성

**defineDropBehavior:**
- 동적 규칙 정의 (필요 시)
- EditorViewDOM 초기화 시 에디터별 규칙
- Extension에서 도메인별 규칙
- 애플리케이션 레벨에서 비즈니스 로직 규칙
- 스키마 규칙 오버라이드 가능

---

## 3. 구현 단계

### 3.1 Step 1: 타입 정의

#### DropBehavior 타입

```typescript
// packages/datastore/src/types/drop-behavior.ts
export type DropBehavior = 'move' | 'copy' | 'merge' | 'transform' | 'wrap' | 'replace' | 'insert';

export interface DropContext {
  modifiers?: {
    ctrlKey?: boolean;  // Ctrl 키 (Windows/Linux)
    metaKey?: boolean;  // Cmd 키 (Mac)
    shiftKey?: boolean; // Shift 키
    altKey?: boolean;   // Alt 키
  };
  position?: number;    // 드롭 위치
  dropZone?: 'before' | 'after' | 'inside'; // 드롭 영역
  sourceOrigin?: 'internal' | 'external';   // 내부/외부 드래그
}
```

#### DropBehaviorDefinition 인터페이스

```typescript
export interface DropBehaviorDefinition {
  targetType: string | string[];  // 타겟 노드 타입 (stype 또는 group)
  sourceType?: string | string[]; // 소스 노드 타입 (선택적, 없으면 모든 소스)
  behavior: DropBehavior | 
    ((targetNode: INode, sourceNode: INode, context: DropContext) => DropBehavior);
  priority?: number; // 우선순위 (높을수록 우선, 기본값: 0)
}
```

### 3.2 Step 2: defineDropBehavior Registry 구현

```typescript
// packages/datastore/src/operations/drop-behavior-registry.ts
import type { INode } from '@barocss/model';
import type { DropBehavior, DropContext, DropBehaviorDefinition } from '../types/drop-behavior';

class GlobalDropBehaviorRegistry {
  private behaviors = new Map<string, DropBehaviorDefinition[]>();

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

  get(
    targetType: string, 
    sourceType: string,
    targetNode?: INode,
    sourceNode?: INode,
    context?: DropContext
  ): DropBehavior | null {
    const behaviors = this.behaviors.get(targetType) || [];
    
    // 우선순위 순서로 매칭
    for (const definition of behaviors) {
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
          return definition.behavior(targetNode, sourceNode, context || {});
        }
      } else {
        return definition.behavior;
      }
    }
    
    return null; // 매칭되는 규칙 없음
  }

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
    ((targetNode: INode, sourceNode: INode, context: DropContext) => DropBehavior),
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
```

### 3.3 Step 3: 스키마 확장

```typescript
// packages/schema/src/types.ts
export interface NodeTypeDefinition {
  // ... 기존 속성들
  
  /**
   * Drop Behavior Rules: 소스 노드 타입별 기본 드롭 행위 (힌트)
   * 
   * 이 규칙은 "기본값"으로 사용되며, defineDropBehavior로 오버라이드 가능
   * 
   * 구조:
   * - 키: 소스 노드 타입 (stype) 또는 와일드카드 ('*')
   * - 값: 드롭 행위
   * 
   * 우선순위:
   * 1. 소스 타입 (stype) 정확히 일치
   * 2. 와일드카드 ('*')
   * 
   * 사용 시나리오:
   * - 스키마 정의 시 "이 노드 타입은 이런 기본 동작을 가진다"는 힌트 제공
   * - 스키마 재사용 시 기본 동작 보장
   * - 특정 에디터 인스턴스에서 다른 규칙이 필요하면 defineDropBehavior로 오버라이드
   * 
   * 예시:
   * dropBehaviorRules: {
   *   'inline-text': 'merge',      // inline-text를 드롭하면 병합
   *   'inline-image': 'copy',      // inline-image를 드롭하면 복사
   *   '*': 'move'                  // 기본값: 이동
   * }
   * 
   * 참고:
   * - 이 규칙은 defineDropBehavior보다 우선순위가 낮음
   * - 스키마는 데이터 모델 정의에 집중, 기본 규칙은 힌트일 뿐
   * - 자세한 아키텍처 논의는 drop-behavior-architecture.md 참고
   */
  dropBehaviorRules?: Record<string, DropBehavior>;
}
```

### 3.4 Step 4: 기본 규칙 구현

```typescript
// packages/datastore/src/operations/utility-operations.ts

/**
 * 기본 드롭 행위를 결정합니다.
 * 
 * @param targetNode 타겟 노드
 * @param sourceNode 소스 노드
 * @param context 드롭 컨텍스트
 * @param schema 스키마
 * @returns 드롭 행위
 */
private _getDefaultDropBehavior(
  targetNode: INode,
  sourceNode: INode,
  context: DropContext,
  schema: any
): DropBehavior {
  // 1. 외부 드래그: insert
  if (context.sourceOrigin === 'external') {
    return 'insert';
  }
  
  // 2. 타입 조합 기본 규칙
  // 텍스트 노드 → 텍스트 노드: merge
  if (targetNode.text && sourceNode.text) {
    return 'merge';
  }
  
  // 3. 같은 타입의 block: move
  const targetType = schema?.getNodeType?.(targetNode.stype);
  const sourceType = schema?.getNodeType?.(sourceNode.stype);
  
  if (targetType?.group === 'block' && sourceType?.group === 'block' && 
      targetNode.stype === sourceNode.stype) {
    return 'move';
  }
  
  // 4. 기본값: move (내부 드래그)
  return 'move';
}
```

### 3.5 Step 5: getDropBehavior 구현

```typescript
// packages/datastore/src/operations/utility-operations.ts

/**
 * 드롭 타겟에 소스 노드를 드롭했을 때의 행위를 결정합니다.
 * 
 * @param targetNodeId 드롭 타겟 노드 ID
 * @param sourceNodeId 소스 노드 ID
 * @param context UI 컨텍스트 (선택적)
 * @returns 드롭 행위
 */
getDropBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  context?: DropContext
): DropBehavior {
  const schema = (this.dataStore as any)._activeSchema;
  const targetNode = this.dataStore.getNode(targetNodeId);
  const sourceNode = this.dataStore.getNode(sourceNodeId);
  
  if (!targetNode || !sourceNode) {
    return 'move'; // 기본값
  }
  
  const targetType = schema?.getNodeType?.(targetNode.stype);
  const sourceType = schema?.getNodeType?.(sourceNode.stype);
  const sourceStype = sourceNode.stype;
  const sourceGroup = sourceType?.group;
  
  // 1. UI 컨텍스트 확인 (최우선)
  if (context?.modifiers?.ctrlKey || context?.modifiers?.metaKey) {
    return 'copy'; // Ctrl/Cmd + 드래그 = 복사
  }
  
  // 2. defineDropBehavior 규칙 확인
  const registeredBehavior = globalDropBehaviorRegistry.get(
    targetNode.stype,
    sourceStype,
    targetNode,
    sourceNode,
    context
  );
  
  if (registeredBehavior) {
    return registeredBehavior;
  }
  
  // 3. 스키마의 dropBehaviorRules 확인
  if (targetType?.dropBehaviorRules) {
    const rules = targetType.dropBehaviorRules;
    
    // 소스 타입별 규칙 확인 (우선순위: stype > group > *)
    if (rules[sourceStype]) {
      return rules[sourceStype];
    }
    
    if (sourceGroup && rules[sourceGroup]) {
      return rules[sourceGroup];
    }
    
    if (rules['*']) {
      return rules['*'];
    }
  }
  
  // 4. 타입 조합 기본 규칙
  return this._getDefaultDropBehavior(targetNode, sourceNode, context || {}, schema);
}
```

### 3.6 Step 6: executeDropBehavior 구현

```typescript
// packages/datastore/src/operations/utility-operations.ts

/**
 * 드롭 행위를 실행합니다.
 * 
 * @param targetNodeId 드롭 타겟 노드 ID
 * @param sourceNodeId 소스 노드 ID
 * @param position 드롭 위치
 * @param behavior 드롭 행위 (선택적, 없으면 자동 결정)
 * @param context UI 컨텍스트 (선택적)
 */
async executeDropBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  behavior?: DropBehavior,
  context?: DropContext
): Promise<void> {
  // 드롭 행위 결정
  const finalBehavior = behavior || this.getDropBehavior(targetNodeId, sourceNodeId, context);
  
  switch (finalBehavior) {
    case 'move':
      this.dataStore.content.moveNode(sourceNodeId, targetNodeId, position);
      break;
      
    case 'copy':
      const newNodeId = this.dataStore.content.copyNode(sourceNodeId, targetNodeId);
      // position 조정 (필요시)
      if (position !== undefined) {
        // 복사된 노드의 위치 조정 로직
      }
      break;
      
    case 'merge':
      await this._executeMergeBehavior(targetNodeId, sourceNodeId);
      break;
      
    case 'transform':
      await this._executeTransformBehavior(targetNodeId, sourceNodeId, position);
      break;
      
    case 'wrap':
      await this._executeWrapBehavior(targetNodeId, sourceNodeId);
      break;
      
    case 'replace':
      await this._executeReplaceBehavior(targetNodeId, sourceNodeId);
      break;
      
    case 'insert':
      await this._executeInsertBehavior(targetNodeId, sourceNodeId, position, context);
      break;
      
    default:
      // 기본값: move
      this.dataStore.content.moveNode(sourceNodeId, targetNodeId, position);
  }
}

private async _executeMergeBehavior(
  targetNodeId: string,
  sourceNodeId: string
): Promise<void> {
  const targetNode = this.dataStore.getNode(targetNodeId);
  const sourceNode = this.dataStore.getNode(sourceNodeId);
  
  if (!targetNode || !sourceNode) {
    return;
  }
  
  // 텍스트 노드 병합
  if (targetNode.text && sourceNode.text) {
    this.dataStore.splitMerge.mergeTextNodes(targetNodeId, sourceNodeId);
  }
  // Block 노드 병합
  else if (targetNode.stype === sourceNode.stype) {
    this.dataStore.splitMerge.mergeBlockNodes(targetNodeId, sourceNodeId);
  }
}

private async _executeTransformBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number
): Promise<void> {
  // 소스 노드를 타겟 타입에 맞게 변환
  // 구현 필요
}

private async _executeWrapBehavior(
  targetNodeId: string,
  sourceNodeId: string
): Promise<void> {
  // 소스 노드를 타겟으로 감싸기
  // 구현 필요
}

private async _executeReplaceBehavior(
  targetNodeId: string,
  sourceNodeId: string
): Promise<void> {
  // 타겟 노드를 소스 노드로 대체
  // 구현 필요
}

private async _executeInsertBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  context?: DropContext
): Promise<void> {
  // 외부에서 드래그된 경우 새 노드 생성
  // 구현 필요
}
```

### 3.7 Step 7: DataStore API 노출

```typescript
// packages/datastore/src/data-store.ts

/**
 * 드롭 타겟에 소스 노드를 드롭했을 때의 행위를 결정합니다.
 * 
 * @param targetNodeId 드롭 타겟 노드 ID
 * @param sourceNodeId 소스 노드 ID
 * @param context UI 컨텍스트 (선택적)
 * @returns 드롭 행위
 */
getDropBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  context?: DropContext
): DropBehavior {
  return this.utility.getDropBehavior(targetNodeId, sourceNodeId, context);
}

/**
 * 드롭 행위를 실행합니다.
 * 
 * @param targetNodeId 드롭 타겟 노드 ID
 * @param sourceNodeId 소스 노드 ID
 * @param position 드롭 위치
 * @param behavior 드롭 행위 (선택적, 없으면 자동 결정)
 * @param context UI 컨텍스트 (선택적)
 */
async executeDropBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  behavior?: DropBehavior,
  context?: DropContext
): Promise<void> {
  return this.utility.executeDropBehavior(
    targetNodeId,
    sourceNodeId,
    position,
    behavior,
    context
  );
}
```

### 3.8 Step 8: 기본 규칙 등록

```typescript
// packages/datastore/src/operations/drop-behavior-defaults.ts

import { defineDropBehavior } from './drop-behavior-registry';

/**
 * 기본 드롭 행위 규칙을 등록합니다.
 * 이 함수는 DataStore 초기화 시 호출됩니다.
 */
export function registerDefaultDropBehaviors(): void {
  // 텍스트 노드 → 텍스트 노드: merge
  defineDropBehavior(
    ['inline-text'],
    'merge',
    { sourceType: 'inline-text', priority: 100 }
  );
  
  // 같은 타입의 block: move
  defineDropBehavior(
    ['block'],
    (target, source) => {
      if (target.stype === source.stype) {
        return 'move';
      }
      return 'move';
    },
    { sourceType: 'block', priority: 50 }
  );
  
  // 기본값: move (모든 조합)
  defineDropBehavior(
    '*',
    'move',
    { priority: 0 }
  );
}
```

---

## 4. 사용 예시

### 4.1 스키마에 기본 규칙 정의 (선택적)

```typescript
// 스키마 정의 시 기본 규칙 힌트 제공
const schema = createSchema('example', {
  nodes: {
    'paragraph': {
      name: 'paragraph',
      group: 'block',
      content: 'inline*',
      // 기본 규칙 (선택적, 힌트)
      dropBehaviorRules: {
        'inline-text': 'merge',      // 텍스트는 병합
        'inline-image': 'move',      // 이미지는 이동
        '*': 'move'                  // 기본값: 이동
      }
    },
    'heading': {
      name: 'heading',
      group: 'block',
      content: 'inline*',
      // 규칙 없음 → 기본값 사용
    }
  }
});
```

**스키마에 정의하는 이유:**
- 스키마 재사용 시 기본 동작 보장
- `editable`, `selectable`, `draggable`, `droppable` 같은 속성과 일관성
- "이 노드 타입은 이런 기본 동작을 가진다"는 힌트

**하지만:**
- 스키마 규칙은 "기본값"일 뿐, 필수 아님
- `defineDropBehavior`로 언제든 오버라이드 가능

### 4.2 defineDropBehavior로 규칙 정의 (필요 시)

```typescript
import { defineDropBehavior } from '@barocss/datastore';

// EditorViewDOM 초기화 시
class EditorViewDOM {
  constructor(editor: Editor, options: EditorViewDOMOptions) {
    // 특정 에디터 인스턴스만의 규칙
    defineDropBehavior(
      'paragraph',
      (target, source, context) => {
        // Shift + 드래그 = 복사
        if (context.modifiers?.shiftKey) {
          return 'copy';
        }
        // null 반환 시 스키마 규칙 확인
        return null;
      },
      { priority: 200 }
    );
  }
}

// Extension에서 도메인별 규칙
defineDropBehavior(
  'paragraph',
  (target, source, context) => {
    // 복잡한 로직
    if (source.attributes?.locked && !context.modifiers?.shiftKey) {
      return 'copy'; // 잠긴 노드는 복사만 가능
    }
    if (source.stype === 'inline-text') {
      return 'merge';
    }
    // null 반환 시 다음 우선순위 확인
    return null;
  },
  { priority: 100 }
);

// 특정 소스 타입에 대한 규칙
defineDropBehavior(
  'paragraph',
  'merge',
  { sourceType: 'inline-text', priority: 200 }
);

// 여러 타겟 타입에 대한 규칙
defineDropBehavior(
  ['paragraph', 'heading'],
  'move',
  { sourceType: 'block', priority: 50 }
);
```

**defineDropBehavior 사용 시나리오:**
- EditorViewDOM 초기화 시 에디터별 규칙
- Extension에서 도메인별 규칙
- 애플리케이션 레벨에서 비즈니스 로직 규칙
- 스키마 규칙 오버라이드

### 4.3 UI Layer에서 사용

```typescript
// EditorViewDOM에서 사용
class EditorViewDOM {
  handleDrop(event: DragEvent): void {
    event.preventDefault();
    
    const targetNodeId = this.getDropTargetNodeId(event);
    const sourceNodeId = this.getDraggedNodeId(event);
    const position = this.getDropPosition(event);
    
    // UI 컨텍스트 생성
    const context: DropContext = {
      modifiers: {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey
      },
      position: position,
      dropZone: this.getDropZone(event),
      sourceOrigin: this.getSourceOrigin(event) // 'internal' 또는 'external'
    };
    
    // 드롭 행위 결정
    const behavior = this.editor.dataStore.getDropBehavior(
      targetNodeId,
      sourceNodeId,
      context
    );
    
    // 드롭 행위 실행
    await this.editor.dataStore.executeDropBehavior(
      targetNodeId,
      sourceNodeId,
      position,
      behavior,
      context
    );
  }
}
```

---

## 5. 구현 순서

### Phase 1: 기본 구조
1. 타입 정의 (`DropBehavior`, `DropContext`, `DropBehaviorDefinition`)
2. `defineDropBehavior` Registry 구현
3. 스키마에 `dropBehaviorRules` 추가

### Phase 2: 기본 규칙
4. 기본 드롭 행위 결정 로직 구현
5. `getDropBehavior` 구현
6. 기본 규칙 등록 (`registerDefaultDropBehaviors`)

### Phase 3: 실행 로직
7. `executeDropBehavior` 구현
8. 각 행위별 실행 함수 구현 (merge, transform, wrap, replace, insert)

### Phase 4: 통합
9. DataStore API 노출
10. UI Layer 통합
11. 테스트 코드 작성

---

## 6. 파일 구조

```
packages/datastore/src/
├── types/
│   └── drop-behavior.ts          # 타입 정의
├── operations/
│   ├── drop-behavior-registry.ts  # defineDropBehavior Registry
│   ├── drop-behavior-defaults.ts # 기본 규칙 등록
│   └── utility-operations.ts      # getDropBehavior, executeDropBehavior
└── data-store.ts                  # DataStore API 노출

packages/schema/src/
└── types.ts                       # dropBehaviorRules 추가

packages/datastore/test/
└── drop-behavior.test.ts         # 테스트 코드
```

---

## 7. 테스트 계획

### 7.1 기본 규칙 테스트
- 내부 드래그: `move`
- Ctrl/Cmd + 드래그: `copy`
- 외부 드래그: `insert`
- 텍스트 노드 → 텍스트 노드: `merge`

### 7.2 defineDropBehavior 테스트
- 기본 규칙 등록 및 매칭
- 우선순위 기반 규칙 매칭
- 동적 함수 규칙

### 7.3 스키마 dropBehaviorRules 테스트
- 소스 타입별 규칙 매칭
- 그룹별 규칙 매칭
- 와일드카드 규칙 매칭

### 7.4 executeDropBehavior 테스트
- 각 행위별 실행 테스트
- 에러 처리 테스트

---

## 8. 주의사항

### 8.1 순환 참조 방지
- `drop-behavior-registry.ts`는 `DataStore`에 의존하지 않도록 설계
- `utility-operations.ts`에서 Registry 사용

### 8.2 성능 고려
- 규칙 매칭 시 우선순위 기반 조기 종료
- 자주 사용되는 규칙은 캐싱 고려

### 8.3 확장성
- 새로운 Drop Behavior 타입 추가 가능
- 커스텀 행위 실행 함수 등록 가능

---

## 9. 참고 자료

- `packages/datastore/docs/drop-behavior-architecture.md`: 아키텍처 설계 및 스키마 vs defineDropBehavior 역할
- `packages/datastore/docs/drop-behavior-spec.md`: Drop Behavior 명세
- `packages/datastore/docs/drop-behavior-implementation-options.md`: 구현 옵션 비교
- `packages/model/src/operations/define-operation.ts`: Operation 정의 패턴

