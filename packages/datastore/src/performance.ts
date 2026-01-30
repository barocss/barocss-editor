import { DataStore } from './data-store.js';
import type { INode } from './types';

export class LazyDataStore extends DataStore {
  private _lazyNodes = new Map<string, () => Promise<INode>>();
  registerLazyNode(id: string, loader: () => Promise<INode>): void { this._lazyNodes.set(id, loader); }
  async getNodeAsync(id: string): Promise<INode | undefined> {
    const existingNode = super.getNode(id) as any;
    if (existingNode) return existingNode;
    const loader = this._lazyNodes.get(id);
    if (loader) {
      const node = await loader();
      this.saveNode(node as any);
      return node as any;
    }
    return undefined;
  }
}

export class CachedDataStore extends DataStore {
  private _cache = new Map<string, { data: any; timestamp: number }>();
  private _cacheTimeout = 5 * 60 * 1000;
  getNode(id: string): INode | undefined {
    const cached = this._cache.get(id);
    if (cached && Date.now() - cached.timestamp < this._cacheTimeout) {
      return cached.data as any;
    }
    const node = super.getNode(id) as any;
    if (node) this._cache.set(id, { data: node, timestamp: Date.now() });
    return node as any;
  }
  saveNode(node: INode, validate: boolean = true): any {
    const result = super.saveNode(node as any, validate);
    if (result === null && node.sid) this._cache.set(node.sid, { data: node, timestamp: Date.now() });
    return result;
  }
  invalidateCache(id?: string): void { id ? this._cache.delete(id) : this._cache.clear(); }
}


