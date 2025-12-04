/**
 * HTML Element Types and Attributes
 * Provides type-safe HTML element attributes and event handlers
 */

import { ClassNameType, DataTemplate } from "./types";

// Base HTML attributes that are common to most elements
export interface BaseHTMLAttributes {
  // Standard attributes
  id?: string;
  className?: ClassNameType | DataTemplate | ((data: any) => ClassNameType);
  style?: string | Record<string, any> | DataTemplate | ((data: any) => Record<string, any>);
  title?: string;
  lang?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  tabIndex?: number;
  role?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-hidden'?: boolean;
  'data-testid'?: string;
  contenteditable?: boolean | 'true' | 'false' | DataTemplate | ((data: any) => boolean | 'true' | 'false');
  
  // Event handlers
  onClick?: (event: MouseEvent) => void;
  onDoubleClick?: (event: MouseEvent) => void;
  onMouseDown?: (event: MouseEvent) => void;
  onMouseUp?: (event: MouseEvent) => void;
  onMouseEnter?: (event: MouseEvent) => void;
  onMouseLeave?: (event: MouseEvent) => void;
  onMouseOver?: (event: MouseEvent) => void;
  onMouseOut?: (event: MouseEvent) => void;
  onMouseMove?: (event: MouseEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onKeyUp?: (event: KeyboardEvent) => void;
  onKeyPress?: (event: KeyboardEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: FocusEvent) => void;
  onChange?: (event: Event) => void;
  onInput?: (event: Event) => void;
  onSubmit?: (event: Event) => void;
  onReset?: (event: Event) => void;
  onLoad?: (event: Event) => void;
  onError?: (event: Event) => void;
  onScroll?: (event: Event) => void;
  onResize?: (event: Event) => void;
}

// Form-related attributes
export interface FormAttributes extends BaseHTMLAttributes {
  action?: string;
  method?: 'get' | 'post' | 'put' | 'delete';
  enctype?: string;
  target?: '_blank' | '_self' | '_parent' | '_top';
  noValidate?: boolean;
}

// Input-related attributes
export interface InputAttributes extends BaseHTMLAttributes {
  type?: 'text' | 'password' | 'email' | 'tel' | 'url' | 'search' | 'number' | 'range' | 'date' | 'time' | 'datetime-local' | 'month' | 'week' | 'color' | 'checkbox' | 'radio' | 'file' | 'submit' | 'reset' | 'button' | 'hidden';
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  checked?: boolean; // for checkbox/radio inputs
  readOnly?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  multiple?: boolean;
  accept?: string;
  capture?: boolean | string;
}

// Textarea attributes
export interface TextareaAttributes extends BaseHTMLAttributes {
  name?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  minLength?: number;
  maxLength?: number;
  rows?: number;
  cols?: number;
  wrap?: 'soft' | 'hard' | 'off';
}

// Select attributes
export interface SelectAttributes extends BaseHTMLAttributes {
  name?: string;
  value?: string | string[];
  defaultValue?: string | string[];
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  multiple?: boolean;
  size?: number;
}

// Option attributes
export interface OptionAttributes extends BaseHTMLAttributes {
  value?: string | number;
  disabled?: boolean;
  selected?: boolean;
  label?: string;
}

// Button attributes
export interface ButtonAttributes extends BaseHTMLAttributes {
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  autoFocus?: boolean;
  form?: string;
  formAction?: string;
  formMethod?: 'get' | 'post' | 'put' | 'delete';
  formEnctype?: string;
  formTarget?: '_blank' | '_self' | '_parent' | '_top';
  formNoValidate?: boolean;
}

// Link attributes
export interface LinkAttributes extends BaseHTMLAttributes {
  href?: string;
  target?: '_blank' | '_self' | '_parent' | '_top';
  rel?: string;
  download?: string | boolean;
  hreflang?: string;
  type?: string;
  media?: string;
}

// Image attributes
export interface ImageAttributes extends BaseHTMLAttributes {
  src?: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  loading?: 'lazy' | 'eager';
  decoding?: 'sync' | 'async' | 'auto';
  sizes?: string;
  srcSet?: string;
  useMap?: string;
  crossOrigin?: 'anonymous' | 'use-credentials';
  referrerPolicy?: 'no-referrer' | 'no-referrer-when-downgrade' | 'origin' | 'origin-when-cross-origin' | 'same-origin' | 'strict-origin' | 'strict-origin-when-cross-origin' | 'unsafe-url';
}

// Media attributes (video, audio)
export interface MediaAttributes extends BaseHTMLAttributes {
  src?: string;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  poster?: string;
  width?: number | string;
  height?: number | string;
  crossOrigin?: 'anonymous' | 'use-credentials';
}

// Table attributes
export interface TableAttributes extends BaseHTMLAttributes {
  border?: number | string;
  cellPadding?: number | string;
  cellSpacing?: number | string;
  summary?: string;
  width?: number | string;
}

// Table cell attributes (td, th)
export interface TableCellAttributes extends BaseHTMLAttributes {
  colSpan?: number;
  rowSpan?: number;
  headers?: string;
  scope?: 'col' | 'row' | 'colgroup' | 'rowgroup' | 'auto';
  abbr?: string;
  align?: 'left' | 'center' | 'right' | 'justify' | 'char';
  valign?: 'top' | 'middle' | 'bottom' | 'baseline';
  width?: number | string;
  height?: number | string;
}

// List attributes (ul, ol)
export interface ListAttributes extends BaseHTMLAttributes {
  type?: string;
  start?: number;
  reversed?: boolean;
}

// Meta attributes
export interface MetaAttributes extends BaseHTMLAttributes {
  name?: string;
  content?: string;
  httpEquiv?: string;
  charset?: string;
  property?: string;
}

// Script attributes
export interface ScriptAttributes extends BaseHTMLAttributes {
  src?: string;
  type?: string;
  async?: boolean;
  defer?: boolean;
  crossOrigin?: 'anonymous' | 'use-credentials';
  integrity?: string;
  noModule?: boolean;
  nonce?: string;
}

// Style attributes
export interface StyleAttributes extends BaseHTMLAttributes {
  type?: string;
  media?: string;
  nonce?: string;
}

// Canvas attributes
export interface CanvasAttributes extends BaseHTMLAttributes {
  width?: number | string;
  height?: number | string;
}

// SVG attributes (basic)
export interface SVGAttributes extends BaseHTMLAttributes {
  viewBox?: string;
  width?: number | string;
  height?: number | string;
  xmlns?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number | string;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  d?: string; // for path elements
  cx?: number | string; // for circle elements
  cy?: number | string; // for circle elements
  r?: number | string; // for circle elements
  x?: number | string; // for rect, text elements
  y?: number | string; // for rect, text elements
  rx?: number | string; // for rect elements
  ry?: number | string; // for rect elements
}

// Union type for all possible HTML attributes
export type HTMLAttributes = 
  | BaseHTMLAttributes
  | FormAttributes
  | InputAttributes
  | TextareaAttributes
  | SelectAttributes
  | OptionAttributes
  | ButtonAttributes
  | LinkAttributes
  | ImageAttributes
  | MediaAttributes
  | TableAttributes
  | TableCellAttributes
  | ListAttributes
  | MetaAttributes
  | ScriptAttributes
  | StyleAttributes
  | CanvasAttributes
  | SVGAttributes;

// HTML element tag names
export type HTMLTagName = 
  | 'a' | 'abbr' | 'address' | 'area' | 'article' | 'aside' | 'audio'
  | 'b' | 'base' | 'bdi' | 'bdo' | 'blockquote' | 'body' | 'br' | 'button'
  | 'canvas' | 'caption' | 'cite' | 'code' | 'col' | 'colgroup'
  | 'data' | 'datalist' | 'dd' | 'del' | 'details' | 'dfn' | 'dialog' | 'div' | 'dl' | 'dt'
  | 'em' | 'embed'
  | 'fieldset' | 'figcaption' | 'figure' | 'footer' | 'form'
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'head' | 'header' | 'hgroup' | 'hr' | 'html'
  | 'i' | 'iframe' | 'img' | 'input' | 'ins'
  | 'kbd'
  | 'label' | 'legend' | 'li' | 'link'
  | 'main' | 'map' | 'mark' | 'menu' | 'meta' | 'meter'
  | 'nav' | 'noscript'
  | 'object' | 'ol' | 'optgroup' | 'option' | 'output'
  | 'p' | 'param' | 'picture' | 'pre' | 'progress'
  | 'q'
  | 'rp' | 'rt' | 'ruby'
  | 's' | 'samp' | 'script' | 'section' | 'select' | 'slot' | 'small' | 'source' | 'span' | 'strong' | 'style' | 'sub' | 'summary' | 'sup' | 'svg'
  | 'table' | 'tbody' | 'td' | 'template' | 'textarea' | 'tfoot' | 'th' | 'thead' | 'time' | 'title' | 'tr' | 'track'
  | 'u' | 'ul'
  | 'var' | 'video'
  | 'wbr';

// SVG element tag names
export type SVGTagName = 
  | 'svg' | 'g' | 'path' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon' | 'rect'
  | 'text' | 'tspan' | 'textPath' | 'image' | 'use' | 'defs' | 'clipPath' | 'mask'
  | 'linearGradient' | 'radialGradient' | 'stop' | 'pattern' | 'marker'
  | 'symbol' | 'switch' | 'foreignObject';

// All possible tag names
export type AllTagNames = HTMLTagName | SVGTagName;

// Type mapping for element-specific attributes
export interface ElementAttributeMap {
  // Form elements
  form: FormAttributes;
  input: InputAttributes;
  textarea: TextareaAttributes;
  select: SelectAttributes;
  option: OptionAttributes;
  button: ButtonAttributes;
  
  // Media elements
  img: ImageAttributes;
  video: MediaAttributes;
  audio: MediaAttributes;
  canvas: CanvasAttributes;
  
  // Text elements
  a: LinkAttributes;
  
  // Table elements
  table: TableAttributes;
  td: TableCellAttributes;
  th: TableCellAttributes;
  
  // List elements
  ul: ListAttributes;
  ol: ListAttributes;
  
  // Meta elements
  meta: MetaAttributes;
  script: ScriptAttributes;
  style: StyleAttributes;
  
  // SVG elements
  svg: SVGAttributes;
  g: SVGAttributes;
  path: SVGAttributes;
  circle: SVGAttributes;
  rect: SVGAttributes;
  text: SVGAttributes;
  
  // Default fallback
  [K: string]: HTMLAttributes;
}

// Helper type to get attributes for a specific tag
export type AttributesForTag<T extends AllTagNames> = 
  T extends keyof ElementAttributeMap 
    ? ElementAttributeMap[T] 
    : BaseHTMLAttributes;

// Dynamic attribute type that can be a function or static value
export type DynamicAttribute<T> = T | DataTemplate;

// Enhanced element attributes with dynamic support
export type DynamicElementAttributes<T extends AllTagNames> = {
  [K in keyof AttributesForTag<T>]?: DynamicAttribute<AttributesForTag<T>[K]>;
} & {
  // Allow custom data attributes
  [K: `data-${string}`]: DynamicAttribute<string | number | boolean>;
  // Allow custom aria attributes
  [K: `aria-${string}`]: DynamicAttribute<string | number | boolean>;
  // Allow custom event handlers
  [K: `on${string}`]: DynamicAttribute<(event: any) => void>;
};
