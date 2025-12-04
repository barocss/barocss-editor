import { describe, it, expect } from 'vitest';
import { Validator } from '../src/validators.js';

describe('Basic Validators', () => {
  describe('Validator.validateType', () => {
    it('should validate string type', () => {
      expect(Validator.validateType('hello', 'string')).toBe(true);
      expect(Validator.validateType(123, 'string')).toBe(false);
      expect(Validator.validateType(null, 'string')).toBe(false);
    });

    it('should validate number type', () => {
      expect(Validator.validateType(123, 'number')).toBe(true);
      expect(Validator.validateType('123', 'number')).toBe(false);
      expect(Validator.validateType(NaN, 'number')).toBe(true); // NaN is still a number
    });

    it('should validate boolean type', () => {
      expect(Validator.validateType(true, 'boolean')).toBe(true);
      expect(Validator.validateType(false, 'boolean')).toBe(true);
      expect(Validator.validateType('true', 'boolean')).toBe(false);
      expect(Validator.validateType(1, 'boolean')).toBe(false);
    });

    it('should validate array type', () => {
      expect(Validator.validateType([], 'array')).toBe(true);
      expect(Validator.validateType([1, 2, 3], 'array')).toBe(true);
      expect(Validator.validateType('[]', 'array')).toBe(false);
      expect(Validator.validateType({}, 'array')).toBe(false);
    });

    it('should validate object type', () => {
      expect(Validator.validateType({}, 'object')).toBe(true);
      expect(Validator.validateType({ a: 1 }, 'object')).toBe(true);
      expect(Validator.validateType([], 'object')).toBe(false);
      expect(Validator.validateType(null, 'object')).toBe(false);
    });

    it('should validate custom type', () => {
      expect(Validator.validateType('anything', 'custom')).toBe(true);
      expect(Validator.validateType(123, 'custom')).toBe(true);
      expect(Validator.validateType(null, 'custom')).toBe(true);
    });
  });

  describe('Validator.validateObjectSchema', () => {
    it('should validate object with required properties', () => {
      const schema = {
        name: { type: 'string', required: true },
        age: { type: 'number', required: true }
      };
      
      const validData = { name: 'John', age: 30 };
      const result = Validator.validateObjectSchema(validData, schema);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing required properties', () => {
      const schema = {
        name: { type: 'string', required: true },
        age: { type: 'number', required: true }
      };
      
      const invalidData = { name: 'John' }; // missing age
      const result = Validator.validateObjectSchema(invalidData, schema);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Required object property 'age' is missing");
    });

    it('should validate optional properties', () => {
      const schema = {
        name: { type: 'string', required: true },
        email: { type: 'string', required: false }
      };
      
      const validData = { name: 'John' }; // email is optional
      const result = Validator.validateObjectSchema(validData, schema);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate nested object schemas', () => {
      const schema = {
        user: {
          type: 'object',
          required: true,
          objectSchema: {
            name: { type: 'string', required: true },
            age: { type: 'number', required: true }
          }
        }
      };
      
      const validData = {
        user: { name: 'John', age: 30 }
      };
      const result = Validator.validateObjectSchema(validData, schema);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid nested objects', () => {
      const schema = {
        user: {
          type: 'object',
          required: true,
          objectSchema: {
            name: { type: 'string', required: true },
            age: { type: 'number', required: true }
          }
        }
      };
      
      const invalidData = {
        user: { name: 'John' } // missing age in nested object
      };
      const result = Validator.validateObjectSchema(invalidData, schema);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Object property 'user': Required object property 'age' is missing");
    });

    it('should validate custom validators', () => {
      const schema = {
        email: {
          type: 'string',
          required: true,
          validator: (value: string) => value.includes('@')
        }
      };
      
      const validData = { email: 'john@example.com' };
      const invalidData = { email: 'invalid-email' };
      
      const validResult = Validator.validateObjectSchema(validData, schema);
      const invalidResult = Validator.validateObjectSchema(invalidData, schema);
      
      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContain("Object property 'email' failed custom validation");
    });

    it('should detect undefined properties', () => {
      const schema = {
        name: { type: 'string', required: true }
      };
      
      const dataWithExtra = { 
        name: 'John', 
        extra: 'should not be here' 
      };
      const result = Validator.validateObjectSchema(dataWithExtra, schema);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Object contains undefined properties: extra");
    });
  });
});
