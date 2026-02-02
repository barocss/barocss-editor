/**
 * DecoratorSchemaRegistry: type schemas only (no renderers).
 * Implements IDecoratorValidator for use with DecoratorManager.
 * Used by editor-view-react defineDecoratorType; editor-view-dom keeps its own DecoratorRegistry.
 */

import type { Decorator, DecoratorTypeSchema } from './types';
import type { IDecoratorValidator } from './validator';

export class DecoratorSchemaRegistry implements IDecoratorValidator {
  private typeSchemas = new Map<string, DecoratorTypeSchema>();

  registerLayerType(type: string, schema: DecoratorTypeSchema): void {
    this.typeSchemas.set(`layer:${type}`, {
      ...schema,
      description: schema.description ?? `Layer decorator: ${type}`,
    });
  }

  registerInlineType(type: string, schema: DecoratorTypeSchema): void {
    this.typeSchemas.set(`inline:${type}`, {
      ...schema,
      description: schema.description ?? `Inline decorator: ${type}`,
    });
  }

  registerBlockType(type: string, schema: DecoratorTypeSchema): void {
    this.typeSchemas.set(`block:${type}`, {
      ...schema,
      description: schema.description ?? `Block decorator: ${type}`,
    });
  }

  getTypeSchema(category: string, type: string): DecoratorTypeSchema | undefined {
    return this.typeSchemas.get(`${category}:${type}`);
  }

  validateDecorator(decorator: Decorator): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!decorator.sid) errors.push('Decorator id is required');
    if (!decorator.category) errors.push('Decorator category is required');
    if (!decorator.stype) errors.push('Decorator type is required');

    const schema = this.getTypeSchema(decorator.category, decorator.stype);
    if (schema?.dataSchema) {
      const dataErrors = this.validateData(decorator.data ?? {}, schema.dataSchema);
      errors.push(...dataErrors);
    }
    return { valid: errors.length === 0, errors };
  }

  private validateData(
    data: Record<string, unknown>,
    schema: Record<string, { type: string; required?: boolean; default?: unknown }>
  ): string[] {
    const errors: string[] = [];
    for (const [key, fieldSchema] of Object.entries(schema)) {
      if (fieldSchema.required && !(key in data)) {
        errors.push(`Required field '${key}' is missing`);
        continue;
      }
      const value = data[key];
      if (value !== undefined && value !== null) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== fieldSchema.type) {
          errors.push(`Field '${key}' should be ${fieldSchema.type}, got ${actualType}`);
        }
      }
    }
    return errors;
  }

  applyDefaults(decorator: Decorator): Decorator {
    const schema = this.getTypeSchema(decorator.category, decorator.stype);
    if (!schema?.dataSchema) return decorator;

    const dataWithDefaults = { ...(decorator.data ?? {}) };
    for (const [key, fieldSchema] of Object.entries(schema.dataSchema)) {
      if (fieldSchema.default !== undefined && !(key in dataWithDefaults)) {
        const defaultValue =
          typeof fieldSchema.default === 'function'
            ? (fieldSchema.default as () => unknown)()
            : fieldSchema.default;
        dataWithDefaults[key] = defaultValue;
      }
    }
    return { ...decorator, data: dataWithDefaults };
  }
}
