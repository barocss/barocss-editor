/**
 * Editor Integration Example
 * 
 * Model의 TransactionEvent를 DOMRenderer가 처리하는 예시
 */

import { DOMRenderer } from '@barocss/renderer-dom';
import { RendererRegistry, renderer, element, data } from '@barocss/dsl';
import { Editor } from '@barocss/editor-core';
import type { TransactionResult } from '@barocss/model';

export class EditorIntegration {
  private domRenderer: DOMRenderer;
  private editor: Editor;
  private container: HTMLElement;
  
  constructor(container: HTMLElement, editor: Editor) {
    this.container = container;
    this.editor = editor;
    
    // 렌더러 설정
    this.setupRenderer();
    
    // 모델 이벤트 리스너 등록
    this.setupModelEventListener();
  }
  
  private setupRenderer(): void {
    const registry = new RendererRegistry();
    
    // 기본 렌더러 등록
    registry.register(renderer('root', element('div', {
      className: 'editor-root'
    }, [data('content', '')])));
    
    registry.register(renderer('textBlock', element('div', {
      className: 'text-block'
    }, [data('text', '')])));
    
    registry.register(renderer('paragraph', element('p', {
      className: 'paragraph'
    }, [data('text', '')])));
    
    this.domRenderer = new DOMRenderer(registry);
  }
  
  private setupModelEventListener(): void {
    // Model 변경 시 에디터 이벤트를 받아 렌더링
    this.editor.on('editor:content.change', (event: any) => {
      const model = event?.content;
      if (!model) return;
      this.domRenderer.render(this.container, model);
    });
  }
  
  // 초기 렌더링
  renderInitial(model: any): void {
    const element = this.domRenderer.renderInitial(model, this.container);
  }
  
  // 사용자 편집 처리
  async handleUserEdit(inputEvent: InputEvent): Promise<void> {
    // 1. DOM 변경사항을 Operation으로 변환
    const operations = this.createOperationsFromInput(inputEvent);
    
    // 2. Editor 트랜잭션 생성 및 실행
    const transaction = {
      sid: `tx-${Date.now()}`,
      operations,
      timestamp: new Date()
    };
    
    // 3. Transaction 실행 (이벤트가 자동으로 DOMRenderer에 전달됨)
    const result: TransactionResult = await this.editor.executeTransaction(transaction as any);
    if (!result.success) {
      console.error('Transaction failed', result.errors);
    }
  }
  
  private createOperationsFromInput(inputEvent: InputEvent): any[] {
    // 실제 구현에서는 DOM 변경사항을 Operation으로 변환
    return [];
  }
  
  // 렌더러 파괴
  destroy(): void {
    this.domRenderer.destroy();
  }
}

// 사용 예시
export function createEditor(container: HTMLElement): EditorIntegration {
  const editor = new Editor();
  const integration = new EditorIntegration(container, editor);
  
  // 초기 모델 렌더링
  const initialModel = {
    id: 'root',
    type: 'root',
    content: 'Hello World'
  };
  
  integration.renderInitial(initialModel);
  
  return integration;
}
