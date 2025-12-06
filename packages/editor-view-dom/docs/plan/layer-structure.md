# Editor-View-DOM 레이어 구조

## 개요

`EditorViewDOM`은 5개의 레이어로 구성된 계층적 구조를 사용합니다. 각 레이어는 서로 다른 목적을 가지며, z-index로 순서가 관리됩니다.

## 레이어 구조

```
┌─────────────────────────────────────────────────────────┐
│ container (position: relative, overflow: hidden)        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Layer 1: Content (z-index: 1)                     │ │
│  │ - position: relative                              │ │
│  │ - contentEditable: true                            │ │
│  │ - 실제 문서 내용이 렌더링되는 곳                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Layer 2: Decorator (z-index: 10)                 │ │
│  │ - position: absolute                               │ │
│  │ - top: 0, left: 0, right: 0, bottom: 0            │ │
│  │ - pointerEvents: none                              │ │
│  │ - Layer decorator가 렌더링되는 overlay 영역       │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Layer 3: Selection (z-index: 100)                 │ │
│  │ - position: absolute                               │ │
│  │ - top: 0, left: 0, right: 0, bottom: 0            │ │
│  │ - pointerEvents: none                              │ │
│  │ - Selection 표시용 overlay                         │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Layer 4: Context (z-index: 200)                   │ │
│  │ - position: absolute                               │ │
│  │ - top: 0, left: 0, right: 0, bottom: 0            │ │
│  │ - pointerEvents: none                              │ │
│  │ - Context menu 등 UI overlay                       │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Layer 5: Custom (z-index: 1000)                   │ │
│  │ - position: absolute                               │ │
│  │ - top: 0, left: 0, right: 0, bottom: 0            │ │
│  │ - pointerEvents: none                              │ │
│  │ - 커스텀 UI overlay                                │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 각 레이어 상세

### 1. Content Layer (`layers.content`)

**역할**: 실제 문서 내용이 렌더링되는 영역

**특징**:
- `position: relative`
- `contentEditable: true` - 사용자 입력 가능
- `z-index: 1` - 가장 아래 레이어
- `renderer-dom`의 `DOMRenderer.render()`가 이 레이어에 문서 내용을 렌더링
- Inline/Block decorator도 이 레이어 내부에 렌더링됨

**렌더링 대상**:
- 문서 노드들 (paragraph, inline-text 등)
- Inline decorator (텍스트 범위에 적용)
- Block decorator (블록 노드에 적용)

### 2. Decorator Layer (`layers.decorator`)

**역할**: Layer decorator가 렌더링되는 overlay 영역

**특징**:
- `position: absolute` - overlay 형태
- `top: 0, left: 0, right: 0, bottom: 0` - 전체 컨테이너를 덮음
- `pointerEvents: none` - 마우스 이벤트 통과 (content 레이어와 상호작용 가능)
- `z-index: 10` - content 위에 표시
- Layer decorator만 이 레이어에 렌더링됨

**렌더링 대상**:
- Layer decorator (커서, selection, comment 등)
- `data.position`으로 절대 위치 지정
- `target`은 선택사항 (overlay 형태이므로)

**예시**:
```typescript
// 커서 (overlay 형태)
view.addDecorator({
  sid: 'cursor-1',
  stype: 'cursor',
  category: 'layer',
  // target 없이 data.position만으로 위치 지정
  data: {
    position: { top: 10, left: 50, width: 2, height: 18 },
    color: '#0066cc'
  }
});
// → layers.decorator에 렌더링됨
```

### 3. Selection Layer (`layers.selection`)

**역할**: Selection 표시용 overlay

**특징**:
- `position: absolute` - overlay 형태
- `top: 0, left: 0, right: 0, bottom: 0` - 전체 컨테이너를 덮음
- `pointerEvents: none` - 마우스 이벤트 통과
- `z-index: 100` - decorator 위에 표시

**사용 예시**:
- 브라우저 네이티브 selection 대신 커스텀 selection 표시
- 다중 selection 표시
- Remote user selection 표시

### 4. Context Layer (`layers.context`)

**역할**: Context menu 등 UI overlay

**특징**:
- `position: absolute` - overlay 형태
- `top: 0, left: 0, right: 0, bottom: 0` - 전체 컨테이너를 덮음
- `pointerEvents: none` - 기본적으로 이벤트 통과 (필요시 개별 요소에서 활성화)
- `z-index: 200` - selection 위에 표시

**사용 예시**:
- Context menu
- Tooltip
- Popover

### 5. Custom Layer (`layers.custom`)

**역할**: 커스텀 UI overlay

**특징**:
- `position: absolute` - overlay 형태
- `top: 0, left: 0, right: 0, bottom: 0` - 전체 컨테이너를 덮음
- `pointerEvents: none` - 기본적으로 이벤트 통과 (필요시 개별 요소에서 활성화)
- `z-index: 1000` - 가장 위에 표시

**사용 예시**:
- 모달 다이얼로그
- 드래그 앤 드롭 오버레이
- 커스텀 위젯

## Decorator 카테고리별 렌더링 위치

### Inline Decorator
- **렌더링 위치**: `layers.content` 내부
- **특징**: 텍스트 범위에 직접 적용 (텍스트를 감싸는 형태)
- **예시**: highlight, underline

```typescript
view.addDecorator({
  sid: 'highlight-1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 'text-1', startOffset: 0, endOffset: 10 },
  data: { color: 'yellow' }
});
// → layers.content 내부의 텍스트에 직접 적용
```

### Block Decorator
- **렌더링 위치**: `layers.content` 내부
- **특징**: 블록 노드에 적용 (before/after 위치로 삽입)
- **예시**: quote, callout

```typescript
view.addDecorator({
  sid: 'quote-1',
  stype: 'quote',
  category: 'block',
  target: { sid: 'paragraph-1' },
  position: 'after',
  data: { text: 'Quote text' }
});
// → layers.content 내부의 paragraph-1 다음에 삽입
```

### Layer Decorator
- **렌더링 위치**: `layers.decorator` (overlay 영역)
- **특징**: 절대 위치로 overlay 형태로 표시
- **예시**: cursor, selection, comment

```typescript
view.addDecorator({
  sid: 'cursor-1',
  stype: 'cursor',
  category: 'layer',
  // target은 선택사항
  data: {
    position: { top: 10, left: 50, width: 2, height: 18 },
    color: '#0066cc'
  }
});
// → layers.decorator에 렌더링됨 (overlay)
```

## 레이어 간 상호작용

### 이벤트 처리

1. **Content Layer**: 
   - 사용자 입력, 클릭, 키보드 이벤트 등 모든 상호작용 가능
   - `contentEditable: true`로 직접 편집 가능

2. **Overlay Layers (Decorator, Selection, Context, Custom)**:
   - `pointerEvents: none`으로 기본적으로 이벤트 통과
   - 개별 요소에서 `pointerEvents: auto`로 활성화 가능
   - 예: Layer decorator의 클릭 가능한 comment

### Z-Index 순서

```
Content (1) < Decorator (10) < Selection (100) < Context (200) < Custom (1000)
```

이 순서는 시각적 계층을 나타냅니다:
- Content가 가장 아래 (실제 문서)
- Decorator가 그 위 (커서, comment 등)
- Selection이 그 위 (선택 영역 강조)
- Context가 그 위 (메뉴 등)
- Custom이 가장 위 (모달 등)

## 실제 사용 예시

### 커서 렌더링

```typescript
// Remote user 커서
view.remoteDecoratorManager.setRemoteDecorator(
  {
    sid: `cursor-${userId}`,
    stype: 'remote-cursor',
    category: 'layer',
    data: {
      position: { top: 10, left: 50, width: 2, height: 18 },
      color: '#0066cc'
    }
  },
  { userId, sessionId }
);
// → layers.decorator에 렌더링됨 (overlay)
```

### Selection 렌더링

```typescript
// Custom selection 표시
const selectionElement = document.createElement('div');
selectionElement.style.position = 'absolute';
selectionElement.style.top = '10px';
selectionElement.style.left = '50px';
selectionElement.style.width = '100px';
selectionElement.style.height = '18px';
selectionElement.style.backgroundColor = 'rgba(0, 102, 204, 0.3)';
view.layers.selection.appendChild(selectionElement);
// → layers.selection에 직접 추가
```

### Comment 렌더링

```typescript
// Comment decorator
view.addDecorator({
  sid: 'comment-1',
  stype: 'comment',
  category: 'layer',
  target: { sid: 'text-1', startOffset: 0, endOffset: 10 },
  data: {
    position: { top: 10, left: 50 },
    text: 'This is a comment'
  }
});
// → layers.decorator에 렌더링됨 (overlay)
```

## 요약

- **Content Layer**: 실제 문서 내용 (Inline/Block decorator 포함)
- **Decorator Layer**: Layer decorator overlay (커서, comment 등)
- **Selection Layer**: Selection 표시 overlay
- **Context Layer**: Context menu 등 UI overlay
- **Custom Layer**: 커스텀 UI overlay

**Layer decorator는 overlay 영역(`layers.decorator`)에 렌더링되며, content 영역이 아닙니다.**

