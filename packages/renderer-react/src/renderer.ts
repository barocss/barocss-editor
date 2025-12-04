import { ReactRendererDefinition, TNodeType } from './types';

// React 렌더러 생성
export function rendererReact<T = any>(
  nodeType: TNodeType, 
  component: React.ComponentType<T>
): ReactRendererDefinition {
  return {
    type: 'react',
    nodeType,
    component
  };
}
