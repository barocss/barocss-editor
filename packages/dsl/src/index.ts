/**
 * @barocss/dsl - Declarative DSL for building templates
 * 
 * This package provides the DSL layer for template definition.
 * It is completely independent of rendering logic.
 */

// Export all DSL functions
export {
  element,
  el,
  data,
  attr,
  slot,
  when,
  text,
  each,
  component,
  define,
  renderer,
  getGlobalRegistry,
  defineDecorator,
  portal,
  defineMark,
  addDecoratorAttribute,
  addMarkClassAttribute
} from './template-builders';

// Pattern decorators are now managed as data in EditorViewDOM.
// Global registry is no longer used.

// Export types
export type {
  ElementTemplate,
  ElementAttributes,
  ElementChild,
  DataTemplate,
  SlotTemplate,
  ConditionalTemplate,
  ComponentTemplate,
  ComponentContext,
  ExternalComponent,
  RendererDefinition,
  RendererTemplate,
  RenderTemplate,
  PortalTemplate,
  EachTemplate,
  ElementTag,
  ElementTagGetter,
  DataValue,
  ModelData,
  ComponentProps,
  ComponentState,
  TNodeType,
  SimpleComponent,
  ContextualComponent,
  ComponentInstance,
  ClassNameType,
  AttrBinding
} from './types';

// Export HTML types
export type {
  AllTagNames,
  HTMLTagName,
  SVGTagName,
  BaseHTMLAttributes,
  FormAttributes,
  InputAttributes,
  TextareaAttributes,
  SelectAttributes,
  OptionAttributes,
  ButtonAttributes,
  LinkAttributes,
  ImageAttributes,
  MediaAttributes,
  TableAttributes,
  TableCellAttributes,
  ListAttributes,
  MetaAttributes,
  ScriptAttributes,
  StyleAttributes,
  CanvasAttributes,
  SVGAttributes,
  HTMLAttributes,
  AttributesForTag,
  DynamicElementAttributes,
  ElementAttributeMap
} from './html-types';

// Export registry
export {
  RendererRegistry
} from './registry';

