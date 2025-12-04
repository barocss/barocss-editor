# Pattern & Custom Decorator 예제 가이드

## 개요

Decorator 시스템은 세 가지 유형을 지원합니다:
1. **Target Decorator** - 특정 노드나 텍스트 범위를 직접 타겟팅
2. **Pattern Decorator** - 정규식 패턴으로 텍스트를 자동 감지하여 decorator 생성
3. **Custom Decorator** - 함수 기반으로 모델 전체를 분석하여 decorator 동적 생성

이 문서는 Pattern과 Custom Decorator의 실용적인 예제를 제공합니다.

---

## Pattern Decorator 예제

Pattern Decorator는 정규식 패턴을 사용하여 텍스트에서 특정 패턴을 자동으로 감지하고 decorator를 생성합니다.

### 등록 방법

Pattern Decorator를 등록하는 방법은 두 가지가 있습니다:

1. **`registerPatternDecorator()` 사용** (권장) - 명시적이고 타입 안전
2. **`addDecorator()` 사용** - 통일된 API로 모든 decorator 타입 지원

### 방법 1: registerPatternDecorator() 사용 (권장)

```typescript
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '@barocss/editor-view-dom';
import { defineDecorator, element, data } from '@barocss/dsl';

// 1. Decorator 템플릿 정의
defineDecorator('color-picker', element('span', {
  className: 'color-picker',
  style: {
    backgroundColor: data('color'),
    color: '#fff',
    padding: '2px 6px',
    borderRadius: '3px',
    cursor: 'pointer'
  },
  onClick: (e: MouseEvent, props: any) => {
    const color = props.color;
    console.log('Color clicked:', color);
    // 색상 선택기 열기 등
  }
}, [data('text')]));

// 2. Pattern Decorator 등록
view.registerPatternDecorator({
  sid: 'hex-color-pattern',
  stype: 'color-picker',
  category: 'inline',
  pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
  extractData: (match: RegExpMatchArray) => {
    return {
      color: match[0],  // #ff0000 또는 #f00
      text: match[0]
    };
  },
  createDecorator: (nodeId: string, startOffset: number, endOffset: number, extractedData: Record<string, any>) => {
    return {
      sid: `color-${nodeId}-${startOffset}-${endOffset}`,
      target: {
        sid: nodeId,
        startOffset: startOffset,
        endOffset: endOffset
      },
      data: {
        color: extractedData.color,
        text: extractedData.text
      }
    };
  },
  priority: 10  // 낮을수록 높은 우선순위
});

// 3. 문서 렌더링
view.render();
```

### 방법 2: addDecorator() 사용

`addDecorator()`를 사용하면 `decoratorType: 'pattern'`을 명시하거나 `data.pattern`이 있으면 자동으로 pattern decorator로 인식됩니다.

```typescript
// 방법 2-1: decoratorType 명시
view.addDecorator({
  sid: 'hex-color-pattern',
  stype: 'color-picker',
  category: 'inline',
  decoratorType: 'pattern',  // 패턴 decorator임을 명시
  target: { sid: '' },  // 패턴 decorator는 target이 없음
  data: {
    pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
    extractData: (match: RegExpMatchArray) => ({
      color: match[0],
      text: match[0]
    }),
    createDecorator: (nodeId: string, start: number, end: number, data: Record<string, any>) => ({
      sid: `color-${nodeId}-${start}-${end}`,
      target: {
        sid: nodeId,
        startOffset: start,
        endOffset: end
      },
      data: {
        color: data.color,
        text: data.text
      }
    }),
    priority: 10
  }
});

// 방법 2-2: data.pattern이 있으면 자동 인식
view.addDecorator({
  sid: 'hex-color-pattern',
  stype: 'color-picker',
  category: 'inline',
  target: { sid: '' },
  data: {
    pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,  // pattern이 있으면 자동으로 pattern decorator로 인식
    extractData: (match: RegExpMatchArray) => ({ /* ... */ }),
    createDecorator: (nodeId, start, end, data) => ({ /* ... */ }),
    priority: 10
  }
});
```

**참고**: 두 방법 모두 동일하게 작동하며, `addDecorator()`는 모든 decorator 타입(target, pattern, custom)을 통일된 API로 처리할 수 있습니다.

### 예제 1: 이메일 주소 자동 링크

```typescript
// 템플릿 정의
defineDecorator('email-link', element('a', {
  className: 'email-link',
  href: data('email'),
  style: {
    color: '#0066cc',
    textDecoration: 'underline'
  },
  onClick: (e: MouseEvent) => {
    e.preventDefault();
    window.location.href = `mailto:${e.currentTarget.getAttribute('href')}`;
  }
}, [data('text')]));

// Pattern 등록 (registerPatternDecorator 사용)
view.registerPatternDecorator({
  sid: 'email-pattern',
  stype: 'email-link',
  category: 'inline',
  pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  extractData: (match) => ({
    email: match[0],
    text: match[0]
  }),
  createDecorator: (nodeId, start, end, data) => ({
    sid: `email-${nodeId}-${start}-${end}`,
    target: {
      sid: nodeId,
      startOffset: start,
      endOffset: end
    },
    data: {
      email: data.email,
      text: data.text
    }
  }),
  priority: 20
});

// 또는 addDecorator 사용
view.addDecorator({
  sid: 'email-pattern',
  stype: 'email-link',
  category: 'inline',
  decoratorType: 'pattern',
  target: { sid: '' },
  data: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    extractData: (match) => ({ email: match[0], text: match[0] }),
    createDecorator: (nodeId, start, end, data) => ({
      sid: `email-${nodeId}-${start}-${end}`,
      target: { sid: nodeId, startOffset: start, endOffset: end },
      data: { email: data.email, text: data.text }
    }),
    priority: 20
  }
});
```

### 예제 2: URL 자동 링크

```typescript
defineDecorator('url-link', element('a', {
  className: 'url-link',
  href: data('url'),
  target: '_blank',
  rel: 'noopener noreferrer',
  style: {
    color: '#0066cc',
    textDecoration: 'underline'
  }
}, [data('text')]));

view.registerPatternDecorator({
  sid: 'url-pattern',
  stype: 'url-link',
  category: 'inline',
  pattern: /https?:\/\/[^\s]+/g,
  extractData: (match) => ({
    url: match[0],
    text: match[0]
  }),
  createDecorator: (nodeId, start, end, data) => ({
    sid: `url-${nodeId}-${start}-${end}`,
    target: {
      sid: nodeId,
      startOffset: start,
      endOffset: end
    },
    data: {
      url: data.url,
      text: data.text
    }
  }),
  priority: 15
});
```

### 예제 3: 멘션(@username) 자동 감지

```typescript
defineDecorator('mention', element('span', {
  className: 'mention',
  'data-username': data('username'),
  style: {
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
    padding: '2px 4px',
    borderRadius: '3px',
    fontWeight: 'bold'
  },
  onClick: (e: MouseEvent, props: any) => {
    const username = props.username;
    console.log('Mention clicked:', username);
    // 사용자 프로필 열기 등
  }
}, [data('text')]));

// registerPatternDecorator 사용
view.registerPatternDecorator({
  sid: 'mention-pattern',
  stype: 'mention',
  category: 'inline',
  pattern: /@(\w+)/g,
  extractData: (match) => ({
    username: match[1],  // @ 제외한 username만
    text: match[0]        // @username 전체
  }),
  createDecorator: (nodeId, start, end, data) => ({
    sid: `mention-${nodeId}-${start}-${end}`,
    target: {
      sid: nodeId,
      startOffset: start,
      endOffset: end
    },
    data: {
      username: data.username,
      text: data.text
    }
  }),
  priority: 5  // 높은 우선순위
});

// 또는 addDecorator 사용
view.addDecorator({
  sid: 'mention-pattern',
  stype: 'mention',
  category: 'inline',
  decoratorType: 'pattern',
  target: { sid: '' },
  data: {
    pattern: /@(\w+)/g,
    extractData: (match) => ({ username: match[1], text: match[0] }),
    createDecorator: (nodeId, start, end, data) => ({
      sid: `mention-${nodeId}-${start}-${end}`,
      target: { sid: nodeId, startOffset: start, endOffset: end },
      data: { username: data.username, text: data.text }
    }),
    priority: 5
  }
});
```

### 예제 4: 여러 패턴 조합 (우선순위 활용)

```typescript
// 1. 이메일 (우선순위 10) - registerPatternDecorator 사용
view.registerPatternDecorator({
  sid: 'email-pattern',
  stype: 'email-link',
  category: 'inline',
  pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // ... extractData, createDecorator
  priority: 10
});

// 2. URL (우선순위 15) - addDecorator 사용 (두 방법 모두 가능)
view.addDecorator({
  sid: 'url-pattern',
  stype: 'url-link',
  category: 'inline',
  decoratorType: 'pattern',
  target: { sid: '' },
  data: {
    pattern: /https?:\/\/[^\s]+/g,
    // ... extractData, createDecorator
    priority: 15
  }
});

// 이메일이 URL 패턴과 겹치면 이메일이 우선 적용됨 (우선순위가 낮을수록 먼저 적용)
```

### Pattern Decorator 활성화/비활성화

```typescript
// 특정 패턴 비활성화
view.setPatternDecoratorEnabled('hex-color-pattern', false);
view.render();  // 재렌더링 필요

// 다시 활성화
view.setPatternDecoratorEnabled('hex-color-pattern', true);
view.render();
```

### Pattern Decorator 제거

```typescript
// 단일 패턴 제거
view.unregisterPatternDecorator('hex-color-pattern');

// 모든 패턴 제거
view.getPatternDecoratorConfigs().forEach(config => {
  view.unregisterPatternDecorator(config.sid);
});
```

---

## Custom Decorator 예제

Custom Decorator는 함수 기반으로 모델 전체를 분석하여 decorator를 동적으로 생성합니다. Pattern Decorator가 텍스트 패턴에만 국한되는 반면, Custom Decorator는 모델의 구조, 속성, 관계 등을 모두 고려할 수 있습니다.

### 등록 방법

Custom Decorator는 `addDecorator()`로 등록하며, **`generate` 함수의 존재로 자동 인식**됩니다. `decoratorType: 'custom'`을 명시할 수도 있지만 필수는 아닙니다.

**구분 로직:**
- `'generate' in decorator` → Custom Decorator로 인식
- 또는 `decoratorType === 'custom'` → Custom Decorator로 인식

### 기본 사용법

```typescript
import type { DecoratorGenerator, DecoratorGeneratorContext } from '@barocss/editor-view-dom';
import type { ModelData } from '@barocss/dsl';

const spellCheckGenerator: DecoratorGenerator = {
  sid: 'spell-check-generator',
  enabled: true,
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    // 텍스트가 있는 경우에만 처리
    if (!text) return decorators;
    
    // 맞춤법 검사 로직 (예시)
    const words = text.split(/\s+/);
    let offset = 0;
    
    for (const word of words) {
      const wordStart = offset;
      const wordEnd = offset + word.length;
      
      // 맞춤법 오류 감지 (예시 로직)
      if (this.isMisspelled(word)) {
        decorators.push({
          sid: `spell-${model.sid}-${wordStart}-${wordEnd}`,
          stype: 'spell-error',
          category: 'inline',
          target: {
            sid: model.sid,
            startOffset: wordStart,
            endOffset: wordEnd
          },
          data: {
            word: word,
            suggestions: this.getSuggestions(word)
          }
        });
      }
      
      offset = wordEnd + 1; // 공백 포함
    }
    
    return decorators;
  },
  
  // 맞춤법 검사 (예시)
  isMisspelled(word: string): boolean {
    // 실제로는 맞춤법 검사 API 사용
    const dictionary = ['hello', 'world', 'example'];
    return !dictionary.includes(word.toLowerCase());
  },
  
  // 제안 단어 가져오기 (예시)
  getSuggestions(word: string): string[] {
    // 실제로는 맞춤법 검사 API 사용
    return ['suggestion1', 'suggestion2'];
  },
  
  // 변경 감지 (선택적)
  onDidChange(callback: () => void): () => void {
    // 외부 이벤트 리스너 등록
    const interval = setInterval(() => {
      callback(); // 주기적으로 재검사
    }, 5000);
    
    return () => clearInterval(interval); // cleanup 함수
  }
};

// Generator 등록 (generate 함수가 있으면 자동으로 custom decorator로 인식)
view.addDecorator(spellCheckGenerator);

// 또는 decoratorType 명시 (선택적)
view.addDecorator({
  ...spellCheckGenerator,
  decoratorType: 'custom'  // 명시적으로 지정 가능하지만 필수는 아님
});
```

### 예제 1: 코드 블록 자동 감지 및 하이라이팅

```typescript
const codeBlockGenerator: DecoratorGenerator = {
  sid: 'code-block-generator',
  enabled: true,
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    if (!text) return decorators;
    
    // 코드 블록 패턴 감지 (```language ... ```)
    const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = codeBlockPattern.exec(text)) !== null) {
      const language = match[1] || 'text';
      const code = match[2];
      const startOffset = match.index;
      const endOffset = match.index + match[0].length;
      
      decorators.push({
        sid: `code-block-${model.sid}-${startOffset}-${endOffset}`,
        stype: 'code-block',
        category: 'block',
        target: {
          sid: model.sid,
          startOffset: startOffset,
          endOffset: endOffset
        },
        data: {
          language: language,
          code: code
        }
      });
    }
    
    return decorators;
  }
};

view.addDecorator(codeBlockGenerator);
```

### 예제 2: 키워드 자동 하이라이팅

```typescript
const keywordHighlighter: DecoratorGenerator = {
  sid: 'keyword-highlighter',
  enabled: true,
  keywords: ['important', 'urgent', 'critical', 'note'],
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    if (!text) return decorators;
    
    // 각 키워드에 대해 검색
    for (const keyword of this.keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        decorators.push({
          sid: `keyword-${model.sid}-${match.index}-${match.index + match[0].length}`,
          stype: 'keyword-highlight',
          category: 'inline',
          target: {
            sid: model.sid,
            startOffset: match.index,
            endOffset: match.index + match[0].length
          },
          data: {
            keyword: keyword,
            text: match[0]
          }
        });
      }
    }
    
    return decorators;
  },
  
  // 키워드 목록 업데이트 시 재렌더링
  onDidChange(callback: () => void): () => void {
    // 키워드 목록이 변경되면 callback 호출
    return () => {}; // cleanup
  }
};

view.addDecorator(keywordHighlighter);
```

### 예제 3: AI 생성 콘텐츠 표시

```typescript
const aiContentMarker: DecoratorGenerator = {
  sid: 'ai-content-marker',
  enabled: true,
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    // 모델의 메타데이터에서 AI 생성 여부 확인
    if (model.metadata?.aiGenerated) {
      decorators.push({
        sid: `ai-marker-${model.sid}`,
        stype: 'ai-badge',
        category: 'layer',
        target: {
          sid: model.sid
        },
        data: {
          model: model.metadata.aiModel || 'unknown',
          timestamp: model.metadata.aiTimestamp || Date.now()
        }
      });
    }
    
    return decorators;
  }
};

view.addDecorator(aiContentMarker);
```

### 예제 4: 실시간 협업 - 다른 사용자의 선택 영역 표시

```typescript
const collaborationHighlighter: DecoratorGenerator = {
  sid: 'collaboration-highlighter',
  enabled: true,
  activeUsers: new Map<string, { selection: any, color: string }>(),
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const decorators: Decorator[] = [];
    
    // 활성 사용자들의 선택 영역 표시
    for (const [userId, userData] of this.activeUsers.entries()) {
      if (userData.selection.sid === model.sid && text) {
        const start = userData.selection.startOffset || 0;
        const end = userData.selection.endOffset || text.length;
        
        decorators.push({
          sid: `collab-${userId}-${model.sid}`,
          stype: 'user-selection',
          category: 'inline',
          target: {
            sid: model.sid,
            startOffset: start,
            endOffset: end
          },
          data: {
            userId: userId,
            color: userData.color,
            userName: userData.userName || userId
          }
        });
      }
    }
    
    return decorators;
  },
  
  // 사용자 선택 영역 업데이트
  updateUserSelection(userId: string, selection: any, color: string, userName?: string): void {
    this.activeUsers.set(userId, { selection, color, userName });
    // 변경 알림 (onDidChange가 등록되어 있으면 자동 재렌더링)
  },
  
  onDidChange(callback: () => void): () => void {
    // WebSocket이나 이벤트 리스너로 실시간 업데이트
    const ws = new WebSocket('ws://collaboration-server');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'selection-change') {
        this.updateUserSelection(data.userId, data.selection, data.color, data.userName);
        callback(); // 재렌더링 트리거
      }
    };
    
    return () => ws.close();
  }
};

view.addDecorator(collaborationHighlighter);
```

### 예제 5: 조건부 Decorator 생성 (복잡한 로직)

```typescript
const smartHighlighter: DecoratorGenerator = {
  sid: 'smart-highlighter',
  enabled: true,
  
  generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const parent = context?.parentModel;
    const decorators: Decorator[] = [];
    
    if (!text) return decorators;
    
    // 부모 노드 타입에 따라 다른 처리
    if (parent?.stype === 'code-block') {
      // 코드 블록 내에서는 키워드만 하이라이트
      return this.highlightKeywords(text, model.sid);
    } else if (parent?.stype === 'quote') {
      // 인용문에서는 특별한 스타일
      return this.highlightQuotes(text, model.sid);
    } else {
      // 일반 텍스트에서는 모든 패턴 적용
      return [
        ...this.highlightKeywords(text, model.sid),
        ...this.highlightUrls(text, model.sid),
        ...this.highlightMentions(text, model.sid)
      ];
    }
  },
  
  highlightKeywords(text: string, nodeId: string): Decorator[] {
    // 키워드 하이라이트 로직
    return [];
  },
  
  highlightQuotes(text: string, nodeId: string): Decorator[] {
    // 인용문 하이라이트 로직
    return [];
  },
  
  highlightUrls(text: string, nodeId: string): Decorator[] {
    // URL 하이라이트 로직
    return [];
  },
  
  highlightMentions(text: string, nodeId: string): Decorator[] {
    // 멘션 하이라이트 로직
    return [];
  }
};

view.addDecorator(smartHighlighter);
```

### Custom Decorator 제거

```typescript
// Generator 제거
view.decoratorGeneratorManager.unregisterGenerator(spellCheckGenerator);

// 또는 addDecorator로 추가한 경우
// Generator 객체를 저장해두고 제거
const generator = { /* ... */ };
view.addDecorator(generator);
// 나중에 제거
view.decoratorGeneratorManager.unregisterGenerator(generator);
```

---

## Pattern vs Custom Decorator 비교

| 특성 | Pattern Decorator | Custom Decorator |
|------|------------------|------------------|
| **감지 방식** | 정규식 패턴 | 함수 기반 분석 |
| **범위** | 텍스트 노드만 | 모델 전체 (구조, 속성, 관계) |
| **성능** | 빠름 (정규식 매칭) | 느릴 수 있음 (복잡한 로직) |
| **사용 사례** | 이메일, URL, 색상 코드 등 | 맞춤법 검사, AI 표시, 협업 등 |
| **동적 업데이트** | 패턴 변경 시 재등록 필요 | onDidChange로 실시간 업데이트 가능 |
| **복잡도** | 낮음 | 높음 (자유로운 로직) |
| **등록 방법** | `registerPatternDecorator()` 또는 `addDecorator()` | `addDecorator()` (generate 함수로 자동 인식) |
| **구분 기준** | `decoratorType: 'pattern'` 또는 `data.pattern` 존재 | `generate` 함수 존재 또는 `decoratorType: 'custom'` |

---

## 실전 활용 팁

### 1. 우선순위 관리

```typescript
// 우선순위가 낮을수록 먼저 적용됨
view.registerPatternDecorator({
  sid: 'email',
  // ...
  priority: 10  // 높은 우선순위
});

view.registerPatternDecorator({
  sid: 'url',
  // ...
  priority: 20  // 낮은 우선순위 (이메일보다 나중에 적용)
});
```

### 2. 패턴 충돌 해결

```typescript
// 겹치는 패턴이 있을 때, 우선순위가 높은 것이 적용됨
// 또는 extractData에서 충돌을 감지하고 처리
extractData: (match) => {
  // 이미 다른 decorator가 있는지 확인
  // 있으면 null 반환하여 스킵
  return { /* ... */ };
}
```

### 3. 성능 최적화

```typescript
// Custom Decorator에서 캐싱 사용
const cache = new Map<string, Decorator[]>();

generate(model: ModelData, text: string | null, context?: DecoratorGeneratorContext): Decorator[] {
    const cacheKey = `${model.sid}-${text}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }
    
    const decorators = this.computeDecorators(model, text, context);
    cache.set(cacheKey, decorators);
    return decorators;
  }
```

### 4. 조건부 활성화

```typescript
// 특정 조건에서만 Generator 활성화
const conditionalGenerator: DecoratorGenerator = {
  get enabled() {
    return this.shouldBeEnabled();
  },
  
  shouldBeEnabled(): boolean {
    // 사용자 설정, 문서 타입 등에 따라 결정
    return userSettings.enableSpellCheck && documentType === 'article';
  },
  
  generate(context: DecoratorGeneratorContext): Decorator[] {
    // ...
  }
};
```

---

## 관련 문서

- [Decorator 사용 가이드](./decorator-guide.md) - 기본 사용법
- [Decorator 아키텍처](./decorator-architecture.md) - 시스템 구조
- [Decorator 통합 가이드](./decorator-integration.md) - AI 통합 및 협업

