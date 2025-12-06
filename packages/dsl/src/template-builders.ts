/**
 * Template Builders: create declarative templates from the DSL
 * - Provides element/data/slot/when/component and define(renderer)
 * - This is the template-definition layer; DOM creation happens in factory/reconcile
 * - Handles native tag protection, global registry, and overload normalization
 */
// Core template types for DSL construction
import { 
  ElementTemplate,        // Element template structure
  ElementAttributes,      // Element attributes interface
  ElementChild,           // Child element types (string, ElementTemplate, etc.)
  DataTemplate,           // Data binding template
  SlotTemplate,           // Slot template for dynamic content
  ConditionalTemplate,    // Conditional rendering template
  RendererDefinition,     // Renderer definition structure
  TNodeType,              // Node type enumeration
  ComponentTemplate,      // Component template structure
  ExternalComponent,      // External component interface
  RenderTemplate,         // Render template type
  ContextualComponent,
  ComponentContext,
  ComponentProps,
  ModelData,
  ElementTag,             // Element tag type
  PortalTemplate,         // Portal template structure
  EachTemplate,
} from './types';
import { 
  AllTagNames, 
  DynamicElementAttributes,
} from './html-types';

// Registry and utility imports
import { RendererRegistry } from './registry';
import { isNativeHTMLTag } from './constants/native-html-tags';

/**
 * Global registry instance for storing renderer definitions
 * 
 * The global: true flag prevents re-entrant recursion during template building.
 * This registry stores all renderer definitions created via define() calls.
 */
const globalRegistry = new RendererRegistry({ global: true });

/**
 * Checks if an object is a valid DSL template object by examining its type and structure
 * @param obj - The object to check
 * @returns true if the object is a valid DSL template, false otherwise
 */
function isDSLTemplate(obj: any): boolean {
  if (typeof obj !== 'object' || obj === null || !obj.type) {
    return false;
  }
  
  const validTypes = ['text', 'data', 'element', 'component', 'conditional', 'portal', 'slot'];
  if (!validTypes.includes(obj.type)) {
    return false;
  }
  
  // Additional validation based on template type
  switch (obj.type) {
    case 'text':
      return typeof obj.getter === 'function';
    case 'data':
      return typeof obj.path === 'string';
    case 'element':
      return typeof obj.tag === 'string';
    case 'component':
      return typeof obj.component === 'function';
    case 'conditional':
      return obj.condition !== undefined;
    case 'portal':
      return obj.target !== undefined;
    case 'slot':
      return obj.name !== undefined;
    default:
      return false;
  }
}

/**
 * Normalizes nested children arrays into a flat array
 * Recursively flattens arrays of children and filters out null/undefined values
 * @param items - Array of items that may contain nested arrays
 * @returns Flattened array of ElementChild objects
 */
const flattenChildren = (items: any[]): ElementChild[] => {
  const out: ElementChild[] = [];
  for (const it of items || []) {
    if (Array.isArray(it)) {
      out.push(...flattenChildren(it));
    } else if (it !== undefined && it !== null) {
      out.push(it as ElementChild);
    }
  }
  return out;
};

/**
 * Element builder function with multiple overloads for flexible usage
 * Creates HTML elements or registered component templates with various parameter combinations
 * 
 * @overload
 * @param tag - HTML tag name
 * @returns ElementTemplate with no attributes or children
 * 
 * @overload
 * @param tag - HTML tag name
 * @param textOrChild - Text content or single child element
 * @returns ElementTemplate with text content or single child
 * 
 * @overload
 * @param tag - HTML tag name
 * @param children - Array of child elements
 * @returns ElementTemplate with multiple children
 * 
 * @overload
 * @param tag - HTML tag name
 * @param attributes - Element attributes object
 * @param children - Optional children (array or single element)
 * @returns ElementTemplate with attributes and children
 */
export function element<T extends AllTagNames>(tag: T): ElementTemplate<T>;
export function element<T extends AllTagNames>(tag: T, textOrChild: string | number | ElementChild): ElementTemplate<T>;
export function element<T extends AllTagNames>(tag: T, children: ElementChild[]): ElementTemplate<T>;
export function element<T extends AllTagNames>(
  tag: T, 
  attributes: DynamicElementAttributes<T> | null, 
  children?: ElementChild[] | ElementChild
): ElementTemplate<T>;

/**
 * Implementation of the element builder function
 * Handles overload resolution and creates appropriate ElementTemplate or ComponentTemplate
 * 
 * @param tagOrComponent - HTML tag name, registered component name, or component function
 * @param a - First parameter: attributes, text, child, or children array
 * @param b - Second parameter: children when first parameter is attributes
 * @returns RenderTemplate (ElementTemplate or ComponentTemplate)
 */
export function element<T extends AllTagNames>(
  tagOrComponent: T | ElementTag | ContextualComponent,
  a?: DynamicElementAttributes<T> | null | string | number | ElementChild | ElementChild[],
  b?: ElementChild[] | ElementChild
): RenderTemplate {
  let attributes: ElementAttributes | null = null;
  let children: ElementChild[] = [];

  // Overload normalization - determine what 'a' represents
  if (a === undefined) {
    // Case: element('div') - no attributes, no children
    attributes = null;
    children = [];
  } else if (typeof a === 'string' || typeof a === 'number') {
    // Case: element('h3', 'Title') - text content
    attributes = null;
    children = [text(a)];
  } else if (Array.isArray(a)) {
    // Case: element('div', [child1, child2]) - children array
    attributes = null;
    children = a as ElementChild[];
  } else if (isDSLTemplate(a)) {
    // Case: element('span', data('name')) - DSL template as child
    // This is a valid DSL template (text, data, component, etc.), treat it as a child element
    attributes = null;
    children = [a as ElementChild];
  } else if (typeof a === 'object' && a !== null && (a as any).type) {
    // Case: element('input', { type: 'text', placeholder: 'Enter text' })
    // HTML attribute object that happens to have a 'type' property
    attributes = (a as any) || null;
    if (b === undefined) {
      children = [];
    } else if (Array.isArray(b)) {
      children = b as ElementChild[];
    } else {
      children = [b as ElementChild];
    }
  } else {
    // Case: element('div', { className: 'container' }, [child1, child2])
    // Treat 'a' as attributes object
    attributes = (a as any) || null;
    if (b === undefined) {
      children = [];
    } else if (Array.isArray(b)) {
      children = b as ElementChild[];
    } else {
      children = [b as ElementChild];
    }
  }
  
  // Flatten any nested children arrays
  if (children && Array.isArray(children)) {
    children = flattenChildren(children as any);
  }

  const tag: any = tagOrComponent as any;

  // Check if this is a registered component (non-native HTML tag)
  const isNative = isNativeHTMLTag(tag);
  
  if (typeof tag === 'string' && !isNative) {
    // Everything defined with define() is component-only, so only use getComponent()
    const registeredComponent = globalRegistry.getComponent(tag);
    if (registeredComponent) {
      // Delegate to component() so children are normalized consistently
      return component(tag, attributes || {}, children);
    }
  }

  // Create native HTML element template
  return {
    type: 'element',
    tag: tag as ElementTag,
    attributes: (attributes || {}) as ElementAttributes,
    children
  };
}


/**
 * Data template builder with multiple overloads for flexible data binding
 * Creates templates that bind to data values using either dot-notation paths or getter functions
 * 
 * @overload
 * @param pathOrGetter - Dot-notation path string (e.g., 'user.name')
 * @param defaultValue - Default value if the path resolves to null/undefined
 * @returns DataTemplate with path-based binding
 * 
 * @overload
 * @param pathOrGetter - Getter function that receives data and returns a value
 * @param defaultValue - Default value if the getter returns null/undefined
 * @returns DataTemplate with function-based binding
 */
export function data<TModel = unknown>(pathOrGetter: (data: TModel) => any, defaultValue?: any): DataTemplate;
export function data(pathOrGetter: string, defaultValue?: any): DataTemplate;
export function data(pathOrGetter: string | ((data: any) => any), defaultValue?: any): DataTemplate {
  if (typeof pathOrGetter === 'function') {
    // Function-based data binding: data((d) => d.user.name)
    return { type: 'data', getter: pathOrGetter, defaultValue } as DataTemplate;
  }
  // Path-based data binding: data('user.name')
  return { type: 'data', path: pathOrGetter, defaultValue } as DataTemplate;
}

/**
 * Attributes alias for data binding
 * Shorthand for accessing element attributes: attr('className') → data('attributes.className')
 * 
 * @param key - Attribute key (e.g., 'className', 'id', 'data-value')
 * @param defaultValue - Default value if the attribute is not set
 * @returns DataTemplate that binds to the specified attribute
 */
export function attr(key: string, defaultValue?: any): DataTemplate {
  // Normalize key by removing 'attributes.' prefix if present
  const normalized = key?.startsWith('attributes.') ? key.slice('attributes.'.length) : key;
  return data(`attributes.${normalized}`, defaultValue);
}

/**
 * Slot template builder
 * Creates a slot template that can be filled with content from parent components
 * 
 * @param name - Slot name identifier
 * @returns SlotTemplate for content projection
 */
export function slot(name: string): SlotTemplate {
  return {
    type: 'slot',
    name
  };
}

/**
 * Each template builder
 * Creates templates that iterate over data[name] (array) and render each item
 *
 * @param name - Property name in data that holds an array
 * @param render - Function mapping (item, index) to an ElementTemplate/ComponentTemplate
 * @param key - Optional key function for keyed reconciliation
 * @returns EachTemplate for array iteration
 */
export function each(
  name: string,
  render: (item: any, index: number) => ElementChild | ElementTemplate | ComponentTemplate,
  key?: (item: any, index: number) => string
): EachTemplate {
  return {
    type: 'each',
    name,
    // Ensure render returns an ElementTemplate/ComponentTemplate; if string/number, wrap as text element
    render: (item: any, index: number) => {
      const out = render(item, index) as any;
      // If render returned a plain string/number, convert to a span element with text
      if (typeof out === 'string' || typeof out === 'number') {
        return element('span', [text(out as any)]) as ElementTemplate;
      }
      return out as ElementTemplate;
    },
    key
  };
}

/**
 * Conditional template builder with optional else template
 * Creates templates that render different content based on data conditions
 * 
 * @overload
 * @param condition - Function that receives data and returns boolean
 * @param thenTemplate - Template to render when condition is true
 * @param elseTemplate - Optional template to render when condition is false
 * @returns ConditionalTemplate for conditional rendering
 */
export function when<TModel = unknown>(
  condition: (data: TModel) => boolean,
  thenTemplate: RenderTemplate,
  elseTemplate?: RenderTemplate
): ConditionalTemplate;
export function when(
  condition: (data: any) => boolean,
  thenTemplate: RenderTemplate,
  elseTemplate?: RenderTemplate
): ConditionalTemplate {
  return {
    type: 'conditional',
    condition,
    template: thenTemplate,
    elseTemplate
  };
}

/**
 * Renderer definition builder with multiple overloads
 * Registers custom renderers that can be used with element() function
 * 
 * @overload
 * @param nodeType - Unique identifier for the renderer (must not be native HTML tag)
 * @param template - Template definition (ElementTemplate, ComponentTemplate, or ExternalComponent)
 * @returns RendererDefinition that is automatically registered
 */
export function renderer<
  P extends ComponentProps = ComponentProps,
  M extends ModelData = ModelData,
  C extends ComponentContext = ComponentContext
>(
  nodeType: TNodeType,
  template: ContextualComponent<P, M, C> | RenderTemplate | ExternalComponent
): RendererDefinition;
export function renderer(nodeType: TNodeType, template: RenderTemplate | ContextualComponent | ExternalComponent): RendererDefinition {
  // Disallow native HTML tag names in production (allowed in tests for convenience)
  const isTestEnvironment = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
  if (!isTestEnvironment && isNativeHTMLTag(nodeType)) {
    throw new Error(`Cannot define template with native HTML tag name '${nodeType}'. Use a descriptive name like 'card', 'button-primary', etc.`);
  }
  
  let processedTemplate: RenderTemplate | ExternalComponent;
  
  // Handle function templates (ContextualComponent)
  if (typeof template === 'function') {
    processedTemplate = {
      type: 'component',
      name: nodeType,
      component: template as ContextualComponent
    } as RenderTemplate;
  } else {
    processedTemplate = template as RenderTemplate | ExternalComponent;
    
    // Auto-wrap ElementTemplate as component function for consistency
    // This makes define() always create components, simplifying the build process
    if (processedTemplate && typeof processedTemplate === 'object' && (processedTemplate as any).type === 'element') {
      const elementTemplate = processedTemplate as ElementTemplate;
      // Wrap ElementTemplate in a function that returns it
      // This allows ElementTemplate to be treated as a component
      const componentFunction: ContextualComponent = (_props, _ctx) => {
        // Return the original ElementTemplate
        // props and ctx are available if needed in the future
        return elementTemplate;
      };
      processedTemplate = {
        type: 'component',
        name: nodeType,
        component: componentFunction
      } as RenderTemplate;
    } else if (
      processedTemplate &&
      typeof processedTemplate === 'object' &&
      !(processedTemplate as any).type &&
      typeof (processedTemplate as any).mount === 'function'
    ) {
      // Auto-tag external components when mount/unmount object is provided without type
      processedTemplate = { type: 'external', ...(processedTemplate as any) } as any;
    }
  }
  
  const definition: RendererDefinition = {
    type: 'renderer',
    nodeType,
    template: processedTemplate
  };
  
  // Auto-register so element('name') can resolve to a registered renderer
  globalRegistry.register(definition);
  
  return definition;
}

/**
 * Gets the global renderer registry instance
 * @returns The global RendererRegistry instance
 */
export function getGlobalRegistry(): RendererRegistry {
  return globalRegistry;
}

/**
 * Alias for renderer function
 * Provides a more concise name for defining custom renderers
 */
export const define = renderer;

/**
 * Explicit text node builder
 * Creates text content that can be either static or dynamic
 * 
 * @param value - Static text, number, or function that returns text/number
 * @returns ElementChild (string for static, DataTemplate for dynamic)
 */
export function text(value: string | number | ((data: any) => string | number)): ElementChild {
  if (typeof value === 'function') {
    // Dynamic text: text((d) => d.user.name)
    return { type: 'data', getter: value } as DataTemplate;
  }
  // Static text: text('Hello World')
  return String(value);
}


/**
 * Component builder function
 * Creates a ComponentTemplate for registered components
 * 
 * @param name - Registered component name
 * @param props - Component props (object or function)
 * @param children - Child elements (moved to props.content)
 * @param key - Optional key for component instance
 * @returns ComponentTemplate
 */
export function component(
  name: string, 
  props?: Record<string, any> | ((data: any) => Record<string, any>), 
  children?: ElementChild[],
  key?: string | ((data: any) => string)
): ComponentTemplate {
  // Move children to props.content for consistent component interface
  let finalProps = props || {};
  if (children && children.length > 0) {
    if (typeof finalProps === 'function') {
      // Wrap function props to inject content
      const originalProps = finalProps;
      finalProps = (data: any) => ({
        ...originalProps(data),
        content: children
      });
    } else {
      // Merge content directly for object props
      finalProps = {
        ...finalProps,
        content: children
      };
    }
  }
  
  // Handle registered component references
  return { 
    type: 'component', 
    name: name, 
    props: finalProps, 
    children: children || [],
    key
  };
}

/**
 * Alias for element() function
 * Provides a shorter name for element creation
 */
export const el = element;

/**
 * Decorator renderer definition helper
 * Creates renderers that automatically add data-decorator="true" attribute
 * 
 * @param name - Decorator name
 * @param template - Template to decorate
 * @returns RendererDefinition with decorator attribute
 */
export function defineDecorator(name: string, template: RenderTemplate): RendererDefinition {
  // Auto-add data-decorator="true" to the template
  const decoratedTemplate = addDecoratorAttribute(template);
  
  // Use the existing define() system
  return define(name, decoratedTemplate);
}

/**
 * Portal template builder
 * Creates templates that render content to a different DOM target
 * 
 * @param target - DOM element where content should be rendered
 * @param template - Template to render in the portal
 * @param portalId - Optional unique identifier for the portal
 * @returns PortalTemplate for portal rendering
 */
export function portal(target: HTMLElement | (() => HTMLElement) | string, template: RenderTemplate, portalId?: string): PortalTemplate {
  return {
    type: 'portal',
    target,
    template,
    portalId
  };
}

/**
 * Mark renderer registration helper
 * Creates renderers for text marks with automatic className="mark-{type}"
 * 
 * @param type - Mark type (e.g., 'bold', 'italic')
 * @param template - Template for the mark
 * @returns RendererDefinition with mark class attribute
 */
export function defineMark(type: string, template: RenderTemplate): RendererDefinition {
  return define(`mark:${type}`, addMarkClassAttribute(type, template));
}

/**
 * Helper function to automatically add data-decorator="true" attribute to templates
 * Used by defineDecorator to mark templates as decorators
 * 
 * @param template - Template to add decorator attribute to
 * @returns Modified template with data-decorator attribute
 */
export function addDecoratorAttribute(template: RenderTemplate): RenderTemplate {
  if (template.type === 'element') {
    return {
      ...template,
      attributes: {
        ...template.attributes,
        // Keep existing data-decorator or inject 'true'
        'data-decorator': template.attributes['data-decorator'] || 'true',
        // Add reconcile skip attribute for decorators
        'data-skip-reconcile': template.attributes['data-skip-reconcile'] || 'true'
      }
    };
  } else if (template.type === 'component') {
    return {
      ...template,
      props: {
        ...template.props,
        // Keep existing data-decorator or inject 'true'
        'data-decorator': (template?.props as Record<string, any>)?.['data-decorator'] || 'true',
        // Add reconcile skip attribute for decorators
        'data-skip-reconcile': (template?.props as Record<string, any>)?.['data-skip-reconcile'] || 'true'
      }
    };
  }
  return template;
}

/**
 * Adds data-bc-stype attribute to element/component templates for schema typing.
 * This does not set sid; sid is instance-specific and provided at render-time.
 */
// (No schema type attribute injection at DSL layer; model carries stype)

/**
 * Helper function to automatically add className="mark-{type}" to element templates
 * Used by defineMark to add mark-specific CSS classes
 * 
 * @param stype - Mark type (e.g., 'bold', 'italic')
 * @param template - Template to add mark class to
 * @returns Modified template with mark class attribute
 */
export function addMarkClassAttribute(stype: string, template: RenderTemplate): RenderTemplate {
  if (template.type === 'element') {
    const existingClass = (template.attributes && (template.attributes as any)['className']) || '';
    const markClass = `mark-${stype}`;
    
    // Duplicate check: don't add if mark-${stype} is already included
    const classStr = String(existingClass);
    const classList = classStr.split(/\s+/).filter(c => c.length > 0);
    const alreadyHasMarkClass = classList.includes(markClass);
    
    const mergedClass = alreadyHasMarkClass 
      ? classStr 
      : (existingClass ? `${existingClass} ${markClass}` : markClass);
    
    return {
      ...template,
      attributes: {
        ...template.attributes,
        className: mergedClass
      }
    };
  }
  // For component templates, we leave it as-is to avoid forcing structure; 
  // component may map props to attributes itself.
  return template;
}