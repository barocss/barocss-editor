/**
 * Decorator 시스템 사용 예시
 */

import { Editor } from '@barocss/editor-core';
import { 
  EditorViewDOM,
  DecoratorRegistry,
  LayerDecorator,
  InlineDecorator,
  BlockDecorator,
  // DSL re-export
  renderer, element, data, when, attr
} from '@barocss/editor-view-dom';

// 가상의 editor-core와 DOM 설정
const mockEditor = {} as Editor;
const contentEditableElement = document.createElement('div');
contentEditableElement.contentEditable = 'true';
contentEditableElement.innerHTML = '<p data-bc-sid="para-1">Hello <span data-bc-sid="text-1">world</span>!</p>';
document.body.appendChild(contentEditableElement);

// EditorViewDOM 인스턴스 생성
const editorView = new EditorViewDOM(mockEditor, {
  contentEditableElement
});

// 1. Layer Decorator 예시 - 하이라이트
const highlightDecorator: LayerDecorator = {
  id: 'highlight-1',
  category: 'layer',
  type: 'highlight',
  target: { nodeId: 'text-1', startOffset: 0, endOffset: 5 },
  data: { backgroundColor: 'yellow', opacity: 0.3 }
};

editorView.decoratorManager.add(highlightDecorator);

// 2. 커스텀 Layer Decorator 렌더러 등록
editorView.decoratorRegistry.registerRenderer('custom-highlight',
  renderer('custom-highlight', (decorator) => ({
    styles: {
      backgroundColor: decorator.data.color,
      padding: '2px 4px',
      borderRadius: '2px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }
  }))
);

// 커스텀 하이라이트 사용
const customHighlight: LayerDecorator = {
  id: 'custom-highlight-1',
  category: 'layer',
  type: 'custom-highlight',
  target: { nodeId: 'text-1', startOffset: 0, endOffset: 3 },
  data: { color: '#ffeb3b' },
  renderer: 'custom-highlight'
};

editorView.decoratorManager.add(customHighlight);

// 3. Inline Decorator 예시 - 인터랙티브 버튼
editorView.decoratorRegistry.registerRenderer('action-button',
  renderer('action-button', element('button', {
    className: 'inline-action-btn',
    style: (d) => ({
      backgroundColor: d.data.color || '#007bff',
      color: 'white',
      border: 'none',
      padding: '2px 8px',
      borderRadius: '3px',
      fontSize: '12px',
      cursor: 'pointer'
    }),
    onClick: (event) => {
      alert(`Action: ${event.target.textContent}`);
    },
    'data-bc-decorator': 'inline'
  }, [
    data('data.text', 'Action')
  ]))
);

const actionButton: InlineDecorator = {
  id: 'action-1',
  category: 'inline',
  type: 'action-button',
  target: { nodeId: 'text-1', startOffset: 3, endOffset: 3 },
  data: { text: 'Edit', color: '#28a745' },
  renderer: 'action-button'
};

editorView.decoratorManager.add(actionButton);

// 4. Block Decorator 예시 - AI 어시스턴트 패널
editorView.decoratorRegistry.registerRenderer('ai-assistant',
  renderer('ai-assistant', element('div', {
    className: 'ai-assistant-panel',
    style: {
      position: 'absolute',
      right: '10px',
      top: '10px',
      width: '250px',
      backgroundColor: '#f8f9fa',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      padding: '12px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    },
    'data-bc-decorator': 'block'
  }, [
    element('h4', {
      style: { margin: '0 0 8px 0', fontSize: '14px', color: '#495057' }
    }, [data('data.title', 'AI Assistant')]),
    
    element('div', { className: 'suggestions' }, [
      when(
        (d) => d.data.suggestions?.length > 0,
        element('ul', {
          style: { margin: '0', padding: '0', listStyle: 'none' }
        }, [
          // 실제로는 동적 리스트 렌더링이 필요하지만 예시용으로 단순화
          element('li', {
            style: { padding: '4px 0', fontSize: '12px', color: '#6c757d' }
          }, ['• Improve grammar'])
        ])
      )
    ]),
    
    element('div', {
      className: 'confidence',
      style: { marginTop: '8px', fontSize: '11px', color: '#6c757d' }
    }, [
      data('data.confidence', 0, (value) => `Confidence: ${(value * 100).toFixed(1)}%`)
    ])
  ]))
);

const aiAssistant: BlockDecorator = {
  id: 'ai-1',
  category: 'block',
  type: 'ai-assistant',
  target: { nodeId: 'para-1', position: 'after' },
  data: {
    title: 'Writing Assistant',
    suggestions: ['Improve grammar', 'Make it concise', 'Add examples'],
    confidence: 0.85
  },
  renderer: 'ai-assistant'
};

editorView.decoratorManager.add(aiAssistant);

// 5. 이벤트 리스닝
editorView.decoratorManager.on('decorator:added', (decorator) => {
  console.log(`Decorator added: ${decorator.sid} (${decorator.type})`);
});

editorView.decoratorManager.on('decorator:updated', (decorator) => {
  console.log(`Decorator updated: ${decorator.sid}`);
});

editorView.decoratorManager.on('decorator:removed', (decoratorId) => {
  console.log(`Decorator removed: ${decoratorId}`);
});

// 6. 동적 업데이트 예시
setTimeout(() => {
  // 하이라이트 색상 변경
  editorView.decoratorManager.updateData('highlight-1', {
    backgroundColor: 'orange'
  });
  
  // AI 어시스턴트 신뢰도 업데이트
  editorView.decoratorManager.updateData('ai-1', {
    confidence: 0.92
  });
}, 2000);

// 7. 조회 예시
setTimeout(() => {
  console.log('All decorators:', editorView.decoratorManager.getAll());
  console.log('Layer decorators:', editorView.decoratorManager.getLayerDecorators());
  console.log('Inline decorators:', editorView.decoratorManager.getInlineDecorators());
  console.log('Block decorators:', editorView.decoratorManager.getBlockDecorators());
  
  // 특정 노드의 Decorator들
  console.log('text-1 decorators:', editorView.decoratorManager.getByNode('text-1'));
  
  // 범위 내 Layer Decorator들
  console.log('Range 0-3 decorators:', 
    editorView.decoratorManager.getLayerDecoratorsInRange('text-1', 0, 3)
  );
}, 3000);

// 8. 정리
setTimeout(() => {
  editorView.destroy();
}, 5000);

export { editorView };
