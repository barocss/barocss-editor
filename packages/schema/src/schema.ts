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
    
    // Register node types
    for (const [nodeName, nodeDef] of Object.entries(definition.nodes)) {
      this.nodes.set(nodeName, { ...nodeDef, name: nodeName });
    }
    
    // Register mark types
    if (definition.marks) {
      for (const [markName, markDef] of Object.entries(definition.marks)) {
        this.marks.set(markName, { ...markDef, name: markName });
      }
    }
  }

  // Get attributes by node type
  getAttribute(nodeType: string, attrName: string): AttributeDefinition | undefined {
    const nodeDef = this.getNodeType(nodeType);
    return nodeDef?.attrs?.[attrName];
  }

  // Get content model by node type
  getContentModel(nodeType: string): string | undefined {
    const nodeDef = this.getNodeType(nodeType);
    return nodeDef?.content;
  }

  // Validate attributes by node type
  validateAttributes(nodeType: string, attributes: Record<string, any>): ValidationResult {
    const nodeDef = this.getNodeType(nodeType);
    if (!nodeDef) {
      return { valid: false, errors: [`Unknown node type: ${nodeType}`] };
    }
    
    return Validator.validateAttributes(nodeDef.attrs || {}, attributes);
  }

  // Validate content by node type
  validateContent(nodeType: string, content: any[]): ValidationResult {
    const nodeDef = this.getNodeType(nodeType);
    if (!nodeDef) {
      return { valid: false, errors: [`Unknown node type: ${nodeType}`] };
    }
    
    const contentModel = nodeDef.content;
    if (!contentModel) return { valid: true, errors: [] };
    
    return Validator.validateContentModel(this, nodeType, content);
  }


  // Transform data by node type
  transform(nodeType: string, data: any): any {
    const nodeDef = this.getNodeType(nodeType);
    if (!nodeDef) {
      throw new Error(`Unknown node type: ${nodeType}`);
    }
    
    const transformed = { ...data };
    
    // Transform attributes
    if (nodeDef.attrs) {
      for (const [key, definition] of Object.entries(nodeDef.attrs)) {
        if (definition.transform && transformed.attrs?.[key]) {
          transformed.attrs[key] = definition.transform(transformed.attrs[key]);
        }
      }
    }
    
    return transformed;
  }

  // Node type management
  getNodeType(type: string): NodeTypeDefinition | undefined {
    return this.nodes.get(type);
  }

  hasNodeType(type: string): boolean {
    return this.nodes.has(type);
  }

  getNodeTypesByGroup(group: string): NodeTypeDefinition[] {
    return Array.from(this.nodes.values()).filter(node => node.group === group);
  }

  // Marks management
  getMarkType(type: string): MarkDefinition | undefined {
    return this.marks.get(type);
  }

  hasMarkType(type: string): boolean {
    return this.marks.has(type);
  }

  getMarkTypesByGroup(group: string): MarkDefinition[] {
    return Array.from(this.marks.values()).filter(mark => mark.group === group);
  }

  // Marks validation
  validateMarks(marks: Mark[]): ValidationResult {
    const errors: string[] = [];
    
    for (const mark of marks) {
      const markDef = this.getMarkType(mark.type);
      if (!markDef) {
        errors.push(`Unknown mark type: ${mark.type}`);
        continue;
      }
      
      // Validate mark attributes
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
            // Type validation
            if (!this.validateAttributeType(value, attrDef.type)) {
              errors.push(`Mark '${mark.type}' attribute '${attrName}' has invalid type. Expected ${attrDef.type}, got ${typeof value}`);
            }
            
            // Custom validator
            if (attrDef.validator && !attrDef.validator(value, mark.attrs)) {
              errors.push(`Mark '${mark.type}' attribute '${attrName}' failed custom validation`);
            }
          }
        }
      }
      
      // Validate mark exclusion relationships
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

  // Node creation methods (according to spec)
  doc(content?: any[]): any {
    // TODO: Connect after Document class implementation
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
    
    // TODO: Connect after Node class implementation
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
    
    // Validate marks
    if (marks && marks.length > 0) {
      const marksValidation = this.validateMarks(marks);
      if (!marksValidation.valid) {
        throw new Error(`Invalid marks: ${marksValidation.errors.join(', ')}`);
      }
    }
    
    // TODO: Connect after TextNode class implementation
    return {
      type: 'text',
      content,
      attrs: attrs || {},
      marks: marks || []
    };
  }
}

// Unified schema creation function
export function createSchema(name: string, definition: SchemaDefinition): Schema;
export function createSchema(baseSchema: Schema, extensions: SchemaExtensions): Schema;
export function createSchema(
  nameOrBase: string | Schema, 
  definitionOrExtensions: SchemaDefinition | SchemaExtensions
): Schema {
  // When extending existing schema
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
  
  // When creating new schema
  const name = nameOrBase as string;
  const definition = definitionOrExtensions as SchemaDefinition;
  return new Schema(name, definition);
}
