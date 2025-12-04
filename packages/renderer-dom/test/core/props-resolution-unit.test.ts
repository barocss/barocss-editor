/**
 * Props Resolution Unit Tests
 * 
 * 분리된 props resolution 로직을 독립적으로 테스트
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeProps,
  resolveComponentProps,
  createComponentInfo,
  separatePropsAndModel
} from '../../src/vnode/props-resolution';
import { ComponentTemplate, ModelData } from '@barocss/dsl';

describe('Props Resolution Unit Tests', () => {
  describe('sanitizeProps', () => {
    it('should remove stype, sid, and type from props', () => {
      const props = {
        stype: 'paragraph',
        sid: 'p1',
        type: 'component',
        label: 'Hello',
        value: 'World'
      };

      const result = sanitizeProps(props);

      expect(result.stype).toBeUndefined();
      expect(result.sid).toBeUndefined();
      expect(result.type).toBeUndefined();
      expect(result.label).toBe('Hello');
      expect(result.value).toBe('World');
    });

    it('should return empty object for null/undefined', () => {
      expect(sanitizeProps(null)).toEqual({});
      expect(sanitizeProps(undefined)).toEqual({});
    });

    it('should return empty object for non-object values', () => {
      expect(sanitizeProps('string')).toEqual({});
      expect(sanitizeProps(123)).toEqual({});
    });
  });

  describe('resolveComponentProps', () => {
    it('should use template.props function if provided', () => {
      const template: ComponentTemplate = {
        type: 'component',
        name: 'test',
        props: (data: ModelData) => ({ computed: data.value * 2 })
      };

      const data = { value: 5, stype: 'test', sid: 't1' };
      const result = resolveComponentProps(template, data);

      expect(result.computed).toBe(10);
      expect(result.stype).toBeUndefined();
      expect(result.sid).toBeUndefined();
    });

    it('should use template.props object if provided and not empty', () => {
      const template: ComponentTemplate = {
        type: 'component',
        name: 'test',
        props: { label: 'Test', value: 123 }
      };

      const data = { stype: 'test', sid: 't1', extra: 'data' };
      const result = resolveComponentProps(template, data);

      expect(result.label).toBe('Test');
      expect(result.value).toBe(123);
      expect(result.stype).toBeUndefined();
    });

    it('should fallback to data when template.props is empty object', () => {
      const template: ComponentTemplate = {
        type: 'component',
        name: 'test',
        props: {}
      };

      const data = { stype: 'test', sid: 't1', label: 'Hello' };
      const result = resolveComponentProps(template, data);

      expect(result.label).toBe('Hello');
      expect(result.stype).toBeUndefined();
      expect(result.sid).toBeUndefined();
    });

    it('should fallback to data when template.props is undefined', () => {
      const template: ComponentTemplate = {
        type: 'component',
        name: 'test'
      };

      const data = { stype: 'test', sid: 't1', label: 'Hello' };
      const result = resolveComponentProps(template, data);

      expect(result.label).toBe('Hello');
      expect(result.stype).toBeUndefined();
    });
  });

  describe('separatePropsAndModel', () => {
    it('should separate props and model correctly', () => {
      const data: ModelData = {
        stype: 'paragraph',
        sid: 'p1',
        label: 'Hello',
        value: 123
      };

      const result = separatePropsAndModel(data, []);

      expect(result.props.label).toBe('Hello');
      expect(result.props.value).toBe(123);
      expect(result.props.stype).toBeUndefined();
      expect(result.props.sid).toBeUndefined();

      expect(result.model.stype).toBe('paragraph');
      expect(result.model.sid).toBe('p1');
      expect(result.model.label).toBe('Hello');
      expect(result.model.value).toBe(123);
    });

    it('should include decorators in result', () => {
      const data: ModelData = { stype: 'test', sid: 't1' };
      const decorators = [{ type: 'bold', range: [0, 5] }];

      const result = separatePropsAndModel(data, decorators);

      expect(result.decorators).toEqual(decorators);
    });
  });

  describe('createComponentInfo', () => {
    it('should create component info with separated props and model', () => {
      const props = { label: 'Hello', value: 123 };
      const model: ModelData = {
        stype: 'test',
        sid: 't1',
        label: 'Hello',
        value: 123
      };

      const result = createComponentInfo('test', props, model, []);

      expect(result.name).toBe('test');
      expect(result.props).toEqual(props);
      expect(result.model).toEqual(model);
      expect(result.decorators).toEqual([]);
    });

    it('should handle isExternal option', () => {
      const props = { label: 'Hello' };
      const model: ModelData = { stype: 'test', sid: 't1' };

      const result = createComponentInfo('test', props, model, [], { isExternal: true });

      expect(result.isExternal).toBe(true);
    });
  });
});

