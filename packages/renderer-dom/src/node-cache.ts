/**
 * Node Cache: optional DOM node cache utility (child scan optimization)
 * - Currently reconcile uses local maps; keep this as an extension point
 */
import { VNode } from './vnode/types';

/**
 * NodeCache - caches VNodes and DOM elements and manages their dependencies
 */
export class NodeCache {
  private vnodeCache = new Map<string, VNode>();
  private elementCache = new Map<string, HTMLElement>();
  private dependencyGraph = new Map<string, Set<string>>();
  
  // Cache VNode
  setVNode(nodeId: string, vnode: VNode): void {
    this.vnodeCache.set(nodeId, vnode);
  }
  
  getVNode(nodeId: string): VNode | null {
    return this.vnodeCache.get(nodeId) || null;
  }
  
  hasVNode(nodeId: string): boolean {
    return this.vnodeCache.has(nodeId);
  }
  
  // Cache DOM element
  setElement(nodeId: string, element: HTMLElement): void {
    this.elementCache.set(nodeId, element);
  }
  
  getElement(nodeId: string): HTMLElement | null {
    return this.elementCache.get(nodeId) || null;
  }
  
  hasElement(nodeId: string): boolean {
    return this.elementCache.has(nodeId);
  }
  
  // Dependency management
  addDependency(nodeId: string, dependencyId: string): void {
    if (!this.dependencyGraph.has(nodeId)) {
      this.dependencyGraph.set(nodeId, new Set());
    }
    this.dependencyGraph.get(nodeId)!.add(dependencyId);
  }
  
  getDependencies(nodeId: string): Set<string> {
    return this.dependencyGraph.get(nodeId) || new Set();
  }
  
  // Invalidate caches
  invalidateCache(nodeId: string): void {
    this.vnodeCache.delete(nodeId);
    this.elementCache.delete(nodeId);
    
    // Invalidate dependent nodes as well
    const dependencies = this.dependencyGraph.get(nodeId) || new Set();
    dependencies.forEach(depId => {
      this.invalidateCache(depId);
    });
  }
  
  // Invalidate only specific cache types
  invalidateVNodeCache(nodeId: string): void {
    this.vnodeCache.delete(nodeId);
  }
  
  invalidateElementCache(nodeId: string): void {
    this.elementCache.delete(nodeId);
  }
  
  // Clear all caches
  clear(): void {
    this.vnodeCache.clear();
    this.elementCache.clear();
    this.dependencyGraph.clear();
  }
  
  // Cache statistics
  getCacheStats(): { vnodeCount: number; elementCount: number; dependencyCount: number } {
    return {
      vnodeCount: this.vnodeCache.size,
      elementCount: this.elementCache.size,
      dependencyCount: this.dependencyGraph.size
    };
  }
}
