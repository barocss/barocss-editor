/**
 * @barocss/vnode - Decorator Processor
 * 
 * Handles decorator processing logic for VNodeBuilder
 */

import { ModelData, RendererRegistry, ElementTemplate } from '@barocss/dsl';
import { VNode } from '../types';
import { Decorator, DecoratorTextRun, CategorizedDecorators } from './types';

/**
 * DecoratorProcessor: Handles all decorator-related processing
 */
export class DecoratorProcessor {
  constructor(private registry: RendererRegistry) {}

  /**
   * Extracts decorator range (startOffset, endOffset) from decorator target
   * Handles both single-node and cross-node decorators
   */
  getDecoratorRange(d: Decorator): { start?: number; end?: number } {
    if ('sid' in d.target) {
      return { start: d.target.startOffset, end: d.target.endOffset };
    } else {
      return { start: d.target.startOffset, end: d.target.endOffset };
    }
  }

  /**
   * Finds decorators that apply to a specific node
   * Validates input and handles edge cases gracefully
   */
  findDecoratorsForNode(sid: string | undefined, decorators: Decorator[]): Decorator[] {
    if (!sid || !decorators || decorators.length === 0) {
      return [];
    }
    
    if (typeof sid !== 'string' || sid.length === 0) {
      console.warn('Invalid sid provided to findDecoratorsForNode:', sid);
      return [];
    }
    
    return decorators.filter(d => {
      if (!d || !d.target) return false;
      
      try {
        if ('sid' in d.target) {
          return d.target.sid === sid;
        } else {
          // Cross-node decorator: check if this node is start or end
          return d.target.startSid === sid || d.target.endSid === sid;
        }
      } catch (error) {
        console.warn('Error checking decorator target:', error, d);
        return false;
      }
    });
  }

  /**
   * Finds inline decorators for a specific node
   */
  findInlineDecorators(sid: string | undefined, decorators: Decorator[]): Decorator[] {
    if (!sid || !decorators || decorators.length === 0) {
      return [];
    }
    
    const result = decorators.filter(d => {
      if (d.category !== 'inline') return false;
      if (!d.target) return false; // Handle null/undefined target
      if ('sid' in d.target) {
        return d.target.sid === sid;
      } else {
        return d.target.startSid === sid || d.target.endSid === sid;
      }
    });
    
    return result;
  }

  /**
   * Categorizes decorators by type in a single pass
   */
  categorizeDecorators(decorators: Decorator[]): CategorizedDecorators {
    const categorized: CategorizedDecorators = {
      block: [],
      layer: [],
      inline: []
    };
    
    decorators.forEach(d => {
      if (!d || !d.category) return;
      const category = d.category as 'block' | 'layer' | 'inline';
      if (category in categorized && Array.isArray(categorized[category])) {
        categorized[category].push(d);
      } else {
        console.warn(`Unknown decorator category: ${category}, skipping decorator ${d.sid}`);
      }
    });
    
    return categorized;
  }

  /**
   * Splits text by decorator ranges
   * Optimized: O(n log n) instead of O(n²) by pre-indexing decorators
   * 
   * @throws Error if decorator ranges are invalid (negative, out of bounds, etc.)
   */
  splitTextByDecorators(text: string, decorators: Decorator[]): DecoratorTextRun[] {
    const len = text.length;
    if (len === 0 || decorators.length === 0) {
      return [{ text, start: 0, end: len }];
    }
    
    // Step 1: Collect boundaries and index decorators by range
    const boundaries = new Set<number>();
    boundaries.add(0);
    boundaries.add(len);
    
    // Index decorators by their start position for faster lookup
    const decoratorIndex = new Map<number, Decorator[]>();
    
    for (const d of decorators) {
      if (d.category !== 'inline') continue;
      
      const range = this.getDecoratorRange(d);
      if (range.start === undefined || range.end === undefined) continue;
      
      // Validate range
      if (range.start < 0 || range.end < 0) {
        console.warn(`Invalid decorator range: start=${range.start}, end=${range.end} for decorator ${d.sid}`);
        continue;
      }
      
      const s = Math.max(0, Math.min(range.start, len));
      const e = Math.max(s, Math.min(range.end, len));
      
      if (e > s) {
        boundaries.add(s);
        boundaries.add(e);
        
        // Index by start position
        if (!decoratorIndex.has(s)) {
          decoratorIndex.set(s, []);
        }
        decoratorIndex.get(s)!.push(d);
      }
    }
    
    // Step 2: Sort boundaries
    const points = Array.from(boundaries.values()).sort((a, b) => a - b);
    const runs: DecoratorTextRun[] = [];
    
    // Step 3: Build runs and find matching decorators efficiently
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      if (end <= start) continue;
      
      const slice = text.slice(start, end);
      
      // Find all decorators that cover this range: check decorators starting at or before this start
      const matchingDecorators: Decorator[] = [];
      
      // Get sorted start positions for efficient lookup
      const sortedStarts = Array.from(decoratorIndex.keys()).sort((a, b) => a - b);
      
      // Check decorators starting at or before this position
      for (const decoratorStart of sortedStarts) {
        if (decoratorStart > start) break; // Stop if we've gone past the start
        
        const candidates = decoratorIndex.get(decoratorStart) || [];
        for (const d of candidates) {
          const range = this.getDecoratorRange(d);
          if (range.start === undefined || range.end === undefined) continue;
          
          // Check if this decorator covers the entire run
          if (range.start <= start && range.end >= end) {
            matchingDecorators.push(d);
          }
        }
      }
      
      // Fallback: if no decorator found via index, check all decorators (for edge cases)
      if (matchingDecorators.length === 0) {
        const found = decorators.find(d => {
          if (d.category !== 'inline') return false;
          const range = this.getDecoratorRange(d);
          if (range.start === undefined || range.end === undefined) return false;
          return range.start <= start && range.end >= end;
        });
        if (found) {
          matchingDecorators.push(found);
        }
      }
      
      // When multiple decorators exist, distinguish before/after for processing
      // Single decorator is stored in decorator field for backward compatibility
      const decorator = matchingDecorators.length > 0 ? matchingDecorators[0] : undefined;
      const decoratorsArray = matchingDecorators.length > 1 ? matchingDecorators : undefined;
      
      runs.push({ text: slice, decorator, decorators: decoratorsArray, start, end });
    }
    
    return runs;
  }

  /**
   * Builds a VNode for a single decorator
   * Requires buildElement callback to avoid circular dependency
   * Handles missing renderer gracefully with fallback
   */
  buildDecoratorVNode(
    decorator: Decorator,
    buildElement: (template: ElementTemplate, data: ModelData, options?: any) => VNode
  ): VNode {
    if (!decorator || !decorator.stype) {
      console.warn('Invalid decorator provided to buildDecoratorVNode:', decorator);
      const errorVNode = {
        tag: 'div',
        attrs: {
          'data-decorator-error': 'invalid-decorator'
        },
        style: {},
        children: []
      } as VNode;
      // Store error info in attrs (not top-level) if decorator exists
      if (decorator) {
        if (!errorVNode.attrs) errorVNode.attrs = {};
        if (decorator.sid) errorVNode.attrs['data-decorator-sid'] = decorator.sid;
        if (decorator.stype) errorVNode.attrs['data-decorator-stype'] = decorator.stype;
        if (decorator.category) errorVNode.attrs['data-decorator-category'] = decorator.category;
      }
      return errorVNode;
    }
    
    // Build decorator VNode without processing decorators (to avoid infinite recursion)
    // Everything defined with define() can only be components, so only use getComponent()
    const component = this.registry.getComponent?.(decorator.stype);
    if (!component) {
      // Fallback: use div when component is missing (should use template defined in defineDecorator)
      console.warn(`Component not found for decorator type '${decorator.stype}', using fallback div`);
      const fallbackVNode = {
        tag: 'div',
        attrs: {
          'data-decorator-missing-renderer': decorator.stype
        },
        style: {},
        children: []
      } as VNode;
      // Store decorator identity in attrs (not top-level)
      if (decorator.sid) fallbackVNode.attrs!['data-decorator-sid'] = decorator.sid;
      if (decorator.stype) fallbackVNode.attrs!['data-decorator-stype'] = decorator.stype;
      if (decorator.category) fallbackVNode.attrs!['data-decorator-category'] = decorator.category;
      if (decorator.position) {
        fallbackVNode.attrs!['data-decorator-position'] = decorator.position;
      }
      return fallbackVNode;
    }
    
    // component.template is a ContextualComponent function
    const componentTemplate = component.template;
    let decoratorVNode: VNode;
    
    try {
      // Important: pass empty array for decorators when building decorator to prevent infinite recursion
      const buildOptionsWithoutDecorators = { decorators: [] };
      
      if (componentTemplate && typeof componentTemplate === 'function') {
        // Execute ContextualComponent function: component(props, model, context)
        const props = {};  // decorator has no props
        const model = decorator.data || {};
        const minimalCtx = {} as any;  // minimal context when building decorator
        const elementTemplate = componentTemplate(props, model, minimalCtx) as ElementTemplate;
        
        // Component function must return ElementTemplate
        if (elementTemplate && typeof elementTemplate === 'object' && elementTemplate.type === 'element') {
          decoratorVNode = buildElement(elementTemplate, model, buildOptionsWithoutDecorators);
          // Set decorator identity in attrs (not top-level)
          if (!decoratorVNode.attrs) decoratorVNode.attrs = {};
          if (decorator.sid) decoratorVNode.attrs['data-decorator-sid'] = decorator.sid;
          if (decorator.stype) decoratorVNode.attrs['data-decorator-stype'] = decorator.stype;
          if (decorator.category) decoratorVNode.attrs['data-decorator-category'] = decorator.category;
          // position is only set when explicitly specified
          // inline decorator has no position by default (handled as overlay)
          // block/layer decorator uses default 'after'
          if (decorator.position) {
            decoratorVNode.attrs['data-decorator-position'] = decorator.position;
          } else if (decorator.category === 'block' || decorator.category === 'layer') {
            decoratorVNode.attrs['data-decorator-position'] = 'after';
          }
        } else {
          throw new Error(`Component '${decorator.stype}' must return an ElementTemplate`);
        }
      } else {
        // Fallback when template is not a function
        decoratorVNode = {
          tag: 'div',
          attrs: {},
          style: {},
          children: []
        } as VNode;
        // Store decorator identity in attrs (not top-level)
        if (decorator.sid) decoratorVNode.attrs!['data-decorator-sid'] = decorator.sid;
        if (decorator.stype) decoratorVNode.attrs!['data-decorator-stype'] = decorator.stype;
        if (decorator.category) decoratorVNode.attrs!['data-decorator-category'] = decorator.category;
        // position is only set when explicitly specified
        // inline decorator has no position by default (handled as overlay)
        // block/layer decorator uses default 'after'
        if (decorator.position) {
          decoratorVNode.attrs!['data-decorator-position'] = decorator.position;
        } else if (decorator.category === 'block' || decorator.category === 'layer') {
          decoratorVNode.attrs!['data-decorator-position'] = 'after';
        }
      }
    } catch (error) {
      console.error('Error building decorator VNode:', error, decorator);
      // inline decorator as <span>, block/layer as <div>
      const defaultTag = decorator.category === 'inline' ? 'span' : 'div';
      const errorVNode = {
        tag: defaultTag,
        attrs: {
          'data-decorator-error': 'build-failed'
        },
        style: {},
        children: []
      } as VNode;
      // Store decorator identity in attrs (not top-level)
      if (decorator.sid) errorVNode.attrs!['data-decorator-sid'] = decorator.sid;
      if (decorator.stype) errorVNode.attrs!['data-decorator-stype'] = decorator.stype;
      if (decorator.category) errorVNode.attrs!['data-decorator-category'] = decorator.category;
      if (decorator.position) {
        errorVNode.attrs!['data-decorator-position'] = decorator.position;
      }
      return errorVNode;
    }
    
    // Store decorator identity information in attrs (not top-level)
    // Reconciler copies attrs directly to DOM, so setting attrs here passes to DOM
    // Skip if already set (may have been set above)
    if (!decoratorVNode.attrs) decoratorVNode.attrs = {};
    if (!decoratorVNode.attrs['data-decorator-sid'] && decorator.sid) {
      decoratorVNode.attrs['data-decorator-sid'] = decorator.sid;
    }
    if (!decoratorVNode.attrs['data-decorator-stype'] && decorator.stype) {
      decoratorVNode.attrs['data-decorator-stype'] = decorator.stype;
    }
    if (!decoratorVNode.attrs['data-decorator-category'] && decorator.category) {
      decoratorVNode.attrs['data-decorator-category'] = decorator.category;
    }
    // position is only set when explicitly specified
    // inline decorator has no position by default (handled as overlay)
    // block/layer decorator uses default 'after'
    if (!decoratorVNode.attrs['data-decorator-position']) {
      if (decorator.position) {
        decoratorVNode.attrs['data-decorator-position'] = decorator.position;
      } else if (decorator.category === 'block' || decorator.category === 'layer') {
        decoratorVNode.attrs['data-decorator-position'] = 'after';
      }
    }
    
    return decoratorVNode;
  }

  /**
   * Builds VNodes for multiple decorators
   */
  buildDecoratorVNodes(
    decorators: Decorator[],
    buildElement: (template: ElementTemplate, data: ModelData, options?: any) => VNode
  ): VNode[] {
    return decorators.map(d => this.buildDecoratorVNode(d, buildElement));
  }

  /**
   * Inserts decorator VNodes into children based on position
   */
  insertDecoratorsIntoChildren(vnode: VNode, decoratorNodes: VNode[]): void {
    if (!vnode.children) {
      vnode.children = [];
    }
    
    for (const decoratorNode of decoratorNodes) {
      const category = decoratorNode.attrs?.['data-decorator-category'] || 'block';
      const position = decoratorNode.attrs?.['data-decorator-position'] || 
                      (category === 'layer' ? 'overlay' : 'after');
      
      switch (position) {
        case 'before':
          vnode.children.unshift(decoratorNode);
          break;
        case 'after':
        default:
          // For block/layer decorators, always add as siblings (not nested)
          vnode.children.push(decoratorNode);
          break;
        case 'inside-start':
          if (vnode.children.length > 0 && typeof vnode.children[0] === 'object') {
            const firstChild = vnode.children[0] as VNode;
            // Only nest if it's not a text node
            if (firstChild.tag && !firstChild.text) {
              if (!firstChild.children) {
                firstChild.children = [];
              }
              firstChild.children.unshift(decoratorNode);
            } else {
              vnode.children.unshift(decoratorNode);
            }
          } else {
            vnode.children.unshift(decoratorNode);
          }
          break;
        case 'inside-end':
          if (vnode.children.length > 0) {
            const lastChild = vnode.children[vnode.children.length - 1];
            // Only nest if last child is an element (not text)
            if (typeof lastChild === 'object' && lastChild.tag && !lastChild.text) {
              const lastVNode = lastChild as VNode;
              if (!lastVNode.children) {
                lastVNode.children = [];
              }
              lastVNode.children.push(decoratorNode);
            } else {
              // Add as sibling
              vnode.children.push(decoratorNode);
            }
          } else {
            vnode.children.push(decoratorNode);
          }
          break;
        case 'overlay':
        case 'absolute':
          // Layer decorator: add as child (sibling)
          vnode.children.push(decoratorNode);
          break;
      }
    }
  }
}

