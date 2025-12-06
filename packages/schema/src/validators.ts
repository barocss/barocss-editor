import { Schema } from './schema.js';
import { ValidationResult, AttributeDefinition, ValidationErrorCode } from './types';
import { VALIDATION_ERRORS } from './types';

/**
 * Unified validation utility class
 * Provides schema-based validation and basic structural validation.
 */
export class Validator {
  /**
   * Basic structural validation (schema-independent)
   * Validates basic structure of nodes such as ID, type, text content, etc.
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
   * Basic document structure validation
   * Validates basic structure of documents such as ID, schema, content, etc.
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
    
    // Validate all nodes within document
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
   * Schema-based node validation
   * Validates node type, attributes, and content model defined in schema.
   */
  static validateNode(schema: Schema, node: any): ValidationResult {
    const errors: string[] = [];
    const errorCodes: ValidationErrorCode[] = [];
    
    // Check if schema is a valid Schema instance
    if (!schema || typeof schema.hasNodeType !== 'function') {
      console.error('Invalid schema passed to validateNode:', schema);
      errors.push('Invalid schema instance');
      errorCodes.push(VALIDATION_ERRORS.INVALID_SCHEMA_INSTANCE);
      return { valid: false, errors, errorCodes };
    }
    
    // Validate node type (stype only)
    const nodeType = node?.stype;
    if (!schema.hasNodeType(nodeType)) {
      errors.push(`Unknown node type: ${nodeType}`);
      errorCodes.push(VALIDATION_ERRORS.NODE_TYPE_UNKNOWN);
      return { valid: false, errors, errorCodes };
    }
    
    // Validate attributes
    const attributeValidation = schema.validateAttributes(nodeType, node.attrs || {});
    if (!attributeValidation.valid) {
      errors.push(...attributeValidation.errors);
      // Attribute validation errors are generally classified as ATTRIBUTE_INVALID
      errorCodes.push(VALIDATION_ERRORS.ATTRIBUTE_INVALID);
    }
    
    // Validate content
    if (node.content) {
      const contentValidation = schema.validateContent(nodeType, node.content);
      if (!contentValidation.valid) {
        errors.push(...contentValidation.errors);
        // Content validation errors are classified as CONTENT_REQUIRED_BUT_EMPTY
        errorCodes.push(VALIDATION_ERRORS.CONTENT_REQUIRED_BUT_EMPTY);
      }
    }

    // ---- Indent-related schema consistency validation (only checks static consistency) ----
    const nodeDef = schema.getNodeType(nodeType);
    if (nodeDef) {
      // 1) Warning-level error if indentable is true but group is not block
      if (nodeDef.indentable && nodeDef.group && nodeDef.group !== 'block') {
        errors.push(
          `Node type '${nodeType}' is indentable but its group is '${nodeDef.group}'. ` +
          `Indentable nodes are expected to be in the 'block' group.`
        );
      }

      // 2) If maxIndentLevel is 0 or less
      if (typeof nodeDef.maxIndentLevel === 'number' && nodeDef.maxIndentLevel <= 0) {
        errors.push(
          `Node type '${nodeType}' has invalid maxIndentLevel '${nodeDef.maxIndentLevel}'. ` +
          `Expected a positive integer or undefined.`
        );
      }

      // 3) If indentParentTypes is defined but indentable is false (not structurally contradictory but a warning)
      if (!nodeDef.indentable && Array.isArray(nodeDef.indentParentTypes) && nodeDef.indentParentTypes.length > 0) {
        errors.push(
          `Node type '${nodeType}' defines indentParentTypes but is not indentable. ` +
          `Either set indentable: true or remove indentParentTypes.`
        );
      }

      // 4) If indentParentTypes contains node types that don't exist
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
   * Schema-based document validation
   * Validates document type, attributes, and content model defined in schema.
   */
  static validateDocument(schema: Schema, document: any): ValidationResult {
  const errors: string[] = [];
  
  // Validate document type (stype only)
  if (document.stype !== schema.topNode) {
    errors.push(`Document stype '${document.stype}' does not match schema topNode '${schema.topNode}'`);
  }
  
  // Validate document attributes
  const attributeValidation = schema.validateAttributes(schema.topNode, document.attrs || {});
  if (!attributeValidation.valid) {
    errors.push(...attributeValidation.errors);
  }
  
  // Validate document content
  if (document.content) {
    const contentValidation = schema.validateContent(schema.topNode, document.content);
    if (!contentValidation.valid) {
      errors.push(...contentValidation.errors);
    }
    
    // Validate each child node
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
   * Type validation function
   * Validates if value matches the specified type.
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
   * Object schema validation function
   * Validates if value matches the specified object schema.
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
  
  // Validate required properties
  for (const [key, definition] of Object.entries(objectSchema)) {
    const isRequired = typeof definition.required === 'function' 
      ? definition.required(value) 
      : definition.required;
      
    if (isRequired && (value[key] === undefined || value[key] === null)) {
      errors.push(`Required object property '${key}' is missing`);
      continue;
    }
    
    // If value is provided, check type and validator
    if (value[key] !== undefined && value[key] !== null) {
      // Type validation
      if (!this.validateType(value[key], definition.type)) {
        errors.push(`Object property '${key}' has invalid type. Expected ${definition.type}, got ${typeof value[key]}`);
        continue;
      }
      
      // Validate nested object schema
      if (definition.type === 'object' && definition.objectSchema) {
        const nestedValidation = this.validateObjectSchema(value[key], definition.objectSchema);
        if (!nestedValidation.valid) {
          errors.push(...nestedValidation.errors.map(err => `Object property '${key}': ${err}`));
        }
      }
      
      // Custom validator
      if (definition.validator && !definition.validator(value[key], value)) {
        errors.push(`Object property '${key}' failed custom validation`);
      }
    }
  }
  
  // Validate undefined properties (optional)
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
   * Attribute validation function by node type (used by Schema class)
   * Validates if node attributes match schema definition.
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

      // Object schema validation
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
