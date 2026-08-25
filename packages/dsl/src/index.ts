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
  external,
  getGlobalRegistry,
  defineDecorator,
  portal,
  defineMark,
  addDecoratorAttribute,
  addMarkClassAttribute,
  /**
   * Saying a renderer is being replaced, and finding out when one is replaced without saying.
   *
   * The registry is last-write-wins on purpose — two products share a renderer set and each draws
   * some of it its own way — and until now that was silent, so a renderer that moved to another file
   * would quietly stop being overridden and the product would draw the other one's answer.
   */
  override,
  silentlyOverridden,
  overrodeNothing,
  forgetOverrides
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
  RenderEnv,
  ExternalComponent,
  ExternalDescriptor,
  BlockComponentProps,
  MarkComponentProps,
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


/**
 * Which names the browser already owns.
 *
 * Exported because the rule it states — a native element name is never a
 * template name — has to be enforced where templates are built, not only
 * declared here. The renderer read a template child's tag as a node type when
 * the two happened to share a spelling and recursed until the stack ran out;
 * `line`, `path`, `ellipse` and `frame` are all node types in the office schema
 * and all elements a browser has.
 */
export { NATIVE_HTML_TAGS, isNativeHTMLTag } from './constants/native-html-tags';
