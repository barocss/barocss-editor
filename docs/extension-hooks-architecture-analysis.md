# Extension Hooks 아키텍처 분석

## 현재 상황

### 현재 Extension 인터페이스

```typescript
interface Extension {
  name: string;
  priority?: number;
  dependencies?: string[];
  
  // Lifecycle (3개)
  onBeforeCreate?(editor: Editor): void;
  onCreate?(editor: Editor): void;
  onDestroy?(editor: Editor): void;
  
  // Command registration
  commands?: Command[];
  
  // Before hooks (3개) - 가로채기/수정
  onBeforeTransaction?(editor: Editor, transaction: Transaction): Transaction | null | void;
  onBeforeSelectionChange?(editor: Editor, selection: SelectionState): SelectionState | null | void;
  onBeforeContentChange?(editor: Editor, content: DocumentState): DocumentState | null | void;
  
  // After hooks (3개) - 알림만
  onTransaction?(editor: Editor, transaction: Transaction): void;
  onSelectionChange?(editor: Editor, selection: SelectionState): void;
  onContentChange?(editor: Editor, content: DocumentState): void;
  
  // State extension (2개)
  addState?: (editor: Editor) => void;
  addStorage?: (editor: Editor) => void;
}
```

**총 11개의 선택적 훅**

---

## 문제점 분석

### 1. 인터페이스 비대화

**문제:**
- Extension 인터페이스가 계속 커짐
- 새로운 기능이 필요할 때마다 인터페이스 수정 필요
- 모든 Extension이 모든 훅을 구현할 필요는 없지만, 인터페이스는 복잡해짐

**예시:**
```typescript
// 미래에 추가될 수 있는 훅들
onBeforeCommand?(editor: Editor, command: string, payload?: any): boolean | void;
onAfterCommand?(editor: Editor, command: string, result: boolean): void;
onBeforeHistoryChange?(editor: Editor, action: 'undo' | 'redo'): boolean | void;
onBeforeRender?(editor: Editor, vnode: VNode): VNode | null | void;
// ... 계속 추가될 수 있음
```

### 2. 타입 안정성 vs 유연성

**현재 방식의 장점:**
- ✅ 타입 안정성: 컴파일 타임에 훅 시그니처 검증
- ✅ 명확성: Extension이 어떤 훅을 지원하는지 명시적
- ✅ IDE 자동완성: 개발자가 쉽게 발견 가능

**현재 방식의 단점:**
- ❌ 확장성: 새로운 훅 추가 시 인터페이스 수정 필요
- ❌ 복잡성: 인터페이스가 계속 커짐
- ❌ 불필요한 구현: 대부분의 Extension은 일부 훅만 사용

### 3. Before Hooks vs After Hooks vs Events

**현재 3가지 방식:**

1. **Before Hooks** (Extension 인터페이스)
   - 가로채기/수정 가능
   - Priority 기반 순차 실행
   - 타입 안정성

2. **After Hooks** (Extension 인터페이스)
   - 알림만 가능
   - Priority 기반 순차 실행
   - 타입 안정성

3. **Events** (editor.on())
   - 알림만 가능
   - 동적 등록/해제
   - 유연성

**중복:**
- After hooks와 Events가 기능적으로 중복됨
- `onTransaction` vs `editor.on('editor:content.change')`

---

## 대안 분석

### 옵션 1: 현재 방식 유지 (점진적 확장)

**접근:**
- 필요한 훅만 추가
- 선택적 속성으로 유지
- 문서화로 가이드

**장점:**
- ✅ 타입 안정성
- ✅ 명확성
- ✅ 기존 코드와 호환

**단점:**
- ❌ 인터페이스 계속 커짐
- ❌ 새로운 훅 추가 시 인터페이스 수정 필요

**적용 시나리오:**
- 훅이 많지 않을 때 (현재 11개)
- 타입 안정성이 중요할 때
- 명확한 API가 필요할 때

---

### 옵션 2: 이벤트 기반 통합

**접근:**
- Before hooks만 Extension 인터페이스에 유지
- After hooks는 `editor.on()`으로 통합
- Lifecycle hooks는 유지 (필수)

```typescript
interface Extension {
  name: string;
  priority?: number;
  
  // Lifecycle (필수)
  onCreate?(editor: Editor): void;
  onDestroy?(editor: Editor): void;
  
  // Before hooks (가로채기/수정만)
  onBeforeTransaction?(editor: Editor, transaction: Transaction): Transaction | null | void;
  onBeforeSelectionChange?(editor: Editor, selection: SelectionState): SelectionState | null | void;
  onBeforeContentChange?(editor: Editor, content: DocumentState): DocumentState | null | void;
  
  // After hooks 제거 → editor.on() 사용
}

// 사용 예시
class MyExtension implements Extension {
  onCreate(editor: Editor): void {
    // After hooks는 이벤트로
    editor.on('editor:content.change', (data) => {
      console.log('Content changed');
    });
  }
}
```

**장점:**
- ✅ 인터페이스 단순화
- ✅ 유연성: 동적 이벤트 등록
- ✅ 확장성: 새로운 이벤트 추가 시 인터페이스 수정 불필요

**단점:**
- ❌ 타입 안정성 약화 (이벤트 이름 문자열)
- ❌ Priority 기반 순서 보장 어려움
- ❌ After hooks의 타입 안정성 손실

**적용 시나리오:**
- After hooks가 단순 알림일 때
- 이벤트 기반이 더 자연스러울 때

---

### 옵션 3: 훅 레지스트리 패턴

**접근:**
- Extension 인터페이스는 최소화
- 훅은 `onCreate`에서 등록

```typescript
interface Extension {
  name: string;
  priority?: number;
  
  onCreate?(editor: Editor): void;
  onDestroy?(editor: Editor): void;
  
  commands?: Command[];
}

// 훅 레지스트리
interface HookRegistry {
  registerBeforeTransaction(
    hook: (editor: Editor, transaction: Transaction) => Transaction | null | void,
    priority?: number
  ): void;
  
  registerAfterTransaction(
    hook: (editor: Editor, transaction: Transaction) => void,
    priority?: number
  ): void;
  
  // ... 다른 훅들
}

// 사용 예시
class MyExtension implements Extension {
  onCreate(editor: Editor): void {
    // 훅 등록
    editor.hooks.registerBeforeTransaction(
      (editor, transaction) => {
        // 가로채기/수정
        return transaction;
      },
      10 // priority
    );
  }
}
```

**장점:**
- ✅ Extension 인터페이스 최소화
- ✅ 동적 훅 등록
- ✅ Priority 기반 순서 보장

**단점:**
- ❌ 타입 안정성 약화
- ❌ 복잡성 증가 (새로운 레지스트리 시스템)
- ❌ 기존 코드 대규모 수정 필요

**적용 시나리오:**
- 훅이 매우 많을 때
- 동적 훅 등록이 필요할 때

---

### 옵션 4: 플러그인 시스템 분리

**접근:**
- Extension: Commands, Keybindings만 담당
- Plugin: Hooks, Events 담당

```typescript
interface Extension {
  name: string;
  onCreate?(editor: Editor): void;
  onDestroy?(editor: Editor): void;
  commands?: Command[];
}

interface Plugin {
  name: string;
  priority?: number;
  
  // Hooks
  onBeforeTransaction?(editor: Editor, transaction: Transaction): Transaction | null | void;
  onTransaction?(editor: Editor, transaction: Transaction): void;
  // ...
}

// 사용
const editor = new Editor({
  extensions: [new BoldExtension()],
  plugins: [new ReadOnlyPlugin()]
});
```

**장점:**
- ✅ 관심사 분리
- ✅ Extension 인터페이스 단순화
- ✅ 플러그인만 훅 사용

**단점:**
- ❌ 복잡성 증가 (Extension vs Plugin 구분)
- ❌ 기존 코드 대규모 수정 필요
- ❌ 개념적 혼란 가능

**적용 시나리오:**
- Extension과 Plugin의 역할이 명확히 다를 때
- 대규모 리팩토링이 가능할 때

---

## 권장 방안

### 하이브리드 접근 (현재 + 점진적 개선)

**1단계: 현재 방식 유지 (단기)**
- Before hooks는 Extension 인터페이스에 유지
  - 가로채기/수정이 핵심 기능
  - 타입 안정성 중요
  - Priority 기반 순서 보장 필요

**2단계: After hooks는 선택적 통합 (중기)**
- After hooks는 `editor.on()`으로도 사용 가능하도록 문서화
- Extension 인터페이스의 After hooks는 유지하되, 권장하지 않음
- 점진적 마이그레이션

**3단계: 필요시에만 훅 추가 (장기)**
- 새로운 훅은 실제 필요할 때만 추가
- Before hooks는 Extension 인터페이스에 유지
- After hooks는 이벤트로 권장

### 구체적 권장사항

```typescript
interface Extension {
  name: string;
  priority?: number;
  
  // Lifecycle (필수)
  onCreate?(editor: Editor): void;
  onDestroy?(editor: Editor): void;
  
  // Before hooks (가로채기/수정) - 권장
  onBeforeTransaction?(editor: Editor, transaction: Transaction): Transaction | null | void;
  onBeforeSelectionChange?(editor: Editor, selection: SelectionState): SelectionState | null | void;
  onBeforeContentChange?(editor: Editor, content: DocumentState): DocumentState | null | void;
  
  // After hooks (알림) - 선택적, 이벤트 권장
  onTransaction?(editor: Editor, transaction: Transaction): void; // @deprecated - editor.on() 사용 권장
  onSelectionChange?(editor: Editor, selection: SelectionState): void; // @deprecated
  onContentChange?(editor: Editor, content: DocumentState): void; // @deprecated
  
  commands?: Command[];
}
```

**이유:**
1. **Before hooks는 Extension 인터페이스에 유지**
   - 가로채기/수정은 핵심 기능
   - 타입 안정성 중요
   - Priority 기반 순서 보장 필요

2. **After hooks는 이벤트로 권장**
   - 단순 알림이므로 이벤트로 충분
   - 유연성 증가
   - 인터페이스 단순화

3. **새로운 훅은 신중하게 추가**
   - 실제 필요할 때만 추가
   - Before hooks 패턴 유지
   - 문서화로 가이드

---

## 비교표

| 방식 | 타입 안정성 | 확장성 | 단순성 | 유연성 | Priority 지원 |
|------|------------|--------|--------|--------|---------------|
| 현재 방식 (모든 훅) | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 이벤트 통합 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 훅 레지스트리 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 플러그인 분리 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 하이브리드 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 결론

**현재 방식이 적절합니다**, 단 다음을 권장:

1. **Before hooks는 Extension 인터페이스에 유지**
   - 가로채기/수정이 핵심 기능
   - 타입 안정성과 Priority 지원 중요

2. **After hooks는 이벤트로 권장 (선택적)**
   - 단순 알림이므로 `editor.on()` 사용 권장
   - Extension 인터페이스의 After hooks는 유지하되 deprecated 표시

3. **새로운 훅은 신중하게 추가**
   - 실제 필요할 때만 추가
   - Before hooks 패턴 유지
   - 문서화로 가이드

**핵심 원칙:**
- Before hooks (가로채기/수정) → Extension 인터페이스
- After hooks (알림) → 이벤트 권장
- Lifecycle hooks → Extension 인터페이스 (필수)
