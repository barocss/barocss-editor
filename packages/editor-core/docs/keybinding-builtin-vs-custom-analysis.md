# Keybinding 시스템: 내장 키 vs 커스텀 키 분석

## 현재 상태

### 발견된 문제
1. **`default-keybindings.ts`에 이미 등록됨**:
   ```typescript
   {
     key: 'Backspace',
     command: 'backspace',
     when: 'editorFocus && editorEditable'
   },
   {
     key: 'Delete',
     command: 'deleteForward',
     when: 'editorFocus && editorEditable'
   }
   ```

2. **하지만 `editor-view-dom.ts`에서 직접 처리**:
   ```typescript
   if (key === 'Backspace') {
     this.handleBackspaceKey(); // keybinding 시스템 우회
     return;
   }
   ```

3. **일관성 문제**:
   - Enter는 keybinding 시스템 사용
   - ArrowLeft/ArrowRight는 직접 처리
   - Backspace/Delete는 직접 처리
   - Mod+b, Mod+i는 keybinding 시스템 사용

## 옵션 비교

### 옵션 A: 모든 키를 keybinding 시스템으로 통합

**구조**:
```
모든 키 입력
  ↓
editor-view-dom: handleKeydown()
  ↓
getKeyString(event) → 정규화된 키 문자열
  ↓
editor.keybindings.resolve(key)
  ↓
command 실행
```

**장점**:
1. ✅ **일관성**: 모든 키가 동일한 경로로 처리
2. ✅ **유연성**: 사용자가 Backspace/Delete도 커스터마이징 가능
3. ✅ **확장성**: Extension에서 기본 키 동작도 override 가능
4. ✅ **테스트 용이**: keybinding 시스템만 테스트하면 됨
5. ✅ **코드 단순화**: `editor-view-dom`에서 특수 케이스 제거

**단점**:
1. ❌ **사용자 혼란**: 기본 편집 키를 실수로 변경할 수 있음
2. ❌ **성능**: 기본 키도 resolve 과정을 거쳐야 함 (미미한 오버헤드)
3. ❌ **복잡성**: 기본 키도 `when` 조건 평가 필요

**VS Code 방식**:
- VS Code는 모든 키를 keybinding 시스템으로 처리
- 하지만 기본 편집 키는 "built-in"으로 표시하여 사용자가 실수로 변경하는 것을 방지

### 옵션 B: 내장 키와 커스텀 키 분리

**구조**:
```
키 입력
  ↓
editor-view-dom: handleKeydown()
  ↓
내장 키 체크 (Backspace, Delete, Enter, Arrow keys)
  ↓
IF 내장 키:
  직접 처리 (keybinding 시스템 우회)
ELSE:
  keybinding 시스템으로 위임
```

**내장 키 목록**:
- Backspace, Delete
- Enter
- ArrowLeft, ArrowRight (기본 커서 이동)
- ArrowUp, ArrowDown → 브라우저 네이티브 커서 이동에 맡기며 기본 keybinding에서는 제외
- Tab, Shift+Tab (선택적)

**장점**:
1. ✅ **성능**: 기본 키는 직접 처리로 빠름
2. ✅ **안정성**: 기본 편집 키는 항상 동일하게 동작
3. ✅ **단순성**: 기본 키는 복잡한 조건 평가 불필요
4. ✅ **사용자 보호**: 기본 키를 실수로 변경할 수 없음

**단점**:
1. ❌ **일관성 부족**: 일부는 keybinding, 일부는 직접 처리
2. ❌ **확장성 제한**: Extension에서 기본 키 동작 변경 어려움
3. ❌ **코드 중복**: 두 가지 경로 유지 필요
4. ❌ **테스트 복잡**: 두 가지 경로 모두 테스트 필요

**ProseMirror 방식**:
- `baseKeymap`에 기본 키 포함
- 하지만 사용자가 override 가능
- 기본 키도 keybinding 시스템에 포함

## 다른 에디터들의 접근 방식

### VS Code
- **모든 키를 keybinding 시스템으로 처리**
- 기본 편집 키도 keybinding에 등록
- UI에서 "built-in"으로 표시하여 변경 방지
- 하지만 기술적으로는 override 가능

### ProseMirror
- **`baseKeymap`에 기본 키 포함**
- 사용자가 `baseKeymap`을 override 가능
- 기본 키도 keybinding 시스템의 일부

### Sublime Text
- **모든 키를 keybinding 시스템으로 처리**
- 기본 키도 설정 파일에 정의
- 사용자가 자유롭게 변경 가능

## 권장 사항

### 옵션 A (모든 키를 keybinding 시스템으로 통합) 권장

**이유**:
1. **일관성**: 모든 키가 동일한 경로로 처리
2. **확장성**: Extension에서 기본 키 동작도 변경 가능
3. **코드 단순화**: `editor-view-dom`에서 특수 케이스 제거
4. **VS Code와 동일한 접근**: 검증된 패턴

**구현 방법**:
1. `editor-view-dom.ts`에서 Backspace/Delete 직접 처리 제거
2. `default-keybindings.ts`의 등록을 실제로 사용
3. Arrow keys도 keybinding 시스템으로 통합 (선택적)

**사용자 보호 방법**:
- UI에서 기본 편집 키를 "built-in"으로 표시
- 또는 `source: 'core'`인 keybinding은 UI에서 변경 불가로 표시
- 하지만 기술적으로는 override 가능 (고급 사용자용)

## 구현 계획

### 1단계: Backspace/Delete를 keybinding 시스템으로 통합

**변경 사항**:
```typescript
// editor-view-dom.ts
handleKeydown(event: KeyboardEvent): void {
  // ... IME 체크 ...
  
  const key = getKeyString(event);
  
  // 특수 케이스 제거: Backspace, Delete도 keybinding 시스템으로
  // Arrow keys도 keybinding 시스템으로 (선택적)
  
  const resolved = this.editor.keybindings.resolve(key);
  if (resolved.length > 0) {
    const { command, args } = resolved[0];
    event.preventDefault();
    void this.editor.executeCommand(command, args);
  }
}
```

**주의사항**:
- Backspace/Delete command는 `selection` 파라미터 필요
- keybinding 시스템에서 command 실행 시 현재 selection을 자동으로 전달해야 함
- 또는 command가 내부에서 selection을 읽도록 구현

### 2단계: Command 파라미터 처리 개선

**문제**: Backspace/Delete command는 `{ selection: ModelSelection }` 파라미터 필요

**해결 방법 A**: Command가 내부에서 selection 읽기
```typescript
// DeleteExtension
execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
  const selection = payload?.selection || editor.selection;
  return await this._executeBackspace(editor, selection);
}
```

**해결 방법 B**: keybinding 시스템에서 자동으로 selection 전달
```typescript
// keybinding.ts resolve()
const resolved = this.editor.keybindings.resolve(key);
if (resolved.length > 0) {
  const { command, args } = resolved[0];
  
  // 특정 command는 자동으로 selection 추가
  if (command === 'backspace' || command === 'deleteForward') {
    const selection = this._getCurrentSelection();
    args = { ...args, selection };
  }
  
  void this.editor.executeCommand(command, args);
}
```

## 결론

**옵션 A (모든 키를 keybinding 시스템으로 통합)를 권장합니다.**

**이유**:
1. 일관성과 확장성
2. 코드 단순화
3. VS Code와 동일한 접근 방식
4. 사용자 보호는 UI 레벨에서 처리 가능

**구현 시 고려사항**:
- Command 파라미터 처리 방법 결정 필요
- Arrow keys도 통합할지 결정 필요
- 성능 영향 최소화 (resolve는 이미 빠름)

