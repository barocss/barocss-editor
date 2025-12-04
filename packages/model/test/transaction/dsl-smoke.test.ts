import { describe, it, expect } from 'vitest';
import { transaction, control, node, textNode, mark } from '../../src/transaction-dsl';
import { create } from '../../src/operations-dsl/create';

describe('DSL Smoke Test', () => {
  it('should create DSL functions without errors', () => {
    // Test that DSL functions can be called without runtime errors
    const textNodeObj = textNode('inline-text', 'Hello World');
    const paragraphNode = node('paragraph', {}, [textNodeObj]);
    const createOp = create(textNodeObj);
    const markDesc = mark('bold', { weight: 'bold' });
    
    expect(textNodeObj).toBeDefined();
    expect(paragraphNode).toBeDefined();
    expect(createOp).toBeDefined();
    expect(markDesc).toBeDefined();
    
    expect(createOp.type).toBe('create');
    expect(createOp.payload?.node).toEqual(textNodeObj);
  });

  it('should create control operations', () => {
    const actions = [
      { type: 'setText', payload: { text: 'New Text' } },
      { type: 'setAttrs', payload: { attrs: { class: 'highlight' } } }
    ];
    
    const controlOps = control('node-1', actions);
    
    expect(controlOps).toHaveLength(2);
    expect(controlOps[0].type).toBe('setText');
    expect(controlOps[0].payload.nodeId).toBe('node-1');
    expect(controlOps[0].payload.text).toBe('New Text');
    
    expect(controlOps[1].type).toBe('setAttrs');
    expect(controlOps[1].payload.nodeId).toBe('node-1');
    expect(controlOps[1].payload.attrs).toEqual({ class: 'highlight' });
  });

  it('should create transaction builder', () => {
    const mockEditor = { dataStore: {} };
    const operations = [
      create(textNode('inline-text', 'Test'))
    ];
    
    const builder = transaction(mockEditor as any, operations);
    
    expect(builder).toBeDefined();
    expect(typeof builder.commit).toBe('function');
  });
});
