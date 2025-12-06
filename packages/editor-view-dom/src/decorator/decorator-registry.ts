/**
 * DecoratorRegistry
 * 
 * Decorator 타입과 렌더러를 등록하고 관리하는 레지스트리
 */

import {
  Decorator,
  DecoratorTypeSchema,
  DecoratorRenderer
} from './types.js';

/**
 * DecoratorRegistry 클래스
 * 
 * Decorator 타입과 렌더러를 등록하고 관리하는 레지스트리
 * decorator는 스키마와 독립적으로 관리됩니다.
 */
export class DecoratorRegistry {
  private typeSchemas = new Map<string, DecoratorTypeSchema>();
  private renderers = new Map<string, DecoratorRenderer>();
  
  constructor() {
    // Initialize without schema (decorator is independent of schema)
  }
  
  /**
   * Layer Decorator 타입 등록
   */
  registerLayerType(type: string, schema: DecoratorTypeSchema): void {
    this.typeSchemas.set(`layer:${type}`, {
      ...schema,
      description: schema.description || `Layer decorator: ${type}`
    });
  }
  
  /**
   * Inline Decorator 타입 등록
   */
  registerInlineType(type: string, schema: DecoratorTypeSchema): void {
    this.typeSchemas.set(`inline:${type}`, {
      ...schema,
      description: schema.description || `Inline decorator: ${type}`
    });
  }
  
  /**
   * Block Decorator 타입 등록
   */
  registerBlockType(type: string, schema: DecoratorTypeSchema): void {
    this.typeSchemas.set(`block:${type}`, {
      ...schema,
      description: schema.description || `Block decorator: ${type}`
    });
  }
  
  /**
   * 렌더러 등록
   */
  registerRenderer(name: string, renderer: DecoratorRenderer): void {
    this.renderers.set(name, renderer);
  }
  
  /**
   * 타입 스키마 조회
   */
  getTypeSchema(category: string, type: string): DecoratorTypeSchema | undefined {
    return this.typeSchemas.get(`${category}:${type}`);
  }
  
  /**
   * 렌더러 조회
   */
  getRenderer(name: string): DecoratorRenderer | undefined {
    return this.renderers.get(name);
  }
  
  /**
   * 등록된 모든 타입 조회
   */
  getAllTypes(): Array<{ category: string; type: string; schema: DecoratorTypeSchema }> {
    const types: Array<{ category: string; type: string; schema: DecoratorTypeSchema }> = [];
    
    for (const [key, schema] of this.typeSchemas.entries()) {
      const [category, type] = key.split(':');
      types.push({ category, type, schema });
    }
    
    return types;
  }
  
  /**
   * 등록된 모든 렌더러 조회
   */
  getAllRenderers(): Array<{ name: string; renderer: DecoratorRenderer }> {
    const renderers: Array<{ name: string; renderer: DecoratorRenderer }> = [];
    
    for (const [name, renderer] of this.renderers.entries()) {
      renderers.push({ name, renderer });
    }
    
    return renderers;
  }
  
  /**
   * Decorator 데이터 검증 (선택적)
   * 
   * 타입이 등록되어 있으면 검증하고, 없으면 통과합니다.
   * 선택적 타입 시스템(Opt-in)을 지원합니다.
   */
  validateDecorator(decorator: Decorator): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Basic field validation (always performed)
    if (!decorator.sid) {
      errors.push('Decorator id is required');
    }
    
    if (!decorator.category) {
      errors.push('Decorator category is required');
    }
    
    if (!decorator.stype) {
      errors.push('Decorator type is required');
    }
    
    // Type schema validation (only when type is registered)
    const schema = this.getTypeSchema(decorator.category, decorator.stype);
    if (schema) {
      // Perform validation if type is registered
      if (schema.dataSchema) {
        const dataErrors = this.validateData(decorator.data || {}, schema.dataSchema);
        errors.push(...dataErrors);
      }
    }
    // If type is not registered, pass without validation (opt-in type system)
    
    return { valid: errors.length === 0, errors };
  }
  
  /**
   * Data schema validation
   */
  private validateData(
    data: Record<string, any>,
    schema: NonNullable<DecoratorTypeSchema['dataSchema']>
  ): string[] {
    const errors: string[] = [];
    
    // Required field validation
    for (const [key, fieldSchema] of Object.entries(schema)) {
      if (fieldSchema.required && !(key in data)) {
        errors.push(`Required field '${key}' is missing`);
        continue;
      }
      
      const value = data[key];
      if (value !== undefined && value !== null) {
        // Type validation
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== fieldSchema.type) {
          errors.push(`Field '${key}' should be ${fieldSchema.type}, got ${actualType}`);
        }
      }
    }
    
    return errors;
  }
  
  /**
   * Apply defaults to Decorator (only when type is registered)
   * 
   * If type is registered, apply defaults, otherwise return original.
   */
  applyDefaults(decorator: Decorator): Decorator {
    const schema = this.getTypeSchema(decorator.category, decorator.stype);
    if (!schema?.dataSchema) {
      // Don't apply defaults if type is not registered
      return decorator;
    }
    
    // Initialize with empty object if data is missing
    const dataWithDefaults = { ...(decorator.data || {}) };
    
    for (const [key, fieldSchema] of Object.entries(schema.dataSchema)) {
      if (fieldSchema.default !== undefined && !(key in dataWithDefaults)) {
        // Call if default is function, otherwise use as-is
        const defaultValue = typeof fieldSchema.default === 'function' 
          ? fieldSchema.default() 
          : fieldSchema.default;
        dataWithDefaults[key] = defaultValue;
      }
    }
    
    return {
      ...decorator,
      data: dataWithDefaults
    };
  }
  
  /**
   * 기본 제공 Layer 타입 스키마
   * @deprecated 스키마에서 decorator 타입을 가져와야 함
   */
  private getBuiltinLayerSchema(type: string): DecoratorTypeSchema {
    const schemas: Record<string, DecoratorTypeSchema> = {
      highlight: {
        defaultRenderer: 'builtin-highlight',
        dataSchema: {
          backgroundColor: { type: 'string', default: 'yellow' },
          opacity: { type: 'number', default: 0.3 }
        }
      },
      comment: {
        defaultRenderer: 'builtin-comment',
        dataSchema: {
          text: { type: 'string', required: true },
          author: { type: 'string', required: true },
          timestamp: { type: 'number', default: Date.now }
        }
      },
      annotation: {
        defaultRenderer: 'builtin-annotation',
        dataSchema: {
          text: { type: 'string', required: true },
          type: { type: 'string', default: 'note' }
        }
      },
      error: {
        defaultRenderer: 'builtin-error',
        dataSchema: {
          message: { type: 'string', required: true },
          severity: { type: 'string', default: 'error' }
        }
      },
      warning: {
        defaultRenderer: 'builtin-warning',
        dataSchema: {
          message: { type: 'string', required: true }
        }
      },
      info: {
        defaultRenderer: 'builtin-info',
        dataSchema: {
          message: { type: 'string', required: true }
        }
      },
      selection: {
        defaultRenderer: 'builtin-selection',
        dataSchema: {
          color: { type: 'string', default: 'blue' },
          opacity: { type: 'number', default: 0.2 }
        }
      },
      focus: {
        defaultRenderer: 'builtin-focus',
        dataSchema: {
          color: { type: 'string', default: 'blue' },
          width: { type: 'number', default: 2 }
        }
      }
    };
    
    return schemas[type] || {};
  }
  
  /**
   * 기본 제공 Inline 타입 스키마
   */
  private getBuiltinInlineSchema(type: string): DecoratorTypeSchema {
    const schemas: Record<string, DecoratorTypeSchema> = {
      'link-button': {
        defaultRenderer: 'builtin-link-button',
        dataSchema: {
          href: { type: 'string', required: true },
          text: { type: 'string', required: true },
          target: { type: 'string', default: '_blank' }
        }
      },
      'emoji-button': {
        defaultRenderer: 'builtin-emoji-button',
        dataSchema: {
          emoji: { type: 'string', required: true },
          label: { type: 'string', required: true }
        }
      },
      'mention-button': {
        defaultRenderer: 'builtin-mention-button',
        dataSchema: {
          userId: { type: 'string', required: true },
          displayName: { type: 'string', required: true },
          avatar: { type: 'string' }
        }
      },
      'hashtag-button': {
        defaultRenderer: 'builtin-hashtag-button',
        dataSchema: {
          tag: { type: 'string', required: true },
          color: { type: 'string', default: 'blue' }
        }
      },
      'inline-input': {
        defaultRenderer: 'builtin-inline-input',
        dataSchema: {
          placeholder: { type: 'string', default: 'Enter text...' },
          value: { type: 'string', default: '' }
        }
      },
      'inline-select': {
        defaultRenderer: 'builtin-inline-select',
        dataSchema: {
          options: { type: 'array', required: true },
          value: { type: 'string', default: '' }
        }
      },
      'inline-toggle': {
        defaultRenderer: 'builtin-inline-toggle',
        dataSchema: {
          checked: { type: 'boolean', default: false },
          label: { type: 'string', required: true }
        }
      }
    };
    
    return schemas[type] || {};
  }
  
  /**
   * 기본 제공 Block 타입 스키마
   */
  private getBuiltinBlockSchema(type: string): DecoratorTypeSchema {
    const schemas: Record<string, DecoratorTypeSchema> = {
      toolbar: {
        defaultRenderer: 'builtin-toolbar',
        dataSchema: {
          items: { type: 'array', required: true },
          position: { type: 'string', default: 'top' }
        }
      },
      'context-menu': {
        defaultRenderer: 'builtin-context-menu',
        dataSchema: {
          items: { type: 'array', required: true },
          x: { type: 'number', required: true },
          y: { type: 'number', required: true }
        }
      },
      dropdown: {
        defaultRenderer: 'builtin-dropdown',
        dataSchema: {
          items: { type: 'array', required: true },
          trigger: { type: 'string', required: true }
        }
      },
      modal: {
        defaultRenderer: 'builtin-modal',
        dataSchema: {
          title: { type: 'string', required: true },
          content: { type: 'string', required: true },
          width: { type: 'number', default: 400 },
          height: { type: 'number', default: 300 }
        }
      },
      panel: {
        defaultRenderer: 'builtin-panel',
        dataSchema: {
          title: { type: 'string', required: true },
          content: { type: 'string', required: true },
          position: { type: 'string', default: 'right' }
        }
      },
      overlay: {
        defaultRenderer: 'builtin-overlay',
        dataSchema: {
          content: { type: 'string', required: true },
          opacity: { type: 'number', default: 0.8 }
        }
      },
      'floating-action': {
        defaultRenderer: 'builtin-floating-action',
        dataSchema: {
          icon: { type: 'string', required: true },
          action: { type: 'string', required: true },
          position: { type: 'string', default: 'bottom-right' }
        }
      },
      notification: {
        defaultRenderer: 'builtin-notification',
        dataSchema: {
          message: { type: 'string', required: true },
          type: { type: 'string', default: 'info' },
          duration: { type: 'number', default: 3000 }
        }
      }
    };
    
    return schemas[type] || {};
  }
}
