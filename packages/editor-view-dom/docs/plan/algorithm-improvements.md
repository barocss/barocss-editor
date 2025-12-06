# 알고리즘 개선 사항

## 현재 구현 상태

✅ **구현 완료:**
- DOM → Model 역변환
- Mark/Decorator 범위 자동 조정
- Text Run Index 기반 위치 변환
- MutationObserver 기반 편집 감지

## 개선이 필요한 부분

### 1. 편집 위치 추정의 정확성 개선

**현재 문제:**
- 공통 접두사 방식은 복잡한 편집에서 부정확할 수 있음
- 예: `"abc"` → `"xyz"` (완전 교체)의 경우 editPosition = 0이지만 실제로는 전체 교체

**개선 방안:**
```typescript
// LCS (Longest Common Subsequence) 알고리즘 사용
// 또는 Diff 알고리즘 사용하여 더 정확한 편집 위치 파악
function findEditPositionWithDiff(oldText: string, newText: string): number {
  // Diff 알고리즘으로 정확한 편집 위치 찾기
  // text-analyzer의 analyzeTextChanges를 활용 가능
}
```

**우선순위:** 중간 (현재도 대부분의 경우 잘 작동함)

### 2. 여러 text node 동시 변경 처리

**현재 문제:**
- MutationObserver는 개별 text node의 변경만 감지
- 여러 text node가 동시에 변경되면 여러 번 호출됨
- 매번 전체 텍스트를 재구성하므로 비효율적일 수 있음

**개선 방안:**
```typescript
// 배치 처리: 짧은 시간 내 여러 변경을 모아서 한 번에 처리
class EditBatchProcessor {
  private pendingEdits: Map<string, EditInfo> = new Map();
  private batchTimer: number | null = null;
  
  addEdit(nodeId: string, edit: EditInfo): void {
    this.pendingEdits.set(nodeId, edit);
    // 50ms 내 여러 편집을 모아서 처리
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.batchTimer = setTimeout(() => this.processBatch(), 50);
  }
}
```

**우선순위:** 낮음 (현재 방식도 충분히 작동함)

### 3. 범위 조정 로직의 엣지 케이스

**현재 문제:**
- 편집 위치가 mark 범위의 정확히 start나 end에 있는 경우 처리 불명확
- 삭제가 mark 범위를 완전히 지우는 경우

**개선 방안:**
```typescript
export function adjustMarkRanges(
  marks: MarkRange[],
  edit: TextEdit
): MarkRange[] {
  const { editPosition, insertedLength, deletedLength } = edit;
  const delta = insertedLength - deletedLength;
  const editEnd = editPosition + deletedLength;  // 삭제 끝 위치
  
  return marks.map(mark => {
    const [start, end] = mark.range;
    
    // 편집이 mark 범위를 완전히 지우는 경우
    if (editPosition <= start && editEnd >= end) {
      // mark 범위가 완전히 삭제됨 → 제거 (filter에서 처리)
      return { ...mark, range: [0, 0] };
    }
    
    // 편집 위치가 mark 범위 앞에 있는 경우
    if (editPosition <= start) {
      return {
        ...mark,
        range: [start + delta, end + delta]
      };
    }
    
    // 편집 위치가 mark 범위 안에 있는 경우
    if (editPosition < end) {
      // 삭제가 mark 범위의 일부를 지우는 경우
      if (editEnd > start && editEnd < end) {
        // 삭제된 부분만큼 end를 줄임
        return {
          ...mark,
          range: [start, end + delta]
        };
      }
      // 삽입만 있는 경우
      return {
        ...mark,
        range: [start, end + delta]
      };
    }
    
    // 편집 위치가 mark 범위 뒤에 있는 경우
    return mark;
  }).filter(mark => {
    const [start, end] = mark.range;
    return start >= 0 && end > start;
  });
}
```

**우선순위:** 높음 (정확성 향상)

### 4. 에러 처리 강화

**현재 문제:**
- textNode가 DOM에서 제거된 경우 처리 없음
- runs가 비어있는 경우 처리 없음
- editPosition이 범위를 벗어나는 경우 처리 없음

**개선 방안:**
```typescript
export function handleEfficientEdit(
  textNode: Text,
  oldValue: string | null,
  newValue: string | null,
  oldModelText: string,
  modelMarks: MarkRange[],
  decorators: DecoratorRange[]
): {
  newText: string;
  adjustedMarks: MarkRange[];
  adjustedDecorators: DecoratorRange[];
  editInfo: TextEdit;
} | null {
  try {
    // 1. inline-text 노드 찾기
    const inlineTextNode = findInlineTextNode(textNode);
    if (!inlineTextNode) {
      console.warn('[handleEfficientEdit] inline-text node not found');
      return null;
    }
    
    const nodeId = inlineTextNode.getAttribute('data-bc-sid');
    if (!nodeId) {
      console.warn('[handleEfficientEdit] nodeId not found');
      return null;
    }
    
    // 2. Text Run Index 구축
    const runs = buildTextRunIndex(inlineTextNode, nodeId, {
      buildReverseMap: true,
      normalizeWhitespace: false
    });
    
    if (!runs || runs.runs.length === 0) {
      console.warn('[handleEfficientEdit] no text runs found');
      return null;
    }
    
    // 3. DOM에서 전체 텍스트 재구성
    const newText = reconstructModelTextFromRuns(runs);
    
    if (newText === oldModelText) {
      return null;
    }
    
    // 4. 편집 위치 파악
    let editPosition: number | undefined;
    // ... (기존 로직)
    
    // 5. editPosition 유효성 검사
    if (editPosition < 0 || editPosition > oldModelText.length) {
      console.warn('[handleEfficientEdit] invalid editPosition, using fallback', {
        editPosition,
        oldTextLength: oldModelText.length
      });
      editPosition = findCommonPrefix(oldModelText, newText);
    }
    
    return createEditInfoFromFullText(
      nodeId,
      oldModelText,
      newText,
      inlineTextNode,
      modelMarks,
      decorators,
      editPosition
    );
  } catch (error) {
    console.error('[handleEfficientEdit] error:', error);
    return null;
  }
}
```

**우선순위:** 높음 (안정성 향상)

### 5. beforeinput 이벤트 활용

**현재 문제:**
- `extractEditPositionFromBeforeInput` 함수는 구현되어 있지만 실제로 사용되지 않음
- InputHandler에서 beforeinput 이벤트를 활용하지 않음

**개선 방안:**
```typescript
export class InputHandlerImpl implements InputHandler {
  private cachedEditPosition: { nodeId: string; offset: number } | null = null;
  
  handleBeforeInput(event: InputEvent): boolean {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    
    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    
    if (textNode.nodeType !== Node.TEXT_NODE) return false;
    
    const inlineTextNode = findInlineTextNode(textNode);
    if (!inlineTextNode) return false;
    
    // 편집 위치 미리 파악 (캐시)
    const editPos = extractEditPositionFromBeforeInput(event, inlineTextNode);
    if (editPos) {
      this.cachedEditPosition = editPos;
    }
    
    return false;
  }
  
  handleTextContentChange(oldValue: string | null, newValue: string | null, target: Node): void {
    // ... 기존 로직
    
    // 캐시된 편집 위치 사용
    let editPosition: number | undefined;
    if (this.cachedEditPosition && this.cachedEditPosition.nodeId === textNodeId) {
      editPosition = this.cachedEditPosition.offset;
      this.cachedEditPosition = null;  // 사용 후 초기화
    }
    
    // ... 나머지 로직
  }
}
```

**우선순위:** 중간 (성능 향상)

### 6. 유니코드 처리 개선

**현재 문제:**
- 이모지, 결합 문자 등 복합 문자의 경우 범위 조정이 정확하지 않을 수 있음
- UTF-16 서로게이트 페어 처리 필요

**개선 방안:**
```typescript
// 유니코드 안전한 문자열 길이 계산
function getUnicodeLength(text: string): number {
  // Array.from을 사용하여 유니코드 문자 단위로 계산
  return Array.from(text).length;
}

// 유니코드 안전한 범위 조정
function adjustRangeForUnicode(range: [number, number], delta: number): [number, number] {
  // 유니코드 문자 경계를 고려한 조정
  // text-analyzer의 adjustToSafeSplitPoint 활용 가능
}
```

**우선순위:** 낮음 (대부분의 경우 현재 방식으로 충분)

### 7. 성능 최적화

**현재 문제:**
- 매번 전체 텍스트를 재구성
- JSON.stringify로 변경 감지 (비효율적)

**개선 방안:**
```typescript
// 변경 감지를 위한 효율적인 비교
function marksChanged(
  oldMarks: MarkRange[],
  newMarks: MarkRange[]
): boolean {
  if (oldMarks.length !== newMarks.length) return true;
  
  for (let i = 0; i < oldMarks.length; i++) {
    const old = oldMarks[i];
    const new_ = newMarks[i];
    if (old.type !== new_.type) return true;
    if (old.range[0] !== new_.range[0] || old.range[1] !== new_.range[1]) {
      return true;
    }
  }
  return false;
}
```

**우선순위:** 낮음 (현재 성능도 충분함)

## 우선순위별 개선 계획

### 높은 우선순위 (즉시 개선)
1. ✅ 범위 조정 로직의 엣지 케이스 처리
2. ✅ 에러 처리 강화

### 중간 우선순위 (점진적 개선)
3. 편집 위치 추정의 정확성 개선 (LCS/Diff 알고리즘)
4. beforeinput 이벤트 활용

### 낮은 우선순위 (선택적 개선)
5. 여러 text node 동시 변경 처리 (배치 처리)
6. 유니코드 처리 개선
7. 성능 최적화

## 결론

현재 알고리즘은 기본적인 기능은 잘 작동하지만, 다음 사항들을 개선하면 더욱 견고해질 것입니다:

1. **엣지 케이스 처리**: 삭제가 mark 범위를 지우는 경우 등
2. **에러 처리**: 예외 상황에 대한 안전한 처리
3. **정확성 향상**: 편집 위치 추정의 정확성 개선

이러한 개선 사항들을 단계적으로 적용하면 더욱 안정적인 에디터가 될 것입니다.

