import { ReactRendererDefinition, TNodeType } from './types';

export class ReactRendererRegistry {
  private _renderers = new Map<TNodeType, ReactRendererDefinition>();
  
  // 렌더러 등록
  register(renderer: ReactRendererDefinition): void {
    this._renderers.set(renderer.nodeType, renderer);
  }
  
  // 렌더러 가져오기
  get(nodeType: TNodeType): ReactRendererDefinition | undefined {
    return this._renderers.get(nodeType);
  }
  
  // 모든 렌더러 가져오기
  getAll(): ReactRendererDefinition[] {
    return Array.from(this._renderers.values());
  }
  
  // 렌더러 제거
  remove(nodeType: TNodeType): boolean {
    return this._renderers.delete(nodeType);
  }
  
  // 렌더러 존재 확인
  has(nodeType: TNodeType): boolean {
    return this._renderers.has(nodeType);
  }

  // 모든 렌더러 초기화
  clear(): void {
    this._renderers.clear();
  }
}
