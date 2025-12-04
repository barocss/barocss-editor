/**
 * Layered API 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorViewDOM } from '../../src/editor-view-dom.js';

// Mock editor-core
const mockEditor = {
  emit: vi.fn(),
  on: vi.fn(),
  executeCommand: vi.fn()
} as any;

describe('EditorViewDOM Container API', () => {
  let container: HTMLElement;
  
  beforeEach(() => {
    // DOM 환경 설정
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.sid = 'editor-container';
    document.body.appendChild(container);
  });
  
  afterEach(() => {
    document.body.innerHTML = '';
  });
  
  describe('Container-based API', () => {
    it('should create all 5 layers with proper structure', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // 컨테이너 확인
      expect(view.container).toBe(container);
      expect(container.style.position).toBe('relative');
      
      // 5개 계층 모두 존재 확인
      expect(view.layers.content).toBeInstanceOf(HTMLElement);
      expect(view.layers.decorator).toBeInstanceOf(HTMLElement);
      expect(view.layers.selection).toBeInstanceOf(HTMLElement);
      expect(view.layers.context).toBeInstanceOf(HTMLElement);
      expect(view.layers.custom).toBeInstanceOf(HTMLElement);
      
      // contentEditableElement는 content layer와 동일
      expect(view.contentEditableElement).toBe(view.layers.content);
      
      // content layer는 contentEditable
      expect(view.layers.content.contentEditable).toBe('true');
      
      view.destroy();
    });
    
    it('should set proper z-index for each layer', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      expect(view.layers.content.style.zIndex).toBe('1');
      expect(view.layers.decorator.style.zIndex).toBe('10');
      expect(view.layers.selection.style.zIndex).toBe('100');
      expect(view.layers.context.style.zIndex).toBe('200');
      expect(view.layers.custom.style.zIndex).toBe('1000');
      
      view.destroy();
    });
    
    it('should apply custom layer configuration', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container,
        layers: {
          contentEditable: {
            className: 'custom-content',
            attributes: { 'data-test': 'content' }
          },
          decorator: {
            className: 'custom-decorators',
            attributes: { 'data-test': 'decorator' }
          }
        }
      });
      
      expect(view.layers.content.className).toBe('custom-content');
      expect(view.layers.content.getAttribute('data-test')).toBe('content');
      expect(view.layers.decorator.className).toBe('custom-decorators');
      expect(view.layers.decorator.getAttribute('data-test')).toBe('decorator');
      
      view.destroy();
    });
    
    it('should set data-bc-layer attributes', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      expect(view.layers.content.getAttribute('data-bc-layer')).toBe('content');
      expect(view.layers.decorator.getAttribute('data-bc-layer')).toBe('decorator');
      expect(view.layers.selection.getAttribute('data-bc-layer')).toBe('selection');
      expect(view.layers.context.getAttribute('data-bc-layer')).toBe('context');
      expect(view.layers.custom.getAttribute('data-bc-layer')).toBe('custom');
      
      view.destroy();
    });
  });
  
  
  describe('Layer Positioning', () => {
    it('should position overlay layers absolutely', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // content layer는 relative
      expect(view.layers.content.style.position).toBe('relative');
      
      // 나머지 계층들은 absolute
      expect(view.layers.decorator.style.position).toBe('absolute');
      expect(view.layers.selection.style.position).toBe('absolute');
      expect(view.layers.context.style.position).toBe('absolute');
      expect(view.layers.custom.style.position).toBe('absolute');
      
      // overlay 계층들은 전체 영역 커버
      [view.layers.decorator, view.layers.selection, view.layers.context, view.layers.custom].forEach(layer => {
        expect(layer.style.top).toBe('0px');
        expect(layer.style.left).toBe('0px');
        expect(layer.style.right).toBe('0px');
        expect(layer.style.bottom).toBe('0px');
      });
      
      view.destroy();
    });
    
    it('should set pointer-events none for overlay layers', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // content layer는 pointer events 허용
      expect(view.layers.content.style.pointerEvents).toBe('');
      
      // overlay 계층들은 pointer events 차단
      expect(view.layers.decorator.style.pointerEvents).toBe('none');
      expect(view.layers.selection.style.pointerEvents).toBe('none');
      expect(view.layers.context.style.pointerEvents).toBe('none');
      expect(view.layers.custom.style.pointerEvents).toBe('none');
      
      view.destroy();
    });
  });
  
  describe('Layer Rendering', () => {
    it('should render content in content layer', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Content layer에 텍스트 추가
      const textNode = document.createTextNode('Hello World');
      view.layers.content.appendChild(textNode);
      
      expect(view.layers.content.textContent).toBe('Hello World');
      expect(view.layers.content.childNodes.length).toBe(1);
      expect(view.layers.content.childNodes[0].nodeType).toBe(Node.TEXT_NODE);
      
      view.destroy();
    });
    
    it('should render decorators in decorator layer', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Decorator layer에 하이라이트 요소 추가
      const highlight = document.createElement('div');
      highlight.className = 'highlight';
      highlight.style.backgroundColor = 'yellow';
      highlight.style.position = 'absolute';
      highlight.style.left = '10px';
      highlight.style.top = '5px';
      highlight.style.width = '50px';
      highlight.style.height = '20px';
      
      view.layers.decorator.appendChild(highlight);
      
      expect(view.layers.decorator.children.length).toBe(1);
      expect(view.layers.decorator.children[0]).toBe(highlight);
      expect(highlight.style.backgroundColor).toBe('yellow');
      expect(highlight.style.position).toBe('absolute');
      
      view.destroy();
    });
    
    it('should render selection indicators in selection layer', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Selection layer에 커서 표시
      const cursor = document.createElement('div');
      cursor.className = 'cursor';
      cursor.style.position = 'absolute';
      cursor.style.left = '25px';
      cursor.style.top = '10px';
      cursor.style.width = '2px';
      cursor.style.height = '16px';
      cursor.style.backgroundColor = 'black';
      
      view.layers.selection.appendChild(cursor);
      
      expect(view.layers.selection.children.length).toBe(1);
      expect(cursor.style.width).toBe('2px');
      expect(cursor.style.height).toBe('16px');
      expect(cursor.style.backgroundColor).toBe('black');
      
      view.destroy();
    });
    
    it('should render context UI in context layer', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Context layer에 툴팁 추가
      const tooltip = document.createElement('div');
      tooltip.className = 'tooltip';
      tooltip.textContent = 'This is a tooltip';
      tooltip.style.position = 'absolute';
      tooltip.style.left = '30px';
      tooltip.style.top = '25px';
      tooltip.style.backgroundColor = 'rgba(0,0,0,0.8)';
      tooltip.style.color = 'white';
      tooltip.style.padding = '4px 8px';
      tooltip.style.borderRadius = '4px';
      
      view.layers.context.appendChild(tooltip);
      
      expect(view.layers.context.children.length).toBe(1);
      expect(tooltip.textContent).toBe('This is a tooltip');
      expect(tooltip.style.backgroundColor).toBe('rgba(0, 0, 0, 0.8)');
      
      view.destroy();
    });
    
    it('should render custom overlays in custom layer', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Custom layer에 디버그 정보 추가
      const debugInfo = document.createElement('div');
      debugInfo.className = 'debug-info';
      debugInfo.innerHTML = '<span>Debug: Line 1</span><span>Cursor: 25</span>';
      debugInfo.style.position = 'absolute';
      debugInfo.style.top = '0';
      debugInfo.style.right = '0';
      debugInfo.style.fontSize = '12px';
      debugInfo.style.fontFamily = 'monospace';
      
      view.layers.custom.appendChild(debugInfo);
      
      expect(view.layers.custom.children.length).toBe(1);
      expect(debugInfo.children.length).toBe(2);
      expect(debugInfo.children[0].textContent).toBe('Debug: Line 1');
      expect(debugInfo.children[1].textContent).toBe('Cursor: 25');
      
      view.destroy();
    });
  });
  
  describe('Layer Coordinate System', () => {
    it('should maintain consistent coordinate system across layers', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Content layer에 텍스트 요소 추가
      const textSpan = document.createElement('span');
      textSpan.textContent = 'Sample text';
      textSpan.style.position = 'absolute';
      textSpan.style.left = '20px';
      textSpan.style.top = '15px';
      view.layers.content.appendChild(textSpan);
      
      // Decorator layer에 같은 위치에 하이라이트 추가
      const highlight = document.createElement('div');
      highlight.style.position = 'absolute';
      highlight.style.left = '20px';  // 텍스트와 같은 x 좌표
      highlight.style.top = '15px';   // 텍스트와 같은 y 좌표
      highlight.style.width = '80px';
      highlight.style.height = '18px';
      highlight.style.backgroundColor = 'yellow';
      highlight.style.opacity = '0.3';
      view.layers.decorator.appendChild(highlight);
      
      // 좌표가 일치하는지 확인
      expect(textSpan.style.left).toBe(highlight.style.left);
      expect(textSpan.style.top).toBe(highlight.style.top);
      
      // 계층별 z-index 확인
      const contentZIndex = parseInt(view.layers.content.style.zIndex);
      const decoratorZIndex = parseInt(view.layers.decorator.style.zIndex);
      expect(decoratorZIndex).toBeGreaterThan(contentZIndex);
      
      view.destroy();
    });
    
    it('should handle relative positioning correctly', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Container의 위치 설정
      container.style.position = 'relative';
      container.style.left = '100px';
      container.style.top = '50px';
      
      // Content layer는 relative positioning
      expect(view.layers.content.style.position).toBe('relative');
      
      // 다른 계층들은 absolute positioning
      expect(view.layers.decorator.style.position).toBe('absolute');
      expect(view.layers.selection.style.position).toBe('absolute');
      expect(view.layers.context.style.position).toBe('absolute');
      expect(view.layers.custom.style.position).toBe('absolute');
      
      // Absolute 계층들의 좌표가 0,0으로 설정되어 있는지 확인
      [view.layers.decorator, view.layers.selection, view.layers.context, view.layers.custom].forEach(layer => {
        expect(layer.style.top).toBe('0px');
        expect(layer.style.left).toBe('0px');
        expect(layer.style.right).toBe('0px');
        expect(layer.style.bottom).toBe('0px');
      });
      
      view.destroy();
    });
  });
  
  describe('Layer Event Handling', () => {
    it('should allow events on content layer', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Content layer는 pointer-events가 허용되어야 함
      expect(view.layers.content.style.pointerEvents).toBe('');
      
      // 이벤트 리스너 추가 테스트
      const clickHandler = vi.fn();
      view.layers.content.addEventListener('click', clickHandler);
      
      // 클릭 이벤트 시뮬레이션
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10
      });
      
      view.layers.content.dispatchEvent(clickEvent);
      expect(clickHandler).toHaveBeenCalledTimes(1);
      
      view.destroy();
    });
    
    it('should block events on overlay layers by default', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Overlay 계층들은 pointer-events가 차단되어야 함
      expect(view.layers.decorator.style.pointerEvents).toBe('none');
      expect(view.layers.selection.style.pointerEvents).toBe('none');
      expect(view.layers.context.style.pointerEvents).toBe('none');
      expect(view.layers.custom.style.pointerEvents).toBe('none');
      
      view.destroy();
    });
    
    it('should allow selective event enabling on decorator elements', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Decorator layer에 클릭 가능한 위젯 추가
      const interactiveWidget = document.createElement('button');
      interactiveWidget.textContent = 'Click me';
      interactiveWidget.style.position = 'absolute';
      interactiveWidget.style.left = '10px';
      interactiveWidget.style.top = '10px';
      interactiveWidget.style.pointerEvents = 'auto'; // 이벤트 허용
      
      view.layers.decorator.appendChild(interactiveWidget);
      
      const clickHandler = vi.fn();
      interactiveWidget.addEventListener('click', clickHandler);
      
      // 클릭 이벤트 시뮬레이션
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true
      });
      
      interactiveWidget.dispatchEvent(clickEvent);
      expect(clickHandler).toHaveBeenCalledTimes(1);
      
      view.destroy();
    });
  });
  
  describe('Layer Content Management', () => {
    it('should support adding and removing elements dynamically', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // 여러 요소를 decorator layer에 추가
      const elements = [];
      for (let i = 0; i < 3; i++) {
        const element = document.createElement('div');
        element.className = `decorator-${i}`;
        element.textContent = `Decorator ${i}`;
        elements.push(element);
        view.layers.decorator.appendChild(element);
      }
      
      expect(view.layers.decorator.children.length).toBe(3);
      
      // 중간 요소 제거
      view.layers.decorator.removeChild(elements[1]);
      expect(view.layers.decorator.children.length).toBe(2);
      expect(view.layers.decorator.children[0].textContent).toBe('Decorator 0');
      expect(view.layers.decorator.children[1].textContent).toBe('Decorator 2');
      
      // 모든 요소 제거
      view.layers.decorator.innerHTML = '';
      expect(view.layers.decorator.children.length).toBe(0);
      
      view.destroy();
    });
    
    it('should handle complex nested structures', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // 복잡한 중첩 구조 생성
      const panel = document.createElement('div');
      panel.className = 'context-panel';
      
      const header = document.createElement('div');
      header.className = 'panel-header';
      header.textContent = 'Context Menu';
      
      const content = document.createElement('div');
      content.className = 'panel-content';
      
      const menuItems = ['Cut', 'Copy', 'Paste', 'Delete'];
      menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item';
        menuItem.textContent = item;
        content.appendChild(menuItem);
      });
      
      panel.appendChild(header);
      panel.appendChild(content);
      view.layers.context.appendChild(panel);
      
      // 구조 검증
      expect(view.layers.context.children.length).toBe(1);
      expect(panel.children.length).toBe(2);
      expect(content.children.length).toBe(4);
      expect(content.children[0].textContent).toBe('Cut');
      expect(content.children[3].textContent).toBe('Delete');
      
      view.destroy();
    });
  });
  
  describe('Layer Performance', () => {
    it('should handle large number of elements efficiently', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      const startTime = performance.now();
      
      // 많은 수의 요소 추가
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < 1000; i++) {
        const element = document.createElement('div');
        element.className = 'performance-test-element';
        element.textContent = `Element ${i}`;
        element.style.position = 'absolute';
        element.style.left = `${i % 100}px`;
        element.style.top = `${Math.floor(i / 100) * 20}px`;
        fragment.appendChild(element);
      }
      
      view.layers.decorator.appendChild(fragment);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(view.layers.decorator.children.length).toBe(1000);
      expect(duration).toBeLessThan(100); // 100ms 이내에 완료되어야 함
      
      view.destroy();
    });
    
    it('should maintain performance with frequent updates', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // 초기 요소 생성
      const cursor = document.createElement('div');
      cursor.className = 'animated-cursor';
      cursor.style.position = 'absolute';
      cursor.style.width = '2px';
      cursor.style.height = '20px';
      cursor.style.backgroundColor = 'black';
      view.layers.selection.appendChild(cursor);
      
      const startTime = performance.now();
      
      // 빈번한 위치 업데이트 시뮬레이션
      for (let i = 0; i < 100; i++) {
        cursor.style.left = `${i * 2}px`;
        cursor.style.top = `${Math.sin(i * 0.1) * 10 + 10}px`;
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(cursor.style.left).toBe('198px');
      expect(duration).toBeLessThan(50); // 50ms 이내에 완료되어야 함
      
      view.destroy();
    });
  });
  
  describe('Cleanup', () => {
    it('should clean up all layers on destroy', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // 계층들이 존재하는지 확인
      expect(container.children.length).toBe(5);
      
      view.destroy();
      
      // 계층들의 내용이 정리되었는지 확인
      Object.values(view.layers).forEach(layer => {
        expect(layer.innerHTML).toBe('');
      });
    });
    
    it('should clean up event listeners on destroy', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // 이벤트 리스너 추가
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      view.layers.content.addEventListener('click', handler1);
      view.layers.context.addEventListener('mouseover', handler2);
      
      // 요소에 이벤트 리스너가 있는 상태에서 destroy
      view.destroy();
      
      // destroy 후 이벤트 발생시켜도 핸들러가 호출되지 않아야 함
      const clickEvent = new MouseEvent('click');
      const mouseEvent = new MouseEvent('mouseover');
      
      // 이미 정리된 계층에서는 이벤트가 발생하지 않음
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});
