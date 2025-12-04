# Drop Behavior 아키텍처 설계

## 문제 제기

Drop Behavior 규칙을 어디에 정의해야 할까?

- **스키마에 정의?** → 스키마는 데이터 모델 정의인데, UI 로직을 포함하는 게 맞나?
- **editor-view-dom에 정의?** → 각 에디터 인스턴스마다 정의해야 하는데, 스키마 재사용 시 규칙도 따로 정의해야 하나?
- **하이브리드?** → 스키마는 기본 규칙만, editor-view-dom에서 추가/오버라이드?

---

## 아키텍처 분석

### 현재 구조

```
Editor (editor-core)
  ├── DataStore (datastore)
  │   └── Schema (schema) - registerSchema()로 등록
  └── EditorViewDOM (editor-view-dom)
      └── Editor 참조
```

**특징:**
- `Schema`는 `DataStore`에 등록됨 (`registerSchema`)
- `EditorViewDOM`은 `Editor`를 참조하여 `dataStore`에 접근
- 스키마는 에디터 인스턴스별로 다를 수 있음

### Drop Behavior 사용 흐름

```
사용자 드래그 & 드롭
  ↓
EditorViewDOM.handleDrop()
  ↓
DataStore.getDropBehavior(targetNodeId, sourceNodeId, context)
  ↓
규칙 매칭 (어디서?)
  ↓
DropBehavior 반환
```

**핵심 질문:** 규칙 매칭은 어디서 일어나야 하나?

---

## 설계 옵션 비교

### 옵션 1: 스키마에만 정의 (순수 스키마 중심)

```typescript
// 스키마 정의 시
const schema = createSchema('example', {
  nodes: {
    'paragraph': {
      dropBehaviorRules: {
        'inline-text': 'merge',
        '*': 'move'
      }
    }
  }
});

// EditorViewDOM에서 사용
const behavior = dataStore.getDropBehavior(targetId, sourceId, context);
// → 스키마의 dropBehaviorRules만 확인
```

**장점:**
- 스키마와 함께 정의되어 일관성 있음
- 스키마별로 다른 규칙 가능
- 스키마 재사용 시 규칙도 함께 재사용

**단점:**
- 스키마가 UI 로직을 포함하게 됨
- 동적 규칙 정의가 어려움
- 에디터 인스턴스별 커스터마이징이 어려움

---

### 옵션 2: editor-view-dom에만 정의 (순수 UI 중심)

```typescript
// EditorViewDOM 초기화 시
class EditorViewDOM {
  constructor(editor: Editor, options: EditorViewDOMOptions) {
    // 드롭 규칙 정의
    defineDropBehavior('paragraph', 'move');
    defineDropBehavior('paragraph', (target, source, ctx) => {
      if (source.stype === 'inline-text') return 'merge';
      return 'move';
    });
  }
}

// 사용
const behavior = dataStore.getDropBehavior(targetId, sourceId, context);
// → defineDropBehavior 레지스트리만 확인
```

**장점:**
- UI 로직이 UI 레이어에 있음
- 에디터 인스턴스별 커스터마이징 가능
- 스키마는 순수하게 데이터 모델만 정의

**단점:**
- 스키마 재사용 시 규칙도 따로 정의해야 함
- 기본 규칙도 매번 정의해야 함
- 스키마와 규칙의 일관성 보장 어려움

---

### 옵션 3: 하이브리드 (권장) ⭐

**원칙:**
1. **스키마는 기본 규칙만 제공** (선택적, 권장)
   - 스키마 정의 시 "이 노드 타입은 이런 드롭 행위를 기본으로 가진다"는 힌트
   - 스키마 재사용 시 기본 동작 보장
2. **defineDropBehavior는 어디서든 정의 가능** (글로벌 레지스트리)
   - editor-view-dom 초기화 시
   - 확장(Extension)에서
   - 애플리케이션 레벨에서
3. **우선순위: defineDropBehavior > 스키마 > 기본값**

```typescript
// 1. 스키마에 기본 규칙 정의 (선택적)
const schema = createSchema('example', {
  nodes: {
    'paragraph': {
      dropBehaviorRules: {  // 기본 규칙 (힌트)
        'inline-text': 'merge',
        '*': 'move'
      }
    }
  }
});

// 2. EditorViewDOM에서 추가/오버라이드 (선택적)
class EditorViewDOM {
  constructor(editor: Editor, options: EditorViewDOMOptions) {
    // 특정 에디터 인스턴스만의 규칙
    defineDropBehavior('paragraph', (target, source, ctx) => {
      if (ctx.modifiers?.shiftKey) {
        return 'copy'; // Shift + 드래그 = 복사
      }
      // 스키마 규칙으로 폴백
      return null; // null 반환 시 다음 우선순위 확인
    }, { priority: 200 });
  }
}

// 3. DataStore.getDropBehavior()에서 우선순위 기반 매칭
getDropBehavior(targetId, sourceId, context) {
  // 1. defineDropBehavior 확인 (최우선)
  // 2. 스키마 dropBehaviorRules 확인
  // 3. 기본 규칙 (타입 조합)
  // 4. 기본값 (move)
}
```

**장점:**
- 스키마는 기본 규칙만 제공 (선택적)
- UI 레이어에서 추가/오버라이드 가능
- 스키마 재사용 시 기본 동작 보장
- 에디터 인스턴스별 커스터마이징 가능
- 확장성과 유연성 균형

**단점:**
- 구현이 약간 복잡함 (우선순위 관리)

---

## 권장 설계: 하이브리드 접근법

### 3.1 스키마의 역할

**스키마는 "기본 규칙 힌트"만 제공**

```typescript
interface NodeTypeDefinition {
  /**
   * Drop Behavior Rules: 소스 노드 타입별 기본 드롭 행위
   * 
   * 이 규칙은 "기본값"으로 사용되며, defineDropBehavior로 오버라이드 가능
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
   *   'block': 'move',             // 모든 block을 드롭하면 이동
   *   '*': 'move'                  // 기본값: 이동
   * }
   */
  dropBehaviorRules?: Record<string, DropBehavior>;
}
```

**스키마에 정의하는 이유:**
- 스키마는 "이 노드 타입이 어떤 동작을 기본으로 가져야 하는가"를 정의하는 곳
- `editable`, `selectable`, `draggable`, `droppable` 같은 속성과 일관성
- 스키마 재사용 시 기본 동작 보장

**하지만:**
- 스키마 규칙은 "기본값"일 뿐, 필수 아님
- `defineDropBehavior`로 언제든 오버라이드 가능

### 3.2 defineDropBehavior의 역할

**defineDropBehavior는 "동적 규칙" 정의**

```typescript
// 어디서든 정의 가능
defineDropBehavior(
  'paragraph',
  (target, source, context) => {
    // 복잡한 로직
    if (context.modifiers?.shiftKey) return 'copy';
    if (source.attributes?.locked) return 'copy';
    return null; // null 반환 시 다음 우선순위 확인
  },
  { priority: 200 }
);
```

**사용 시나리오:**
- EditorViewDOM 초기화 시 에디터별 규칙
- Extension에서 도메인별 규칙
- 애플리케이션 레벨에서 비즈니스 로직 규칙

### 3.3 우선순위

```
1. UI 컨텍스트 (Ctrl/Cmd = copy) - 최우선
2. defineDropBehavior 규칙 (동적 규칙)
3. 스키마 dropBehaviorRules (기본 규칙)
4. 타입 조합 기본 규칙 (내장 규칙)
5. 기본값 (move/insert)
```

---

## 구현 예시

### 스키마 정의 (기본 규칙)

```typescript
const schema = createSchema('example', {
  nodes: {
    'paragraph': {
      name: 'paragraph',
      group: 'block',
      content: 'inline*',
      // 기본 규칙 (선택적)
      dropBehaviorRules: {
        'inline-text': 'merge',  // 텍스트는 병합
        '*': 'move'              // 기본값: 이동
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

### EditorViewDOM에서 추가 규칙

```typescript
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
```

### DataStore.getDropBehavior 구현

```typescript
getDropBehavior(
  targetNodeId: string,
  sourceNodeId: string,
  context?: DropContext
): DropBehavior {
  const targetNode = this.getNode(targetNodeId);
  const sourceNode = this.getNode(sourceNodeId);
  const schema = this._activeSchema;
  const targetType = schema?.getNodeType?.(targetNode.stype);
  
  // 1. UI 컨텍스트 (최우선)
  if (context?.modifiers?.ctrlKey || context?.modifiers?.metaKey) {
    return 'copy';
  }
  
  // 2. defineDropBehavior 규칙 확인
  const registeredBehavior = globalDropBehaviorRegistry.get(
    targetNode.stype,
    sourceNode.stype,
    targetNode,
    sourceNode,
    context
  );
  
  if (registeredBehavior !== null) {  // null이 아니면 반환
    return registeredBehavior;
  }
  
  // 3. 스키마 dropBehaviorRules 확인
  if (targetType?.dropBehaviorRules) {
    const rules = targetType.dropBehaviorRules;
    if (rules[sourceNode.stype]) {
      return rules[sourceNode.stype];
    }
    if (rules['*']) {
      return rules['*'];
    }
  }
  
  // 4. 타입 조합 기본 규칙
  // 5. 기본값
  return this._getDefaultDropBehavior(targetNode, sourceNode, context);
}
```

---

## 결론

### 스키마에 정의하는 이유

1. **일관성**: `editable`, `selectable`, `draggable`, `droppable` 같은 속성과 일관성
2. **재사용성**: 스키마 재사용 시 기본 동작 보장
3. **명확성**: "이 노드 타입은 이런 기본 동작을 가진다"는 힌트

### 하지만 스키마만으로는 부족한 이유

1. **동적 규칙**: 복잡한 로직은 함수로 정의해야 함
2. **커스터마이징**: 에디터 인스턴스별 다른 규칙 필요
3. **확장성**: Extension이나 애플리케이션 레벨에서 규칙 추가 필요

### 하이브리드 접근법의 장점

- **스키마**: 기본 규칙 힌트 (선택적)
- **defineDropBehavior**: 동적 규칙, 커스터마이징 (필요 시)
- **우선순위**: defineDropBehavior > 스키마 > 기본값

이렇게 하면:
- 스키마는 순수하게 데이터 모델 정의에 집중 (기본 규칙은 힌트)
- UI 레이어는 필요 시 규칙 추가/오버라이드 가능
- 스키마 재사용 시 기본 동작 보장
- 에디터 인스턴스별 커스터마이징 가능

---

## 참고 자료

- `packages/datastore/docs/drop-behavior-spec.md`: Drop Behavior 명세
- `packages/datastore/docs/drop-behavior-implementation-plan.md`: 구현 계획
- `packages/datastore/docs/drop-behavior-implementation-options.md`: 구현 옵션 비교

