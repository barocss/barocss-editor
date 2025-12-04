import { SchemaDefinition, AttributeDefinition, ValidationResult, NodeTypeDefinition, MarkDefinition, Mark, SchemaExtensions } from './types';
import { Validator } from './validators.js';

export class Schema {
  public topNode: string;
  public nodes: Map<string, NodeTypeDefinition>;
  public marks: Map<string, MarkDefinition>;
  
  constructor(public name: string, public definition: SchemaDefinition) {
    this.topNode = definition.topNode || 'doc';
    this.nodes = new Map();
    this.marks = new Map();
    
    // 노드 타입들 등록
    for (const [nodeName, nodeDef] of Object.entries(definition.nodes)) {
      this.nodes.set(nodeName, { ...nodeDef, name: nodeName });
    }
    
    // 마크 타입들 등록
    if (definition.marks) {
      for (const [markName, markDef] of Object.entries(definition.marks)) {
        this.marks.set(markName, { ...markDef, name: markName });
      }
    }
  }

  // 노드 타입별 속성 조회
  getAttribute(nodeType: string, attrName: string): AttributeDefinition | undefined {
    const nodeDef = this.getNodeType(nodeType);
    return nodeDef?.attrs?.[attrName];
  }

  // 노드 타입별 콘텐츠 모델 조회
  getContentModel(nodeType: string): string | undefined {
    const nodeDef = this.getNodeType(nodeType);
    return nodeDef?.content;
  }

  // 노드 타입별 속성 검증
  validateAttributes(nodeType: string, attributes: Record<string, any>): ValidationResult {
    const nodeDef = this.getNodeType(nodeType);
    if (!nodeDef) {
      return { valid: false, errors: [`Unknown node type: ${nodeType}`] };
    }
    
    return Validator.validateAttributes(nodeDef.attrs || {}, attributes);
  }

  // 노드 타입별 콘텐츠 검증
  validateContent(nodeType: string, content: any[]): ValidationResult {
    const nodeDef = this.getNodeType(nodeType);
    if (!nodeDef) {
      return { valid: false, errors: [`Unknown node type: ${nodeType}`] };
    }
    
    const contentModel = nodeDef.content;
    if (!contentModel) return { valid: true, errors: [] };
    
    return Validator.validateContentModel(this, nodeType, content);
  }


  // 노드 타입별 데이터 변환
  transform(nodeType: string, data: any): any {
    const nodeDef = this.getNodeType(nodeType);
    if (!nodeDef) {
      throw new Error(`Unknown node type: ${nodeType}`);
    }
    
    const transformed = { ...data };
    
    // 속성 변환
    if (nodeDef.attrs) {
      for (const [key, definition] of Object.entries(nodeDef.attrs)) {
        if (definition.transform && transformed.attrs?.[key]) {
          transformed.attrs[key] = definition.transform(transformed.attrs[key]);
        }
      }
    }
    
    return transformed;
  }

  // 노드 타입 관리
  getNodeType(type: string): NodeTypeDefinition | undefined {
    return this.nodes.get(type);
  }

  hasNodeType(type: string): boolean {
    return this.nodes.has(type);
  }

  getNodeTypesByGroup(group: string): NodeTypeDefinition[] {
    return Array.from(this.nodes.values()).filter(node => node.group === group);
  }

  // Marks 관리
  getMarkType(type: string): MarkDefinition | undefined {
    return this.marks.get(type);
  }

  hasMarkType(type: string): boolean {
    return this.marks.has(type);
  }

  getMarkTypesByGroup(group: string): MarkDefinition[] {
    return Array.from(this.marks.values()).filter(mark => mark.group === group);
  }

  // Marks 검증
  validateMarks(marks: Mark[]): ValidationResult {
    const errors: string[] = [];
    
    for (const mark of marks) {
      const markDef = this.getMarkType(mark.type);
      if (!markDef) {
        errors.push(`Unknown mark type: ${mark.type}`);
        continue;
      }
      
      // 마크 속성 검증
      if (markDef.attrs && mark.attrs) {
        for (const [attrName, attrDef] of Object.entries(markDef.attrs)) {
          const value = mark.attrs[attrName];
          const isRequired = typeof attrDef.required === 'function' 
            ? attrDef.required(mark.attrs) 
            : attrDef.required;
            
          if (isRequired && (value === undefined || value === null)) {
            errors.push(`Required mark attribute '${attrName}' is missing for mark '${mark.type}'`);
            continue;
          }
          
          if (value !== undefined && value !== null) {
            // 타입 검증
            if (!this.validateAttributeType(value, attrDef.type)) {
              errors.push(`Mark '${mark.type}' attribute '${attrName}' has invalid type. Expected ${attrDef.type}, got ${typeof value}`);
            }
            
            // 커스텀 검증자
            if (attrDef.validator && !attrDef.validator(value, mark.attrs)) {
              errors.push(`Mark '${mark.type}' attribute '${attrName}' failed custom validation`);
            }
          }
        }
      }
      
      // 마크 제외 관계 검증
      if (markDef.excludes) {
        const conflictingMarks = marks.filter(otherMark => 
          otherMark !== mark && markDef.excludes!.includes(otherMark.type)
        );
        if (conflictingMarks.length > 0) {
          errors.push(`Mark '${mark.type}' cannot be used with: ${conflictingMarks.map(m => m.type).join(', ')}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  private validateAttributeType(value: any, type: string): boolean {
    switch (type) {
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number';
      case 'boolean': return typeof value === 'boolean';
      case 'array': return Array.isArray(value);
      case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'custom': return true;
      default: return false;
    }
  }

  // 노드 생성 메서드들 (스펙에 맞게)
  doc(content?: any[]): any {
    // TODO: Document 클래스 구현 후 연결
    return {
      type: this.topNode,
      content: content || []
    };
  }

  node(type: string, attrs?: any, content?: any[]): any {
    const nodeDef = this.getNodeType(type);
    if (!nodeDef) {
      throw new Error(`Unknown node type: ${type}`);
    }
    
    // TODO: Node 클래스 구현 후 연결
    return {
      type,
      attrs: attrs || {},
      content: content || []
    };
  }

  text(content: string, attrs?: any, marks?: Mark[]): any {
    const textDef = this.getNodeType('text');
    if (!textDef) {
      throw new Error('Text node type not defined in schema');
    }
    
    // Marks 검증
    if (marks && marks.length > 0) {
      const marksValidation = this.validateMarks(marks);
      if (!marksValidation.valid) {
        throw new Error(`Invalid marks: ${marksValidation.errors.join(', ')}`);
      }
    }
    
    // TODO: TextNode 클래스 구현 후 연결
    return {
      type: 'text',
      content,
      attrs: attrs || {},
      marks: marks || []
    };
  }
}

// 통합 스키마 생성 함수
export function createSchema(name: string, definition: SchemaDefinition): Schema;
export function createSchema(baseSchema: Schema, extensions: SchemaExtensions): Schema;
export function createSchema(
  nameOrBase: string | Schema, 
  definitionOrExtensions: SchemaDefinition | SchemaExtensions
): Schema {
  // 기존 스키마를 확장하는 경우
  if (typeof nameOrBase === 'object') {
    const baseSchema = nameOrBase;
    const extensions = definitionOrExtensions as Partial<SchemaDefinition>;
    
    const mergedDefinition: SchemaDefinition = {
      topNode: extensions.topNode || baseSchema.topNode,
      nodes: {
        ...baseSchema.definition.nodes,
        ...extensions.nodes
      },
      marks: {
        ...baseSchema.definition.marks,
        ...extensions.marks
      }
    };
    
    return new Schema(baseSchema.name, mergedDefinition);
  }
  
  // 새로운 스키마 생성하는 경우
  const name = nameOrBase as string;
  const definition = definitionOrExtensions as SchemaDefinition;
  return new Schema(name, definition);
}
