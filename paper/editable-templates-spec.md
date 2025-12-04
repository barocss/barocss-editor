# 편집 가능한 템플릿 스펙 (Editable Templates Specification)

## 📋 개요

이 문서는 Barocss Editor의 편집 가능한 템플릿 시스템에 대한 명세를 정의합니다. `renderer-dom`의 DSL을 사용하여 편집 가능한 영역과 편집 불가능한 UI 영역을 구분하는 템플릿을 작성하는 방법을 설명합니다.

## 🎯 핵심 개념

### 1. 편집 영역 구분
- **최상위 `contentEditable="true"`**: 전체 문서 편집 영역
- **편집 가능한 요소**: `data-bc-edit` 속성으로 편집 타입 명시
- **편집 불가능한 UI 요소**: `data-bc-ui` 속성으로 UI 요소 표시 (`contentEditable="false"`)

### 2. 편집 타입 구분
- **콘텐츠 편집**: `data-bc-edit="content"` - 텍스트 내용 변경
- **속성 편집**: `data-bc-edit="attribute:속성명"` + `data-bc-value="현재값"` - 특정 속성 변경
- **UI 요소**: `data-bc-ui="타입"` - 편집 불가능한 UI 요소

### 3. 속성 관리
- **스키마 기반**: 각 노드 타입마다 다른 속성 정의
- **동적 생성**: `data.attributes`를 통해 유동적인 속성 처리
- **고정 속성 제거**: `data-bc-alignment` 같은 고정된 속성 사용 안함

## 🏗️ 템플릿 구조

### 1. 기본 렌더러 정의

```typescript
import { renderer, element, slot, data, attr } from '@barocss/renderer-dom';

// 편집 가능한 문서 렌더러
const documentRenderer = renderer('document',
  element('div',
    {
      contentEditable: 'true',
      className: 'barocss-editor'
    },
    [slot('content')]
  )
);
```

### 2. 편집 가능한 콘텐츠 템플릿

#### 단락 (Paragraph)
```typescript
const paragraphRenderer = renderer('paragraph',
  element('p',
    {
      'data-bc-edit': 'content',  // 콘텐츠 편집
      className: (data) => `paragraph paragraph-${data.attributes?.textAlign || 'left'}`,
      style: (data) => ({
        textAlign: data.attributes?.textAlign || 'left',
        margin: '10px 0',
        lineHeight: '1.6'
      })
    },
    [data('text', '')]
  )
);
```

#### 헤딩 (Heading)
```typescript
const headingRenderer = renderer('heading',
  element((data) => `h${data.attributes?.level || 1}`,
    {
      'data-bc-edit': 'attribute:level',  // level 속성 편집
      'data-bc-value': (data) => String(data.attributes?.level || 1),  // 현재 레벨 값
      className: (data) => `heading heading-level-${data.attributes?.level || 1}`,
      style: (data) => ({
        fontSize: `${2 - (data.attributes?.level || 1) * 0.2}rem`,
        fontWeight: 'bold',
        margin: '20px 0 10px 0'
      })
    },
    [data('text', '')]
  )
);
```

#### 리스트 (List)
```typescript
const listRenderer = renderer('list',
  element((data) => data.attributes?.ordered ? 'ol' : 'ul',
    {
      'data-bc-edit': 'attribute:ordered',  // ordered 속성 편집
      'data-bc-value': (data) => String(data.attributes?.ordered || false),  // 현재 ordered 값
      className: (data) => `list ${data.attributes?.ordered ? 'ordered' : 'unordered'}`,
      style: {
        margin: '10px 0',
        paddingLeft: '20px'
      }
    },
    [slot('items')]
  )
);

const listItemRenderer = renderer('listItem',
  element('li',
    {
      'data-bc-edit': 'content',  // 콘텐츠 편집
      className: 'list-item',
      style: {
        margin: '5px 0'
      }
    },
    [data('text', '')]
  )
);
```

### 3. 편집 불가능한 UI 템플릿

#### UI 헤딩
```typescript
const uiHeadingRenderer = renderer('uiHeading',
  element('div',
    {
      'data-bc-ui': 'heading',  // UI 요소
      contentEditable: 'false',
      className: (data) => `ui-heading ui-heading-level-${data.attributes?.level || 1}`,
      style: {
        backgroundColor: '#f0f0f0',
        padding: '10px',
        borderRadius: '4px',
        borderLeft: '4px solid #007acc',
        margin: '10px 0'
      }
    },
    [
      element('span',
        {
          className: 'ui-heading-content'
        },
        [data('text', '')]
      )
    ]
  )
);
```

#### UI 버튼
```typescript
const uiButtonRenderer = renderer('uiButton',
  element('button',
    {
      'data-bc-ui': 'button',  // UI 요소
      className: 'ui-button',
      contentEditable: 'false',
      type: 'button',
      style: {
        backgroundColor: '#007acc',
        color: 'white',
        border: 'none',
        padding: '8px 16px',
        borderRadius: '4px',
        cursor: 'pointer',
        margin: '5px'
      }
    },
    [data('text', 'Button')]
  )
);
```

#### UI 컨테이너
```typescript
const uiContainerRenderer = renderer('uiContainer',
  element('div',
    {
      'data-bc-ui': 'container',  // UI 요소
      className: (data) => `ui-container ui-${data.attributes?.type || 'container'}`,
      contentEditable: 'false',
      style: {
        backgroundColor: '#f8f9fa',
        border: '1px solid #e9ecef',
        borderRadius: '4px',
        padding: '10px',
        margin: '10px 0'
      }
    },
    [slot('content')]
  )
);
```

## 📊 데이터 구조

### 1. 문서 데이터 구조

```typescript
interface DocumentData {
  id: string;
  type: 'document';
  slots: {
    content: NodeData[];
  };
}

interface NodeData {
  id: string;
  type: string;
  text?: string;
  attributes?: Record<string, any>;
  slots?: {
    [key: string]: NodeData[];
  };
}
```

### 2. 사용 예시

#### 기본 편집 가능한 문서
```typescript
const documentData: DocumentData = {
  id: 'doc-1',
  type: 'document',
  slots: {
    content: [
      {
        id: 'p-1',
        type: 'paragraph',
        text: '이것은 편집 가능한 단락입니다.',
        attributes: { textAlign: 'left' }
      },
      {
        id: 'h1-1',
        type: 'heading',
        text: '제목 텍스트',
        attributes: { level: 1 }
      },
      {
        id: 'p-2',
        type: 'paragraph',
        text: '또 다른 편집 가능한 단락입니다.',
        attributes: { textAlign: 'center' }
      }
    ]
  }
};
```

#### UI 요소가 포함된 문서
```typescript
const documentDataWithUI: DocumentData = {
  id: 'doc-2',
  type: 'document',
  slots: {
    content: [
      {
        id: 'h1-1',
        type: 'heading',
        text: '편집 가능한 제목',
        attributes: { level: 1 }
      },
      {
        id: 'p-1',
        type: 'paragraph',
        text: '이 단락은 편집할 수 있습니다.',
        attributes: { textAlign: 'left' }
      },
      {
        id: 'ui-heading-1',
        type: 'uiHeading',
        text: 'UI 제목 (편집 불가)',
        attributes: { level: 2 }
      },
      {
        id: 'ui-button-1',
        type: 'uiButton',
        text: '저장',
        attributes: { action: 'save' }
      },
      {
        id: 'p-2',
        type: 'paragraph',
        text: '마지막 편집 가능한 단락입니다.',
        attributes: { textAlign: 'right' }
      }
    ]
  }
};
```

## 🔧 렌더러 등록 및 사용

### 1. 렌더러 레지스트리 설정

```typescript
import { RendererRegistry, RendererFactory } from '@barocss/renderer-dom';

// 렌더러 레지스트리 생성
const registry = new RendererRegistry();

// 렌더러 등록
registry.register(documentRenderer);
registry.register(paragraphRenderer);
registry.register(headingRenderer);
registry.register(listRenderer);
registry.register(listItemRenderer);
registry.register(uiHeadingRenderer);
registry.register(uiButtonRenderer);
registry.register(uiContainerRenderer);

// 렌더러 팩토리 생성
const factory = new RendererFactory(registry);
```

### 2. 렌더링 실행

```typescript
// 문서 렌더링
const element = factory.createRenderer('document', documentData);

// DOM에 추가
document.getElementById('editor').appendChild(element);
```

## 🎨 CSS 스타일링

### 1. 기본 스타일

```css
/* 편집 가능한 영역 */
.barocss-editor {
  border: 2px solid #e0e0e0;
  border-radius: 4px;
  padding: 15px;
  min-height: 100px;
  outline: none;
}

.barocss-editor:focus {
  border-color: #007acc;
  box-shadow: 0 0 0 3px rgba(0, 122, 204, 0.1);
}

/* 편집 가능한 요소 */
.paragraph {
  margin: 10px 0;
  line-height: 1.6;
}

.paragraph-left { text-align: left; }
.paragraph-center { text-align: center; }
.paragraph-right { text-align: right; }

.heading {
  margin: 20px 0 10px 0;
  font-weight: bold;
}

.heading-level-1 { font-size: 2rem; }
.heading-level-2 { font-size: 1.5rem; }
.heading-level-3 { font-size: 1.25rem; }

/* 편집 불가능한 UI 요소 */
[contentEditable="false"] {
  user-select: none;
  pointer-events: none;
}

.ui-heading {
  background: #f0f0f0;
  padding: 10px;
  border-radius: 4px;
  margin: 10px 0;
  border-left: 4px solid #007acc;
}

.ui-button {
  background: #007acc;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  margin: 5px;
}

.ui-button:hover {
  background: #005a9e;
}

.ui-container {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 10px;
  margin: 10px 0;
}
```

## 📄 생성되는 HTML 구조

### 1. 기본 문서 구조
```html
<div contentEditable="true" class="barocss-editor">
  <!-- 콘텐츠 편집 가능한 단락 -->
  <p data-bc-edit="content" data-bc-sid="p-1" data-bc-stype="paragraph" 
     class="paragraph paragraph-left">
    편집 가능한 텍스트
  </p>
  
  <!-- 속성 편집 가능한 헤딩 -->
  <h1 data-bc-edit="attribute:level" data-bc-value="1" 
      data-bc-sid="h1-1" data-bc-stype="heading" 
      class="heading heading-level-1">
    제목 텍스트
  </h1>
  
  <!-- 편집 불가능한 UI 버튼 -->
  <button data-bc-ui="button" contentEditable="false" 
          class="ui-button" type="button">
    저장
  </button>
  
  <!-- 편집 불가능한 UI 컨테이너 -->
  <div data-bc-ui="container" contentEditable="false" 
       class="ui-container ui-container">
    <span>UI 컨텐츠</span>
  </div>
</div>
```

### 2. 편집 타입별 속성
```html
<!-- 콘텐츠 편집 (값 불필요) -->
<p data-bc-edit="content">텍스트 내용을 편집</p>

<!-- 속성 편집 (현재 값 포함) -->
<h1 data-bc-edit="attribute:level" data-bc-value="1">제목 레벨을 편집</h1>
<div data-bc-edit="attribute:textAlign" data-bc-value="center">정렬을 편집</div>
<ol data-bc-edit="attribute:ordered" data-bc-value="true">순서 있는 리스트</ol>

<!-- UI 요소 (편집 불가능) -->
<button data-bc-ui="button" contentEditable="false">버튼</button>
<div data-bc-ui="container" contentEditable="false">컨테이너</div>
```

## 🚀 사용 예시

### 1. 기본 사용법

```typescript
// Editor 인스턴스 생성
const editor = new Editor({
  contentEditableElement: document.getElementById('editor'),
  dataStore: dataStore,
  schema: schema
});

// 편집 가능한 문서 렌더링
const element = factory.createRenderer('document', documentData);
document.getElementById('editor').appendChild(element);
```

### 2. 이벤트 처리

```typescript
// 편집 이벤트 리스너
editor.on('editor:selection.change', (data) => {
  console.log('Selection changed:', data.selection);
});

editor.on('editor:content.change', (data) => {
  console.log('Content changed:', data.content);
});

// UI 버튼 클릭 이벤트
document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target.classList.contains('ui-button')) {
    const action = target.getAttribute('data-bc-ui-action');
    console.log('Button clicked:', action);
  }
});
```

### 3. Editor 파싱 로직

```typescript
export class Editor {
  private _parseEditAttribute(editAttr: string, valueAttr: string): { 
    type: string; 
    attribute?: string; 
    value?: string 
  } {
    if (!editAttr) return { type: 'none' };
    
    if (editAttr === 'content') {
      return { type: 'content' };
    }
    
    if (editAttr.startsWith('attribute:')) {
      const attribute = editAttr.split(':')[1];
      return { 
        type: 'attribute', 
        attribute, 
        value: valueAttr 
      };
    }
    
    return { type: 'none' };
  }
  
  private _handleEdit(event: Event): void {
    const target = event.target as HTMLElement;
    
    const editAttr = target.getAttribute('data-bc-edit');
    const valueAttr = target.getAttribute('data-bc-value');
    const { type, attribute, value } = this._parseEditAttribute(editAttr, valueAttr);
    const nodeId = target.getAttribute('data-bc-sid');
    
    if (type === 'attribute') {
      // 속성 편집 처리 (현재 값과 새 값 비교)
      this._handleAttributeEdit(nodeId, attribute, value, target);
    } else if (type === 'content') {
      // 콘텐츠 편집 처리
      this._handleContentEdit(nodeId, target);
    }
  }
}
```

## 📋 속성 네이밍 컨벤션

### 1. 편집 관련 속성
- `data-bc-edit="content"` - 콘텐츠 편집 (텍스트 내용 변경)
- `data-bc-edit="attribute:속성명"` - 속성 편집 (예: `"attribute:level"`, `"attribute:textAlign"`)
- `data-bc-value="현재값"` - 속성 편집 시 현재 값 (예: `"1"`, `"center"`, `"true"`)
- `data-bc-ui="타입"` - UI 요소 표시 (편집 불가능)
- `contentEditable: 'false'` - 편집 불가능 (UI 요소)

### 2. 모델 매핑 속성
- `data-bc-sid` - 노드 ID (자동 설정)
- `data-bc-stype` - 노드 타입 (자동 설정)

### 3. 스키마 기반 속성
- `data.attributes.textAlign` - 텍스트 정렬
- `data.attributes.level` - 헤딩 레벨
- `data.attributes.action` - UI 액션
- `data.attributes.type` - UI 타입

### 4. CSS 클래스
- `paragraph paragraph-{textAlign}` - 단락 스타일
- `heading heading-level-{level}` - 헤딩 스타일
- `ui-{type}` - UI 요소 스타일

## 🔄 동적 속성 처리

### 1. 스키마 기반 속성
각 노드 타입마다 다른 속성을 `data.attributes`를 통해 처리:

```typescript
// 단락의 경우
attributes: { textAlign: 'left' }

// 헤딩의 경우
attributes: { level: 1 }

// UI 버튼의 경우
attributes: { action: 'save' }
```

### 2. 동적 스타일 생성
`style` 함수를 통해 데이터 기반 동적 스타일 생성:

```typescript
style: (data) => ({
  textAlign: data.attributes?.textAlign || 'left',
  fontSize: `${2 - (data.attributes?.level || 1) * 0.2}rem`
})
```

## 🎯 핵심 원칙

1. **편집 타입 명시**: `data-bc-edit` 속성으로 편집 타입을 명확히 구분
   - `"content"`: 텍스트 내용 편집
   - `"attribute:속성명"`: 특정 속성 편집 (현재 값은 `data-bc-value`로 저장)
2. **UI 요소 분리**: `data-bc-ui` 속성으로 편집 불가능한 UI 요소 표시
3. **스키마 기반**: 고정된 속성 대신 유동적인 스키마 사용
4. **동적 생성**: 데이터 기반으로 속성과 스타일 동적 생성
5. **명확한 네이밍**: 속성 이름이 명확하고 직관적
6. **유연한 구조**: 새로운 노드 타입 추가 시 스키마만 정의

이 스펙을 따라 편집 가능한 템플릿을 작성하면 유동적이고 확장 가능한 에디터 시스템을 구축할 수 있습니다.
