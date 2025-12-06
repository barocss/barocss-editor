# Absolute Position 스펙

## 1. 개요

Absolute Position은 Barocss Editor에서 문서 전체를 하나의 연속된 텍스트로 간주했을 때의 **문자 인덱스**입니다. 이는 ProseMirror의 Position 개념과 유사하지만, Barocss의 계층적 문서 구조에 맞게 설계되었습니다.

### 1.1 목적
- **정확한 선택**: 노드 경계에서의 선택을 정확하게 처리
- **구조 보존**: 문서의 계층적 구조 정보를 유지
- **확장성**: 하이라이트, 데코레이션, 협업 편집 등 향후 기능 지원
- **호환성**: ProseMirror와 유사한 방식으로 다른 에디터와의 호환성 확보

## 2. Absolute Position 정의

### 2.1 기본 개념

```typescript
// Absolute Position은 0부터 시작하는 정수
// 노드 경계와 텍스트 문자를 모두 포함
type AbsolutePosition = number;  // 0, 1, 2, 3, ...

// 예시: 문서 구조
// doc-1
//   ├── para-1
//   │   └── text-1 (text: "Hello")
//   └── para-2
//       └── text-2 (text: "World")

// Absolute Position 매핑 (노드 경계 포함):
// 0: doc-1 시작
// 1: para-1 시작
// 2: H (text-1의 0번째 문자)
// 3: e (text-1의 1번째 문자)
// 4: l (text-1의 2번째 문자)
// 5: l (text-1의 3번째 문자)
// 6: o (text-1의 4번째 문자)
// 7: para-1 끝
// 8: para-2 시작
// 9: W (text-2의 0번째 문자)
// 10: o (text-2의 1번째 문자)
// 11: r (text-2의 2번째 문자)
// 12: l (text-2의 3번째 문자)
// 13: d (text-2의 4번째 문자)
// 14: para-2 끝
// 15: doc-1 끝
```

### 2.2 계산 규칙

1. **문서 순회**: 문서의 루트부터 깊이 우선 순회(DFS)
2. **모든 노드 포함**: 텍스트 노드와 컨테이너 노드 모두 포함
3. **노드 경계 포함**: 각 노드의 시작과 끝 위치를 인덱스로 할당
4. **순차적 인덱싱**: 문서 순서대로 0부터 연속적으로 인덱스 할당
5. **선택 가능성**: 빈 노드도 선택할 수 있도록 노드 경계 유지

### 2.3 계산 알고리즘

```typescript
function calculateAbsolutePosition(nodeId: string, offset: number): number {
  let absoluteOffset = 0;
  
  const traverse = (currentNodeId: string): boolean => {
    const node = document.getNode(currentNodeId);
    if (!node) return false;

    // 현재 노드가 목표 노드인 경우
    if (node.sid === nodeId) {
      absoluteOffset += offset;
      return true;
    }

    // 노드 시작 위치 추가 (1)
    absoluteOffset += 1;

    // 텍스트 노드인 경우 텍스트 길이 추가
    if (node.text) {
      absoluteOffset += node.text.length;
    }

    // 컨테이너 노드인 경우 자식들을 순회
    if (node.content) {
      for (const childId of node.content) {
        if (traverse(childId)) return true;
      }
    }

    // 노드 끝 위치 추가 (1)
    absoluteOffset += 1;

    return false;
  };

  traverse(document.sid);
  return absoluteOffset;
}
```

### 2.4 역변환 알고리즘

```typescript
function findNodeByAbsolutePosition(absoluteOffset: number): { nodeId: string; offset: number } | null {
  let currentOffset = 0;
  
  const traverse = (nodeId: string): { nodeId: string; offset: number } | null => {
    const node = document.getNode(nodeId);
    if (!node) return null;

    // 노드 시작 위치 확인
    if (currentOffset === absoluteOffset) {
      return { nodeId, offset: 0 }; // 노드 시작
    }
    currentOffset += 1;

    // 텍스트 노드인 경우
    if (node.text) {
      const nodeLength = node.text.length;
      if (currentOffset + nodeLength > absoluteOffset) {
        return {
          nodeId,
          offset: Math.max(0, absoluteOffset - currentOffset)
        };
      }
      currentOffset += nodeLength;
    }

    // 컨테이너 노드인 경우 자식들을 순회
    if (node.content) {
      for (const childId of node.content) {
        const result = traverse(childId);
        if (result) return result;
      }
    }

    // 노드 끝 위치 확인
    if (currentOffset === absoluteOffset) {
      return { nodeId, offset: node.text ? node.text.length : 0 }; // 노드 끝
    }
    currentOffset += 1;

    return null;
  };

  return traverse(document.sid);
}
```

## 3. Absolute Position의 특징

### 3.1 장점

1. **정확한 선택**: 노드 경계에서의 선택을 정확하게 처리
2. **구조 보존**: 문서의 계층적 구조 정보를 유지
3. **빈 노드 선택**: 텍스트가 없는 노드도 선택 가능
4. **ProseMirror 호환**: ProseMirror와 동일한 방식으로 호환성 확보
5. **확장성**: 하이라이트, 데코레이션 등 향후 기능 지원

### 3.2 단점

1. **복잡성**: 노드 경계 계산이 복잡
2. **성능**: 대규모 문서에서 계산 오버헤드
3. **이해 어려움**: 개발자가 이해하기 어려울 수 있음

### 3.3 다른 에디터와의 비교

| 에디터 | Position 방식 | 구조 정보 | 선택 방식 |
|--------|---------------|-----------|-----------|
| **ProseMirror** | 노드 경계 포함 | ✅ | 정확한 경계 |
| **Word** | 문자 단위 | ❌ | 단순한 범위 |
| **Google Docs** | 하이브리드 | ✅ | 구조 + 텍스트 |
| **Notion** | 블록 기반 | ✅ | 블록 단위 |
| **Obsidian** | 라인 기반 | ❌ | 라인 + 문자 |
| **Barocss** | 노드 경계 포함 | ✅ | 정확한 경계 |

## 4. 사용 예시

### 4.1 기본 사용법

```typescript
import { PositionCalculator } from '@barocss/model';

const calculator = new PositionCalculator(document);

// nodeId + offset을 절대 위치로 변환
const absolutePos = calculator.calculateAbsolutePosition('text-1', 3);
console.log(absolutePos); // 5 (para-1 시작 + text-1 시작 + 3)

// 절대 위치를 nodeId + offset으로 변환
const nodePos = calculator.findNodeByAbsolutePosition(5);
console.log(nodePos); // { nodeId: 'text-1', offset: 3 }
```

### 4.2 Selection과 함께 사용

```typescript
import { PositionBasedSelectionManager } from '@barocss/model';

const selectionManager = new PositionBasedSelectionManager(document, positionTracker);

// 절대 위치 기반 선택
const selectionId = selectionManager.selectAbsoluteRange(2, 7);
// text-1의 0-5번째 문자 선택

// 노드 선택
const nodeSelectionId = selectionManager.selectNode('para-1');
// 빈 paragraph 선택 가능
```

### 4.3 직렬화와 업데이트 규칙 요약

직렬화 포맷(권장):

```json
{
  "type": "absolute-range",
  "start": 12,
  "end": 23,
  "version": 3
}
```

업데이트 규칙(요약):

- 텍스트 삽입: 삽입 절대 위치 ≤ 포지션이면 해당 포지션 absolute(+len)
- 텍스트 삭제: 삭제 구간 이전은 유지, 이후는 absolute(-len), 구간 내는 무효화
- 노드 삽입/삭제: 삽입/삭제 위치가 포지션 앞이면 absolute 가감, 동일 노드 삭제 시 무효화
- 노드 이동: 경계 포함 계산에 따라 이동량만큼 절대값 보정

### 4.3 복잡한 문서 구조

```typescript
// 복잡한 문서 구조 예시
const complexDocument = {
  id: 'doc-1',
  type: 'document',
  content: ['section-1', 'section-2']
};

// section-1 > para-1 > text-1("Hello") + para-2 > text-2("World")
// section-2 > para-3 > text-3("Test")

// Absolute Position 매핑:
// 0: doc-1 시작
// 1: section-1 시작
// 2: para-1 시작
// 3: H, 4: e, 5: l, 6: l, 7: o
// 8: para-1 끝
// 9: para-2 시작
// 10: W, 11: o, 12: r, 13: l, 14: d
// 15: para-2 끝
// 16: section-1 끝
// 17: section-2 시작
// 18: para-3 시작
// 19: T, 20: e, 21: s, 22: t
// 23: para-3 끝
// 24: section-2 끝
// 25: doc-1 끝
```

## 5. 성능 고려사항

### 5.1 계산 복잡도

- **시간 복잡도**: O(N) - 문서의 노드 수에 비례
- **공간 복잡도**: O(1) - 상수 공간 사용
- **최적화**: 캐싱, 증분 업데이트 등으로 성능 향상 가능

### 5.2 최적화 전략

1. **캐싱**: 자주 사용되는 Position 계산 결과 캐싱
2. **증분 업데이트**: 변경된 부분만 재계산
3. **지연 계산**: 필요할 때만 계산
4. **인덱싱**: 자주 사용되는 노드에 대한 인덱스 구축

## 6. 구현 상태

### 6.1 완료된 기능

- ✅ PositionCalculator 클래스 구현
- ✅ calculateAbsolutePosition 메서드
- ✅ findNodeByAbsolutePosition 메서드
- ✅ PositionBasedSelectionManager 통합
- ✅ 단위 테스트 작성
- ✅ 사용 예제 작성

### 6.2 향후 계획

- 🔄 Position 캐싱 시스템
- 🔄 증분 업데이트 최적화
- 🔄 사용자 친화적 API 추가
- 🔄 성능 벤치마크

## 7. 결론

Barocss의 Absolute Position 시스템은 **ProseMirror와 유사한 방식**으로 설계되어 정확한 선택과 구조 보존을 제공합니다. 노드 경계를 포함하는 방식으로 빈 노드도 선택할 수 있고, 향후 하이라이트, 데코레이션, 협업 편집 등의 기능을 지원할 수 있는 확장 가능한 기반을 마련했습니다.

이 시스템은 복잡성을 감수하더라도 **정확성과 확장성**을 우선시한 설계 결정으로, Barocss Editor의 핵심 기능인 정확한 문서 편집을 지원합니다.

## 8. Operation 페이로드 규약 (Absolute 기반)

### 8.1 키 규약

- 단일 위치: `pos`
- 범위: `start`, `end`
- 이동: `from`, `to`

모든 좌표는 Absolute Position(정수)이며, 오퍼레이션 내부에서 노드/오프셋으로 정상화된다.

### 8.2 매핑 동작

- `pos` → `resolveAbsolute(pos)`로 `{ nodeId, offset }` 계산 후 기존 로직 적용
- `start/end` → 각각 `resolveAbsolute(start|end)`로 시작/끝 노드와 오프셋 계산 후 기존 로직 적용
- `from/to` → 각각 절대 좌표가 가리키는 노드 ID로 해석하여 이동 대상/목표를 결정

### 8.3 사용 예시

```ts
// 텍스트 삽입
applyOperation('text.insert', { pos: 42, text: 'Hello' }, ctx);

// 텍스트 선택 치환
applyOperation('text.replaceSelection', { start: 10, end: 25, text: 'MID' }, ctx);

// 텍스트 범위 삭제
applyOperation('text.deleteRange', { start: 100, end: 120 }, ctx);

// 텍스트 분할
applyOperation('text.splitAtSelection', { pos: 77 }, ctx);

// 블록 분할
applyOperation('block.splitAtSelection', { pos: 130 }, ctx);

// 인접 형제 래핑
applyOperation('block.wrapAdjacentSiblings', { start: 200, end: 260, wrapperType: 'section', wrapperAttrs: { class: 'range' } }, ctx);

// 노드 이동 (앞/뒤)
applyOperation('node.moveBefore', { from: 300, to: 280 }, ctx);
applyOperation('node.moveAfter', { from: 300, to: 320 }, ctx);

// 리스트 아이템 분할 / 병합
applyOperation('list.splitItem', { pos: 410 }, ctx);
applyOperation('list.mergeWithNextItem', { pos: 512 }, ctx);
applyOperation('list.mergeWithPrevItem', { pos: 512 }, ctx);
```

### 8.4 검증 원칙 요약

- 정상화가 실패하면 유효성 에러(`absolute position out of bounds` 등)를 반환한다.
- 정상화 이후에는 기존 노드/오프셋 기반 검증 로직을 그대로 따른다.