# Decorator 통합 가이드

## 개요

이 문서는 Decorator 시스템을 AI 통합 및 협업 환경에서 사용하는 방법을 설명합니다.

## 핵심 원칙

### Decorator는 AI와 무관한 일반 도구

**Decorator는 AI 전용 기능이 아니다.**

- Decorator는 일반적인 UI 표시 도구
- AI는 편집의 주체일 뿐
- AI가 작업 상태를 표시하기 위해 기존 decorator를 사용
- AI 작업 완료 후 모델 업데이트로 끝

### AI의 작업 흐름

1. **작업 시작**: `addDecorator()`로 decorator 추가 (일반 decorator 사용)
2. **작업 진행**: `updateDecorator(id, updates)`로 decorator 업데이트
3. **작업 완료**: 모델 업데이트 + `removeDecorator(id)`로 decorator 제거

**Decorator 자체에는 AI 관련 특별한 기능이 없다.**

## AI 통합

### 기본 시나리오: AI가 텍스트 생성

```typescript
// AI가 새로운 문단을 생성하는 과정

// 1단계: 작업 시작 전에 decorator 추가
// 일반 comment decorator를 사용하여 "생성 중" 표시
const workingDecorator: Decorator = {
  sid: 'work-indicator-1',
  stype: 'comment',  // 일반 comment decorator
  category: 'block',
  target: {
    sid: 'paragraph-1'
  },
  position: 'after',  // paragraph-1 다음에 생성 예정
  data: {
    text: 'AI가 새로운 문단을 생성하고 있습니다...'
  }
};

// Decorator 추가하고 ID 받기
const decoratorId = view.addDecorator(workingDecorator);

// 2단계: AI 작업 수행 (비동기)
// 작업 진행 중 decorator 업데이트 가능
view.updateDecorator(decoratorId, {
  data: {
    text: 'AI가 생성 중... 50%'
  }
});

const newParagraph = await aiGenerateParagraph();

// 3단계: 작업 완료
// - 모델 업데이트 (실제 컨텐츠 삽입)
editor.transaction([
  insertContent('paragraph-1', 'after', {
    sid: 'paragraph-2',
    stype: 'paragraph',
    content: [
      {
        sid: 'text-1',
        stype: 'inline-text',
        text: newParagraph
      }
    ]
  })
]).commit();

// - Decorator 제거
view.removeDecorator(decoratorId);
```

### AI가 기존 텍스트 편집

```typescript
// AI가 기존 텍스트를 개선하는 과정

// 1단계: 편집할 영역에 decorator 추가
// 일반 highlight decorator를 사용하여 "편집 중" 표시
const editingDecorator: Decorator = {
  sid: 'work-indicator-2',
  stype: 'highlight',  // 일반 highlight decorator
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 10,
    endOffset: 30
  },
  data: {
    message: 'AI가 이 부분을 개선하고 있습니다...'
  }
};

const decoratorId = view.addDecorator(editingDecorator);

// 2단계: AI 작업 수행
// 진행 중 업데이트 가능
view.updateDecorator(decoratorId, {
  data: {
    message: 'AI가 개선 중... 80%'
  }
});

const improvedText = await aiImproveText('text-1', 10, 30);

// 3단계: 작업 완료
// - 모델 업데이트 (텍스트 교체)
editor.transaction([
  updateText('text-1', 10, 30, improvedText)
]).commit();

// - Decorator 제거
view.removeDecorator(decoratorId);
```

### Block Decorator의 Position 설명

```typescript
// Block decorator의 position 옵션

// 1. 'before': target의 형제로 앞에 삽입
const beforeDecorator: Decorator = {
  category: 'block',
  target: { sid: 'paragraph-1' },
  position: 'before'  // paragraph-1 앞에 삽입
};

// 2. 'after': target의 형제로 뒤에 삽입
const afterDecorator: Decorator = {
  category: 'block',
  target: { sid: 'paragraph-1' },
  position: 'after'  // paragraph-1 뒤에 삽입
};

// 3. 'inside-start': target의 첫 번째 자식으로 삽입
const insideStartDecorator: Decorator = {
  category: 'block',
  target: { sid: 'section-1' },
  position: 'inside-start'  // section-1의 첫 번째 자식으로 삽입
};

// 4. 'inside-end': target의 마지막 자식으로 삽입
const insideEndDecorator: Decorator = {
  category: 'block',
  target: { sid: 'section-1' },
  position: 'inside-end'  // section-1의 마지막 자식으로 삽입
};

// 예시: AI가 section 하위에 paragraph 생성
const aiWorkDecorator: Decorator = {
  sid: 'ai-work-1',
  stype: 'comment',
  category: 'block',
  target: { sid: 'section-1' },
  position: 'inside-end',  // section-1의 마지막 자식으로 들어감
  data: { text: 'AI가 생성 중...' }
};
```

### AI 작업 관리 헬퍼

```typescript
/**
 * AI 작업을 관리하는 간단한 헬퍼
 * Decorator는 그냥 일반 도구로 사용
 */
export class AIWorkManager {
  constructor(private view: EditorViewDOM) {}
  
  /**
   * AI 작업 시작
   * - 일반 decorator를 사용하여 작업 상태 표시
   * @returns decorator ID
   */
  startWork(
    workType: 'generate' | 'edit' | 'analyze',
    target: DecoratorTarget,
    position?: DecoratorPosition,
    message: string = 'AI가 작업 중...'
  ): string {
    // 적절한 decorator 타입 선택
    const decoratorType = this.getDecoratorTypeForWork(workType);
    const category = this.getCategoryForWork(workType);
    
    // 일반 decorator 생성
    const decorator: Decorator = {
      sid: `ai-work-${Date.now()}`,
      stype: decoratorType,
      category,
      target,
      position,
      data: {
        message,
        workType,
        startTime: Date.now()
      }
    };
    
    // Decorator 추가하고 ID 반환
    return this.view.addDecorator(decorator);
  }
  
  /**
   * AI 작업 진행 중 업데이트
   */
  updateWork(decoratorId: string, updates: Partial<Decorator>): void {
    this.view.updateDecorator(decoratorId, updates);
  }
  
  /**
   * AI 작업 완료
   * - 모델 업데이트
   * - Decorator 제거
   */
  completeWork(
    decoratorId: string,
    modelUpdate: (model: ModelData) => ModelData
  ): void {
    const decorator = this.view.decoratorManager.get(decoratorId);
    if (!decorator) return;
    
    // 모델 업데이트
    const updatedModel = modelUpdate(this.getModel(decorator.target));
    this.updateModel(decorator.target, updatedModel);
    
    // Decorator 제거
    this.view.removeDecorator(decoratorId);
  }
  
  /**
   * AI 작업 취소
   * - Decorator만 제거
   */
  cancelWork(decoratorId: string): void {
    this.view.removeDecorator(decoratorId);
  }
  
  private getDecoratorTypeForWork(workType: string): string {
    switch (workType) {
      case 'generate':
        return 'comment';  // 생성 중 표시
      case 'edit':
        return 'highlight'; // 편집 중 표시
      case 'analyze':
        return 'overlay';   // 분석 중 표시
      default:
        return 'comment';
    }
  }
  
  private getCategoryForWork(workType: string): 'inline' | 'block' | 'layer' {
    switch (workType) {
      case 'generate':
        return 'block';
      case 'edit':
        return 'inline';
      case 'analyze':
        return 'layer';
      default:
        return 'block';
    }
  }
}
```

## 협업 환경

### 핵심 원칙: Selection과 동일한 패턴

**Decorator는 Selection과 동일하게 별도 채널로 관리됩니다.**

### DocumentModel vs EditorModel 분리

```typescript
// DocumentModel (공유 가능)
- 문서 내용 (텍스트, 구조)
- Marks (서식 정보)
- 네트워크를 통해 동기화
- 저장소에 저장

// EditorModel (로컬 + 별도 채널)
- Selection (커서/범위)
- Decorators (주석, 하이라이트 등)
- 별도 경량 채널로 전달
- 로컬 상태 + 원격 상태 분리 관리
```

### 채널 분리 구조

```
┌─────────────────────────────────────┐
│     DocumentModel (OT/CRDT)        │
│  - 텍스트, 구조, Marks              │
│  - 무거운 데이터                    │
│  - 충돌 해결 필요                   │
└─────────────────────────────────────┘
              ↓
        [네트워크 전송]

┌─────────────────────────────────────┐
│  EditorModel (Presence/Session)     │
│  - Selection (별도 채널)            │
│  - Decorators (별도 채널)           │
│  - 경량 데이터                      │
│  - 실시간 동기화                    │
└─────────────────────────────────────┘
```

### 원격 Decorator 관리

다른 사용자나 AI 에이전트의 decorator를 관리합니다.

```typescript
// 원격 decorator 추가
view.remoteDecoratorManager.setRemoteDecorator(
  {
    sid: 'remote-1',
    stype: 'highlight',
    category: 'inline',
    target: { sid: 't1', startOffset: 0, endOffset: 5 },
    data: { color: 'blue' }
  },
  { userId: 'user-2', sessionId: 'session-2' }
);

// 특정 사용자의 decorator 제거
view.remoteDecoratorManager.removeByOwner('user-2');

// 모든 원격 decorator 조회
const remoteDecorators = view.remoteDecoratorManager.getAll();
```

### 동시 편집 시스템 통합

```typescript
/**
 * 동시 편집 시스템과 Decorator 통합
 */
export class CollaborativeDecoratorManager {
  private editorView: EditorViewDOM;
  private collaborationClient: CollaborationClient;
  
  constructor(editorView: EditorViewDOM) {
    this.editorView = editorView;
    this.collaborationClient = new CollaborationClient();
    
    // 브로드캐스트 메시지 수신
    this.collaborationClient.on('message', (message: CollaborationMessage) => {
      this.handleRemoteMessage(message);
    });
  }
  
  /**
   * 로컬 decorator 추가 (브로드캐스트 포함)
   */
  addLocalDecorator(decorator: Decorator): string {
    // 로컬에 추가
    const sid = this.editorView.addDecorator(decorator);
    
    // 다른 클라이언트에 브로드캐스트
    this.collaborationClient.broadcast({
      type: 'decorator-add',
      decorator,
      owner: {
        userId: this.getCurrentUserId(),
        sessionId: this.getCurrentSessionId()
      }
    });
    
    return sid;
  }
  
  /**
   * 외부 메시지 처리
   */
  private handleRemoteMessage(message: CollaborationMessage): void {
    switch (message.type) {
      case 'decorator-add':
        // 외부 decorator 추가
        this.editorView.remoteDecoratorManager.setRemoteDecorator(
          message.decorator,
          message.owner
        );
        // 재렌더링
        this.editorView.render();
        break;
        
      case 'decorator-update':
        // 외부 decorator 업데이트
        const existing = this.editorView.remoteDecoratorManager
          .get(message.sid);
        
        if (existing && existing.owner?.userId === message.owner.userId) {
          this.editorView.remoteDecoratorManager.setRemoteDecorator(
            { ...existing, ...message.updates },
            message.owner
          );
          this.editorView.render();
        }
        break;
        
      case 'decorator-remove':
        // 외부 decorator 제거
        this.editorView.remoteDecoratorManager.removeRemoteDecorator(
          message.sid
        );
        this.editorView.render();
        break;
        
      case 'user-disconnect':
        // 사용자 연결 해제 시 해당 사용자의 decorator 모두 제거
        this.editorView.remoteDecoratorManager.removeByOwner(
          message.userId
        );
        this.editorView.render();
        break;
    }
  }
}
```

### 브로드캐스트 메시지 타입

```typescript
/**
 * 동시 편집 브로드캐스트 메시지
 * Selection과 동일한 경량 채널 사용
 */
type CollaborationMessage = 
  // Selection 메시지 (참고)
  | {
      type: 'selection-update';
      userId: string;
      selection: ModelSelection;
      timestamp: number;
    }
  // Decorator 메시지 (동일한 패턴)
  | {
      type: 'decorator-add';
      decorator: Decorator;
      owner: DecoratorOwner;
      timestamp: number;
    }
  | {
      type: 'decorator-update';
      sid: string;
      updates: Partial<Decorator>;
      owner: DecoratorOwner;
      timestamp: number;
    }
  | {
      type: 'decorator-remove';
      sid: string;
      owner: DecoratorOwner;
      timestamp: number;
    }
  | {
      type: 'user-disconnect';
      userId: string;
    };
```

## 시각적 구분

### 외부 Decorator 시각화

외부 사용자/AI의 decorator는 시각적으로 구분할 수 있어야 합니다:

```typescript
/**
 * Decorator 렌더링 시 소유자 정보 표시
 */
function renderDecorator(decorator: Decorator): VNode {
  const isRemote = decorator.source === 'remote';
  const owner = decorator.owner;
  
  return {
    tag: 'div',
    attrs: {
      'data-decorator-sid': decorator.sid,
      'data-decorator-source': decorator.source,
      'data-owner-id': owner?.userId,
      'data-agent-id': owner?.agentId,
      class: [
        'decorator',
        isRemote ? 'decorator-remote' : 'decorator-local',
        owner?.agentId ? 'decorator-ai' : 'decorator-user'
      ].join(' ')
    },
    children: [
      // Decorator 내용
      renderDecoratorContent(decorator),
      
      // 외부 decorator인 경우 소유자 표시
      isRemote ? {
        tag: 'span',
        attrs: { class: 'decorator-owner-badge' },
        text: owner?.agentId 
          ? `AI: ${owner.agentId}`
          : `User: ${owner?.userId}`
      } : null
    ].filter(Boolean)
  };
}
```

### CSS 스타일링

```css
/* 외부 decorator 스타일 */
.decorator-remote {
  opacity: 0.8;
  border-left: 3px solid #2196F3; /* 파란색으로 구분 */
}

/* AI decorator 스타일 */
.decorator-ai {
  border-left-color: #FF9800; /* 주황색으로 구분 */
}

/* 소유자 배지 */
.decorator-owner-badge {
  font-size: 10px;
  color: #666;
  margin-left: 4px;
}
```

## 예시 시나리오

### 시나리오 1: 외부 사용자가 decorator 추가

```typescript
// 외부 사용자 A가 decorator 추가
// → 브로드캐스트 메시지 수신
{
  type: 'decorator-add',
  decorator: {
    sid: 'comment-remote-1',
    stype: 'comment',
    category: 'inline',
    target: { sid: 'text-1', startOffset: 0, endOffset: 10 },
    data: { text: '외부 사용자 A의 코멘트' }
  },
  owner: {
    userId: 'user-a',
    sessionId: 'session-a-123'
  }
}

// → RemoteDecoratorManager에 추가
view.remoteDecoratorManager.setRemoteDecorator(
  decorator,
  owner
);

// → 재렌더링
view.render();
// → 외부 decorator가 파란색 테두리로 표시됨
```

### 시나리오 2: 외부 AI가 decorator 추가

```typescript
// 외부 사용자 B의 AI가 decorator 추가
{
  type: 'decorator-add',
  decorator: {
    sid: 'ai-work-remote-1',
    stype: 'comment',
    category: 'block',
    target: { sid: 'paragraph-1' },
    position: 'after',
    data: { text: '외부 AI가 작업 중...' }
  },
  owner: {
    userId: 'user-b',
    agentId: 'ai-writer',
    sessionId: 'session-b-456'
  }
}

// → 외부 AI decorator가 주황색 테두리로 표시됨
// → "AI: ai-writer" 배지 표시
```

### 시나리오 3: 사용자 연결 해제

```typescript
// 사용자 A가 연결 해제
{
  type: 'user-disconnect',
  userId: 'user-a'
}

// → 사용자 A의 모든 decorator 제거
view.remoteDecoratorManager.removeByOwner('user-a');

// → 재렌더링
view.render();
```

## 요약

### 핵심 포인트

1. **Selection과 동일한 패턴**: Decorator는 Selection처럼 별도 채널로 관리
2. **DocumentModel과 분리**: DocumentModel 변경(OT/CRDT)과 EditorModel 변경(Presence/Session) 분리
3. **로컬/외부 분리**: Selection 정보처럼 decorator도 로컬과 외부를 분리 관리
4. **통합 렌더링**: 렌더링 시 모든 decorator 통합하여 표시
5. **소유자 정보**: 각 decorator에 소유자 정보 포함
6. **시각적 구분**: 외부 decorator는 시각적으로 구분
7. **자동 동기화**: 브로드캐스트를 통한 자동 동기화

### 채널 구조

```
DocumentModel (OT/CRDT 채널)
  ↓
  텍스트, 구조, Marks 변경
  (무거운 데이터, 충돌 해결 필요)

EditorModel (Presence/Session 채널)
  ├─ Selection 변경
  │   (경량 데이터, 실시간 동기화)
  └─ Decorator 변경
      (경량 데이터, 실시간 동기화)
```

### 구현 원칙

1. **별도 전송**: Decorator는 operation payload에 포함하지 않음
2. **경량 채널**: Presence/Session 채널 사용 (Selection과 동일)
3. **실시간 동기화**: 변경 즉시 브로드캐스트
4. **로컬 우선**: 로컬 변경은 즉시 반영, 원격 변경은 별도 관리

## 관련 문서

- [Decorator 사용 가이드](./decorator-guide.md) - 기본 사용법 및 예제
- [Decorator 아키텍처](./decorator-architecture.md) - 시스템 아키텍처 및 설계 원칙

