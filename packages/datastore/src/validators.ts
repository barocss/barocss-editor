import type { INode, Document, ValidationResult } from './types';
import { Schema, Validator } from '@barocss/schema';

export class DataValidator {
  static validateNode(node: INode, schema: Schema): ValidationResult {
    function adapt(n: any): any {
      if (!n || typeof n !== 'object') return n;
      const adapted: any = {
        stype: n.stype,
        attrs: n.attributes || {},
        text: n.text,
        marks: n.marks,
      };
      if (Array.isArray(n.content)) {
        adapted.content = n.content
          .map((child: any) => (child && typeof child === 'object' && 'stype' in child ? adapt(child) : child))
          .filter((c: any) => c !== undefined);
      }
      return adapted;
    }
    return Validator.validateNode(schema, adapt(node) as any) as any;
  }
}

export class IntegrityValidator {
  static validateNode(node: INode): ValidationResult {
    const errors: string[] = [];
    if (!node) {
      errors.push('Node is required');
      return { valid: false, errors } as any;
    }
    if (!(node as any).sid) {
      errors.push('Node ID is required');
    }
    if (!(node as any).stype) {
      errors.push('Node stype is required');
    }
    // text 필드가 있으면 텍스트 노드로 간주 (추가 검증 불필요)
    return { valid: errors.length === 0, errors } as any;
  }

  static validateDocument(document: Document): ValidationResult {
    const errors: string[] = [];
    if (!document) {
      errors.push('Document is required');
      return { valid: false, errors } as any;
    }
    if (!(document as any).sid) {
      errors.push('Document ID is required');
    }
    if (!(document as any).schema) {
      errors.push('Document schema is required');
    }
    if (!(document as any).content || (document as any).content.length === 0) {
      errors.push('Document content is required');
    }
    return { valid: errors.length === 0, errors } as any;
  }
}

export function validateNode(node: INode, schema: Schema): ValidationResult {
  return DataValidator.validateNode(node, schema);
}

export function validateDocument(document: Document): ValidationResult {
  return IntegrityValidator.validateDocument(document);
}


