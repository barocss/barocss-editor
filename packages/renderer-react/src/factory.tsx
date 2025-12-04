import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { TNodeType } from './types';
import { ReactRendererRegistry } from './registry.js';

export class ReactRendererFactory {
  constructor(private registry: ReactRendererRegistry) {}
  
  // 렌더러 생성
  createRenderer(nodeType: TNodeType, data: any): HTMLElement {
    const renderer = this.registry.get(nodeType);
    if (!renderer) {
      throw new Error(`React renderer for node type '${nodeType}' not found`);
    }
    
    // React 컴포넌트를 DOM으로 렌더링
    const container = document.createElement('div');
    const root = createRoot(container);
    
    const props = renderer.props ? renderer.props(data) : { data };
    root.render(createElement(renderer.component, props));
    
    return container.firstChild as HTMLElement;
  }
}
