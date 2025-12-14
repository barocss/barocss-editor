# Before Hooks 사용 사례 분석

## 개요

Extension의 `onBeforeTransaction`, `onBeforeSelectionChange` 같은 Before hooks를 통해 transaction/selection/content 변경을 **가로채서 수정하거나 취소**할 수 있는 실제 사용 사례들을 정리합니다.

---

## 1. Read-Only 모드 강제

### 문제
- 현재 `editorEditable` context로 keybinding만 비활성화됨
- 하지만 `editor.executeCommand()`로 직접 호출하면 우회 가능
- Transaction 자체를 막을 수 없음

### 해결: `onBeforeTransaction`
```typescript
class ReadOnlyExtension implements Extension {
  onCreate(editor: Editor) {
    editor.setContext('readOnly', true);
  }

  onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
    // Read-only 모드면 모든 transaction 취소
    if (editor.getContext('readOnly')) {
      return null; // 취소
    }
    return transaction; // 그대로 진행
  }
}
```

### 효과
- Command 우회 불가능
- 모든 transaction 차단
- 일관된 read-only 보장

---

## 2. Content Sanitization (XSS 방지)

### 문제
- 외부에서 paste된 HTML에 `<script>` 태그 포함 가능
- 사용자 입력에 악성 코드 포함 가능

### 해결: `onBeforeTransaction`
```typescript
class SanitizeExtension implements Extension {
  onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
    const ops = transaction.getOperations();
    
    // insertText operation에서 악성 패턴 검사
    for (const op of ops) {
      if (op.type === 'insertText') {
        const sanitized = this.sanitizeText(op.text);
        if (sanitized !== op.text) {
          // 수정된 operation으로 교체
          return transaction.withOperation(
            op.id,
            { ...op, text: sanitized }
          );
        }
      }
    }
    
    return transaction;
  }

  private sanitizeText(text: string): string {
    // <script> 태그 제거, HTML 엔티티 이스케이프 등
    return text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }
}
```

### 효과
- 모든 텍스트 입력 자동 검사
- 악성 코드 자동 제거
- 안전한 content 보장

---

## 3. Auto-Formatting (자동 포맷팅)

### 문제
- 사용자가 URL을 입력하면 자동으로 링크로 변환
- 날짜 입력 시 자동 포맷팅
- 전화번호 자동 포맷팅

### 해결: `onBeforeTransaction`
```typescript
class AutoFormatExtension implements Extension {
  onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
    const ops = transaction.getOperations();
    const newOps: Operation[] = [];

    for (const op of ops) {
      if (op.type === 'insertText') {
        // URL 패턴 감지
        const urlMatch = op.text.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          // 텍스트 삽입 + 링크 마크 추가로 변환
          newOps.push(op);
          newOps.push({
            type: 'addMark',
            nodeId: op.nodeId,
            mark: { type: 'link', attributes: { href: urlMatch[0] } },
            range: [op.offset, op.offset + urlMatch[0].length]
          });
          continue;
        }
      }
      newOps.push(op);
    }

    // operation이 변경되었으면 새 transaction 반환
    if (newOps.length !== ops.length) {
      return transaction.withOperations(newOps);
    }

    return transaction;
  }
}
```

### 효과
- 사용자 입력 자동 변환
- 일관된 포맷팅
- 사용자 경험 향상

---

## 4. Change Tracking (변경 추적)

### 문제
- 누가 무엇을 언제 변경했는지 추적 필요
- 변경 이력에 메타데이터 추가 필요

### 해결: `onBeforeTransaction`
```typescript
class ChangeTrackingExtension implements Extension {
  private userId: string;

  onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
    // Transaction에 메타데이터 추가
    return transaction.withMetadata({
      userId: this.userId,
      timestamp: Date.now(),
      changeType: this.detectChangeType(transaction)
    });
  }

  private detectChangeType(transaction: Transaction): string {
    const ops = transaction.getOperations();
    if (ops.some(op => op.type === 'insertText')) return 'insert';
    if (ops.some(op => op.type === 'deleteText')) return 'delete';
    if (ops.some(op => op.type === 'updateNode')) return 'format';
    return 'unknown';
  }
}
```

### 효과
- 모든 변경에 메타데이터 자동 추가
- 변경 이력 추적 가능
- 협업 편집 지원

---

## 5. Collaborative Editing Protection

### 문제
- 사용자가 입력 중인 노드를 외부 변경으로부터 보호 필요
- AI나 다른 사용자의 변경이 사용자 입력을 방해

### 해결: `onBeforeTransaction`
```typescript
class CollaborativeProtectionExtension implements Extension {
  private activeTextNodeId: string | null = null;

  onCreate(editor: Editor) {
    // 사용자 입력 시작 감지
    editor.on('editor:content.change', () => {
      this.activeTextNodeId = editor.selection?.startNodeId || null;
    });
  }

  onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
    // 외부 변경인지 확인 (사용자 입력이 아닌 경우)
    const isExternalChange = !transaction.metadata?.isUserInput;
    
    if (isExternalChange && this.activeTextNodeId) {
      // 활성 노드에 대한 변경인지 확인
      const ops = transaction.getOperations();
      const affectsActiveNode = ops.some(op => 
        op.nodeId === this.activeTextNodeId
      );

      if (affectsActiveNode) {
        // 사용자 입력 중인 노드는 보호
        console.warn('[CollaborativeProtection] Blocked external change to active node');
        return null; // 취소
      }
    }

    return transaction;
  }
}
```

### 효과
- 사용자 입력 보호
- 외부 변경으로부터 안전
- 협업 편집 안정성 향상

---

## 6. Selection Normalization (선택 영역 정규화)

### 문제
- Selection이 특정 규칙을 위반 (예: 블록 노드 내부만 선택 가능)
- Selection이 비정상적인 위치 (예: 데코레이터 영역)

### 해결: `onBeforeSelectionChange`
```typescript
class SelectionNormalizeExtension implements Extension {
  onBeforeSelectionChange(
    editor: Editor, 
    selection: SelectionState
  ): SelectionState | null {
    // Selection이 블록 노드 경계를 넘지 않도록 정규화
    const normalized = this.normalizeSelection(editor, selection);
    
    if (normalized.startNodeId !== selection.startNodeId ||
        normalized.startOffset !== selection.startOffset) {
      // Selection이 변경되었으면 정규화된 selection 반환
      return normalized;
    }

    return selection; // 그대로 진행
  }

  private normalizeSelection(
    editor: Editor, 
    selection: SelectionState
  ): SelectionState {
    // 블록 노드 경계 확인 및 조정 로직
    // ...
    return selection;
  }
}
```

### 효과
- 일관된 selection 보장
- 비정상적인 selection 방지
- 사용자 경험 향상

---

## 7. Transaction Filtering (트랜잭션 필터링)

### 문제
- 특정 조건의 transaction만 허용
- 예: 특정 노드 타입만 수정 가능

### 해결: `onBeforeTransaction`
```typescript
class TransactionFilterExtension implements Extension {
  private allowedNodeTypes: string[] = ['paragraph', 'heading'];

  onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
    const ops = transaction.getOperations();
    
    // 허용되지 않은 노드 타입 수정 시도 차단
    for (const op of ops) {
      if (op.type === 'updateNode' || op.type === 'createNode') {
        const nodeType = op.stype || op.attributes?.stype;
        if (nodeType && !this.allowedNodeTypes.includes(nodeType)) {
          console.warn(`[TransactionFilter] Blocked operation on ${nodeType}`);
          return null; // 취소
        }
      }
    }

    return transaction;
  }
}
```

### 효과
- 세밀한 권한 제어
- 특정 노드 타입만 수정 가능
- 보안 강화

---

## 8. Content Validation (컨텐츠 검증)

### 문제
- Schema 검증을 통과했지만 비즈니스 로직 검증 필요
- 예: 최대 글자 수, 특정 패턴 필수

### 해결: `onBeforeTransaction`
```typescript
class ContentValidationExtension implements Extension {
  private maxLength: number = 1000;

  onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
    const ops = transaction.getOperations();
    
    for (const op of ops) {
      if (op.type === 'insertText') {
        const node = editor.dataStore.getNode(op.nodeId);
        const currentLength = node?.text?.length || 0;
        const newLength = currentLength + op.text.length;

        if (newLength > this.maxLength) {
          // 최대 길이 초과 시 취소
          console.warn(`[ContentValidation] Text too long: ${newLength} > ${this.maxLength}`);
          return null;
        }
      }
    }

    return transaction;
  }
}
```

### 효과
- Schema 검증 이후 추가 검증
- 비즈니스 로직 강제
- 데이터 무결성 보장

---

## 9. Auto-Correction (자동 수정)

### 문제
- 오타 자동 수정
- 대소문자 자동 수정

### 해결: `onBeforeTransaction`
```typescript
class AutoCorrectExtension implements Extension {
  private corrections: Map<string, string> = new Map([
    ['teh', 'the'],
    ['adn', 'and'],
    // ...
  ]);

  onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
    const ops = transaction.getOperations();
    const newOps: Operation[] = [];

    for (const op of ops) {
      if (op.type === 'insertText') {
        // 오타 수정
        let correctedText = op.text;
        for (const [wrong, correct] of this.corrections) {
          correctedText = correctedText.replace(wrong, correct);
        }

        if (correctedText !== op.text) {
          // 수정된 텍스트로 교체
          newOps.push({ ...op, text: correctedText });
          continue;
        }
      }
      newOps.push(op);
    }

    if (newOps.length !== ops.length || 
        newOps.some((op, i) => op !== ops[i])) {
      return transaction.withOperations(newOps);
    }

    return transaction;
  }
}
```

### 효과
- 실시간 오타 수정
- 사용자 경험 향상
- 일관된 텍스트 품질

---

## 10. Transaction Batching (트랜잭션 배칭)

### 문제
- 빠른 연속 입력 시 transaction이 너무 많음
- 성능 저하 및 이벤트 폭주

### 해결: `onBeforeTransaction`
```typescript
class TransactionBatchingExtension implements Extension {
  private pendingOps: Operation[] = [];
  private batchTimeout: number | null = null;

  onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null {
    const ops = transaction.getOperations();
    
    // 배치에 추가
    this.pendingOps.push(...ops);

    // 타임아웃 설정 (100ms 내 추가 transaction이 없으면 배치 실행)
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = window.setTimeout(() => {
      // 배치 실행
      const batchedTransaction = transaction.withOperations(this.pendingOps);
      this.pendingOps = [];
      this.batchTimeout = null;
      
      // 실제 transaction 실행 (재귀 방지를 위해 플래그 설정)
      editor.executeTransaction(batchedTransaction);
    }, 100);

    // 현재 transaction은 취소 (배치에서 처리)
    return null;
  }
}
```

### 효과
- Transaction 수 감소
- 성능 향상
- 이벤트 폭주 방지

---

## 구현 방식 요약

### Before Hooks 시그니처
```typescript
interface Extension {
  // Transaction 가로채기
  onBeforeTransaction?(
    editor: Editor, 
    transaction: Transaction
  ): Transaction | null | void;
  // - Transaction 반환: 수정된 transaction 사용
  // - null 반환: transaction 취소
  // - void: 그대로 진행

  // Selection 가로채기
  onBeforeSelectionChange?(
    editor: Editor, 
    selection: SelectionState
  ): SelectionState | null | void;
  // - Selection 반환: 다른 selection으로 교체
  // - null 반환: selection 변경 취소
  // - void: 그대로 진행

  // Content 가로채기
  onBeforeContentChange?(
    editor: Editor, 
    content: DocumentState
  ): DocumentState | null | void;
  // - Content 반환: 다른 content로 교체
  // - null 반환: content 변경 취소
  // - void: 그대로 진행
}
```

### 실행 순서
1. Extension들을 `priority` 순으로 정렬
2. 각 Extension의 `onBeforeTransaction` 호출
3. 반환값이 `null`이면 즉시 취소
4. 반환값이 `Transaction`이면 수정된 transaction 사용
5. 모든 Extension 통과 후 실제 transaction 실행

---

## 결론

Before hooks는 다음과 같은 상황에서 유용합니다:

1. **보안**: Read-only 강제, Content sanitization
2. **자동화**: Auto-formatting, Auto-correction
3. **보호**: Collaborative editing protection
4. **검증**: Content validation, Transaction filtering
5. **최적화**: Transaction batching
6. **추적**: Change tracking

이러한 기능들은 **단순 이벤트 리스너로는 불가능**하며, **transaction/selection/content를 가로채서 수정하거나 취소**할 수 있어야 구현 가능합니다.
