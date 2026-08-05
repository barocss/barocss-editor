import { 
  AllTagNames, 
  DynamicElementAttributes,
} from './html-types';

export type ClassNameType = string | string[] | Record<string, boolean> | Array<string | Record<string, boolean> | Array<string | Record<string, boolean>>>;

// Enhanced type-safe element attributes
export type ElementAttributes<T extends AllTagNames = AllTagNames> = {
  // Keep backward compatibility
  className?: ClassNameType | ((data: any) => ClassNameType);
  style?: Record<string, any> | ((data: any) => Record<string, any>);
  id?: string | ((data: any) => string);
  // Reconcile key: used for keyed reconciliation (VNode-only, not rendered as DOM attribute)
  key?: string | ((data: any) => string);
  
  // Allow custom data attributes
  [K: `data-${string}`]: any;
  // Allow custom aria attributes
  [K: `aria-${string}`]: any;
  // Allow custom event handlers
  [K: `on${string}`]: any;
  
  // Fallback for any other attributes
  [key: string]: any;
} & DynamicElementAttributes<T>;

// More specific types for better type safety
export type DataValue = any;
export type ModelData = Record<string, any>;
export type ComponentProps = Record<string, any>;
export type ComponentState = Record<string, any>;

export type ElementTagGetter = (data: Record<string, any>) => AllTagNames;

export type ElementTag = AllTagNames | ElementTagGetter;

export interface ElementTemplate<T extends AllTagNames = AllTagNames> {
  type: 'element';
  tag: ElementTag;
  attributes: ElementAttributes<T>;
  children: ElementChild[];
}

export interface DataTemplate {
  type: 'data';
  // path or function stringified flag handled at runtime; we store either path or function
  path?: string;
  getter?: (data: ModelData) => DataValue;
  defaultValue?: DataValue;
}

export interface AttrBinding {
  __attrData: true;
  path: string;
  defaultValue?: any;
  formatter?: (value: any) => string | number | boolean | null | undefined;
}

export interface SlotTemplate {
  type: 'slot';
  name: string;
}

export interface ConditionalTemplate {
  type: 'conditional';
  condition: (data: ModelData) => boolean;
  template: RenderTemplate;
  elseTemplate?: RenderTemplate;
}

export interface PortalTemplate {
  type: 'portal';
  target: HTMLElement | (() => HTMLElement) | string;
  template: RenderTemplate;
  portalId?: string;
}

export interface EachTemplate {
  type: 'each';
  name: string; // iterates data[name] array
  render: (item: DataValue, index: number) => ElementTemplate; // map each item to ElementTemplate
  key?: (item: DataValue, index: number) => string; // data-bc-sid key (fallback to item.sid or auto)
}

export interface ComponentTemplate {
  type: 'component';
  name: string; // component name (looked up in registry)
  props?: ComponentProps | ((data: ModelData) => ComponentProps); // props passed to component
  children?: ElementChild[]; // children (passed via slot/content)
  key?: string | ((data: ModelData) => string); // data-bc-sid key
  // Component function (for function-based components)
  component?: ContextualComponent;
}

export interface ComponentInstance {
  id: string;
  element: HTMLElement;
  component: ExternalComponent;
  state: ComponentState;
  props: ComponentProps;
  vnode?: any;
  template?: ContextualComponent; 
  parentElement?: HTMLElement; 
  renderer?: any;
  setState: (newState: Record<string, any>) => void;
  getState: (key: string) => DataValue;
  toggleState: (key: string) => void;
}

export type SimpleComponent = (props: ComponentProps) => ElementTemplate;

export type ContextualComponent<
  P extends ComponentProps = ComponentProps,
  M extends ModelData = ModelData,
  C extends ComponentContext = ComponentContext
> = (props: P, model: M, context: C) => ElementTemplate | ComponentTemplate;

/**
 * Whatever the host wants templates to be able to reach.
 *
 * A template is handed the node it is drawing and nothing else, which is enough
 * for a node that describes itself completely and not enough for one that does
 * not: a Word paragraph's appearance depends on the style it points at, the
 * defaults behind that style, the list counter that precedes it, and the page
 * layout it landed on — none of which are in the node.
 *
 * Products worked around this with module-level state, which quietly means one
 * document per module instance: two editors on a page would read each other's.
 * Passing the environment down through the render instead makes the scope the
 * render, which is what it always was.
 *
 * The shape is the host's business. The renderer only carries it.
 */
export interface RenderEnv {
  [key: string]: unknown;
}

export interface ComponentContext {
  id: string;
  /** Host-supplied environment for this render. */
  env?: RenderEnv;
  state: ComponentState;
  props: ComponentProps;
  // Renderer-specific instance holder (renderer-dom uses BaseComponentState)
  // Use a broad type to stay renderer-agnostic
  instance?: unknown;
  registry: {
    get: (name: string) => any;
    getComponent: (name: string) => any;
    register: (definition: any) => void;
    setState: (id: string, state: Record<string, any>) => boolean;
    getState: (id: string) => ComponentState;
    toggleState: (id: string, key: string) => boolean;
  };
  // State management methods
  initState: (initial: Record<string, any>) => void;
  getState: (key: string) => DataValue;
  setState: (newState: Record<string, any>) => void;
  toggleState: (key: string) => void;
}

export interface ExternalComponent {
  template?: ContextualComponent;
  mount: (props: Record<string, any>, container: HTMLElement) => HTMLElement;
  update?: (instance: ComponentInstance, prevProps: Record<string, any>, nextProps: Record<string, any>) => void;
  unmount: (instance: ComponentInstance) => void;
  managesDOM?: boolean;
  /** React: function or class component (renderer-react uses this when present). */
  reactComponent?: (props: Record<string, any>) => any;
}

/**
 * Props passed by renderer-react to a block node's React component.
 * Use with define('nodeType', external(Component)).
 */
export interface BlockComponentProps<A = Record<string, any>> {
  sid: string;
  stype: string;
  model: Record<string, unknown>;
  attributes: A;
  text?: string;
  children?: any;
  'data-bc-sid': string;
  'data-bc-stype': string;
  [key: string]: unknown;
}

/**
 * Props passed by renderer-react to a mark's React component.
 * Use with defineMark('markType', external(Component)).
 *
 * `children` is the inner text string or nested mark React elements.
 */
export interface MarkComponentProps<A = Record<string, any>> {
  markType: string;
  attributes: A;
  text: string;
  children?: any;
  'data-mark-type': string;
  [key: string]: unknown;
}

/**
 * Descriptor returned by external() for define('name', external(...)).
 * Either reactComponent (React) or mount/unmount (DOM) is provided.
 */
export interface ExternalDescriptor {
  type: 'external';
  reactComponent?: (props: Record<string, any>) => any;
  mount?: (props: Record<string, any>, container: HTMLElement) => HTMLElement;
  update?: (instance: ComponentInstance, prevProps: Record<string, any>, nextProps: Record<string, any>) => void;
  unmount?: (instance: ComponentInstance) => void;
  managesDOM?: boolean;
}

export type RenderTemplate = ElementTemplate | ComponentTemplate | PortalTemplate;

export type ElementChild = string | number | ElementTemplate | SlotTemplate | DataTemplate | ConditionalTemplate | EachTemplate | ComponentTemplate | PortalTemplate | ((data: any) => ElementChild) | ElementChild[];

export interface RendererDefinition {
  type: 'renderer';
  nodeType: string;
  template: RenderTemplate | ExternalComponent | ExternalDescriptor;
}

export interface RendererTemplate {
  nodeType: string;
  template: RenderTemplate | ExternalComponent;
}

export type TNodeType = string;

