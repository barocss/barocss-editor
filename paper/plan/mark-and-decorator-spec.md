# Mark & Decorator 스펙 문서

## 개요

Barocss Editor는 **1가지 포맷팅 기법**과 **3가지 레이어링 기법**을 제공합니다.

- **Mark**: 모델에 저장되는 실제 포맷팅 데이터
- **Decorator**: 모델과 무관한 부가 정보 표시 (3가지 타입)

## 1. Mark (모델 데이터)

### 1.1 정의
Mark는 모델에 저장되는 실제 포맷팅 데이터로, 사용자가 편집 가능한 컨텐츠의 일부입니다.

### 1.2 특징
- **Schema 기반**: `@barocss/schema` 패키지에서 정의
- **모델 저장**: 문서 모델에 영구적으로 저장됨
- **편집 가능**: 사용자가 직접 편집할 수 있는 컨텐츠
- **렌더링**: `renderer-dom`에서 처리 및 렌더링
- **diff 포함**: DOM diff 알고리즘에 포함되어 변경사항 추적
- **확장 가능**: Schema 확장을 통해 새로운 Mark 타입 추가 가능

### 1.3 Mark 타입 (Schema 기반)

Mark는 `@barocss/schema` 패키지에서 정의되며, Schema 설정에 따라 동적으로 결정됩니다.

#### Mark 인터페이스
```typescript
interface Mark {
  type: string;                    // Schema에서 정의된 Mark 타입
  attrs: Record<string, any>;      // Mark별 속성
}
```

#### Schema에서 Mark 정의 예시
```typescript
import { createSchema } from '@barocss/schema';

const schema = createSchema('rich-text-editor', {
  topNode: 'doc',
  nodes: {
    // ... 노드 정의
  },
  marks: {
    // 기본 텍스트 스타일
    bold: {
      name: 'bold',
      group: 'text-style',
      attrs: {
        weight: { type: 'string', default: 'bold' }
      }
    },
    
    italic: {
      name: 'italic',
      group: 'text-style',
      attrs: {
        style: { type: 'string', default: 'italic' }
      }
    },
    
    underline: {
      name: 'underline',
      group: 'text-style',
      attrs: {}
    },
    
    // 색상 관련
    color: {
      name: 'color',
      group: 'color',
      attrs: {
        color: { type: 'string', required: true },
        backgroundColor: { type: 'string', required: false }
      }
    },
    
    // 링크
    link: {
      name: 'link',
      group: 'link',
      attrs: {
        href: { type: 'string', required: true },
        title: { type: 'string', required: false },
        target: { type: 'string', default: '_self' }
      }
    },
    
    // 커스텀 Mark (사용자 정의)
    highlight: {
      name: 'highlight',
      group: 'annotation',
      attrs: {
        color: { type: 'string', default: 'yellow' },
        intensity: { type: 'number', default: 0.3 }
      }
    }
  }
});
```

#### Schema 기반 Mark 사용 예시
```typescript
// Schema에서 정의된 Mark 사용
const boldMark: Mark = { 
  type: 'bold', 
  attrs: { weight: 'bold' } 
};

const colorMark: Mark = { 
  type: 'color', 
  attrs: { color: 'red', backgroundColor: 'yellow' } 
};

const linkMark: Mark = { 
  type: 'link', 
  attrs: { href: 'https://example.com', target: '_blank' } 
};

// 커스텀 Mark 사용
const highlightMark: Mark = { 
  type: 'highlight', 
  attrs: { color: 'yellow', intensity: 0.5 } 
};
```

#### Schema 확장을 통한 새로운 Mark 추가
```typescript
// 기존 Schema 확장
const extendedSchema = createSchema(schema, {
  marks: {
    // 새로운 Mark 추가
    strikethrough: {
      name: 'strikethrough',
      group: 'text-style',
      attrs: {}
    },
    
    code: {
      name: 'code',
      group: 'code',
      attrs: {
        language: { type: 'string', required: false }
      }
    },
    
    fontSize: {
      name: 'fontSize',
      group: 'typography',
      attrs: {
        size: { type: 'string', required: true },
        unit: { type: 'string', default: 'px' }
      }
    }
  }
});
```

### 1.4 Mark와 Schema의 관계

#### Schema 패키지 역할
- **Mark 정의**: 사용 가능한 Mark 타입과 속성 정의
- **검증**: Mark 데이터의 유효성 검사
- **타입 안전성**: TypeScript 타입 생성 및 검증
- **확장성**: 기존 Schema를 확장하여 새로운 Mark 추가

#### renderer-dom에서의 Mark 처리 (DSL 기반)
```typescript
// renderer-dom에서 DSL을 통한 Mark 렌더링
import { RendererRegistry, renderer, element, data, when, attr } from '@barocss/renderer-dom';

const registry = new RendererRegistry();

// Text 렌더러에서 Mark에 따른 조건부 렌더링
registry.register(renderer('text', element('span', {
  className: 'text-node',
  style: (d: any) => {
    const styles: any = {};
    
    // Mark 배열을 순회하며 스타일 적용
    if (d.marks) {
      d.marks.forEach((mark: Mark) => {
        switch (mark.type) {
          case 'bold':
            styles.fontWeight = mark.attrs?.weight || 'bold';
            break;
          case 'italic':
            styles.fontStyle = mark.attrs?.style || 'italic';
            break;
          case 'underline':
            styles.textDecoration = 'underline';
            break;
          case 'color':
            styles.color = mark.attrs?.color;
            if (mark.attrs?.backgroundColor) {
              styles.backgroundColor = mark.attrs.backgroundColor;
            }
            break;
        }
      });
    }
    
    return styles;
  }
}, [
  // Bold Mark가 있을 때 strong 요소로 감싸기
  when(
    (d: any) => d.marks?.some((mark: Mark) => mark.type === 'bold'),
    element('strong', {}, [data('text', '')])
  ),
  
  // Italic Mark가 있을 때 em 요소로 감싸기  
  when(
    (d: any) => d.marks?.some((mark: Mark) => mark.type === 'italic'),
    element('em', {}, [data('text', '')])
  ),
  
  // Link Mark가 있을 때 a 요소로 감싸기
  when(
    (d: any) => d.marks?.some((mark: Mark) => mark.type === 'link'),
    element('a', {
      href: (d: any) => {
        const linkMark = d.marks?.find((mark: Mark) => mark.type === 'link');
        return linkMark?.attrs?.href || '#';
      },
      target: (d: any) => {
        const linkMark = d.marks?.find((mark: Mark) => mark.type === 'link');
        return linkMark?.attrs?.target || '_self';
      }
    }, [data('text', '')])
  ),
  
  // Mark가 없을 때 기본 텍스트
  when(
    (d: any) => !d.marks || d.marks.length === 0,
    data('text', '')
  )
])));

// 또는 더 간단한 방식으로 중첩된 요소 생성
registry.register(renderer('text', 
  // Link Mark 체크
  when(
    (d: any) => d.marks?.some((mark: Mark) => mark.type === 'link'),
    element('a', {
      href: (d: any) => d.marks?.find((m: Mark) => m.type === 'link')?.attrs?.href || '#'
    }, [
      // Bold Mark 체크 (Link 안에서)
      when(
        (d: any) => d.marks?.some((mark: Mark) => mark.type === 'bold'),
        element('strong', {}, [
          // Italic Mark 체크 (Bold 안에서)
          when(
            (d: any) => d.marks?.some((mark: Mark) => mark.type === 'italic'),
            element('em', {}, [data('text', '')]),
            data('text', '') // Italic이 없으면 일반 텍스트
          )
        ]),
        // Bold가 없으면 Italic만 체크
        when(
          (d: any) => d.marks?.some((mark: Mark) => mark.type === 'italic'),
          element('em', {}, [data('text', '')]),
          data('text', '') // 둘 다 없으면 일반 텍스트
        )
      )
    ]),
    // Link가 없으면 Bold 체크
    when(
      (d: any) => d.marks?.some((mark: Mark) => mark.type === 'bold'),
      element('strong', {}, [
        when(
          (d: any) => d.marks?.some((mark: Mark) => mark.type === 'italic'),
          element('em', {}, [data('text', '')]),
          data('text', '')
        )
      ]),
      // Bold가 없으면 Italic만 체크
      when(
        (d: any) => d.marks?.some((mark: Mark) => mark.type === 'italic'),
        element('em', {}, [data('text', '')]),
        data('text', '') // 모든 Mark가 없으면 일반 텍스트
      )
    )
  )
));
```

#### Mark 데이터 흐름
```
Schema 정의 → Model 저장 → renderer-dom 렌더링 → DOM 출력
     ↓              ↓              ↓              ↓
  Mark 타입      Mark 인스턴스    HTML 요소      사용자 화면
   정의           생성/저장       생성/스타일      표시/편집
```

### 1.5 Mark 적용 예시

```html
<!-- Mark 적용 전 -->
<div data-bc-sid="text-1">Hello World</div>

<!-- Mark 적용 후 -->
<div data-bc-sid="text-1">
  <strong style="color: red;">Hello</strong> <em>World</em>
</div>
```

## 2. Decorator (부가 정보 표시)

### 2.1 정의
Decorator는 문서 모델과 별도로 관리되는 부가 정보를 표시하는 시스템으로, 렌더링 방식에 따라 3가지 카테고리로 구분됩니다.

### 2.2 특징
- **데이터 저장**: `DataStore`의 `Document.decorators` 배열에 저장
- **사용자 편집**: 직접 편집 불가능 (읽기 전용)
- **렌더링**: `renderer-dom`의 `ContentDecoratorRenderer`와 `DisplayDecoratorRenderer`에서 처리
- **이벤트 처리**: `defineDecorator` 템플릿에서 이벤트 핸들러 정의 가능
- **위치 관리**: 절대 위치 또는 상대 위치로 배치

### 2.3 Decorator 분류 체계

Decorator는 **렌더링 방식**에 따라 3가지 카테고리로 분류되며, 각 카테고리 내에서 **자유로운 타입 정의**가 가능합니다.

#### 2.3.1 Layer Decorator (오버레이 데코레이터)

**정의**: 문서 위에 오버레이로 표시되는 데코레이터로, `DisplayDecoratorRenderer`에서 처리됩니다.

**특징**:
- 절대 위치로 배치
- 문서 구조와 독립적
- `contenteditable="false"`로 편집 방지
- 이벤트 핸들러 지원 (onMouseEnter, onClick 등)

**기본 구조**:
```typescript
interface IDecorator {
  id: string;                    // 고유 식별자
  type: string;                  // defineDecorator로 등록된 템플릿 이름
  category: 'layer';             // 분류 (고정값)
  target: {
    nodeId: string;
    startOffset: number;
    endOffset: number;
  } | {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  data: Record<string, any>;     // 템플릿에 전달될 데이터
  createdAt: number;             // 생성 시간
  updatedAt: number;             // 수정 시간
  version: number;               // 버전 (충돌 해결용)
}
```

**사용 방법**:
- `defineDecorator`로 템플릿 정의
- `addDecorator`로 데코레이터 추가
- `DisplayDecoratorRenderer`에서 오버레이 렌더링

자세한 구현 예시는 [Decorator Implementation Guide](../docs/decorator-implementation-guide.md)를 참조하세요.

#### 2.3.2 Inline Decorator (인라인 데코레이터)

**정의**: 텍스트 내부에 삽입되는 데코레이터로, `ContentDecoratorRenderer`에서 처리됩니다.

**특징**:
- 텍스트 내부에 `position: 'inside-start'` 또는 `'inside-end'`로 삽입
- `contenteditable="false"`로 편집 방지
- 인라인 요소로 렌더링 (`span` 태그 사용)
- 이벤트 핸들러 지원

**기본 구조**:
```typescript
interface IDecorator {
  id: string;                    // 고유 식별자
  type: string;                  // defineDecorator로 등록된 템플릿 이름
  category: 'inline';            // 분류 (고정값)
  target: {
    nodeId: string;
    startOffset: number;
    endOffset: number;
  };
  data: Record<string, any>;     // 템플릿에 전달될 데이터
  createdAt: number;             // 생성 시간
  updatedAt: number;             // 수정 시간
  version: number;               // 버전 (충돌 해결용)
}
```

**사용 방법**:
- `defineDecorator`로 템플릿 정의
- `addDecorator`로 데코레이터 추가
- `ContentDecoratorRenderer`에서 인라인 렌더링

자세한 구현 예시는 [Decorator Implementation Guide](../docs/decorator-implementation-guide.md)를 참조하세요.

#### 2.3.3 Block Decorator (블록 데코레이터)

**정의**: 블록 레벨에 삽입되는 데코레이터로, `ContentDecoratorRenderer`에서 처리됩니다.

**특징**:
- 블록 레벨에 `position: 'before'` 또는 `'after'`로 삽입
- `contenteditable="false"`로 편집 방지
- 블록 요소로 렌더링 (`div` 태그 사용)
- 이벤트 핸들러 지원

**기본 구조**:
```typescript
interface IDecorator {
  id: string;                    // 고유 식별자
  type: string;                  // defineDecorator로 등록된 템플릿 이름
  category: 'block';             // 분류 (고정값)
  target: {
    nodeId: string;
    startOffset: number;
    endOffset: number;
  };
  data: Record<string, any>;     // 템플릿에 전달될 데이터
  createdAt: number;             // 생성 시간
  updatedAt: number;             // 수정 시간
  version: number;               // 버전 (충돌 해결용)
}
```

**사용 방법**:
- `defineDecorator`로 템플릿 정의
- `addDecorator`로 데코레이터 추가
- `ContentDecoratorRenderer`에서 블록 렌더링

자세한 구현 예시는 [Decorator Implementation Guide](../docs/decorator-implementation-guide.md)를 참조하세요.

// 외부에서 정의한 커스텀 타입 사용
const customPanelDecorator: BlockDecorator = {
  id: 'custom-panel-1',
  category: 'block',
  type: 'ai-assistant-panel',  // 자유로운 타입명
  target: { nodeId: 'text-1', position: 'wrap' },
  data: {
    // 커스텀 데이터 구조
    assistantType: 'writing-helper',
    suggestions: [
      'Improve grammar',
      'Make it more concise',
      'Add examples'
    ],
    confidence: 0.85,
    language: 'en',
    customSettings: {
      autoSuggest: true,
      showConfidence: true,
      theme: 'professional'
    }
  },
  renderer: 'ai-assistant-panel-renderer'  // 커스텀 렌더러 지정
};

// 플러그인에서 정의한 타입
const pluginPanelDecorator: BlockDecorator = {
  id: 'plugin-panel-1',
  category: 'block',
  type: 'collaboration-sidebar',  // 플러그인에서 정의한 타입
  target: { nodeId: 'text-1', position: 'after' },
  data: {
    collaborators: [
      { id: 'user1', name: 'John', status: 'online', cursor: { nodeId: 'text-2', offset: 5 } },
      { id: 'user2', name: 'Jane', status: 'typing', cursor: { nodeId: 'text-1', offset: 10 } }
    ],
    showCursors: true,
    showComments: true,
    realTimeSync: true
  }
};
```

### 2.4 Decorator 확장성 및 커스텀 렌더러

#### 2.4.1 커스텀 Decorator 타입 등록
```typescript
// editor-view-dom에서 커스텀 Decorator 타입 등록
import { DecoratorRegistry } from '@barocss/editor-view-dom';

const decoratorRegistry = new DecoratorRegistry();

// Layer Decorator 커스텀 타입 등록
decoratorRegistry.registerLayerType('my-custom-annotation', {
  defaultRenderer: 'custom-annotation-renderer',
  dataSchema: {
    severity: { type: 'string', required: true },
    category: { type: 'string', required: true },
    reviewers: { type: 'array', required: false }
  }
});

// Inline Decorator 커스텀 타입 등록
decoratorRegistry.registerInlineType('interactive-chart', {
  defaultRenderer: 'interactive-chart-renderer',
  dataSchema: {
    chartType: { type: 'string', required: true },
    dataSource: { type: 'string', required: true },
    width: { type: 'number', default: 200 },
    height: { type: 'number', default: 100 }
  }
});

// Block Decorator 커스텀 타입 등록
decoratorRegistry.registerBlockType('ai-assistant-panel', {
  defaultRenderer: 'ai-assistant-panel-renderer',
  dataSchema: {
    assistantType: { type: 'string', required: true },
    suggestions: { type: 'array', required: false },
    confidence: { type: 'number', min: 0, max: 1 }
  }
});
```

#### 2.4.2 커스텀 렌더러 정의
```typescript
// DSL을 사용한 커스텀 렌더러 정의
import { renderer, element, data, when, attr } from '@barocss/editor-view-dom';

// Layer Decorator 커스텀 렌더러
decoratorRegistry.registerRenderer('custom-annotation-renderer', 
  renderer('custom-annotation', (decorator: LayerDecorator) => {
    // CSS 스타일만 적용 (Layer Decorator)
    return {
      styles: {
        backgroundColor: decorator.data.severity === 'high' ? '#ffebee' : '#f3e5f5',
        borderLeft: `3px solid ${decorator.data.severity === 'high' ? '#f44336' : '#9c27b0'}`,
        padding: '2px 4px',
        borderRadius: '2px'
      }
    };
  })
);

// Inline Decorator 커스텀 렌더러
decoratorRegistry.registerRenderer('interactive-chart-renderer',
  renderer('interactive-chart', element('div', {
    className: 'interactive-chart-widget',
    style: (d: any) => ({
      width: `${d.data.width}px`,
      height: `${d.data.height}px`,
      border: '1px solid #ddd',
      borderRadius: '4px',
      display: 'inline-block'
    }),
    'data-bc-decorator': 'inline'  // diff에서 제외
  }, [
    element('canvas', {
      width: attr('data.width', 200),
      height: attr('data.height', 100)
    }, []),
    element('div', {
      className: 'chart-controls'
    }, [
      data('data.chartType', 'Unknown Chart')
    ])
  ]))
);

// Block Decorator 커스텀 렌더러
decoratorRegistry.registerRenderer('ai-assistant-panel-renderer',
  renderer('ai-assistant-panel', element('div', {
    className: 'ai-assistant-panel',
    style: {
      position: 'absolute',
      right: '10px',
      top: '10px',
      width: '300px',
      backgroundColor: '#fff',
      border: '1px solid #ddd',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      padding: '16px'
    },
    'data-bc-decorator': 'block'  // diff에서 제외
  }, [
    element('h3', {}, [data('data.assistantType', 'AI Assistant')]),
    element('div', { className: 'suggestions' }, [
      // suggestions 배열 렌더링
      when(
        (d: any) => d.data.suggestions && d.data.suggestions.length > 0,
        element('ul', {}, 
          // 동적 리스트 렌더링 (실제 구현에서는 더 복잡할 수 있음)
          data('data.suggestions', []).map((suggestion: string) =>
            element('li', {}, [suggestion])
          )
        )
      )
    ]),
    element('div', { 
      className: 'confidence',
      style: { fontSize: '12px', color: '#666', marginTop: '8px' }
    }, [
      data('data.confidence', 0, (value: number) => `Confidence: ${(value * 100).toFixed(1)}%`)
    ])
  ]))
);
```

## 3. 실제 사용 예시

### 3.1 Mark 적용 예시

```html
<!-- Mark 적용 전 -->
<div data-bc-sid="text-1">Hello World</div>

<!-- Mark 적용 후 -->
<div data-bc-sid="text-1">
  <strong style="color: red;">Hello</strong> <em>World</em>
</div>
```

### 3.2 실제 사용 예시

자세한 HTML 렌더링 예시와 구현 방법은 [Decorator Implementation Guide](../docs/decorator-implementation-guide.md)를 참조하세요.

## 4. 처리 위치별 정리

| 기법 | 정의 위치 | 처리 위치 | 저장 위치 | 사용자 편집 | 이벤트 처리 |
|------|-----------|-----------|-----------|-------------|-------------|
| **Mark** | `@barocss/schema` | `renderer-dom` | 모델 데이터 | 가능 | ❌ |
| **Layer Decorator** | `defineDecorator` | `DisplayDecoratorRenderer` | `DataStore.decorators` | 불가능 | ✅ |
| **Inline Decorator** | `defineDecorator` | `ContentDecoratorRenderer` | `DataStore.decorators` | 불가능 | ✅ |
| **Block Decorator** | `defineDecorator` | `ContentDecoratorRenderer` | `DataStore.decorators` | 불가능 | ✅ |

## 5. 구현 가이드

### 5.1 Mark 구현 (Schema 기반)
- **정의**: `@barocss/schema` 패키지에서 Mark 타입 및 속성 정의
- **처리**: `renderer-dom`에서 Schema 기반 렌더링 처리
- **저장**: 모델 데이터에 영구 저장
- **동기화**: 모델 변경 시 자동으로 DOM 업데이트
- **검증**: Schema 기반 Mark 속성 유효성 검사

### 5.2 Layer Decorator 구현
- **정의**: `defineDecorator`로 템플릿 등록
- **처리**: `DisplayDecoratorRenderer`에서 오버레이 렌더링
- **저장**: `DataStore.decorators` 배열에 저장
- **이벤트**: `onMouseEnter`, `onClick` 등 이벤트 핸들러 지원
- **위치**: 절대 위치로 배치

### 5.3 Inline Decorator 구현
- **정의**: `defineDecorator`로 템플릿 등록
- **처리**: `ContentDecoratorRenderer`에서 인라인 렌더링
- **저장**: `DataStore.decorators` 배열에 저장
- **이벤트**: 클릭, 호버 등 이벤트 핸들러 지원
- **위치**: 텍스트 내부에 `position: 'inside-start'` 또는 `'inside-end'`로 삽입

### 5.4 Block Decorator 구현
- **정의**: `defineDecorator`로 템플릿 등록
- **처리**: `ContentDecoratorRenderer`에서 블록 렌더링
- **저장**: `DataStore.decorators` 배열에 저장
- **이벤트**: 클릭, 호버 등 이벤트 핸들러 지원
- **위치**: 블록 레벨에 `position: 'before'` 또는 `'after'`로 삽입

## 6. 성능 고려사항

### 6.1 Mark
- 모델 데이터이므로 성능 영향 최소
- diff에 포함되므로 변경 시 재렌더링

### 6.2 Layer Decorator
- CSS로만 표현되므로 성능 영향 최소
- diff에 포함되므로 변경 시 재렌더링

### 6.3 Inline Decorator
- 실제 DOM 위젯이므로 성능 영향 있음
- diff에서 제외되므로 변경 시 재적용 필요

### 6.4 Block Decorator
- 실제 DOM 위젯이므로 성능 영향 있음
- diff에서 제외되므로 변경 시 재적용 필요

## 7. 확장성

### 7.1 Mark 확장
- 새로운 Mark 타입 추가 가능
- `renderer-dom`에서 처리 로직 추가

### 7.2 Decorator 확장
- 새로운 Decorator 타입 추가 가능
- `editor-view-dom`에서 처리 로직 추가

### 7.3 커스텀 위젯
- Inline/Block Decorator에서 커스텀 위젯 지원
- 위젯 생명주기 관리

## 8. 테스트 전략

### 8.1 Mark 테스트
- 모델 데이터 동기화 테스트
- 렌더링 결과 테스트
- diff 동작 테스트

### 8.2 Decorator 테스트
- 부가 정보 표시 테스트
- 위젯 삽입/제거 테스트
- diff 제외 동작 테스트

### 8.3 통합 테스트
- Mark와 Decorator 조합 테스트
- 성능 테스트
- 사용자 상호작용 테스트

## 📖 관련 문서

- [Decorator Implementation Guide](../docs/decorator-implementation-guide.md) - 실제 구현 가이드
- [Renderer Decorator System Specification](renderer-decorator-spec.md) - 렌더링 시스템 기술 스펙
- [BaroCSS Editor API Reference](../api-reference.md) - 전체 API 참조
