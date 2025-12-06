# Drop Behavior 구현 옵션 비교

## 개요

이 문서는 Drop Behavior를 정의하는 다양한 방법을 비교하고, 다른 에디터들의 접근 방식을 분석합니다.

---

## 1. 구현 방법 비교

### 방법 1: 스키마 기반 정의 (Static)

```typescript
// 스키마에 직접 정의
const schema = new Schema('example', {
  nodes: {
    'paragraph': {
      name: 'paragraph',
      dropBehaviorRules: {
        'inline-text': 'merge',
        'inline-image': 'copy',
        '*': 'move'
      }
    }
  }
});
```

**장점:**
- 명시적이고 직관적
- 스키마와 함께 관리되어 일관성 유지
- 타입 안정성

**단점:**
- 복잡한 로직 표현이 어려움
- 동적 결정이 제한적
- 확장성이 낮음

### 방법 2: 함수 기반 정의 (Dynamic) - 권장

```typescript
// defineDropBehavior 패턴
defineDropBehavior(
  'paragraph',
  (targetNode: INode, sourceNode: INode, context: DropContext) => {
    // 동적 로직
    if (sourceNode.stype === 'inline-text') {
      return 'merge';
    }
    if (sourceNode.stype === 'inline-image' && context.modifiers?.ctrlKey) {
      return 'copy';
    }
    return 'move';
  }
);
```

**장점:**
- 복잡한 로직 표현 가능
- 동적 결정 가능
- 컨텍스트 활용 가능
- 확장성 높음

**단점:**
- 스키마와 분리되어 관리
- 타입 안정성이 낮을 수 있음

### 방법 3: 하이브리드 (스키마 + 함수)

```typescript
// 스키마에 함수 참조
const schema = new Schema('example', {
  nodes: {
    'paragraph': {
      name: 'paragraph',
      dropBehavior: defineDropBehavior('paragraph', (target, source, context) => {
        // ...
      })
    }
  }
});
```

**장점:**
- 스키마와 함수의 장점 결합
- 명시적이면서도 유연함

**단점:**
- 구현 복잡도 증가

---

## 2. 다른 에디터들의 접근 방식

### 2.1 ProseMirror

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

### 2.2 Slate.js

**방식**: 핸들러 함수 기반

```typescript
// Slate.js는 핸들러 함수로 드롭 행위 정의
const editor = {
  // ...
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

### 2.3 TinyMCE

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

### 2.4 Draft.js

**방식**: 핸들러 함수 기반

```typescript
// Draft.js는 핸들러 함수로 드롭 행위 정의
const editor = {
  handleDrop: (selection, dataTransfer) => {
    // 드롭 행위 결정 및 실행
    // ...
  }
};
```

**특징:**
- 핸들러 함수 기반
- 이벤트 기반 처리

---

## 3. 권장 구현 방식

### 3.1 defineDropBehavior 패턴 (권장)

기존 `defineOperation` 패턴과 일관성을 유지하면서 Drop Behavior를 정의합니다.

```typescript
// Drop Behavior 정의 인터페이스
export interface DropBehaviorDefinition {
  targetType: string | string[];  // 타겟 노드 타입
  sourceType?: string | string[]; // 소스 노드 타입 (선택적, 없으면 모든 소스)
  behavior: DropBehavior | 
    ((targetNode: INode, sourceNode: INode, context: DropContext) => DropBehavior);
  priority?: number; // 우선순위
}

// Global Drop Behavior Registry
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
      // priority로 정렬
      this.behaviors.get(targetType)!.sort((a, b) => 
        (b.priority || 0) - (a.priority || 0)
      );
    });
  }

  get(targetType: string, sourceType: string): DropBehaviorDefinition | undefined {
    const behaviors = this.behaviors.get(targetType) || [];
    return behaviors.find(b => {
      if (!b.sourceType) return true; // 와일드카드
      const sourceTypes = Array.isArray(b.sourceType) ? b.sourceType : [b.sourceType];
      return sourceTypes.includes(sourceType) || sourceTypes.includes('*');
    });
  }
}

export const globalDropBehaviorRegistry = new GlobalDropBehaviorRegistry();

// Drop Behavior 정의 함수
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

### 3.2 사용 예시

```typescript
// 기본 드롭 행위 정의
defineDropBehavior('paragraph', 'move');

// 소스 타입별 드롭 행위 정의
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

### 3.3 DataStore 통합

```typescript
// DataStore에서 사용
getDropBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  context?: DropContext
): DropBehavior {
  const targetNode = this.getNode(targetNodeId);
  const sourceNode = this.getNode(sourceNodeId);
  
  if (!targetNode || !sourceNode) {
    return 'move';
  }
  
  // 1. UI 컨텍스트 확인 (최우선)
  if (context?.modifiers?.ctrlKey || context?.modifiers?.metaKey) {
    return 'copy';
  }
  
  // 2. 등록된 Drop Behavior 확인
  const definition = globalDropBehaviorRegistry.get(
    targetNode.stype,
    sourceNode.stype
  );
  
  if (definition) {
    if (typeof definition.behavior === 'function') {
      return definition.behavior(targetNode, sourceNode, context || {});
    }
    return definition.behavior;
  }
  
  // 3. 스키마의 dropBehaviorRules 확인
  const schema = this.getActiveSchema();
  if (schema) {
    const targetType = schema.getNodeType(targetNode.stype);
    if (targetType?.dropBehaviorRules) {
      const rules = targetType.dropBehaviorRules;
      if (rules[sourceNode.stype]) {
        return rules[sourceNode.stype];
      }
      if (sourceType?.group && rules[sourceType.group]) {
        return rules[sourceType.group];
      }
      if (rules['*']) {
        return rules['*'];
      }
    }
  }
  
  // 4. 타입 조합 기본 규칙
  if (targetNode.text && sourceNode.text) {
    return 'merge';
  }
  
  // 5. 기본값
  return 'move';
}
```

---

## 4. 비교표

| 방법 | 명시성 | 유연성 | 확장성 | 일관성 | 복잡도 |
|------|--------|--------|--------|--------|--------|
| 스키마 기반 | 높음 | 낮음 | 낮음 | 높음 | 낮음 |
| 함수 기반 | 중간 | 높음 | 높음 | 중간 | 중간 |
| 하이브리드 | 높음 | 높음 | 높음 | 높음 | 높음 |

---

## 5. 최종 권장사항

### 5.1 계층적 접근

1. **기본 규칙**: 스키마의 `dropBehaviorRules` (명시적, 간단한 규칙)
2. **복잡한 규칙**: `defineDropBehavior` 함수 (동적, 복잡한 로직)
3. **UI 컨텍스트**: 최우선 적용 (Ctrl/Cmd 키 등)

### 5.2 구현 순서

1. 스키마에 `dropBehaviorRules` 추가 (간단한 규칙)
2. `defineDropBehavior` 함수 구현 (복잡한 규칙)
3. DataStore에 `getDropBehavior` API 추가
4. UI Layer에서 컨텍스트 전달

### 5.3 예시 구조

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

// 3. DataStore에서 사용
const behavior = dataStore.getDropBehavior(
  targetNodeId,
  sourceNodeId,
  { modifiers: { ctrlKey: true } }
);
```

---

## 6. 참고 자료

- `packages/model/src/operations/define-operation.ts`: Operation 정의 패턴
- ProseMirror: 플러그인 기반 드롭 처리
- Slate.js: 핸들러 함수 기반 드롭 처리
- TinyMCE: 설정 기반 드롭 처리

