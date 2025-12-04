import { Schema } from './schema.js';
import { ValidationResult, AttributeDefinition, ValidationErrorCode } from './types';
import { VALIDATION_ERRORS } from './types';

/**
 * 통합 검증 유틸리티 클래스
 * 스키마 기반 검증과 기본 구조적 검증을 제공합니다.
 */
export class Validator {
  /**
   * 기본적인 구조적 검증 (스키마와 무관)
   * 노드의 ID, 타입, 텍스트 내용 등의 기본 구조를 검증합니다.
   */
  static validateNodeStructure(node: any): ValidationResult {
    const errors: string[] = [];
    const errorCodes: ValidationErrorCode[] = [];
    
    if (!node) {
      errors.push('Node is required');
      errorCodes.push(VALIDATION_ERRORS.NODE_REQUIRED);
      return { valid: false, errors, errorCodes };
    }
    
    if (!node.sid) {
      errors.push('Node ID is required');
      errorCodes.push(VALIDATION_ERRORS.NODE_ID_REQUIRED);
    }
    
    const nodeType = node?.stype;
    if (!nodeType) {
      errors.push('Node stype is required');
      errorCodes.push(VALIDATION_ERRORS.NODE_TYPE_REQUIRED);
    }
    
    if (node?.stype === 'text') {
      const hasText = node.text && node.text !== undefined && node.text !== '';
      const hasContent = node.attributes?.content && node.attributes.content !== undefined && node.attributes.content !== '';
      
      if (!hasText && !hasContent) {
        errors.push('Text content or content attribute is required for text nodes');
        errorCodes.push(VALIDATION_ERRORS.TEXT_CONTENT_REQUIRED);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      errorCodes
    };
  }

  /**
   * 기본적인 문서 구조 검증
   * 문서의 ID, 스키마, 컨텐츠 등의 기본 구조를 검증합니다.
   */
  static validateDocumentStructure(document: any): ValidationResult {
    const errors: string[] = [];
    const errorCodes: ValidationErrorCode[] = [];
    
    if (!document) {
      errors.push('Document is required');
      errorCodes.push(VALIDATION_ERRORS.DOCUMENT_REQUIRED);
      return { valid: false, errors, errorCodes };
    }
    
    if (!document.sid) {
      errors.push('Document ID is required');
      errorCodes.push(VALIDATION_ERRORS.DOCUMENT_ID_REQUIRED);
    }
    
    if (!document.schema) {
      errors.push('Document schema is required');
      errorCodes.push(VALIDATION_ERRORS.DOCUMENT_SCHEMA_REQUIRED);
    }
    
    if (!document.content || document.content.length === 0) {
      errors.push('Document content is required');
      errorCodes.push(VALIDATION_ERRORS.DOCUMENT_CONTENT_REQUIRED);
    }
    
    // 문서 내부의 모든 노드 검증
    if (document.content && Array.isArray(document.content)) {
      document.content.forEach((node: any, index: number) => {
        const nodeValidation = this.validateNodeStructure(node);
        if (!nodeValidation.valid) {
          nodeValidation.errors.forEach(error => {
            errors.push(`Node ${index}: ${error}`);
          });
          if (nodeValidation.errorCodes) {
            (nodeValidation.errorCodes as ValidationErrorCode[]).forEach(code => {
              errorCodes.push(code);
            });
          }
        }
      });
    }
    
    return {
      valid: errors.length === 0,
      errors,
      errorCodes
    };
  }

  /**
   * 스키마 기반 노드 검증
   * 스키마에 정의된 노드 타입, 속성, 컨텐츠 모델을 검증합니다.
   */
  static validateNode(schema: Schema, node: any): ValidationResult {
    const errors: string[] = [];
    const errorCodes: ValidationErrorCode[] = [];
    
    // 스키마가 유효한 Schema 인스턴스인지 확인
    if (!schema || typeof schema.hasNodeType !== 'function') {
      console.error('Invalid schema passed to validateNode:', schema);
      errors.push('Invalid schema instance');
      errorCodes.push(VALIDATION_ERRORS.INVALID_SCHEMA_INSTANCE);
      return { valid: false, errors, errorCodes };
    }
    
    // 노드 타입 검증 (stype 전용)
    const nodeType = node?.stype;
    if (!schema.hasNodeType(nodeType)) {
      errors.push(`Unknown node type: ${nodeType}`);
      errorCodes.push(VALIDATION_ERRORS.NODE_TYPE_UNKNOWN);
      return { valid: false, errors, errorCodes };
    }
    
    // 속성 검증
    const attributeValidation = schema.validateAttributes(nodeType, node.attrs || {});
    if (!attributeValidation.valid) {
      errors.push(...attributeValidation.errors);
      // 속성 검증 오류는 일반적으로 ATTRIBUTE_INVALID로 분류
      errorCodes.push(VALIDATION_ERRORS.ATTRIBUTE_INVALID);
    }
    
    // 컨텐츠 검증
    if (node.content) {
      const contentValidation = schema.validateContent(nodeType, node.content);
      if (!contentValidation.valid) {
        errors.push(...contentValidation.errors);
        // 컨텐츠 검증 오류는 CONTENT_REQUIRED_BUT_EMPTY로 분류
        errorCodes.push(VALIDATION_ERRORS.CONTENT_REQUIRED_BUT_EMPTY);
      }
    }

    // ---- Indent 관련 스키마 정합성 검증 (정적 일관성만 확인) ----
    const nodeDef = schema.getNodeType(nodeType);
    if (nodeDef) {
      // 1) indentable 이 true 인데 group 이 block 이 아닌 경우 경고 수준의 에러
      if (nodeDef.indentable && nodeDef.group && nodeDef.group !== 'block') {
        errors.push(
          `Node type '${nodeType}' is indentable but its group is '${nodeDef.group}'. ` +
          `Indentable nodes are expected to be in the 'block' group.`
        );
      }

      // 2) maxIndentLevel 이 0 이하인 경우
      if (typeof nodeDef.maxIndentLevel === 'number' && nodeDef.maxIndentLevel <= 0) {
        errors.push(
          `Node type '${nodeType}' has invalid maxIndentLevel '${nodeDef.maxIndentLevel}'. ` +
          `Expected a positive integer or undefined.`
        );
      }

      // 3) indentParentTypes 가 정의되어 있는데 indentable 이 아닌 경우 (구조적으로 모순은 아니지만 경고)
      if (!nodeDef.indentable && Array.isArray(nodeDef.indentParentTypes) && nodeDef.indentParentTypes.length > 0) {
        errors.push(
          `Node type '${nodeType}' defines indentParentTypes but is not indentable. ` +
          `Either set indentable: true or remove indentParentTypes.`
        );
      }

      // 4) indentParentTypes 에 존재하지 않는 노드 타입이 있는 경우
      if (Array.isArray(nodeDef.indentParentTypes)) {
        for (const parentType of nodeDef.indentParentTypes) {
          if (!schema.hasNodeType(parentType)) {
            errors.push(
              `Node type '${nodeType}' has indentParentTypes entry '${parentType}' which is not defined in the schema.`
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      errorCodes
    };
  }

  /**
   * 스키마 기반 문서 검증
   * 스키마에 정의된 문서 타입, 속성, 컨텐츠 모델을 검증합니다.
   */
  static validateDocument(schema: Schema, document: any): ValidationResult {
  const errors: string[] = [];
  
  // 문서 타입 검증 (stype 전용)
  if (document.stype !== schema.topNode) {
    errors.push(`Document stype '${document.stype}' does not match schema topNode '${schema.topNode}'`);
  }
  
  // 문서 속성 검증
  const attributeValidation = schema.validateAttributes(schema.topNode, document.attrs || {});
  if (!attributeValidation.valid) {
    errors.push(...attributeValidation.errors);
  }
  
  // 문서 컨텐츠 검증
  if (document.content) {
    const contentValidation = schema.validateContent(schema.topNode, document.content);
    if (!contentValidation.valid) {
      errors.push(...contentValidation.errors);
    }
    
    // 각 자식 노드 검증
    document.content.forEach((childNode: any, index: number) => {
      const nodeValidation = this.validateNode(schema, childNode);
      if (!nodeValidation.valid) {
        errors.push(...nodeValidation.errors.map(err => `Child node ${index}: ${err}`));
      }
    });
  }
  
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 타입 검증 함수
   * 값이 지정된 타입과 일치하는지 검증합니다.
   */
  static validateType(value: any, type: AttributeDefinition['type']): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'custom':
      return true; // Custom types rely on their specific validator
    default:
      return false;
  }
  }

  /**
   * Object 스키마 검증 함수
   * 값이 지정된 객체 스키마와 일치하는지 검증합니다.
   */
  static validateObjectSchema(
    value: any, 
    objectSchema: Record<string, AttributeDefinition>
  ): ValidationResult {
    const errors: string[] = [];
    
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      valid: false,
      errors: ['Value must be a valid object']
    };
  }
  
  // 필수 속성 검증
  for (const [key, definition] of Object.entries(objectSchema)) {
    const isRequired = typeof definition.required === 'function' 
      ? definition.required(value) 
      : definition.required;
      
    if (isRequired && (value[key] === undefined || value[key] === null)) {
      errors.push(`Required object property '${key}' is missing`);
      continue;
    }
    
    // 값이 제공된 경우 타입과 검증자 확인
    if (value[key] !== undefined && value[key] !== null) {
      // 타입 검증
      if (!this.validateType(value[key], definition.type)) {
        errors.push(`Object property '${key}' has invalid type. Expected ${definition.type}, got ${typeof value[key]}`);
        continue;
      }
      
      // 중첩된 object 스키마 검증
      if (definition.type === 'object' && definition.objectSchema) {
        const nestedValidation = this.validateObjectSchema(value[key], definition.objectSchema);
        if (!nestedValidation.valid) {
          errors.push(...nestedValidation.errors.map(err => `Object property '${key}': ${err}`));
        }
      }
      
      // 커스텀 검증자
      if (definition.validator && !definition.validator(value[key], value)) {
        errors.push(`Object property '${key}' failed custom validation`);
      }
    }
  }
  
  // 정의되지 않은 속성 검증 (선택적)
  const definedKeys = new Set(Object.keys(objectSchema));
  const valueKeys = Object.keys(value);
  const extraKeys = valueKeys.filter(key => !definedKeys.has(key));
  
  if (extraKeys.length > 0) {
    errors.push(`Object contains undefined properties: ${extraKeys.join(', ')}`);
  }
  
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 노드 타입별 속성 검증 함수 (Schema 클래스에서 사용)
   * 노드의 속성이 스키마 정의와 일치하는지 검증합니다.
   */
  static validateAttributes(attrs: Record<string, AttributeDefinition>, attributes: Record<string, any>): ValidationResult {
    const errors: string[] = [];

    for (const key in attrs) {
    const definition = attrs[key];
    const value = attributes[key];

    // Check required
    const isRequired = typeof definition.required === 'function' ? definition.required(attributes) : definition.required;
    if (isRequired && (value === undefined || value === null || value === '')) {
      errors.push(`Required attribute '${key}' is missing or empty.`);
      continue;
    }

    // If value is provided, validate type and custom validator
    if (value !== undefined && value !== null) {
      if (!this.validateType(value, definition.type)) {
        errors.push(`Attribute '${key}' has invalid type. Expected ${definition.type}, got ${typeof value}.`);
      }

      // Object 스키마 검증
      if (definition.type === 'object' && definition.objectSchema) {
        const objectValidation = this.validateObjectSchema(value, definition.objectSchema);
        if (!objectValidation.valid) {
          errors.push(...objectValidation.errors.map(err => `Attribute '${key}': ${err}`));
        }
      }

      if (definition.validator && !definition.validator(value, attributes)) {
        errors.push(`Attribute '${key}' failed custom validation.`);
      }
    }
  }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 통합 스키마용 컨텐츠 모델 검증 함수
   * 노드의 컨텐츠가 스키마에 정의된 컨텐츠 모델과 일치하는지 검증합니다.
   */
  static validateContentModel(
    schema: Schema,
    nodeType: string,
    content: any[]
  ): ValidationResult {
    const errors: string[] = [];
    const nodeDef = schema.getNodeType(nodeType);
    
    if (!nodeDef) {
    return { valid: false, errors: [`Unknown node type: ${nodeType}`] };
  }
  
  const contentModel = nodeDef.content;
  if (!contentModel) {
    return { valid: true, errors: [] };
  }

  // Simple content model parsing and validation logic
  const trimmedModel = contentModel.trim();

  if (trimmedModel.endsWith('+')) {
    if (content.length === 0) {
      errors.push(`Content is required but empty for model '${trimmedModel}'.`);
    }
    const baseModel = trimmedModel.slice(0, -1);
    content.forEach((node, index) => {
      if (!schema.hasNodeType(node.stype)) {
        errors.push(`Node at index ${index} has unknown type '${node.stype}'.`);
        return;
      }
      const childNodeDef = schema.getNodeType(node.stype);
      if (childNodeDef?.group !== baseModel && node.stype !== baseModel) {
        errors.push(`Node at index ${index} of type '${node.stype}' does not match required content model '${baseModel}'.`);
      }
    });
  } else if (trimmedModel.endsWith('*')) {
    // 0 or more, no minimum length check
    const baseModel = trimmedModel.slice(0, -1);
    content.forEach((node, index) => {
      if (!schema.hasNodeType(node.stype)) {
        errors.push(`Node at index ${index} has unknown type '${node.stype}'.`);
        return;
      }
      const childNodeDef = schema.getNodeType(node.stype);
      if (childNodeDef?.group !== baseModel && node.stype !== baseModel) {
        errors.push(`Node at index ${index} of type '${node.stype}' does not match required content model '${baseModel}'.`);
      }
    });
  } else if (trimmedModel.endsWith('?')) {
    if (content.length > 1) {
      errors.push(`Content for model '${trimmedModel}' must be 0 or 1 node, but got ${content.length}.`);
    }
    if (content.length === 1) {
      const baseModel = trimmedModel.slice(0, -1);
      const node = content[0];
      if (!schema.hasNodeType(node.stype)) {
        errors.push(`Node has unknown type '${node.stype}'.`);
        return {
          valid: errors.length === 0,
          errors
        };
      }
      const childNodeDef = schema.getNodeType(node.stype);
      if (childNodeDef?.group !== baseModel && node.stype !== baseModel) {
        errors.push(`Node of type '${node.stype}' does not match required content model '${baseModel}'.`);
      }
    }
  } else if (trimmedModel.includes('|')) {
    const allowedTypes = trimmedModel.split('|').map(s => s.trim());
    content.forEach((node, index) => {
      if (!allowedTypes.includes(node.stype)) {
        const childNodeDef = schema.getNodeType(node.stype);
        const nodeGroup = childNodeDef?.group;
        if (!allowedTypes.includes(nodeGroup || '')) {
          errors.push(`Node at index ${index} of type '${node.stype}' does not match any allowed types in '${trimmedModel}'.`);
        }
      }
    });
  } else if (trimmedModel !== '') { // Specific node type or group
    content.forEach((node, index) => {
      if (!schema.hasNodeType(node.stype)) {
        errors.push(`Node at index ${index} has unknown type '${node.stype}'.`);
        return;
      }
      const childNodeDef = schema.getNodeType(node.stype);
      if (node.stype !== trimmedModel && childNodeDef?.group !== trimmedModel) {
        errors.push(`Node at index ${index} of type '${node.stype}' does not match required type or group '${trimmedModel}'.`);
      }
    });
  }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
