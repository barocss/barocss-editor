import { DataStore } from './data-store.js';
import type { INode, Document } from './types';

export class DataStoreLoader {
  private _dataStore: DataStore;
  private _nodeIdCounter: number = 0;
  private _sessionId: string;

  constructor(dataStore: DataStore, sessionId: string) {
    this._dataStore = dataStore;
    this._sessionId = sessionId;
  }

  loadDocument(treeDocument: Document): string {
    const rootNode = this._createNodeFromTree(treeDocument as unknown as INode);
    this._dataStore.setNode(rootNode as any);
    this._dataStore.setRootNodeId(rootNode.sid as string);
    this._loadChildren(rootNode.sid as string, (treeDocument.content || []) as INode[]);
    return rootNode.sid as string;
  }

  loadNodes(treeNodes: INode[], parentId?: string): void {
    for (const treeNode of treeNodes) {
      const node = this._createNodeFromTree(treeNode);
      if (parentId) node.parentId = parentId as any;
      this._dataStore.setNode(node as any);
      if (treeNode.content && treeNode.content.length > 0) {
        this._loadChildren(node.sid as string, treeNode.content as INode[]);
      }
    }
  }

  loadFromJSON(jsonString: string): string {
    const treeDocument = JSON.parse(jsonString) as Document;
    return this.loadDocument(treeDocument);
  }

  async loadFromAPI(url: string): Promise<string> {
    const response = await fetch(url);
    const treeDocument = await response.json() as Document;
    return this.loadDocument(treeDocument);
  }

  private _generateFigmaStyleId(): string {
    this._nodeIdCounter++;
    const id = `${this._sessionId}:${this._nodeIdCounter}`;
    return id;
  }

  private _createNodeFromTree(treeNode: INode): INode {
    const nodeId = treeNode.sid || this._generateFigmaStyleId();
    const nodeType = treeNode.stype;
    return {
      sid: nodeId,
      stype: nodeType,
      attributes: treeNode.attributes || {},
      // content는 로딩 단계에서 parent에 의해 구성되므로 여기서는 비워둔다
      content: undefined,
      text: treeNode.text,
      marks: treeNode.marks,
      metadata: {
        ...treeNode.metadata,
        loadedAt: new Date().toISOString()
      },
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    } as any;
  }

  private _loadChildren(parentId: string, children: INode[]): void {
    const parentNode = this._dataStore.getNode(parentId);
    if (!parentNode) return;
    if (!parentNode.content) parentNode.content = [] as any;
    for (const child of children) {
      const childNode = this._createNodeFromTree(child);
      (childNode as any).parentId = parentId;
      this._dataStore.setNode(childNode as any);
      (parentNode.content as any).push(childNode.sid);
      if (child.content && child.content.length > 0) {
        this._loadChildren(childNode.sid as string, child.content as INode[]);
      }
    }
    this._dataStore.setNode(parentNode as any);
  }

  clear(): void {
    this._dataStore.clear();
    this._nodeIdCounter = 0;
  }

  getSessionId(): string { return this._sessionId; }
  getNodeCounter(): number { return this._nodeIdCounter; }
  getSessionInfo(): { sessionId: string; nodeCounter: number } {
    return { sessionId: this._sessionId, nodeCounter: this._nodeIdCounter };
  }

  generateId(): string { return this._generateFigmaStyleId(); }
  generateIdForType(type: string): string { return `${type}-${this.generateId()}`; }
}

export class DataStoreExporter {
  private _dataStore: DataStore;
  constructor(dataStore: DataStore) { this._dataStore = dataStore; }

  exportToTree(rootNodeId?: string): Document {
    const rootId = rootNodeId || this._dataStore.getRootNode()?.sid;
    if (!rootId) throw new Error('No root node found');
    const rootNode = this._dataStore.getNode(rootId);
    if (!rootNode) throw new Error('Root node not found');
    return this._exportNodeToTree(rootNode) as Document;
  }

  exportToJSON(rootNodeId?: string): string {
    return JSON.stringify(this.exportToTree(rootNodeId), null, 2);
  }

  /**
   * Proxy 기반으로 INode를 반환 (lazy evaluation)
   * 
   * content 배열이 ID 배열인 경우, 접근 시에만 실제 노드로 변환하여 메모리 효율적
   * 
   * @param rootNodeId - 루트 노드 ID (없으면 기본 루트 사용)
   * @returns Proxy로 래핑된 INode (ModelData 호환)
   */
  toProxy(rootNodeId?: string): INode | null {
    const rootId = rootNodeId || this._dataStore.getRootNode()?.sid;
    if (!rootId) return null;
    const rootNode = this._dataStore.getNode(rootId);
    if (!rootNode) return null;
    return this._createProxy(rootNode);
  }

  /**
   * INode를 Proxy로 래핑하여 lazy evaluation 지원
   * 
   * content 배열이 ID 배열인 경우, 접근 시에만 실제 INode로 변환
   */
  private _createProxy(node: INode): INode {
    const dataStore = this._dataStore; // 클로저로 캡처
    const createProxy = (n: INode) => this._createProxy(n); // 재귀 호출을 위한 참조
    
    return new Proxy(node, {
      get(target: INode, prop: string | symbol): any {
        // content 접근 시 lazy evaluation
        if (prop === 'content' && target.content) {
          return target.content.map((item: any) => {
            // 문자열인 경우: ID로 간주하고 노드로 변환
            if (typeof item === 'string') {
              const childNode = dataStore.getNode(item);
              if (childNode) {
                // 재귀적으로 Proxy 생성
                return createProxy(childNode);
              }
              // 찾을 수 없으면 그대로 반환 (텍스트일 수 있음)
              return item;
            }
            
            // 이미 INode 객체인 경우 (이미 변환된 경우)
            if (item && typeof item === 'object' && item.stype) {
              return createProxy(item as INode);
            }
            
            return item;
          });
        }
        
        // 나머지는 원본 속성 반환
        return (target as any)[prop];
      }
    }) as INode;
  }

  private _exportNodeToTree(node: INode): INode {
    const children = node.content ?
      (node.content as any)
        .map((childId: string) => this._dataStore.getNode(childId))
        .filter((child: INode | undefined): child is INode => child !== undefined)
        .map((child: INode) => this._exportNodeToTree(child))
      : undefined;
    return {
      sid: node.sid,
      stype: node.stype,
      content: children,
      text: node.text,
      attributes: node.attributes,
      marks: node.marks,
      metadata: node.metadata
    };
  }
}

export class DataStoreManager {
  private _dataStore: DataStore;
  private _loader: DataStoreLoader;
  private _exporter: DataStoreExporter;

  constructor(sessionId: string, rootNodeId?: string) {
    this._dataStore = new DataStore(rootNodeId || 'root');
    this._loader = new DataStoreLoader(this._dataStore, sessionId);
    this._exporter = new DataStoreExporter(this._dataStore);
  }

  get dataStore(): DataStore { return this._dataStore; }
  get loader(): DataStoreLoader { return this._loader; }
  get exporter(): DataStoreExporter { return this._exporter; }

  loadTree(treeDocument: Document): string { return this._loader.loadDocument(treeDocument); }
  loadFromJSON(jsonString: string): string { return this._loader.loadFromJSON(jsonString); }
  async loadFromAPI(url: string): Promise<string> { return this._loader.loadFromAPI(url); }
  exportToTree(rootNodeId?: string): Document { return this._exporter.exportToTree(rootNodeId); }
  exportToJSON(rootNodeId?: string): string { return this._exporter.exportToJSON(rootNodeId); }
  clear(): void { this._loader.clear(); }
  getSessionId(): string { return this._loader.getSessionId(); }
  getNodeCounter(): number { return this._loader.getNodeCounter(); }
  getSessionInfo(): { sessionId: string; nodeCounter: number } { return this._loader.getSessionInfo(); }
  generateId(): string { return this._loader.generateId(); }
  generateIdForType(type: string): string { return this._loader.generateIdForType(type); }
}


