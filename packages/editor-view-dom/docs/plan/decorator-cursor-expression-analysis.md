# Decorator를 통한 커서 표현 분석

## 질문

Target, Pattern, Custom Decorator를 통해 특정 부분의 커서를 표현할 수 있는가?  
현재 renderer-dom에서 decorator 표현하는 방식이 커서도 가능한가?

## 분석 결과

### 현재 Decorator 렌더링 방식

#### 1. Inline Decorator
- **렌더링 방식**: 텍스트 범위(`startOffset`, `endOffset`)를 감싸는 형태
- **처리 로직**: `splitTextByDecorators`에서 텍스트를 분할하고 decorator로 감쌈
- **제한사항**: `if (e > s)` 조건으로 **`startOffset === endOffset`인 경우(커서 위치)는 처리하지 않음**

```typescript
// packages/renderer-dom/src/vnode/decorator/processor.ts
if (e > s) {  // ← startOffset === endOffset인 경우 스킵됨
  boundaries.add(s);
  boundaries.add(e);
  // ...
}
```

**결론**: ❌ **Inline Decorator로는 커서 표현이 어렵습니다** (0-width 범위 미지원)

#### 2. Layer Decorator
- **렌더링 방식**: 절대 위치(`position: absolute`)로 오버레이
- **위치 지정**: `data.position`에 `{ top, left, width, height }` 지정 가능
- **컨테이너**: `layers.decorator` 레이어에 렌더링

```typescript
// packages/editor-view-dom/src/decorator/decorator-renderer.ts
if (decorator.category === 'layer' && decorator.data.position) {
  return {
    ...baseData,
    decoratorStyles: {
      position: 'absolute',
      top: `${decorator.data.position.top}px`,
      left: `${decorator.data.position.left}px`,
      width: `${decorator.data.position.width}px`,
      height: `${decorator.data.position.height}px`,
      pointerEvents: 'none'
    }
  };
}
```

**결론**: ✅ **Layer Decorator로 커서 표현 가능** (절대 위치 지정)

#### 3. Block Decorator
- **렌더링 방식**: 블록 노드에 적용 (before/after/inside-start/inside-end)
- **결론**: ❌ **커서 표현에는 부적합** (블록 단위)

---

## 커서 표현 방법

### 방법 1: Layer Decorator 사용 (권장)

Layer Decorator를 사용하여 절대 위치로 커서를 표시할 수 있습니다.

```typescript
import { defineDecorator, element } from '@barocss/dsl';

// 커서 템플릿 정의
defineDecorator('cursor', element('div', {
  className: 'cursor',
  style: {
    position: 'absolute',
    width: '2px',
    height: '18px',
    backgroundColor: '#000',
    animation: 'blink 1s infinite',
    pointerEvents: 'none',
    zIndex: 1000
  }
}, []));

// 커서 위치 계산 (예시)
function calculateCursorPosition(nodeId: string, offset: number): { top: number; left: number } {
  // DOM에서 실제 위치 계산
  const element = document.querySelector(`[data-bc-sid="${nodeId}"]`);
  if (!element) return { top: 0, left: 0 };
  
  const range = document.createRange();
  const textNode = element.childNodes[0]; // 텍스트 노드 가정
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    range.setStart(textNode, Math.min(offset, textNode.textContent?.length || 0));
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    const containerRect = element.getBoundingClientRect();
    
    return {
      top: rect.top - containerRect.top,
      left: rect.left - containerRect.left
    };
  }
  
  return { top: 0, left: 0 };
}

// 커서 추가
const position = calculateCursorPosition('text-1', 5);
view.addDecorator({
  sid: 'cursor-1',
  stype: 'cursor',
  category: 'layer',
  target: {
    sid: 'text-1'
  },
  data: {
    position: {
      top: position.top,
      left: position.left,
      width: 2,
      height: 18
    }
  }
});
```

### 방법 2: Custom Decorator로 자동 계산

Custom Decorator를 사용하여 커서 위치를 자동으로 계산하고 Layer Decorator를 생성할 수 있습니다.

```typescript
const cursorGenerator: DecoratorGenerator = {
  sid: 'cursor-generator',
  enabled: true,
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    // 커서 위치 정보 (예: selection에서 가져오기)
    const cursorInfo = this.getCursorInfo(); // 외부에서 커서 정보 가져오기
    
    if (cursorInfo && cursorInfo.nodeId === model.sid && text) {
      const position = this.calculatePosition(model.sid, cursorInfo.offset);
      
      decorators.push({
        sid: `cursor-${model.sid}-${cursorInfo.offset}`,
        stype: 'cursor',
        category: 'layer',
        target: {
          sid: model.sid
        },
        data: {
          position: {
            top: position.top,
            left: position.left,
            width: 2,
            height: position.height || 18
          }
        }
      });
    }
    
    return decorators;
  },
  
  calculatePosition(nodeId: string, offset: number): { top: number; left: number; height: number } {
    // DOM에서 실제 위치 계산
    // ...
  },
  
  getCursorInfo(): { nodeId: string; offset: number } | null {
    // Selection API나 다른 소스에서 커서 정보 가져오기
    // ...
  },
  
  onDidChange(callback: () => void): () => void {
    // Selection 변경 감지
    document.addEventListener('selectionchange', callback);
    return () => document.removeEventListener('selectionchange', callback);
  }
};

view.addDecorator(cursorGenerator);
```

### 방법 3: 실시간 협업 - 다른 사용자의 커서

```typescript
const remoteCursorGenerator: DecoratorGenerator = {
  sid: 'remote-cursor-generator',
  enabled: true,
  remoteCursors: new Map<string, { nodeId: string; offset: number; color: string; userName: string }>(),
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    // 원격 사용자들의 커서 표시
    for (const [userId, cursor] of this.remoteCursors.entries()) {
      if (cursor.nodeId === model.sid && text) {
        const position = this.calculatePosition(model.sid, cursor.offset);
        
        decorators.push({
          sid: `remote-cursor-${userId}`,
          stype: 'remote-cursor',
          category: 'layer',
          target: {
            sid: model.sid
          },
          data: {
            position: {
              top: position.top,
              left: position.left,
              width: 2,
              height: position.height || 18
            },
            color: cursor.color,
            userName: cursor.userName
          }
        });
      }
    }
    
    return decorators;
  },
  
  updateRemoteCursor(userId: string, nodeId: string, offset: number, color: string, userName: string): void {
    this.remoteCursors.set(userId, { nodeId, offset, color, userName });
  },
  
  calculatePosition(nodeId: string, offset: number): { top: number; left: number; height: number } {
    // DOM 위치 계산
    // ...
  },
  
  onDidChange(callback: () => void): () => void {
    // WebSocket으로 원격 커서 업데이트 수신
    const ws = new WebSocket('ws://collaboration-server');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'cursor-change') {
        this.updateRemoteCursor(data.userId, data.nodeId, data.offset, data.color, data.userName);
        callback();
      }
    };
    return () => ws.close();
  }
};

view.addDecorator(remoteCursorGenerator);
```

---

## 현재 제한사항 및 개선 방안

### 제한사항

1. **Inline Decorator**: `startOffset === endOffset` (0-width) 미지원
   - `splitTextByDecorators`에서 `if (e > s)` 조건으로 스킵됨
   
2. **위치 계산**: DOM에서 실제 위치를 계산해야 함
   - `Range.getBoundingClientRect()` 사용 필요
   - 레이아웃 변경 시 재계산 필요

### 개선 방안

#### 옵션 1: Inline Decorator에 0-width 지원 추가

```typescript
// packages/renderer-dom/src/vnode/decorator/processor.ts
// 현재
if (e > s) {
  boundaries.add(s);
  boundaries.add(e);
  // ...
}

// 개선안
if (e >= s) {  // 0-width도 허용
  boundaries.add(s);
  if (e > s) {
    boundaries.add(e);
  } else {
    // 0-width인 경우 특별 처리 (커서 표시)
    // ...
  }
}
```

**장점**: Inline Decorator로도 커서 표현 가능  
**단점**: 텍스트 분할 로직 변경 필요, 빈 텍스트 처리 복잡

#### 옵션 2: Layer Decorator 개선 (현재 방식 유지)

- 위치 계산 유틸리티 제공
- 자동 업데이트 메커니즘 추가

**장점**: 현재 구조 유지, 절대 위치로 정확한 표현  
**단점**: DOM 위치 계산 필요

---

## 권장 사항

### 현재 상황

✅ **Layer Decorator로 커서 표현 가능**  
- 절대 위치 지정 지원
- `data.position`으로 정확한 위치 제어
- Custom Decorator로 자동화 가능

❌ **Inline Decorator로는 커서 표현 어려움**  
- 0-width 범위 미지원
- 텍스트 감싸기 방식이라 커서에 부적합

### 실전 활용

1. **로컬 커서**: Layer Decorator + Custom Decorator 조합
   - Custom Decorator가 Selection API를 감지
   - Layer Decorator로 커서 표시

2. **원격 커서**: Layer Decorator + Custom Decorator 조합
   - WebSocket으로 원격 커서 정보 수신
   - Custom Decorator가 자동으로 Layer Decorator 생성

3. **AI 커서**: Layer Decorator + Custom Decorator 조합
   - AI 편집 위치를 Layer Decorator로 표시
   - Custom Decorator가 AI 상태를 감지하여 자동 생성

---

## AI 및 Remote User 커서 렌더링

### 현재 시스템 지원 여부

✅ **완전히 지원됩니다!**

현재 시스템은 이미 AI와 remote user의 커서를 렌더링할 수 있도록 설계되어 있습니다:

1. **RemoteDecoratorManager**: 외부 사용자/AI의 decorator를 별도로 관리
2. **Layer Decorator**: 절대 위치 지정으로 커서 표현
3. **자동 렌더링**: `render()` 호출 시 local + remote + generator decorator 모두 통합

### 실제 사용 예시

#### 1. Remote User 커서

```typescript
// WebSocket이나 다른 채널로 원격 커서 정보 수신
websocket.on('cursor-update', (data: { userId: string; nodeId: string; offset: number; color: string }) => {
  // 커서 위치 계산 (클라이언트 측에서 계산하거나 서버에서 전달)
  const position = calculateCursorPosition(data.nodeId, data.offset);
  
  // Remote Decorator로 커서 추가 (overlay 형태, target 불필요)
  view.remoteDecoratorManager.setRemoteDecorator(
    {
      sid: `remote-cursor-${data.userId}`,
      stype: 'remote-cursor',
      category: 'layer',
      // target은 선택사항: Layer decorator는 overlay 형태로 동작하므로
      // data.position으로만 위치 지정 가능
      data: {
        position: {
          top: position.top,
          left: position.left,
          width: 2,
          height: position.height || 18
        },
        color: data.color,
        userId: data.userId
      }
    },
    {
      userId: data.userId,
      sessionId: data.sessionId
    }
  );
  
  // 자동으로 render()가 호출되거나 수동으로 호출
  view.render();
});

// 사용자 연결 해제 시
websocket.on('user-disconnected', (userId: string) => {
  view.remoteDecoratorManager.removeByOwner(userId);
  view.render();
});
```

#### 2. AI 커서 (편집 중 표시)

```typescript
// AI가 편집 중인 위치 표시
function showAICursor(agentId: string, nodeId: string, offset: number) {
  const position = calculateCursorPosition(nodeId, offset);
  
  view.remoteDecoratorManager.setRemoteDecorator(
    {
      sid: `ai-cursor-${agentId}`,
      stype: 'ai-cursor',
      category: 'layer',
      // target은 선택사항: overlay 형태로 동작
      data: {
        position: {
          top: position.top,
          left: position.left,
          width: 2,
          height: position.height || 18
        },
        color: '#ff6b6b', // AI는 빨간색
        agentId: agentId
      }
    },
    {
      userId: 'system', // 시스템 사용자
      agentId: agentId,
      sessionId: `ai-${agentId}`
    }
  );
  
  view.render();
}

// AI 편집 완료 시 커서 제거
function hideAICursor(agentId: string) {
  view.remoteDecoratorManager.removeByAgent(agentId);
  view.render();
}
```

#### 3. Custom Decorator로 자동화

```typescript
const remoteCursorGenerator: DecoratorGenerator = {
  sid: 'remote-cursor-generator',
  enabled: true,
  remoteCursors: new Map<string, { nodeId: string; offset: number; color: string; userName: string }>(),
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    // 원격 커서들 표시
    for (const [userId, cursor] of this.remoteCursors.entries()) {
      if (cursor.nodeId === model.sid && text) {
        const position = this.calculatePosition(model.sid, cursor.offset);
        
        decorators.push({
          sid: `remote-cursor-${userId}`,
          stype: 'remote-cursor',
          category: 'layer',
          target: {
            sid: model.sid
          },
          data: {
            position: {
              top: position.top,
              left: position.left,
              width: 2,
              height: position.height || 18
            },
            color: cursor.color,
            userName: cursor.userName
          }
        });
      }
    }
    
    return decorators;
  },
  
  calculatePosition(nodeId: string, offset: number): { top: number; left: number; height: number } {
    // DOM에서 실제 위치 계산
    const element = document.querySelector(`[data-bc-sid="${nodeId}"]`);
    if (!element) return { top: 0, left: 0, height: 18 };
    
    const range = document.createRange();
    const textNode = element.childNodes[0];
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      range.setStart(textNode, Math.min(offset, textNode.textContent?.length || 0));
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      const containerRect = element.getBoundingClientRect();
      
      return {
        top: rect.top - containerRect.top,
        left: rect.left - containerRect.left,
        height: rect.height || 18
      };
    }
    
    return { top: 0, left: 0, height: 18 };
  },
  
  updateRemoteCursor(userId: string, nodeId: string, offset: number, color: string, userName: string): void {
    this.remoteCursors.set(userId, { nodeId, offset, color, userName });
  },
  
  onDidChange(callback: () => void): () => void {
    // WebSocket으로 원격 커서 업데이트 수신
    const ws = new WebSocket('ws://collaboration-server');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'cursor-change') {
        this.updateRemoteCursor(data.userId, data.nodeId, data.offset, data.color, data.userName);
        callback(); // 재렌더링 트리거
      }
    };
    return () => ws.close();
  }
};

view.addDecorator(remoteCursorGenerator);
```

### 시스템 통합 흐름

```
┌─────────────────────────────────────────────────────────┐
│ 1. 원격 커서 정보 수신 (WebSocket/Presence Channel)     │
│    - userId, agentId, nodeId, offset, color             │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 2. RemoteDecoratorManager에 추가                        │
│    view.remoteDecoratorManager.setRemoteDecorator(...)  │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 3. render() 호출 (자동 또는 수동)                       │
│    - localDecorators + remoteDecorators 통합            │
│    - renderer-dom으로 렌더링                            │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Layer Decorator로 커서 렌더링                        │
│    - layers.decorator에 절대 위치로 표시                │
│    - 각 사용자/AI별로 다른 색상으로 구분                │
└─────────────────────────────────────────────────────────┘
```

### 주의사항

1. **위치 계산**: DOM에서 실제 위치를 계산해야 함
   - `Range.getBoundingClientRect()` 사용
   - 레이아웃 변경 시 재계산 필요

2. **성능**: 많은 원격 커서가 있을 때
   - 위치 계산 최적화 필요
   - 필요시 throttling/debouncing 적용

3. **자동 업데이트**: 
   - `render()` 호출 필요 (자동 또는 수동)
   - Custom Decorator의 `onDidChange`로 자동화 가능

---

## 결론

**현재 renderer-dom의 decorator 표현 방식으로 커서 표현이 가능합니다.**

- ✅ **Layer Decorator**: 절대 위치 지정으로 커서 표현 가능 (권장)
- ❌ **Inline Decorator**: 0-width 범위 미지원으로 커서 표현 어려움
- ✅ **Custom Decorator**: 커서 위치를 자동 계산하여 Layer Decorator 생성 가능
- ✅ **RemoteDecoratorManager**: AI 및 remote user 커서를 별도로 관리 가능

**AI 및 Remote User 커서 렌더링**: ✅ **완전히 지원됩니다!**

**권장 패턴**: 
- Remote User/AI 커서: `RemoteDecoratorManager` + Layer Decorator
- 자동화: Custom Decorator + `onDidChange`로 실시간 업데이트

