# editor-view-dom과 renderer-dom 연동 계획

## 목표

`editor-view-dom` 패키지가 `renderer-dom`을 사용하여 문서를 렌더링하도록 완전히 통합합니다.

## 현재 상태

### 이미 구현된 부분
- `EditorViewDOM`에 `_domRenderer` 필드 존재
- `_setupContentRenderer()` 메서드로 DOMRenderer 초기화
- `render()` 메서드에서 `DOMRenderer.render()` 호출 시도
- Decorator 변환 로직 (`convertToDecoratorData()`)

### 문제점
1. **타입 불일치**: `TreeDocument`와 `ModelData` 간 변환 로직 부재
2. **데이터 변환**: `TreeDocument.type` → `ModelData.stype`, `TreeDocument.id` → `ModelData.sid` 변환 필요
3. **재귀 변환**: `content` 배열의 각 항목도 변환 필요
4. **마크 변환**: `TreeDocument.marks` → `ModelData.marks` (range 형식)
5. **템플릿 등록**: editor-view-dom에서 사용할 템플릿들이 renderer-dom에 등록되어야 함
6. **테스트 부재**: 통합 테스트가 없음

## 연동 계획

### 1단계: 데이터 변환 유틸리티 구현

#### 1.1 TreeDocument → ModelData 변환기

```typescript
// packages/editor-view-dom/src/utils/tree-to-model.ts

import type { TreeDocument } from '../types';
import type { ModelData } from '@barocss/dsl';

/**
 * TreeDocument를 ModelData로 변환
 */
export function convertTreeToModel(tree: TreeDocument): ModelData {
  const model: ModelData = {
    stype: tree.type,  // type → stype
    sid: tree.id,      // id → sid
  };

  // text가 있으면 추가
  if (tree.text !== undefined) {
    model.text = tree.text;
  }

  // attributes가 있으면 병합
  if (tree.attributes) {
    Object.assign(model, tree.attributes);
  }

  // content가 있으면 재귀 변환
  if (tree.content && Array.isArray(tree.content)) {
    model.content = tree.content.map(child => convertTreeToModel(child));
  }

  // marks 변환 (range 형식으로)
  if (tree.marks) {
    model.marks = convertMarks(tree.marks);
  }

  // metadata는 그대로 전달 (필요시)
  if (tree.metadata) {
    model.metadata = tree.metadata;
  }

  return model;
}

/**
 * marks를 range 형식으로 변환
 */
function convertMarks(marks: any): Array<{ type: string; range: [number, number]; attrs?: Record<string, any> }> {
  if (!Array.isArray(marks)) return [];
  
  return marks.map(mark => {
    // 이미 range 형식이면 그대로
    if (mark.range && Array.isArray(mark.range)) {
      return {
        type: mark.type,
        range: mark.range,
        attrs: mark.attrs || mark.attributes
      };
    }
    
    // start/end 형식이면 range로 변환
    if (mark.start !== undefined && mark.end !== undefined) {
      return {
        type: mark.type,
        range: [mark.start, mark.end],
        attrs: mark.attrs || mark.attributes
      };
    }
    
    // 기본값
    return {
      type: mark.type || 'unknown',
      range: [0, 0],
      attrs: mark.attrs || mark.attributes
    };
  });
}
```

### 2단계: EditorViewDOM의 render() 메서드 개선

#### 2.1 변환 로직 통합

```typescript
// packages/editor-view-dom/src/editor-view-dom.ts

import { convertTreeToModel } from './utils/tree-to-model';
import type { ModelData } from '@barocss/dsl';

render(tree?: TreeDocument): void {
  if (!this._domRenderer) {
    console.warn('[EditorViewDOM] No DOM renderer available');
    return;
  }
  
  // 1. TreeDocument 가져오기
  let treeDocument = tree;
  if (!treeDocument) {
    try {
      const exported = this.editor.exportDocument?.();
      if (exported) {
        treeDocument = exported;
      }
    } catch (error) {
      console.error('[EditorViewDOM] Error exporting document:', error);
      return;
    }
  }
  
  if (!treeDocument) {
    console.warn('[EditorViewDOM] No content to render');
    return;
  }
  
  // 2. TreeDocument → ModelData 변환
  const model = convertTreeToModel(treeDocument);
  
  // 3. Decorators 가져오기 및 변환
  let decorators: DecoratorData[] | undefined;
  try {
    const dataStore = this.editor.dataStore;
    if (dataStore) {
      const allDecorators = dataStore.getAllDecorators();
      if (allDecorators && allDecorators.length > 0) {
        decorators = allDecorators.map((d: any) => this.convertToDecoratorData(d));
      }
    }
  } catch (error) {
    console.error('[EditorViewDOM] Error getting decorators:', error);
  }
  
  // 4. renderer-dom으로 렌더링
  this._domRenderer.render(this.layers.content, model, decorators || []);
  this._hasRendered = true;
}
```

### 3단계: 템플릿 등록 시스템

#### 3.1 기본 템플릿 등록

editor-view-dom에서 사용하는 기본 노드 타입들(document, paragraph, heading 등)의 템플릿을 renderer-dom에 등록해야 합니다.

```typescript
// packages/editor-view-dom/src/templates/default-templates.ts

import { define, element, slot, data } from '@barocss/dsl';
import { getGlobalRegistry } from '@barocss/dsl';

/**
 * 기본 템플릿들을 등록
 */
export function registerDefaultTemplates(registry?: RendererRegistry): void {
  const reg = registry || getGlobalRegistry();
  
  // Document
  if (!reg.has('document')) {
    define('document', element('div', { className: 'barocss-document' }, [slot('content')]));
  }
  
  // Paragraph
  if (!reg.has('paragraph')) {
    define('paragraph', element('p', { className: 'barocss-paragraph' }, [slot('content')]));
  }
  
  // Heading
  if (!reg.has('heading')) {
    define('heading', (props, model, ctx) => {
      const level = model.attributes?.level || model.level || 1;
      const tag = `h${Math.min(Math.max(level, 1), 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return element(tag, { className: 'barocss-heading' }, [slot('content')]);
    });
  }
  
  // Text node
  if (!reg.has('text')) {
    define('text', element('span', { className: 'barocss-text' }, [data('text')]));
  }
  
  // Inline text (marks 지원)
  if (!reg.has('inline-text')) {
    define('inline-text', (props, model, ctx) => {
      const text = model.text || '';
      const marks = model.marks || [];
      
      // 마크가 없으면 단순 텍스트
      if (marks.length === 0) {
        return element('span', { className: 'barocss-inline-text' }, [text]);
      }
      
      // 마크가 있으면 처리 (VNodeBuilder가 자동 처리)
      return element('span', { className: 'barocss-inline-text' }, [text]);
    });
  }
}
```

#### 3.2 EditorViewDOM에서 템플릿 등록

```typescript
// packages/editor-view-dom/src/editor-view-dom.ts

import { registerDefaultTemplates } from './templates/default-templates';

private _setupContentRenderer(options: EditorViewDOMOptions): void {
  // 1. Registry 설정
  if (options.registry) {
    this._rendererRegistry = options.registry;
  } else {
    this._rendererRegistry = new RendererRegistry({ global: false });
  }
  
  // 2. 기본 템플릿 등록
  registerDefaultTemplates(this._rendererRegistry);
  
  // 3. DOMRenderer 생성
  this._domRenderer = new DOMRenderer(this._rendererRegistry);
}
```

### 4단계: Decorator 변환 개선

#### 4.1 convertToDecoratorData() 개선

```typescript
private convertToDecoratorData(decorator: any): DecoratorData {
  // target 변환 (nodeId/sid 기반)
  let target: any;
  if (decorator.target) {
    if (typeof decorator.target === 'string') {
      // nodeId만 있는 경우
      target = { sid: decorator.target };
    } else if (decorator.target.nodeId || decorator.target.sid) {
      target = {
        sid: decorator.target.sid || decorator.target.nodeId,
        startOffset: decorator.target.startOffset,
        endOffset: decorator.target.endOffset
      };
    } else {
      target = decorator.target;
    }
  }
  
  return {
    sid: decorator.sid || decorator.id,
    stype: decorator.stype || decorator.type,
    category: decorator.category || 'inline', // 기본값
    position: decorator.position, // 'before' | 'after' | 'inside'
    target: target,
    model: decorator.data || decorator.model || {}
  };
}
```

### 5단계: 테스트 작성

#### 5.1 통합 테스트 구조

```typescript
// packages/editor-view-dom/test/integration/renderer-dom-integration.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@barocss/editor-core';
import { EditorViewDOM } from '../src/editor-view-dom';
import { DataStore } from '@barocss/datastore';
import { normalizeHTML } from './utils/html';

describe('EditorViewDOM + renderer-dom Integration', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  
  beforeEach(() => {
    container = document.createElement('div');
    const dataStore = new DataStore();
    editor = new Editor({ dataStore });
    view = new EditorViewDOM(editor, { container });
  });
  
  it('renders simple paragraph', () => {
    const tree = {
      id: 'doc1',
      type: 'document',
      content: [
        {
          id: 'p1',
          type: 'paragraph',
          content: [
            { id: 't1', type: 'text', text: 'Hello World' }
          ]
        }
      ]
    };
    
    view.render(tree);
    
    const html = normalizeHTML(container.firstElementChild);
    expect(html).toContain('data-bc-sid="doc1"');
    expect(html).toContain('data-bc-sid="p1"');
    expect(html).toContain('Hello World');
  });
  
  it('renders document with headings and paragraphs', () => {
    // ...
  });
  
  it('renders text with marks', () => {
    // ...
  });
  
  it('renders with decorators', () => {
    // ...
  });
  
  it('updates content correctly', () => {
    // ...
  });
});
```

## 구현 순서

1. ✅ **데이터 변환 유틸리티 구현** (`tree-to-model.ts`)
2. ✅ **EditorViewDOM.render() 개선** (변환 로직 통합)
3. ✅ **기본 템플릿 등록 시스템** (`default-templates.ts`)
4. ✅ **Decorator 변환 개선**
5. ✅ **통합 테스트 작성**

## 주의사항

1. **타입 안전성**: `TreeDocument`와 `ModelData` 간 변환 시 타입 체크 필요
2. **재귀 변환**: `content` 배열의 깊은 중첩 처리
3. **마크 형식**: `start/end` → `range` 변환
4. **템플릿 충돌**: 외부에서 전달된 registry에 이미 등록된 템플릿과의 충돌 방지
5. **성능**: 대용량 문서 변환 시 성능 고려

## 검증 기준

- [ ] 간단한 paragraph 렌더링
- [ ] 중첩 구조 (document > paragraph > text)
- [ ] 마크가 있는 텍스트 렌더링
- [ ] 데코레이터가 있는 문서 렌더링
- [ ] 업데이트 시 DOM 안정성 (sid 기반 재사용)
- [ ] contentEditable 동작 유지
- [ ] Selection 매핑 정확성

