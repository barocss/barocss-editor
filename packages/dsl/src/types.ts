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

/**
 * The object a renderer hands back to an external component's `update`/`unmount`.
 *
 * This is written from the producer, not from the wish: `ComponentManager` builds it in exactly
 * two places (`component-manager.ts`, where an instance is created or re-created) and those are
 * the fields it puts there. The previous declaration lived here and said something else —
 * `element: HTMLElement` (never null), and `setState`/`getState`/`toggleState` **required** — none
 * of which the producer sets. A component author writing `unmount(instance)` against it and
 * calling `instance.getState(…)` would have been told by the compiler that it was there, and got
 * `undefined is not a function`.
 *
 * The receipt that this was already known: `office-site/src/code-render.ts` types its own `update`
 * as `(instance: { element?: HTMLElement }, …)` — a hand-written subset, because the shared name
 * could not be trusted.
 *
 * `vnode` is `unknown` on purpose. It is the renderer's virtual node and the DSL has no word for
 * one; `ComponentManager` only ever writes it.
 */
export interface ComponentInstance {
  id: string;
  /**
   * Where it was mounted. `null` when a mount was attempted and returned nothing.
   *
   * This file used to say `HTMLElement` — never absent, always an HTML element — and both halves
   * were false. `ComponentManager.mountComponent(vnode, container: Element, …)` assigns that
   * container, and assigns `null` when `mount()` throws or returns nothing. Narrowing this to
   * `HTMLElement | null` was tried and the compiler said so at `component-manager.ts:350`, which is
   * the difference between measuring the producer and guessing at it.
   */
  element: Element | null;
  component: ExternalComponent;
  state: ComponentState;
  props: ComponentProps;
  vnode?: unknown;
  template?: ContextualComponent;
  parentElement?: HTMLElement;
  renderer?: any;
  /** True once the element is in the document; false again after unmount. */
  mounted?: boolean;
  /** Set by the renderer only for the components it manages state for. */
  setState?: (newState: Record<string, any>) => void;
  /** The node this instance draws, read fresh from the store each time. */
  getModel: () => ModelData | undefined;
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

/**
 * The state object a renderer puts on `context.instance`.
 *
 * The class is the renderer's — `renderer-dom` hands over a `BaseComponentState` — so the DSL
 * names only what a template is allowed to ask of it. It used to be `unknown` here, which made the
 * usage every integration test in `editor-view-dom` is written around, `ctx.instance?.get('count')`,
 * impossible to write without a cast; those tests are outside `tsc`'s `include`, which is the only
 * reason nobody met it.
 */
export interface ComponentStateHandle {
  get<T = any>(key: string): T;
  set(patch: Record<string, any>): void;
  init(initial: Record<string, any>): void;
  snapshot(): Record<string, any>;
}

export interface ComponentContext {
  id: string;
  /** Host-supplied environment for this render. */
  env?: RenderEnv;
  state: ComponentState;
  props: ComponentProps;
  /**
   * The node being drawn, whole — `stype` and `sid` included, where `props` has neither.
   *
   * It was missing here while `renderer-dom`'s copy of this type had it and its `VNodeBuilder` set
   * it on every context. A template author reading `ctx.model` got a type error from the shared
   * vocabulary for a field that was always there.
   */
  model: ModelData;
  /** Renderer-supplied state object; see {@link ComponentStateHandle}. */
  instance?: ComponentStateHandle;
  /**
   * The registry this render resolves names against.
   *
   * The three lookups are what both renderers supply. The three state methods are optional because
   * only one of them does: `renderer-react`'s stub context declares all six, and what
   * `renderer-dom` passes is the `RendererRegistry` itself, which **has no `setState`,
   * `getState` or `toggleState`.** They were declared required here, so this type described an
   * object neither renderer had ever handed to a template.
   */
  registry: {
    get: (name: string) => any;
    getComponent: (name: string) => any;
    register: (definition: any) => void;
    setState?: (id: string, state: Record<string, any>) => boolean;
    getState?: (id: string) => ComponentState;
    toggleState?: (id: string, key: string) => boolean;
  };
  // State management methods
  initState: (initial: Record<string, any>) => void;
  getState: (key: string) => DataValue;
  setState: (newState: Record<string, any>) => void;
  toggleState: (key: string) => void;
}

export interface ExternalComponent {
  /**
   * What the registry sorts on: `registry.ts` reads `type === 'external'` to decide
   * that this belongs in the components map rather than the renderers map.
   *
   * It read it through an `as any` and the interface did not declare it, so the only
   * way to write one down was to cast — which is how a test came to say
   * `type: 'external' as any` inside a typed literal. Found when the tests were
   * type-checked for the first time.
   */
  type?: 'external';
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

