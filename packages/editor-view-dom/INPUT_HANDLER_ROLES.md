# InputHandler와 EfficientEditHandler 역할 분리

## 개요

텍스트 입력 처리는 두 개의 레이어로 분리되어 있습니다:

1. **`input-handler.ts`** (InputHandlerImpl): 이벤트 처리 및 상태 관리 레이어
2. **`efficient-edit-handler.ts`** (handleEfficientEdit): 텍스트 변경 분석 및 범위 조정 레이어

## 역할 분리 원칙

### 책임 분리 (Separation of Concerns)

- **InputHandler**: "언제", "어떤 조건에서" 처리할지 결정
- **EfficientEditHandler**: "어떻게" 텍스트 변경을 분석하고 조정할지 처리

---

## 1. `input-handler.ts` (InputHandlerImpl)

### 역할: 이벤트 처리 및 상태 관리

**주요 책임**:
1. DOM 이벤트 수신 및 필터링
2. IME 조합 상태 관리
3. Pending 상태 관리 (조합 중 변경사항 보류)
4. Selection 검증 및 활성 노드 추적
5. 트랜잭션 실행 및 이벤트 발생

### 주요 메서드

#### `handleTextContentChange(oldValue, newValue, target)`
**역할**: MutationObserver에서 호출되는 진입점

**처리 흐름**:
```
1. 사전 검증
   - filler <br> 체크
   - sid 추출 (resolveModelTextNodeId)
   - 모델 노드 존재 확인

2. 상태 기반 필터링
   - IME 조합 중? → pending에 저장
   - Range 선택? → 건너뜀
   - 비활성 노드? → 건너뜀

3. 모델 데이터 수집
   - oldModelText (sid 기준)
   - modelMarks
   - decorators

4. EfficientEditHandler 호출
   - handleEfficientEdit()로 변경 분석 위임

5. 트랜잭션 실행
   - editor.executeTransaction()
   - decorators 업데이트
```

**핵심 포인트**:
- `oldValue`/`newValue`는 개별 text node의 값이지만, 실제 비교는 하지 않음
- sid 기준 전체 텍스트 비교는 `handleEfficientEdit`에서 수행
- 상태 관리 (composing, pending, activeTextNodeId)가 핵심

#### `handleCompositionStart/Update/End()`
**역할**: IME 조합 상태 관리

- `compositionstart`: `isComposing = true`, pending 초기화
- `compositionupdate`: 아무 작업 안 함 (브라우저에 맡김)
- `compositionend`: `isComposing = false`, `commitPendingImmediate()` 호출

#### `commitPendingImmediate()`
**역할**: IME 조합 중 보류된 변경사항 처리

- pending에 저장된 변경사항을 `handleEfficientEdit`로 처리
- 조합 완료 후 최종 텍스트만 모델에 반영

#### `resolveModelTextNodeId(target)`
**역할**: DOM 노드에서 sid 추출

- `closest('[data-bc-sid]')` 사용
- Text 노드면 parentElement, Element면 그대로 사용

### 상태 변수

```typescript
private isComposing = false;              // IME 조합 중 여부
private activeTextNodeId: string | null; // 현재 활성 텍스트 노드 (커서 위치)
private pendingTextNodeId: string | null; // 보류 중인 노드 ID
private pendingOldText: string;          // 보류 중인 이전 텍스트
private pendingNewText: string;          // 보류 중인 새 텍스트
private pendingTimer: any;               // 보류 타이머 (400ms)
```

---

## 2. `efficient-edit-handler.ts` (handleEfficientEdit)

### 역할: 텍스트 변경 분석 및 범위 조정

**주요 책임**:
1. sid 기준 전체 텍스트 재구성
2. text-analyzer를 사용한 정확한 변경 범위 계산
3. Selection offset을 Model offset으로 정규화
4. Marks/Decorators 범위 자동 조정

### 주요 함수

#### `handleEfficientEdit(textNode, oldValue, newValue, oldModelText, modelMarks, decorators)`
**역할**: 텍스트 변경 분석 및 조정

**처리 흐름**:
```
1. sid 추출
   - findInlineTextNode()로 inline-text 노드 찾기
   - data-bc-sid 속성 추출

2. Text Run Index 구축
   - buildTextRunIndex()로 모든 text node 수집
   - mark/decorator로 분리된 여러 text node를 하나로 합치기

3. sid 기준 전체 텍스트 재구성
   - reconstructModelTextFromRuns()로 모든 text node 합치기
   - oldModelText vs newText 비교

4. Selection offset 정규화
   - DOM offset → Model offset 변환
   - convertDOMToModelPosition() 사용

5. text-analyzer 호출
   - analyzeTextChanges()로 정확한 변경 범위 계산
   - LCP/LCS + Selection 바이어싱 적용

6. TextChange → TextEdit 변환
   - createEditInfoFromTextChange()로 변환
   - marks/decorators 범위 조정
```

**핵심 포인트**:
- `oldValue`/`newValue`는 사용하지 않음 (참고용)
- 항상 sid 기준 전체 텍스트로 비교
- text-analyzer의 고급 알고리즘 활용

#### `createEditInfoFromTextChange(...)`
**역할**: TextChange를 TextEdit로 변환

- `TextChange` (text-analyzer 결과) → `TextEdit` (시스템 내부 형식)
- `adjustMarkRanges()` / `adjustDecoratorRanges()` 호출

#### `reconstructModelTextFromRuns(runs)`
**역할**: Text Run Index에서 전체 텍스트 재구성

- 모든 text node의 `textContent`를 순서대로 합치기
- mark/decorator로 분리된 여러 text node를 하나의 텍스트로 통합

---

## 데이터 흐름

```
MutationObserver 감지
    ↓
InputHandler.handleTextContentChange()
    ↓
[상태 검증 및 필터링]
    - IME 조합 중? → pending 저장
    - Range 선택? → 건너뜀
    - 비활성 노드? → 건너뜀
    ↓
[모델 데이터 수집]
    - oldModelText (sid 기준)
    - modelMarks
    - decorators
    ↓
EfficientEditHandler.handleEfficientEdit()
    ↓
[sid 기준 전체 텍스트 재구성]
    - buildTextRunIndex() → 모든 text node 수집
    - reconstructModelTextFromRuns() → 전체 텍스트 합치기
    ↓
[Selection 정규화]
    - DOM offset → Model offset 변환
    ↓
[text-analyzer 호출]
    - analyzeTextChanges() → LCP/LCS + Selection 바이어싱
    ↓
[범위 조정]
    - adjustMarkRanges()
    - adjustDecoratorRanges()
    ↓
[결과 반환]
    - newText
    - adjustedMarks
    - adjustedDecorators
    - editInfo
    ↓
InputHandler에서 트랜잭션 실행
    - editor.executeTransaction()
    - decorators 업데이트
```

---

## 핵심 차이점

| 항목 | InputHandler | EfficientEditHandler |
|------|-------------|---------------------|
| **책임** | "언제", "어떤 조건에서" | "어떻게" 분석하고 조정 |
| **입력** | DOM 이벤트, MutationObserver | sid, oldModelText, modelMarks |
| **상태 관리** | ✅ (composing, pending, activeNodeId) | ❌ (순수 함수) |
| **필터링** | ✅ (조합 중, Range 선택, 비활성 노드) | ❌ |
| **텍스트 분석** | ❌ | ✅ (LCP/LCS, Selection 바이어싱) |
| **범위 조정** | ❌ | ✅ (marks/decorators) |
| **트랜잭션 실행** | ✅ | ❌ |

---

## 설계 원칙

### 1. 단일 책임 원칙 (SRP)
- **InputHandler**: 이벤트 처리 및 상태 관리만 담당
- **EfficientEditHandler**: 텍스트 분석 및 범위 조정만 담당

### 2. 관심사 분리
- **상태 관리** vs **순수 계산**
- **조건 검증** vs **데이터 변환**

### 3. 재사용성
- `handleEfficientEdit`는 순수 함수로 설계되어 다른 곳에서도 재사용 가능
- `InputHandler`는 Editor 인스턴스에 종속적

### 4. 테스트 용이성
- `EfficientEditHandler`는 순수 함수이므로 단위 테스트가 쉬움
- `InputHandler`는 상태 관리 로직이 복잡하지만, 각 메서드별로 테스트 가능

---

## 개선 포인트

### 현재 구조의 장점
1. ✅ 명확한 책임 분리
2. ✅ EfficientEditHandler의 재사용성
3. ✅ text-analyzer 패키지 활용
4. ✅ IME 조합 처리 안정성

### 잠재적 개선 사항
1. `InputHandler`에서 `analyzeTextChanges` import는 사용하지 않음 (제거 가능)
2. `commitPendingImmediate`에서도 `handleEfficientEdit`를 사용하므로 일관성 유지
3. 에러 처리 및 로깅 일관성 개선 가능

---

## 요약

- **InputHandler**: "언제 처리할지" 결정하는 **게이트키퍼**
- **EfficientEditHandler**: "어떻게 분석할지" 처리하는 **분석 엔진**

이러한 분리로 인해:
- 코드 가독성 향상
- 테스트 용이성 향상
- 유지보수성 향상
- 재사용성 향상

