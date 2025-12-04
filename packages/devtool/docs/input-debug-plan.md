## Devtool 입력 디버그 플랜 (`Last Input Debug`)

이 문서는 입력 처리 규칙(특히 `beforeinput` 기반 Insert Range 힌트와 C1/C2 분류)이  
실제 동작 중에 Devtool에서 어떻게 시각적으로 검증될 수 있는지에 대한 설계이다.

---

## 1. 목적

- **목적 1**: 입력 행위(타이핑/붙여넣기/삭제/한글 조합 등)에 대해  
  - `beforeinput` 단계에서 계산한 `InputHint`
  - `dom-change-classifier`가 계산한 `contentRange` / `case`
  - 실제 `replaceText`/`deleteText`에 사용된 `contentRange`
  를 한 곳에 모아서 Devtool에서 한눈에 비교할 수 있게 한다.

- **목적 2**: 규칙 위반/불일치가 있을 때 Devtool 상에 **시각적 표식**(OK/경고)을 띄워  
  입력 처리 파이프라인의 버그를 바로 발견할 수 있도록 한다.

---

## 2. 데이터 구조 설계 (`LastInputDebug`)

Editor 인스턴스에 디버그용 속성을 추가한다:

```ts
interface LastInputDebug {
  case: 'C1' | 'C2' | 'C3' | 'C4' | 'IME_INTERMEDIATE' | 'UNKNOWN';
  inputType?: string;          // beforeinput.inputType
  usedInputHint?: boolean;     // classify 단계에서 InputHint를 실제로 사용했는지
  inputHintRange?: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  classifiedContentRange?: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  appliedContentRange?: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  modelSelectionAtInput?: any; // convertDOMSelectionToModel 결과 (선택적)
  timestamp: number;
  status?: 'ok' | 'mismatch' | 'skipped';
  notes?: string[];            // 규칙 위반/예외 상황 설명
}
```

에디터 쪽에서는 다음 위치에서 이 구조를 채운다:

- `handleBeforeInput`:
  - `inputType`, `inputHintRange`, `timestamp` 초기 셋업
- `classifyDomChange` (C1/C2):
  - `case`, `classifiedContentRange`, `usedInputHint`, `modelSelectionAtInput` 업데이트
- `handleC1` / `handleC2` / `handleC3`:
  - `appliedContentRange`를 `replaceText`/`deleteText`/command에 실제 사용한 값으로 설정
  - 규칙 비교 후 `status`와 `notes` 결정

이 값은 예를 들어 `editor.__lastInputDebug` 같은 필드에 저장한다.

---

## 3. 규칙 정의 및 비교 로직

Devtool에 노출할 “규칙”은 다음과 같이 정의한다.

### 3.1 C1 규칙 (단일 inline-text)

- **규칙 C1-1**:  
  - `classifiedContentRange`와 `appliedContentRange`가 동일해야 한다.
- **규칙 C1-2**:  
  - `inputType`이 `insertText`/`insertFromPaste`/`insertReplacementText`일 때는  
    `usedInputHint === true` 이어야 한다.
- **규칙 C1-3**:  
  - IME 조합 중(`case === 'IME_INTERMEDIATE'`)에는 `usedInputHint === false` 이어야 한다.

비교 결과:

- 모든 규칙 만족 → `status: 'ok'`
- 하나라도 위반 → `status: 'mismatch'`, `notes`에 위반된 규칙 추가

### 3.2 C2 규칙 (여러 inline-text에 걸친 변경)

- **규칙 C2-1**:  
  - selection 기반으로 계산한 범위(현재는 `classifiedContentRange`)와  
    `appliedContentRange`가 최소한 시작/끝 nodeId 및 offset 방향에서 일관성을 가져야 한다.
- **규칙 C2-2**:  
  - insert류(덮어쓰기 포함)에서 `inputHint` 범위가 제공되었다면  
    `classifiedContentRange`가 이를 우선적으로 반영해야 한다 (`usedInputHint === true`).

비교 결과 처리 방식은 C1과 동일하게 `status`와 `notes`로 표현한다.

---

## 4. Devtool 연동 설계

### 4.1 Devtool 쪽 API 확장

`Devtool` 클래스에 다음 메서드를 추가한다:

```ts
class Devtool {
  // ...
  private lastInputDebug: LastInputDebug | null = null;

  public updateLastInputDebug(debug: LastInputDebug): void {
    this.lastInputDebug = debug;
    this.ui.updateLastInputDebug(debug);
  }
}
```

에디터 쪽에서는 입력 처리 완료 후:

```ts
(editor as any).__lastInputDebug = debugObject;
devtool.updateLastInputDebug(debugObject);
```

### 4.2 Devtool UI 확장

`DevtoolUI`에 “Last Input” 영역을 추가한다:

- 위치: Model Tree 패널 상단 또는 하단에 작은 박스로 배치.
- 표시 항목:
  - `Case: C1`
  - `InputType: insertText`
  - `Status: OK / MISMATCH`
  - `Ranges`:
    - `Hint: [sid, s, e]`
    - `Classified: [sid, s, e]`
    - `Applied: [sid, s, e]`
  - `Notes`: 규칙 위반/예외 메시지 리스트.

시각적 스타일:

- `Status: OK` → 초록색 배경/아이콘
- `Status: MISMATCH` → 빨간색 배경/아이콘
- `Status: SKIPPED` → 회색

또한, 마지막 입력이 영향을 준 `inline-text` 또는 `text-run`을 Model Tree에서 자동으로 강조 표시할 수 있다:

- `appliedContentRange.startNodeId`를 기준으로 해당 노드 요소에 배지 추가:
  - 예: `C1✓`, `C2⚠` 등의 짧은 라벨.

---

## 5. 구현 TODO (요약)

1. **Editor 쪽**
   - [ ] `LastInputDebug` 타입 정의 (`editor-core` 또는 `devtool` 타입 모듈로 공유)
   - [ ] `handleBeforeInput` / `classifyDomChange` / `handleC1` / `handleC2` / `handleC3`에서  
         `LastInputDebug`를 구성하고 `editor.__lastInputDebug`에 저장
   - [ ] 규칙 비교 로직(C1/C2 규칙)을 구현하여 `status`와 `notes`를 채움

2. **Devtool 쪽**
   - [ ] `Devtool`에 `lastInputDebug` 필드와 `updateLastInputDebug` 메서드 추가
   - [ ] `DevtoolUI`에 “Last Input” 패널 UI 추가
   - [ ] Model Tree에서 해당 노드에 배지/강조 스타일 적용

3. **테스트**
   - [ ] T1/T2/T6 시나리오에서 `LastInputDebug` 정보와 Devtool UI 표시가  
         기대한 규칙과 일치하는지 수동/자동 테스트


