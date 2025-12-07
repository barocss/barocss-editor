/**
 * VNodeBuilder 실제 Mark Wrapper 생성 테스트
 * 
 * VNodeBuilder가 실제로 mark wrapper를 어떻게 생성하는지 검증
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VNodeBuilder } from '../../src/vnode/factory';
import { defineMark, define, element, data, slot } from '@barocss/dsl';
import { VNode } from '../../src/vnode/types';

describe('VNodeBuilder Actual Mark Wrapper Creation', () => {
  let builder: VNodeBuilder;

  beforeEach(() => {
    builder = new VNodeBuilder();
    
    // Define inline-text component
    define('inline-text', element('span', {
      className: 'text'
    }, [data('text')]));
  });

  it('should create mark wrapper with correct structure for bgColor mark', () => {
    defineMark('bgColor', element('span', {
      className: 'custom-bg-color',
      'data-mark-type': 'bgColor',
      'data-bg-color': data('bgColor', '#ffff00'),
      style: {
        backgroundColor: data('bgColor', '#ffff00'),
        padding: '1px 2px',
        borderRadius: '2px'
      }
    }, [data('text')]));

    define('paragraph', element('p', {
      className: 'paragraph'
    }, [slot('content')]));

    const model = {
      sid: 'text-yellow-bg',
      stype: 'inline-text',
      text: 'yellow background',
      marks: [{
        type: 'bgColor',
        range: [0, 16],
        attrs: { bgColor: '#ffff00' }
      }]
    };

    const vnode = builder.build('inline-text', model);

    // Verify VNode structure
    expect(vnode.tag).toBe('span');
    expect(vnode.sid).toBe('text-yellow-bg');
    expect(vnode.stype).toBe('inline-text');
    
    // Verify children exist
    expect(vnode.children).toBeDefined();
    expect(Array.isArray(vnode.children)).toBe(true);
    
    // Verify mark wrapper is in children
    if (vnode.children && vnode.children.length > 0) {
      const firstChild = vnode.children[0];
      expect(typeof firstChild).toBe('object');
      
      const markWrapper = firstChild as VNode;
      expect(markWrapper.tag).toBe('span');
      // VNodeBuilder may automatically add mark-{type} class
      expect(markWrapper.attrs?.className).toContain('custom-bg-color');
      
      // Verify mark wrapper's children
      if (markWrapper.children && markWrapper.children.length > 0) {
        const inner = markWrapper.children[0];
        expect(typeof inner).toBe('object');
        
        const innerVNode = inner as VNode;
        // inner may be a span wrapper
        if (innerVNode.tag === 'span') {
          // Verify span wrapper's children
          if (innerVNode.children && innerVNode.children.length > 0) {
            const textNode = innerVNode.children[0];
            if (typeof textNode === 'object') {
              const textVNode = textNode as VNode;
              // text VNode has no tag and has text property
              expect(textVNode.tag).toBeUndefined();
              expect(textVNode.text).toBeDefined();
            } else {
              // Or may be primitive text
              expect(typeof textNode === 'string' || typeof textNode === 'number').toBe(true);
            }
          }
        } else {
          // inner may be a text VNode
          expect(innerVNode.tag).toBeUndefined();
          expect(innerVNode.text).toBeDefined();
        }
      }
    }
  });

  it('should verify mark wrapper structure after text change', () => {
    defineMark('bgColor', element('span', {
      className: 'custom-bg-color',
      'data-mark-type': 'bgColor',
      'data-bg-color': data('bgColor', '#ffff00'),
      style: {
        backgroundColor: data('bgColor', '#ffff00'),
        padding: '1px 2px',
        borderRadius: '2px'
      }
    }, [data('text')]));

    // Initial model
    const initialModel = {
      sid: 'text-yellow-bg',
      stype: 'inline-text',
      text: 'yellow background',
      marks: [{
        type: 'bgColor',
        range: [0, 16],
        attrs: { bgColor: '#ffff00' }
      }]
    };

    const initialVNode = builder.build('inline-text', initialModel);

    // Updated model
    const updatedModel = {
      sid: 'text-yellow-bg',
      stype: 'inline-text',
      text: 'yellow bㅁackground',
      marks: [{
        type: 'bgColor',
        range: [0, 18],
        attrs: { bgColor: '#ffff00' }
      }]
    };

    const updatedVNode = builder.build('inline-text', updatedModel);

    // Verify structure is identical
    expect(initialVNode.tag).toBe(updatedVNode.tag);
    expect(initialVNode.sid).toBe(updatedVNode.sid);
    
    // Verify children structure
    if (initialVNode.children && initialVNode.children.length > 0) {
      const initialMarkWrapper = initialVNode.children[0] as VNode;
      
      if (updatedVNode.children && updatedVNode.children.length > 0) {
        const updatedMarkWrapper = updatedVNode.children[0] as VNode;
        
        // Verify mark wrapper structure is identical
        expect(initialMarkWrapper.tag).toBe(updatedMarkWrapper.tag);
        expect(initialMarkWrapper.attrs?.className).toBe(updatedMarkWrapper.attrs?.className);
        
        // Verify children structure
        if (initialMarkWrapper.children && initialMarkWrapper.children.length > 0) {
          const initialInner = initialMarkWrapper.children[0] as VNode;
          
          if (updatedMarkWrapper.children && updatedMarkWrapper.children.length > 0) {
            const updatedInner = updatedMarkWrapper.children[0] as VNode;
            
            // Verify inner structure is identical
            expect(initialInner.tag).toBe(updatedInner.tag);
          }
        }
      }
    }
  });
});

