/**
 * Layer Rendering Scenarios Test
 * 실제 사용 시나리오를 기반으로 한 계층 렌더링 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorViewDOM } from '../../src/editor-view-dom.js';

// Mock editor-core
const mockEditor = {
  emit: vi.fn(),
  on: vi.fn(),
  executeCommand: vi.fn()
} as any;

describe('Layer Rendering Scenarios', () => {
  let container: HTMLElement;
  
  beforeEach(() => {
    // DOM 환경 설정
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.sid = 'editor-container';
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
  });
  
  afterEach(() => {
    document.body.innerHTML = '';
  });
  
  describe('Rich Text Editing Scenario', () => {
    it('should render rich text with multiple decorators', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // 1. Content layer에 텍스트 추가
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'This is <strong>bold</strong> and <em>italic</em> text.';
      view.layers.content.appendChild(paragraph);
      
      // 2. Decorator layer에 하이라이트 추가
      const highlight1 = document.createElement('div');
      highlight1.className = 'highlight-yellow';
      highlight1.style.position = 'absolute';
      highlight1.style.left = '50px';
      highlight1.style.top = '10px';
      highlight1.style.width = '40px';
      highlight1.style.height = '18px';
      highlight1.style.backgroundColor = 'yellow';
      highlight1.style.opacity = '0.3';
      view.layers.decorator.appendChild(highlight1);
      
      const highlight2 = document.createElement('div');
      highlight2.className = 'highlight-blue';
      highlight2.style.position = 'absolute';
      highlight2.style.left = '120px';
      highlight2.style.top = '10px';
      highlight2.style.width = '50px';
      highlight2.style.height = '18px';
      highlight2.style.backgroundColor = 'lightblue';
      highlight2.style.opacity = '0.3';
      view.layers.decorator.appendChild(highlight2);
      
      // 3. Selection layer에 커서 추가
      const cursor = document.createElement('div');
      cursor.className = 'cursor';
      cursor.style.position = 'absolute';
      cursor.style.left = '200px';
      cursor.style.top = '10px';
      cursor.style.width = '2px';
      cursor.style.height = '18px';
      cursor.style.backgroundColor = 'black';
      cursor.style.animation = 'blink 1s infinite';
      view.layers.selection.appendChild(cursor);
      
      // 검증
      expect(view.layers.content.children.length).toBe(1);
      expect(view.layers.decorator.children.length).toBe(2);
      expect(view.layers.selection.children.length).toBe(1);
      expect(paragraph.innerHTML).toContain('<strong>bold</strong>');
      expect(paragraph.innerHTML).toContain('<em>italic</em>');
      
      view.destroy();
    });
    
    it('should handle text selection with range highlights', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Content layer에 여러 줄 텍스트
      const lines = [
        'First line of text',
        'Second line with more content',
        'Third and final line'
      ];
      
      lines.forEach((text, index) => {
        const line = document.createElement('div');
        line.textContent = text;
        line.style.lineHeight = '20px';
        line.style.marginBottom = '5px';
        view.layers.content.appendChild(line);
      });
      
      // Selection layer에 범위 선택 표시
      const selectionRange = document.createElement('div');
      selectionRange.className = 'selection-range';
      selectionRange.style.position = 'absolute';
      selectionRange.style.left = '80px';
      selectionRange.style.top = '25px';
      selectionRange.style.width = '150px';
      selectionRange.style.height = '45px'; // 2줄에 걸친 선택
      selectionRange.style.backgroundColor = 'rgba(0, 123, 255, 0.2)';
      selectionRange.style.border = '1px solid rgba(0, 123, 255, 0.4)';
      view.layers.selection.appendChild(selectionRange);
      
      // 검증
      expect(view.layers.content.children.length).toBe(3);
      expect(view.layers.selection.children.length).toBe(1);
      expect(selectionRange.style.height).toBe('45px');
      
      view.destroy();
    });
  });
  
  describe('Code Editor Scenario', () => {
    it('should render code with syntax highlighting and line numbers', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Content layer에 코드 블록
      const codeBlock = document.createElement('pre');
      codeBlock.style.fontFamily = 'monospace';
      codeBlock.style.fontSize = '14px';
      codeBlock.style.lineHeight = '20px';
      codeBlock.style.padding = '10px';
      codeBlock.style.backgroundColor = '#f8f9fa';
      
      const codeLines = [
        'function hello(name) {',
        '  console.log("Hello, " + name);',
        '  return true;',
        '}'
      ];
      
      codeLines.forEach(line => {
        const lineElement = document.createElement('div');
        lineElement.textContent = line;
        codeBlock.appendChild(lineElement);
      });
      
      view.layers.content.appendChild(codeBlock);
      
      // Decorator layer에 라인 번호 추가
      const lineNumbers = document.createElement('div');
      lineNumbers.className = 'line-numbers';
      lineNumbers.style.position = 'absolute';
      lineNumbers.style.left = '0';
      lineNumbers.style.top = '10px';
      lineNumbers.style.width = '30px';
      lineNumbers.style.fontFamily = 'monospace';
      lineNumbers.style.fontSize = '14px';
      lineNumbers.style.lineHeight = '20px';
      lineNumbers.style.textAlign = 'right';
      lineNumbers.style.color = '#6c757d';
      lineNumbers.style.paddingRight = '10px';
      
      codeLines.forEach((_, index) => {
        const lineNumber = document.createElement('div');
        lineNumber.textContent = (index + 1).toString();
        lineNumbers.appendChild(lineNumber);
      });
      
      view.layers.decorator.appendChild(lineNumbers);
      
      // Decorator layer에 에러 표시 추가
      const errorIndicator = document.createElement('div');
      errorIndicator.className = 'error-indicator';
      errorIndicator.style.position = 'absolute';
      errorIndicator.style.left = '35px';
      errorIndicator.style.top = '50px'; // 3번째 줄
      errorIndicator.style.width = '200px';
      errorIndicator.style.height = '20px';
      errorIndicator.style.backgroundColor = 'rgba(220, 53, 69, 0.1)';
      errorIndicator.style.border = '1px solid rgba(220, 53, 69, 0.3)';
      view.layers.decorator.appendChild(errorIndicator);
      
      // 검증
      expect(view.layers.content.children.length).toBe(1);
      expect(view.layers.decorator.children.length).toBe(2);
      expect(codeBlock.children.length).toBe(4);
      expect(lineNumbers.children.length).toBe(4);
      
      view.destroy();
    });
    
    it('should render autocomplete popup in context layer', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Content layer에 코드 입력 중
      const codeLine = document.createElement('div');
      codeLine.textContent = 'console.lo';
      codeLine.style.fontFamily = 'monospace';
      view.layers.content.appendChild(codeLine);
      
      // Context layer에 자동완성 팝업
      const autocompletePopup = document.createElement('div');
      autocompletePopup.className = 'autocomplete-popup';
      autocompletePopup.style.position = 'absolute';
      autocompletePopup.style.left = '80px';
      autocompletePopup.style.top = '25px';
      autocompletePopup.style.width = '150px';
      autocompletePopup.style.backgroundColor = 'white';
      autocompletePopup.style.border = '1px solid #ccc';
      autocompletePopup.style.borderRadius = '4px';
      autocompletePopup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
      autocompletePopup.style.zIndex = '1000';
      
      const suggestions = ['log', 'logError', 'logWarning'];
      suggestions.forEach((suggestion, index) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.textContent = suggestion;
        item.style.padding = '8px 12px';
        item.style.cursor = 'pointer';
        item.style.fontSize = '14px';
        
        if (index === 0) {
          item.style.backgroundColor = '#e3f2fd';
        }
        
        autocompletePopup.appendChild(item);
      });
      
      view.layers.context.appendChild(autocompletePopup);
      
      // 검증
      expect(view.layers.context.children.length).toBe(1);
      expect(autocompletePopup.children.length).toBe(3);
      expect(autocompletePopup.children[0].style.backgroundColor).toBe('rgb(227, 242, 253)');
      
      view.destroy();
    });
  });
  
  describe('Collaborative Editing Scenario', () => {
    it('should render multiple user cursors and selections', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Content layer에 공유 문서
      const sharedDocument = document.createElement('div');
      sharedDocument.innerHTML = `
        <h1>Shared Document</h1>
        <p>This is a collaborative document being edited by multiple users.</p>
        <p>Each user has their own cursor and selection.</p>
      `;
      view.layers.content.appendChild(sharedDocument);
      
      // Selection layer에 여러 사용자의 커서와 선택 영역
      const users = [
        { name: 'Alice', color: '#ff4444', cursorPos: { x: 100, y: 60 }, selectionPos: { x: 50, y: 85, width: 120, height: 18 } },
        { name: 'Bob', color: '#44ff44', cursorPos: { x: 200, y: 85 }, selectionPos: null },
        { name: 'Charlie', color: '#4444ff', cursorPos: { x: 80, y: 110 }, selectionPos: { x: 80, y: 110, width: 80, height: 18 } }
      ];
      
      users.forEach(user => {
        // 사용자 커서
        const cursor = document.createElement('div');
        cursor.className = `cursor-${user.name.toLowerCase()}`;
        cursor.style.position = 'absolute';
        cursor.style.left = `${user.cursorPos.x}px`;
        cursor.style.top = `${user.cursorPos.y}px`;
        cursor.style.width = '2px';
        cursor.style.height = '18px';
        cursor.style.backgroundColor = user.color;
        view.layers.selection.appendChild(cursor);
        
        // 사용자 이름 라벨
        const label = document.createElement('div');
        label.className = `cursor-label-${user.name.toLowerCase()}`;
        label.textContent = user.name;
        label.style.position = 'absolute';
        label.style.left = `${user.cursorPos.x + 5}px`;
        label.style.top = `${user.cursorPos.y - 20}px`;
        label.style.fontSize = '12px';
        label.style.color = user.color;
        label.style.fontWeight = 'bold';
        label.style.backgroundColor = 'white';
        label.style.padding = '2px 4px';
        label.style.borderRadius = '2px';
        label.style.border = `1px solid ${user.color}`;
        view.layers.selection.appendChild(label);
        
        // 사용자 선택 영역 (있는 경우)
        if (user.selectionPos) {
          const selection = document.createElement('div');
          selection.className = `selection-${user.name.toLowerCase()}`;
          selection.style.position = 'absolute';
          selection.style.left = `${user.selectionPos.x}px`;
          selection.style.top = `${user.selectionPos.y}px`;
          selection.style.width = `${user.selectionPos.width}px`;
          selection.style.height = `${user.selectionPos.height}px`;
          selection.style.backgroundColor = user.color.replace('#', 'rgba(') + ', 0.2)'.replace('rgba(', 'rgba(').replace('44', '68').replace('ff', '255');
          view.layers.selection.appendChild(selection);
        }
      });
      
      // 검증
      expect(view.layers.selection.children.length).toBe(8); // 3 cursors + 3 labels + 2 selections
      
      // 각 사용자의 요소들이 올바르게 생성되었는지 확인
      const aliceElements = Array.from(view.layers.selection.children).filter(el => 
        el.className.includes('alice')
      );
      expect(aliceElements.length).toBe(3); // cursor + label + selection
      
      view.destroy();
    });
  });
  
  describe('Performance Intensive Scenario', () => {
    it('should handle real-time syntax highlighting updates', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Content layer에 대용량 코드 파일 시뮬레이션
      const codeContainer = document.createElement('div');
      codeContainer.style.fontFamily = 'monospace';
      codeContainer.style.fontSize = '14px';
      codeContainer.style.lineHeight = '20px';
      
      // 100줄의 코드 생성
      for (let i = 0; i < 100; i++) {
        const line = document.createElement('div');
        line.textContent = `// Line ${i + 1}: function example${i}() { return ${i}; }`;
        line.style.height = '20px';
        codeContainer.appendChild(line);
      }
      
      view.layers.content.appendChild(codeContainer);
      
      // Decorator layer에 구문 강조 오버레이 추가
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        // 키워드 강조
        const keywordHighlight = document.createElement('div');
        keywordHighlight.style.position = 'absolute';
        keywordHighlight.style.left = `${100 + i % 10}px`;
        keywordHighlight.style.top = `${i * 20}px`;
        keywordHighlight.style.width = '60px';
        keywordHighlight.style.height = '20px';
        keywordHighlight.style.backgroundColor = 'rgba(0, 0, 255, 0.1)';
        view.layers.decorator.appendChild(keywordHighlight);
        
        // 함수명 강조
        const functionHighlight = document.createElement('div');
        functionHighlight.style.position = 'absolute';
        functionHighlight.style.left = `${200 + i % 15}px`;
        functionHighlight.style.top = `${i * 20}px`;
        functionHighlight.style.width = '80px';
        functionHighlight.style.height = '20px';
        functionHighlight.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
        view.layers.decorator.appendChild(functionHighlight);
      }
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // 검증
      expect(view.layers.content.children.length).toBe(1);
      expect(codeContainer.children.length).toBe(100);
      expect(view.layers.decorator.children.length).toBe(200); // 100 keyword + 100 function highlights
      expect(renderTime).toBeLessThan(200); // 200ms 이내에 렌더링 완료
      
      view.destroy();
    });
    
    it('should handle smooth scrolling with sticky elements', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Content layer에 긴 문서
      const longDocument = document.createElement('div');
      for (let i = 0; i < 200; i++) {
        const paragraph = document.createElement('p');
        paragraph.textContent = `Paragraph ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.`;
        paragraph.style.marginBottom = '10px';
        longDocument.appendChild(paragraph);
      }
      view.layers.content.appendChild(longDocument);
      
      // Custom layer에 스크롤 위치 표시기
      const scrollIndicator = document.createElement('div');
      scrollIndicator.className = 'scroll-indicator';
      scrollIndicator.style.position = 'absolute';
      scrollIndicator.style.right = '10px';
      scrollIndicator.style.top = '10px';
      scrollIndicator.style.width = '100px';
      scrollIndicator.style.height = '30px';
      scrollIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      scrollIndicator.style.color = 'white';
      scrollIndicator.style.padding = '5px 10px';
      scrollIndicator.style.borderRadius = '4px';
      scrollIndicator.style.fontSize = '12px';
      scrollIndicator.textContent = 'Line 1 of 200';
      view.layers.custom.appendChild(scrollIndicator);
      
      // Custom layer에 미니맵
      const minimap = document.createElement('div');
      minimap.className = 'minimap';
      minimap.style.position = 'absolute';
      minimap.style.right = '10px';
      minimap.style.top = '50px';
      minimap.style.width = '80px';
      minimap.style.height = '400px';
      minimap.style.backgroundColor = '#f0f0f0';
      minimap.style.border = '1px solid #ccc';
      
      // 미니맵에 콘텐츠 표시
      for (let i = 0; i < 20; i++) {
        const minimapLine = document.createElement('div');
        minimapLine.style.height = '2px';
        minimapLine.style.backgroundColor = '#333';
        minimapLine.style.margin = '1px 2px';
        minimap.appendChild(minimapLine);
      }
      
      view.layers.custom.appendChild(minimap);
      
      // 검증
      expect(view.layers.content.children.length).toBe(1);
      expect(longDocument.children.length).toBe(200);
      expect(view.layers.custom.children.length).toBe(2);
      expect(minimap.children.length).toBe(20);
      
      view.destroy();
    });
  });
  
  describe('Interactive Widget Scenario', () => {
    it('should render interactive inline widgets', () => {
      const view = new EditorViewDOM(mockEditor, {
        container: container
      });
      
      // Content layer에 텍스트와 위젯 플레이스홀더
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'Click here to see the chart: <span class="widget-placeholder">[CHART]</span> and continue reading.';
      view.layers.content.appendChild(paragraph);
      
      // Decorator layer에 인터랙티브 차트 위젯
      const chartWidget = document.createElement('div');
      chartWidget.className = 'chart-widget';
      chartWidget.style.position = 'absolute';
      chartWidget.style.left = '200px';
      chartWidget.style.top = '10px';
      chartWidget.style.width = '300px';
      chartWidget.style.height = '200px';
      chartWidget.style.backgroundColor = 'white';
      chartWidget.style.border = '2px solid #007bff';
      chartWidget.style.borderRadius = '8px';
      chartWidget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      chartWidget.style.pointerEvents = 'auto'; // 인터랙션 허용
      chartWidget.setAttribute('data-bc-decorator', 'inline');
      
      // 차트 헤더
      const chartHeader = document.createElement('div');
      chartHeader.style.padding = '10px';
      chartHeader.style.borderBottom = '1px solid #eee';
      chartHeader.style.fontWeight = 'bold';
      chartHeader.textContent = 'Sales Chart';
      chartWidget.appendChild(chartHeader);
      
      // 차트 내용 (간단한 막대 그래프 시뮬레이션)
      const chartContent = document.createElement('div');
      chartContent.style.padding = '20px';
      chartContent.style.display = 'flex';
      chartContent.style.alignItems = 'flex-end';
      chartContent.style.height = '120px';
      
      const data = [30, 60, 45, 80, 55];
      data.forEach((value, index) => {
        const bar = document.createElement('div');
        bar.style.width = '40px';
        bar.style.height = `${value}px`;
        bar.style.backgroundColor = '#007bff';
        bar.style.margin = '0 5px';
        bar.style.cursor = 'pointer';
        bar.title = `Value: ${value}`;
        chartContent.appendChild(bar);
      });
      
      chartWidget.appendChild(chartContent);
      
      // 차트 컨트롤
      const chartControls = document.createElement('div');
      chartControls.style.padding = '10px';
      chartControls.style.borderTop = '1px solid #eee';
      chartControls.style.textAlign = 'center';
      
      const refreshButton = document.createElement('button');
      refreshButton.textContent = 'Refresh';
      refreshButton.style.padding = '5px 15px';
      refreshButton.style.marginRight = '10px';
      chartControls.appendChild(refreshButton);
      
      const exportButton = document.createElement('button');
      exportButton.textContent = 'Export';
      exportButton.style.padding = '5px 15px';
      chartControls.appendChild(exportButton);
      
      chartWidget.appendChild(chartControls);
      view.layers.decorator.appendChild(chartWidget);
      
      // 이벤트 핸들러 테스트
      const refreshHandler = vi.fn();
      const exportHandler = vi.fn();
      refreshButton.addEventListener('click', refreshHandler);
      exportButton.addEventListener('click', exportHandler);
      
      // 버튼 클릭 시뮬레이션
      refreshButton.click();
      exportButton.click();
      
      // 검증
      expect(view.layers.decorator.children.length).toBe(1);
      expect(chartWidget.children.length).toBe(3); // header + content + controls
      expect(chartContent.children.length).toBe(5); // 5 bars
      expect(refreshHandler).toHaveBeenCalledTimes(1);
      expect(exportHandler).toHaveBeenCalledTimes(1);
      expect(chartWidget.getAttribute('data-bc-decorator')).toBe('inline');
      
      view.destroy();
    });
  });
});
