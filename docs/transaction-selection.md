# Transaction과 Selection 적용 시점

**Selection이 Model → View(DOM)까지 어떻게 적용되는지** 전체 흐름은 [selection-application-flow.md](./selection-application-flow.md) 참고.

## 문제

트랜잭션 **실행 중**(연산 루프 안)에 `context.selection.current`를 바꾸면, 아직 **커밋 전**에 selection이 바뀐 상태가 된다.  
Content 변경은 overlay에만 있고 commit 전인데, selection만 먼저 바꾸면 안 된다.

- Selection 변경은 **트랜잭션 결과**의 일부여야 하고,
- **커밋이 끝난 뒤** `selectionAfter`로 한 번만 View/Editor에 적용되어야 한다.

## 원칙

1. **연산 실행 중**:  
   Content 연산(insertText, deleteTextRange, setSelection 등)만 `context.selection.current`를 갱신할 수 있다.  
   이들은 “이 연산의 결과로 캐럿이 여기로 간다”는 **연산 수준의 selection 매핑**이다.

2. **연산 실행 중에 하면 안 되는 것**:  
   Command/Extension이 “방금 만든 블록으로 selection 옮기기” 같은 **명령 수준 selection**을 `op()` 안에서 `context.selection.setCaret(...)`로 직접 넣는 것.  
   → 트랜잭션을 아직 커밋하지 않았는데 selection이 바뀌는 꼴이 됨.

3. **Selection 결정 시점**:  
   **모든 연산 실행이 끝난 뒤**, **commit 직전**에 한 번만 “이번 트랜잭션의 최종 selection”을 정한다.  
   그 값이 `selectionAfter`가 되고, **commit 후** `editor.updateSelection(selectionAfter)`로만 DOM/React에 반영된다.

## 구조

```
1. 트랜잭션 시작 (lock, begin overlay)
2. context 생성 (selection.current = selectionBefore 복사)
3. 연산 루프 실행
   - Content 연산만 context.selection.current 수정 가능 (insertText, deleteTextRange, setSelection 등)
   - splitBlockNode / addChild 는 context.lastCreatedBlock 만 설정 (selection 직접 건드리지 않음)
4. [새로 추가] Selection 해석 (resolution)
   - 모든 연산 실행이 끝난 뒤, commit 전
   - context.lastCreatedBlock 이 있으면 → selectionAfter = 해당 블록 시작 캐럿
   - 없으면 → selectionAfter = context.selection.current (연산들이 이미 설정한 값)
5. overlay end + commit
6. options.applySelectionToView !== false 일 때만 editor.updateSelection(selectionAfter) 호출 → View/Editor에 반영
```

- **Selection 해석**은 **TransactionManager**가 연산 루프 **바로 다음**, **commit 직전**에 한 번만 수행한다.
- **View 적용 여부**: `transaction(editor, ops, { applySelectionToView?: boolean })` 옵션으로 제어. 기본값은 적용(true). 원격 동기화 등에서는 `applySelectionToView: false`로 DOM 선택 갱신을 건너뛴다.
- Extension/Command는 `lastCreatedBlock`을 채우는 연산(splitBlockNode, addChild)만 넣고,  
  selection을 바꾸는 `op()`은 넣지 않는다.

## 체크리스트

- [x] 연산 루프 안에서 `op()`으로 `context.selection.setCaret` 호출하지 않음 (ParagraphExtension에서 op() 제거)
- [x] `context.selection.current` 수정은 연산 정의부(insertText, deleteTextRange, setSelection 등)에서만 함
- [x] `selectionAfter` 결정은 “연산 루프 종료 → selection 해석 → commit → updateSelection” 순서로 한 번만 함 (TransactionManager 5단계)
- [x] splitBlockNode / addChild 는 `lastCreatedBlock`만 설정하고, selection은 TransactionManager의 해석 단계에서만 사용
- [x] View 적용은 TransactionOptions.applySelectionToView로 제어 (기본 true, false 시 updateSelection 호출 안 함)
