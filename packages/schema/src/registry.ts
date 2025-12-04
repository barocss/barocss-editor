import { Schema } from './schema.js';

class SchemaRegistry {
  private _schemas = new Map<string, Schema>();
  private _nodeGroups = new Map<string, string[]>(); // 노드 타입 그룹별 관리

  register(schema: Schema): void {
    if (this._schemas.has(schema.name)) {
      console.warn(`Schema '${schema.name}' is already registered. Overwriting.`);
    }
    this._schemas.set(schema.name, schema);
    
    // 노드 타입별 그룹 등록
    for (const [nodeType, nodeDef] of schema.nodes) {
      if (nodeDef.group) {
        const groupNodes = this._nodeGroups.get(nodeDef.group) || [];
        if (!groupNodes.includes(nodeType)) {
          groupNodes.push(nodeType);
          this._nodeGroups.set(nodeDef.group, groupNodes);
        }
      }
    }
  }

  get(name: string): Schema | undefined {
    return this._schemas.get(name);
  }

  getAll(): Schema[] {
    return Array.from(this._schemas.values());
  }

  // 노드 타입 그룹별 조회
  getNodeTypesByGroup(group: string): string[] {
    return this._nodeGroups.get(group) || [];
  }

  // 특정 스키마의 노드 타입 그룹별 조회
  getNodeTypesByGroupInSchema(schemaName: string, group: string): string[] {
    const schema = this._schemas.get(schemaName);
    if (!schema) return [];
    
    return Array.from(schema.nodes.values())
      .filter(node => node.group === group)
      .map(node => node.name);
  }

  remove(name: string): boolean {
    const schema = this._schemas.get(name);
    if (schema) {
      // 노드 타입 그룹에서 제거
      for (const [nodeType, nodeDef] of schema.nodes) {
        if (nodeDef.group) {
          const groupNodes = this._nodeGroups.get(nodeDef.group) || [];
          const index = groupNodes.indexOf(nodeType);
          if (index > -1) {
            groupNodes.splice(index, 1);
            this._nodeGroups.set(nodeDef.group, groupNodes);
          }
        }
      }
    }
    return this._schemas.delete(name);
  }

  has(name: string): boolean {
    return this._schemas.has(name);
  }

  clear(): void {
    this._schemas.clear();
    this._nodeGroups.clear();
  }
}

// 전역 레지스트리 인스턴스
const globalRegistry = new SchemaRegistry();

export function registerSchema(schema: Schema): void {
  globalRegistry.register(schema);
}

export function getSchema(name: string): Schema | undefined {
  return globalRegistry.get(name);
}

export function getAllSchemas(): Schema[] {
  return globalRegistry.getAll();
}

// 노드 타입 그룹별 조회
export function getNodeTypesByGroup(group: string): string[] {
  return globalRegistry.getNodeTypesByGroup(group);
}

// 특정 스키마의 노드 타입 그룹별 조회
export function getNodeTypesByGroupInSchema(schemaName: string, group: string): string[] {
  return globalRegistry.getNodeTypesByGroupInSchema(schemaName, group);
}

export function removeSchema(name: string): boolean {
  return globalRegistry.remove(name);
}

export function hasSchema(name: string): boolean {
  return globalRegistry.has(name);
}

export function clearSchemas(): void {
  globalRegistry.clear();
}

export { SchemaRegistry, globalRegistry as schemaRegistry };
