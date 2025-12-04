# Drop Behavior 명세

## 개요

이 문서는 드롭 앤 드롭 시 **드롭 타겟에 소스 노드가 들어올 때의 행위**를 정의합니다.

---

## 1. Drop Behavior란?

**Drop Behavior**는 드롭 타겟에 소스 노드를 드롭했을 때 수행되는 행위입니다.

### 핵심 개념

- **드롭 타겟**: 드롭을 받는 노드 (droppable node)
- **소스 노드**: 드래그되어 드롭되는 노드 (draggable node)
- **행위**: 드롭 시 수행되는 작업 (Move, Copy, Merge, Transform 등)

### Drop Behavior 타입

#### 1. Move (이동)
- **의미**: 소스 노드를 원본 위치에서 제거하고 드롭 타겟에 삽입
- **기본 행위**: 대부분의 경우 기본값
- **예시**: paragraph를 다른 위치로 이동

#### 2. Copy (복사)
- **의미**: 소스 노드를 복사하여 드롭 타겟에 삽입 (원본 유지)
- **사용 케이스**: Ctrl/Cmd + 드래그, 외부에서 드래그
- **예시**: 이미지를 복사하여 여러 곳에 배치

#### 3. Merge (병합)
- **의미**: 소스 노드를 드롭 타겟과 병합
- **사용 케이스**: 텍스트 노드 병합, block 병합
- **예시**: 텍스트 노드를 다른 텍스트 노드에 드롭하여 병합

#### 4. Transform (변환)
- **의미**: 소스 노드를 드롭 타겟의 타입에 맞게 변환하여 삽입
- **사용 케이스**: block을 inline으로 변환, 특정 타입으로 변환
- **예시**: heading을 paragraph로 변환하여 삽입

#### 5. Wrap (감싸기)
- **의미**: 소스 노드를 드롭 타겟으로 감싸기
- **사용 케이스**: block을 다른 block으로 감싸기
- **예시**: paragraph를 blockQuote로 감싸기

#### 6. Replace (대체)
- **의미**: 드롭 타겟을 소스 노드로 대체
- **사용 케이스**: 드롭 타겟을 완전히 교체
- **예시**: 기존 이미지를 새 이미지로 교체

---

## 2. Drop Behavior 정의 방법

### 2.1 스키마 vs UI 기준 구분

**핵심 원칙**: 
- **스키마 기준**: 데이터 모델 레벨의 기본 규칙 (일관성, 재사용성)
- **UI 기준**: 사용자 인터랙션 컨텍스트 (키보드 수정자, 드래그 위치 등)

#### 스키마 기준 정의
- **Target-Source 조합별 기본 행위**: 어떤 타입의 노드를 어떤 타입의 노드에 드롭할 때의 기본 행위
- **데이터 무결성 보장**: 스키마 레벨에서 정의하여 일관된 동작 보장
- **재사용성**: 여러 UI 컨텍스트에서 동일한 규칙 적용

#### UI 기준 정의
- **컨텍스트 정보**: Ctrl/Cmd 키, Shift 키, 드래그 위치 등
- **사용자 의도 반영**: 키보드 수정자에 따른 행위 변경 (예: Ctrl+드래그 = Copy)
- **시각적 피드백**: 드롭 가능 여부, 드롭 행위 미리보기

### 2.2 Target-Source 조합별 정의

#### 방법 1: 스키마에 dropBehaviorRules 추가

```typescript
interface NodeTypeDefinition {
  // ... 기존 속성들
  /**
   * Drop Behavior Rules: 소스 노드 타입별 드롭 행위 정의
   * 
   * 구조:
   * - 키: 소스 노드 타입 (stype) 또는 그룹 (group)
   * - 값: 드롭 행위 ('move' | 'copy' | 'merge' | 'transform' | 'wrap' | 'replace')
   * 
   * 예시:
   * dropBehaviorRules: {
   *   'inline-text': 'merge',      // inline-text를 드롭하면 병합
   *   'inline-image': 'copy',      // inline-image를 드롭하면 복사
   *   'paragraph': 'move',        // paragraph를 드롭하면 이동
   *   'block': 'move',            // 모든 block 노드를 드롭하면 이동
   *   '*': 'move'                 // 기본값: 이동
   * }
   */
  dropBehaviorRules?: Record<string, DropBehavior>;
  
  /**
   * Drop Behavior: 기본 드롭 행위 (dropBehaviorRules가 없을 때 사용)
   * 
   * 타입:
   * - 'move': 소스 노드를 이동 (기본값)
   * - 'copy': 소스 노드를 복사
   * - 'merge': 소스 노드를 병합
   * - 'transform': 소스 노드를 변환
   * - 'wrap': 소스 노드를 감싸기
   * - 'replace': 드롭 타겟을 소스 노드로 대체
   * - 함수: 동적으로 행위 결정
   */
  dropBehavior?: DropBehavior | 
    ((targetNode: INode, sourceNode: INode) => DropBehavior);
}
```

#### 방법 2: 별도 규칙 엔진 (권장)

```typescript
/**
 * Drop Behavior Rule Engine
 * Target-Source 조합별 행위를 정의하는 규칙 엔진
 */
interface DropBehaviorRule {
  targetType: string | string[];  // 타겟 노드 타입 (stype 또는 group)
  sourceType: string | string[]; // 소스 노드 타입 (stype 또는 group)
  behavior: DropBehavior | ((targetNode: INode, sourceNode: INode) => DropBehavior);
  priority?: number; // 우선순위 (높을수록 우선)
}

// 규칙 예시
const dropBehaviorRules: DropBehaviorRule[] = [
  // 텍스트 노드 → 텍스트 노드: 병합
  {
    targetType: ['inline-text'],
    sourceType: ['inline-text'],
    behavior: 'merge',
    priority: 100
  },
  // 같은 타입의 block: 이동
  {
    targetType: ['block'],
    sourceType: ['block'],
    behavior: (target, source) => {
      return target.stype === source.stype ? 'move' : 'move';
    },
    priority: 50
  },
  // 기본값: 이동
  {
    targetType: '*',
    sourceType: '*',
    behavior: 'move',
    priority: 0
  }
];
```

#### 방법 3: 매트릭스 형태 정의

```typescript
/**
 * Drop Behavior Matrix
 * Target 타입별 Source 타입별 행위 매트릭스
 */
type DropBehaviorMatrix = Record<string, Record<string, DropBehavior>>;

const dropBehaviorMatrix: DropBehaviorMatrix = {
  'paragraph': {
    'inline-text': 'merge',
    'inline-image': 'move',
    'paragraph': 'move',
    '*': 'move'  // 기본값
  },
  'heading': {
    'inline-text': 'merge',
    'inline-image': 'move',
    'heading': 'move',
    '*': 'move'
  },
  'document': {
    'block': 'move',
    '*': 'move'
  },
  '*': {  // 모든 타겟에 대한 기본값
    '*': 'move'
  }
};
```

### 2.3 구현 구조

#### 계층 구조

```
UI Layer (EditorViewDOM)
  ↓ 컨텍스트 정보 추가 (Ctrl/Cmd 키, 드래그 위치 등)
DataStore Layer (getDropBehavior)
  ↓ Target-Source 조합 확인
Schema Layer (dropBehaviorRules)
  ↓ 기본 규칙 적용
Default Behavior ('move')
```

#### 구현 예시

```typescript
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
  const schema = this.dataStore.getActiveSchema();
  const targetNode = this.dataStore.getNode(targetNodeId);
  const sourceNode = this.dataStore.getNode(sourceNodeId);
  
  if (!targetNode || !sourceNode || !schema) {
    return 'move'; // 기본값
  }
  
  const targetType = schema.getNodeType(targetNode.stype);
  const sourceType = schema.getNodeType(sourceNode.stype);
  
  // 1. UI 컨텍스트 확인 (최우선)
  if (context?.modifiers?.ctrlKey || context?.modifiers?.metaKey) {
    return 'copy'; // Ctrl/Cmd + 드래그 = 복사
  }
  
  // 2. 스키마의 dropBehaviorRules 확인
  if (targetType?.dropBehaviorRules) {
    const rules = targetType.dropBehaviorRules;
    
    // 소스 타입별 규칙 확인
    if (rules[sourceNode.stype]) {
      return rules[sourceNode.stype];
    }
    
    // 소스 그룹별 규칙 확인
    if (sourceType?.group && rules[sourceType.group]) {
      return rules[sourceType.group];
    }
    
    // 와일드카드 규칙 확인
    if (rules['*']) {
      return rules['*'];
    }
  }
  
  // 3. 스키마의 dropBehavior 함수 확인
  if (targetType?.dropBehavior && typeof targetType.dropBehavior === 'function') {
    return targetType.dropBehavior(targetNode, sourceNode);
  }
  
  // 4. 타입 조합에 따른 기본 규칙
  // 텍스트 노드 → 텍스트 노드: merge
  if (targetNode.text && sourceNode.text) {
    return 'merge';
  }
  
  // 같은 타입의 block: move
  if (targetType?.group === 'block' && sourceType?.group === 'block' && 
      targetNode.stype === sourceNode.stype) {
    return 'move';
  }
  
  // 5. 기본값: move
  return 'move';
}
```

#### DropContext 인터페이스

```typescript
interface DropContext {
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

---

## 3. Drop Behavior 구현

### 3.1 Move (이동)

```typescript
function executeMoveBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  dataStore: DataStore
): void {
  // moveNode operation 실행
  dataStore.content.moveNode(sourceNodeId, targetNodeId, position);
}
```

### 3.2 Copy (복사)

```typescript
function executeCopyBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  dataStore: DataStore
): string {
  // copyNode operation 실행
  const newNodeId = dataStore.content.copyNode(sourceNodeId, targetNodeId);
  // position 조정 (필요시)
  return newNodeId;
}
```

### 3.3 Merge (병합)

```typescript
function executeMergeBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  dataStore: DataStore
): void {
  const targetNode = dataStore.getNode(targetNodeId);
  const sourceNode = dataStore.getNode(sourceNodeId);
  
  // 텍스트 노드 병합
  if (targetNode.text && sourceNode.text) {
    dataStore.splitMerge.mergeTextNodes(targetNodeId, sourceNodeId);
  }
  // Block 노드 병합
  else if (targetNode.stype === sourceNode.stype) {
    dataStore.splitMerge.mergeBlockNodes(targetNodeId, sourceNodeId);
  }
}
```

### 3.4 Transform (변환)

```typescript
function executeTransformBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  dataStore: DataStore
): string {
  const targetNode = dataStore.getNode(targetNodeId);
  const sourceNode = dataStore.getNode(sourceNodeId);
  
  // 소스 노드를 타겟 타입에 맞게 변환
  const transformedNode = transformNode(sourceNode, targetNode.stype);
  const newNodeId = dataStore.createNode(transformedNode);
  
  // 타겟에 삽입
  dataStore.content.addChild(targetNodeId, newNodeId, position);
  
  // 원본 제거 (필요시)
  if (sourceNode.parentId) {
    dataStore.content.removeChild(sourceNode.parentId, sourceNodeId);
  }
  
  return newNodeId;
}
```

### 3.5 Wrap (감싸기)

```typescript
function executeWrapBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  dataStore: DataStore
): string {
  // 소스 노드를 타겟 타입으로 감싸기
  const wrapperNode = {
    stype: targetNode.stype,
    content: [sourceNodeId]
  };
  
  const wrapperNodeId = dataStore.createNode(wrapperNode);
  
  // 원본 위치에 삽입
  if (sourceNode.parentId) {
    const position = dataStore.getNode(sourceNode.parentId)?.content?.indexOf(sourceNodeId);
    dataStore.content.addChild(sourceNode.parentId, wrapperNodeId, position);
    dataStore.content.removeChild(sourceNode.parentId, sourceNodeId);
  }
  
  return wrapperNodeId;
}
```

### 3.6 Replace (대체)

```typescript
function executeReplaceBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  dataStore: DataStore
): void {
  const targetNode = dataStore.getNode(targetNodeId);
  
  // 타겟 노드를 소스 노드로 대체
  if (targetNode.parentId) {
    const position = dataStore.getNode(targetNode.parentId)?.content?.indexOf(targetNodeId);
    dataStore.content.moveNode(sourceNodeId, targetNode.parentId, position);
    dataStore.deleteNode(targetNodeId);
  }
}
```

---

## 4. Drop Behavior 결정 우선순위

### 4.1 우선순위 순서

1. **스키마의 dropBehavior 속성** (최우선)
   - 타겟 노드 타입에 명시적으로 정의된 경우
   - 함수인 경우: 동적으로 결정

2. **타입 조합 규칙**
   - 텍스트 노드 → 텍스트 노드: `merge`
   - 같은 타입의 block: `move`
   - block → inline: `transform` 또는 `move`

3. **기본값**
   - 그 외의 경우: `move`

### 4.2 구현 예시

```typescript
getDropBehavior(targetNodeId: string, sourceNodeId: string): DropBehavior {
  const schema = this.dataStore.getActiveSchema();
  if (!schema) {
    return 'move'; // 기본값
  }
  
  const targetNode = this.dataStore.getNode(targetNodeId);
  const sourceNode = this.dataStore.getNode(sourceNodeId);
  
  if (!targetNode || !sourceNode) {
    return 'move';
  }
  
  const targetType = schema.getNodeType(targetNode.stype);
  const sourceType = schema.getNodeType(sourceNode.stype);
  
  // 1. 스키마에 명시적으로 정의된 경우
  if (targetType?.dropBehavior) {
    if (typeof targetType.dropBehavior === 'function') {
      return targetType.dropBehavior(targetNode, sourceNode);
    }
    return targetType.dropBehavior;
  }
  
  // 2. 타입 조합에 따른 기본 규칙
  // 텍스트 노드 → 텍스트 노드: merge
  if (targetNode.text && sourceNode.text) {
    return 'merge';
  }
  
  // 같은 타입의 block: move
  if (targetType?.group === 'block' && sourceType?.group === 'block' && 
      targetNode.stype === sourceNode.stype) {
    return 'move';
  }
  
  // 3. 기본값: move
  return 'move';
}
```

---

## 5. 사용 케이스

### 5.1 기본 드롭 (Move)

```typescript
// paragraph를 다른 위치로 이동
const behavior = dataStore.getDropBehavior('paragraph-2', 'paragraph-1');
// behavior: 'move'

// moveNode operation 실행
await transaction(editor, [
  {
    type: 'moveNode',
    payload: {
      nodeId: 'paragraph-1',
      newParentId: 'document-1',
      position: 2
    }
  }
]).commit();
```

### 5.2 텍스트 병합 (Merge)

```typescript
// 텍스트 노드를 다른 텍스트 노드에 드롭하여 병합
const behavior = dataStore.getDropBehavior('text-2', 'text-1');
// behavior: 'merge'

// mergeTextNodes operation 실행
await transaction(editor, [
  {
    type: 'mergeTextNodes',
    payload: {
      leftNodeId: 'text-2',
      rightNodeId: 'text-1'
    }
  }
]).commit();
```

### 5.3 이미지 복사 (Copy)

```typescript
// 이미지를 복사하여 여러 곳에 배치
const behavior = dataStore.getDropBehavior('paragraph-2', 'image-1');
// behavior: 'copy' (스키마에 정의된 경우)

// copyNode operation 실행
await transaction(editor, [
  {
    type: 'copyNode',
    payload: {
      nodeId: 'image-1',
      newParentId: 'paragraph-2'
    }
  }
]).commit();
```

---

## 6. 권장 구현 방안

### 6.1 스키마 확장 (권장)

```typescript
interface NodeTypeDefinition {
  // ... 기존 속성들
  
  /**
   * Drop Behavior Rules: 소스 노드 타입별 드롭 행위 정의
   * 
   * 구조:
   * - 키: 소스 노드 타입 (stype) 또는 그룹 (group) 또는 와일드카드 ('*')
   * - 값: 드롭 행위
   * 
   * 우선순위:
   * 1. 소스 타입 (stype) 정확히 일치
   * 2. 소스 그룹 (group) 일치
   * 3. 와일드카드 ('*')
   * 
   * 예시:
   * dropBehaviorRules: {
   *   'inline-text': 'merge',      // inline-text를 드롭하면 병합
   *   'inline-image': 'copy',      // inline-image를 드롭하면 복사
   *   'block': 'move',             // 모든 block을 드롭하면 이동
   *   '*': 'move'                  // 기본값: 이동
   * }
   */
  dropBehaviorRules?: Record<string, DropBehavior>;
  
  /**
   * Drop Behavior: 기본 드롭 행위 (dropBehaviorRules가 없을 때 사용)
   * 함수인 경우: 동적으로 행위 결정
   */
  dropBehavior?: DropBehavior | 
    ((targetNode: INode, sourceNode: INode) => DropBehavior);
}
```

### 6.2 DataStore API 추가

```typescript
// DataStore에 추가
interface DataStore {
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
  ): DropBehavior;
  
  /**
   * 드롭 행위를 실행합니다.
   * 
   * @param targetNodeId 드롭 타겟 노드 ID
   * @param sourceNodeId 소스 노드 ID
   * @param position 드롭 위치
   * @param behavior 드롭 행위 (선택적, 없으면 자동 결정)
   * @param context UI 컨텍스트 (선택적)
   */
  executeDropBehavior(
    targetNodeId: string,
    sourceNodeId: string,
    position: number,
    behavior?: DropBehavior,
    context?: DropContext
  ): Promise<void>;
}
```

### 6.3 UI Layer 통합

```typescript
// EditorViewDOM에서 사용
class EditorViewDOM {
  handleDrop(event: DragEvent): void {
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
      sourceOrigin: this.getSourceOrigin(event)
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

### 6.2 API 추가

```typescript
// DataStore에 추가
getDropBehavior(targetNodeId: string, sourceNodeId: string): DropBehavior;
executeDropBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  position: number,
  behavior?: DropBehavior
): Promise<void>;
```

### 6.3 확장 가능한 구조

```typescript
// Drop Behavior Handler 인터페이스
interface DropBehaviorHandler {
  canHandle(behavior: DropBehavior): boolean;
  execute(
    targetNodeId: string,
    sourceNodeId: string,
    position: number,
    dataStore: DataStore
  ): Promise<void>;
}

// Handler 등록
registerDropBehaviorHandler(behavior: DropBehavior, handler: DropBehaviorHandler);
```

---

## 7. 요약

### Drop Behavior의 정의

1. **드롭 타겟에 소스 노드가 들어올 때의 행위**
2. **스키마 레벨 또는 함수 레벨에서 정의 가능**
3. **타입 조합에 따른 기본 규칙 적용**

### Drop Behavior 타입

- **Move**: 소스 노드를 이동 (기본값)
- **Copy**: 소스 노드를 복사
- **Merge**: 소스 노드를 병합
- **Transform**: 소스 노드를 변환
- **Wrap**: 소스 노드를 감싸기
- **Replace**: 드롭 타겟을 소스 노드로 대체

### 결정 우선순위

1. **스키마의 dropBehavior 속성** (최우선)
2. **타입 조합 규칙** (텍스트 병합, 같은 타입 이동 등)
3. **기본값** (move)

---

## 8. 함수 기반 정의 (defineDropBehavior)

### 8.1 defineDropBehavior 패턴

기존 `defineOperation` 패턴과 일관성을 유지하면서 Drop Behavior를 정의합니다.

```typescript
// Drop Behavior 정의 함수
defineDropBehavior(
  targetType: string | string[],
  behavior: DropBehavior | 
    ((targetNode: INode, sourceNode: INode, context: DropContext) => DropBehavior),
  options?: {
    sourceType?: string | string[];
    priority?: number;
  }
): void;
```

### 8.2 사용 예시

```typescript
// 기본 드롭 행위 정의
defineDropBehavior('paragraph', 'move');

// 동적 드롭 행위 정의
defineDropBehavior(
  'paragraph',
  (target, source, context) => {
    if (source.stype === 'inline-text') {
      return 'merge';
    }
    if (source.stype === 'inline-image' && context.modifiers?.ctrlKey) {
      return 'copy';
    }
    return 'move';
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

### 8.3 스키마 vs 함수 기반 비교

| 구분 | 스키마 기반 | 함수 기반 |
|------|------------|-----------|
| **명시성** | 높음 (스키마에 직접 정의) | 중간 (별도 등록) |
| **유연성** | 낮음 (정적 규칙) | 높음 (동적 로직) |
| **확장성** | 낮음 | 높음 |
| **일관성** | 높음 (스키마와 함께 관리) | 중간 |
| **복잡도** | 낮음 | 중간 |

### 8.4 하이브리드 접근 (권장)

**기본 규칙**: 스키마의 `dropBehaviorRules` (명시적, 간단한 규칙)
**복잡한 규칙**: `defineDropBehavior` 함수 (동적, 복잡한 로직)

```typescript
// 1. 스키마에 기본 규칙 정의
const schema = new Schema('example', {
  nodes: {
    'paragraph': {
      dropBehaviorRules: {
        'inline-text': 'merge',  // 간단한 규칙
        '*': 'move'
      }
    }
  }
});

// 2. 복잡한 규칙은 함수로 정의
defineDropBehavior(
  'paragraph',
  (target, source, context) => {
    // 복잡한 로직
    if (source.attributes?.locked && !context.modifiers?.shiftKey) {
      return 'copy'; // 잠긴 노드는 복사만 가능
    }
    // ...
  },
  { priority: 100 }
);
```

---

## 9. 다른 에디터들의 접근 방식

### 9.1 ProseMirror

**방식**: 플러그인 기반 + 스키마 규칙

```typescript
// ProseMirror는 플러그인으로 드롭 행위 정의
const dropBehaviorPlugin = new Plugin({
  props: {
    handleDrop(view, event, slice, moved) {
      // 드롭 행위 결정 및 실행
      if (moved) {
        // 이동
      } else {
        // 복사
      }
    }
  }
});
```

**특징:**
- 플러그인 시스템 활용
- 스키마의 `content` 정의 기반으로 기본 규칙 적용
- 커스텀 드롭 행위는 플러그인에서 처리

### 9.2 Slate.js

**방식**: 핸들러 함수 기반

```typescript
// Slate.js는 핸들러 함수로 드롭 행위 정의
const editor = {
  handlers: {
    onDrop: (event, editor) => {
      // 드롭 행위 결정 및 실행
      if (event.dataTransfer.effectAllowed === 'copy') {
        // 복사
      } else {
        // 이동
      }
    }
  }
};
```

**특징:**
- 핸들러 함수 기반
- 이벤트 기반 처리
- 유연하지만 일관성 유지가 어려울 수 있음

### 9.3 TinyMCE

**방식**: 설정 기반 + 플러그인

```typescript
// TinyMCE는 설정과 플러그인으로 드롭 행위 정의
tinymce.init({
  plugins: 'dragdrop',
  dragdrop_config: {
    behavior: 'move', // 또는 'copy'
    rules: {
      'paragraph': { 'image': 'copy', '*': 'move' }
    }
  }
});
```

**특징:**
- 설정 기반 기본 동작
- 플러그인으로 확장
- 규칙 기반 매칭

---

## 10. 구현 계획

자세한 구현 계획은 다음 문서를 참고하세요:
- `packages/datastore/docs/drop-behavior-implementation-plan.md`: 구현 계획 및 단계별 가이드

### 10.1 구현 순서

1. **Phase 1: 기본 구조**
   - 타입 정의
   - `defineDropBehavior` Registry 구현
   - 스키마에 `dropBehaviorRules` 추가

2. **Phase 2: 기본 규칙**
   - 기본 드롭 행위 결정 로직
   - `getDropBehavior` 구현
   - 기본 규칙 등록

3. **Phase 3: 실행 로직**
   - `executeDropBehavior` 구현
   - 각 행위별 실행 함수 구현

4. **Phase 4: 통합**
   - DataStore API 노출
   - UI Layer 통합
   - 테스트 코드 작성

---

## 11. 참고 자료

- `packages/datastore/src/operations/content-operations.ts`: moveNode, copyNode 구현
- `packages/datastore/src/operations/split-merge-operations.ts`: mergeTextNodes, mergeBlockNodes 구현
- `packages/model/src/operations/moveNode.ts`: moveNode operation
- `packages/model/src/operations/copyNode.ts`: copyNode operation
- `packages/model/src/operations/define-operation.ts`: Operation 정의 패턴
- `packages/datastore/docs/droppable-node-spec.md`: Droppable Node 명세
- `packages/datastore/docs/drop-behavior-implementation-options.md`: 구현 옵션 비교
- `packages/datastore/docs/drop-behavior-implementation-plan.md`: 구현 계획 및 단계별 가이드

