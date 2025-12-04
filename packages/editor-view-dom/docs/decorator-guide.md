# Decorator 사용 가이드

## 개요

Decorator는 EditorModel 레벨의 임시 UI 상태로, 문서에 시각적 효과나 메타데이터를 추가하는 데 사용됩니다. Decorator는 **선택적 타입 시스템(Opt-in)**을 지원하여, 타입 정의 없이도 사용할 수 있지만, 필요할 때 타입을 정의하여 검증과 기본값 적용을 활성화할 수 있습니다.

## 빠른 시작

### 1. 기본 설정

```typescript
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { defineDecorator, element, text } from '@barocss/dsl';

// 에디터 초기화
const container = document.getElementById('editor');
const editor = new Editor({ dataStore: new DataStore() });
const view = new EditorViewDOM(editor, { 
  container,
  autoRender: false
});
```

### 2. 첫 번째 Decorator 만들기

```typescript
// 1. 템플릿 정의 (선택적)
defineDecorator('my-comment', element('div', {
  className: 'my-comment',
  style: {
    position: 'absolute',
    backgroundColor: '#e3f2fd',
    border: '1px solid #2196f3',
    borderRadius: '4px',
    padding: '8px',
    cursor: 'pointer'
  },
  onClick: (e: MouseEvent) => {
    console.log('Comment clicked!');
  }
}, [text('💬 Comment')]));

// 2. Decorator 추가
view.addDecorator({
  sid: 'comment-1',
  stype: 'my-comment',
  category: 'layer',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 5
  },
  data: { content: 'This is a comment' }
});

// 3. 렌더링
view.render();
```

## 기본 사용법

### 타입 정의 없이 사용 (빠른 프로토타이핑)

```typescript
// 타입 정의 없이 바로 사용 가능
view.addDecorator({
  sid: 'd1',
  stype: 'highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 10
  },
  data: {
    color: 'yellow',
    opacity: 0.5
  }
});
```

**특징:**
- 타입 정의 없이 즉시 사용 가능
- 기본 필드 검증만 수행 (sid, category, stype 필수)
- 데이터 스키마 검증 없음
- 기본값 적용 없음

### 타입 정의와 함께 사용 (프로덕션)

```typescript
// 1. 앱 초기화 시 타입 정의
view.defineDecoratorType('highlight', 'inline', {
  description: 'Highlight decorator',
  dataSchema: {
    color: { type: 'string', default: 'yellow' },
    opacity: { type: 'number', default: 0.3 }
  }
});

// 2. 런타임에 인스턴스 추가
view.addDecorator({
  sid: 'd1',
  stype: 'highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 10
  },
  data: {
    color: 'red'  // opacity는 기본값 0.3 자동 적용
  }
});
```

**특징:**
- 데이터 스키마 검증 수행
- 기본값 자동 적용
- 타입 안정성 보장
- 잘못된 데이터 시 에러 발생

## Decorator 카테고리

### Inline Decorator

텍스트 범위에 적용되는 decorator입니다. 텍스트 내부에 삽입됩니다.

```typescript
view.addDecorator({
  sid: 'd1',
  stype: 'highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 10
  },
  data: { color: 'yellow' }
});
```

**특징:**
- 텍스트 내부에 `span` 태그로 렌더링
- 텍스트와 함께 흐름
- 이벤트 핸들러 지원

### Block Decorator

블록 노드에 적용되는 decorator입니다. 블록 레벨로 삽입됩니다.

```typescript
view.addDecorator({
  sid: 'd2',
  stype: 'quote',
  category: 'block',
  target: {
    sid: 'paragraph-1'
  },
  data: { author: 'Author Name' }
});
```

**특징:**
- 블록 레벨에 `div` 태그로 렌더링
- `before` 또는 `after` 위치로 삽입
- 이벤트 핸들러 지원

### Layer Decorator

레이어에 오버레이되는 decorator입니다. 문서 위에 절대 위치로 표시됩니다.

**특징:**
- **Overlay 형태**: `position: absolute`로 동작
- **target은 선택사항**: 커서, selection 같은 overlay는 target 없이 `data.position`만으로 위치 지정
- **컨테이너**: `layers.decorator` 레이어에 렌더링 (전체 컨테이너를 덮는 overlay)

```typescript
// 커서나 selection 같은 overlay (target 불필요)
view.addDecorator({
  sid: 'cursor-1',
  stype: 'cursor',
  category: 'layer',
  // target은 선택사항: overlay 형태로 동작
  data: {
    position: {
      top: 10,
      left: 50,
      width: 2,
      height: 18
    },
    color: '#0066cc'
  }
});

// 특정 노드와 연관된 comment (target 사용 가능)
view.addDecorator({
  sid: 'comment-1',
  stype: 'comment',
  category: 'layer',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 10
  },
  data: {
    text: 'This is a comment',
    position: { x: 100, y: 50 }
  }
});
```

**특징:**
- 절대 위치로 배치
- 문서 구조와 독립적
- Z-index로 레이어 관리
- 이벤트 핸들러 지원

## 템플릿 정의

### 기본 템플릿

```typescript
import { defineDecorator, element, text, slot } from '@barocss/dsl';

// 댓글 인디케이터
defineDecorator('comment', element('div', {
  className: 'barocss-comment-indicator',
  style: {
    position: 'absolute',
    width: '20px',
    height: '20px',
    backgroundColor: 'rgba(33,150,243,0.9)',
    border: '2px solid white',
    borderRadius: '50%',
    cursor: 'pointer',
    zIndex: '1000'
  },
  onClick: (e: MouseEvent) => {
    showCommentPopup(e);
  }
}, [text('💬')]));

// 하이라이트
defineDecorator('highlight', element('span', {
  className: 'barocss-highlight',
  style: {
    backgroundColor: 'rgba(255, 213, 79, 0.22)',
    border: '1px solid rgba(255, 193, 7, 0.45)',
    borderRadius: '4px'
  }
}, [slot('text')]));  // 타겟 텍스트가 여기에 삽입됨
```

### 이벤트 처리

```typescript
defineDecorator('interactive-widget', element('div', {
  className: 'barocss-interactive-widget',
  style: { /* 스타일 */ },
  
  // 마우스 이벤트
  onMouseEnter: (e: MouseEvent) => {
    console.log('Mouse entered');
  },
  onClick: (e: MouseEvent) => {
    console.log('Clicked');
    e.stopPropagation();
  },
  
  // 키보드 이벤트
  onKeyDown: (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      console.log('Enter pressed');
    }
  }
}, [text('Widget')]));
```

## 타입 정의

### 기본 구조

```typescript
view.defineDecoratorType(
  type: string,                    // 타입 이름 (예: 'highlight')
  category: 'layer' | 'inline' | 'block',  // 카테고리
  schema: {
    description?: string;          // 타입 설명 (선택적)
    dataSchema?: {                 // 데이터 스키마 (선택적)
      [fieldName: string]: {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        required?: boolean;         // 필수 필드 여부
        default?: any;              // 기본값
      };
    };
  }
);
```

### 예제: 복잡한 타입 정의

```typescript
view.defineDecoratorType('comment', 'layer', {
  description: 'Comment decorator for collaborative editing',
  dataSchema: {
    text: {
      type: 'string',
      required: true  // 필수 필드
    },
    author: {
      type: 'string',
      default: 'Anonymous'
    },
    timestamp: {
      type: 'number',
      default: () => Date.now()  // 함수로 동적 기본값
    },
    position: {
      type: 'object',
      default: { x: 0, y: 0 }
    },
    resolved: {
      type: 'boolean',
      default: false
    }
  }
});
```

## Decorator 관리

### 추가

```typescript
view.addDecorator({
  sid: 'd1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 't1', startOffset: 0, endOffset: 5 },
  data: { color: 'yellow' }
});
// 자동으로 render() 호출됨
```

### 업데이트

```typescript
view.updateDecorator('d1', {
  data: { color: 'red' }
});
// 자동으로 render() 호출됨
```

### 제거

```typescript
view.removeDecorator('d1');
// 자동으로 render() 호출됨
```

### 조회

```typescript
// 모든 decorator 조회
const allDecorators = view.decoratorManager.getAll();

// 특정 decorator 조회
const decorator = view.decoratorManager.get('d1');

// 특정 노드의 decorator 조회
const nodeDecorators = view.decoratorManager.getByTarget('text-1');
```

## 협업 환경

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

### 채널 분리

Decorator는 Selection과 동일하게 별도 채널로 관리됩니다:

- **DocumentModel 변경**: OT/CRDT 채널 (무거운 데이터)
- **Decorator 변경**: Presence/Session 채널 (경량 데이터, 실시간 동기화)

자세한 내용은 [Decorator 통합 가이드](./decorator-integration.md)를 참조하세요.

## 실제 사용 시나리오

### 시나리오 1: 빠른 프로토타이핑

```typescript
// 타입 정의 없이 바로 사용
view.addDecorator({
  sid: 'temp-1',
  stype: 'quick-highlight',
  category: 'inline',
  target: { sid: 't1', startOffset: 0, endOffset: 10 },
  data: { color: 'yellow' }
});
```

### 시나리오 2: 프로덕션 환경

```typescript
// 앱 초기화 시 모든 타입 정의
view.defineDecoratorType('highlight', 'inline', {
  dataSchema: {
    color: { type: 'string', default: 'yellow' },
    opacity: { type: 'number', default: 0.3 }
  }
});

view.defineDecoratorType('comment', 'layer', {
  dataSchema: {
    text: { type: 'string', required: true },
    author: { type: 'string', default: 'Anonymous' }
  }
});

// 런타임에 안전하게 사용
view.addDecorator({
  sid: 'prod-1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 't1', startOffset: 0, endOffset: 10 },
  data: { color: 'red' }  // opacity는 기본값 적용
});
```

### 시나리오 3: 플러그인 시스템

```typescript
// 플러그인이 자체 decorator 타입 정의
class MyPlugin {
  initialize(view: EditorViewDOM) {
    view.defineDecoratorType('plugin-widget', 'block', {
      description: 'Plugin widget decorator',
      dataSchema: {
        widgetId: { type: 'string', required: true },
        config: { type: 'object', default: {} }
      }
    });
  }
  
  addWidget(view: EditorViewDOM, targetSid: string) {
    view.addDecorator({
      sid: `widget-${Date.now()}`,
      stype: 'plugin-widget',
      category: 'block',
      target: { sid: targetSid },
      data: {
        widgetId: 'widget-123',
        config: { theme: 'dark' }
      }
    });
  }
}
```

## 검증 동작 비교

| 상황 | 기본 필드 검증 | 데이터 스키마 검증 | 기본값 적용 |
|------|---------------|------------------|-----------|
| 타입 정의 없음 | ✅ 수행 | ❌ 없음 | ❌ 없음 |
| 타입 정의 있음 | ✅ 수행 | ✅ 수행 | ✅ 수행 |

## 주의사항

1. **타입 정의는 앱 초기화 시 수행 권장**
   - 런타임에 타입을 정의해도 되지만, 일관성을 위해 초기화 시 정의하는 것이 좋습니다.

2. **타입 정의는 선택적**
   - 모든 decorator 타입을 정의할 필요는 없습니다.
   - 필요한 타입만 선택적으로 정의하세요.

3. **기본값은 함수로 동적 생성 가능**
   ```typescript
   dataSchema: {
     timestamp: {
       type: 'number',
       default: () => Date.now()  // 매번 새로운 값
     }
   }
   ```

4. **자동 렌더링**
   - `addDecorator()`, `updateDecorator()`, `removeDecorator()` 호출 시 자동으로 `render()`가 호출됩니다.

## 관련 문서

- [Decorator 아키텍처](./decorator-architecture.md) - 시스템 아키텍처 및 설계 원칙
- [Decorator 통합 가이드](./decorator-integration.md) - AI 통합 및 협업 환경
- [Pattern & Custom Decorator 예제](./decorator-pattern-and-custom-examples.md) - Pattern과 Custom Decorator 상세 예제

