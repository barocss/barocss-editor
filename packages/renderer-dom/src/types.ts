/**
 * What this package adds to the shared vocabulary — and nothing that is already in it.
 *
 * Sixteen names were declared here *and* in `@barocss/dsl`, which this package already depends on.
 * Eight of them were the same text twice; the other eight had drifted, and structural typing is
 * exactly why nobody found out: a `ComponentInstance` built against this file's shape is assignable
 * to the DSL's in most positions, so the compiler stayed quiet while the two said different things
 * about the same object.
 *
 * The fix is not a check. A re-export cannot drift: there is one declaration, and it is the DSL's.
 * Where this package's copy was the truer one — it is the producer of both `ComponentInstance` and
 * `ComponentContext` — the truth moved *down* into `@barocss/dsl` rather than being kept up here.
 *
 * So the rule for this file: a type belongs here only if it is about **reconciling into a DOM**,
 * which the DSL has no word for. Everything about templates, components and their contexts comes
 * from the DSL.
 */
import type { VNode } from './vnode/types';

// DataStore type (minimal interface for type safety)
export interface DataStore {
  getNode(sid: string): any | undefined;
}

/** The DSL's vocabulary, passed through unchanged. One declaration, in `@barocss/dsl`. */
export type {
  AllTagNames,
  DynamicElementAttributes,
  ElementTemplate,
  ComponentTemplate,
  SlotTemplate,
  DataTemplate,
  ConditionalTemplate,
  EachTemplate,
  PortalTemplate,
  RendererDefinition,
  RendererTemplate,
  ModelData,
  RenderEnv,
  // …and the sixteen this file used to declare a second time.
  ClassNameType,
  ElementAttributes,
  DataValue,
  ComponentProps,
  ComponentState,
  ExternalComponent,
  ElementTag,
  ElementTagGetter,
  AttrBinding,
  ComponentInstance,
  SimpleComponent,
  ContextualComponent,
  ComponentContext,
  ComponentStateHandle,
  RenderTemplate,
  ElementChild,
  TNodeType
} from '@barocss/dsl';

export type { Decorator } from './vnode/decorator';

// ReconcileContext interface
export interface ReconcileContext {
  data?: Record<string, any>;
  registry?: any;
  getComponent?: (name: string) => any;
  hooks?: Record<string, any>;
  debug?: boolean;
  path?: number[];
  parent?: HTMLElement;
  vnodeToDOM?: (vnode: VNode, parent?: Element | null, data?: any) => Node;
  // Optional flags controlling reconcile behavior
  excludePortals?: boolean; // when true, skip portal finalize in main tree
  noDetach?: boolean; // when true, avoid physical detach in key reconciler
  preserveContainerOnNullNext?: boolean; // when true, do not clear container when nextVNode is null
  reconcile?: (prevVNode: VNode | null, nextVNode: VNode | null, container: HTMLElement, context: ReconcileContext) => void;
  builder?: any;
  onError?: (error: ReconcileError) => void;
  // DataStore access for getting model data by sid
  dataStore?: DataStore;
}

// ReconcileError interface
export interface ReconcileError {
  message: string;
  stack?: string;
  vnode?: VNode;
  context?: ReconcileContext;
}

// ThreeElement: Three.js DSL element
export interface ThreeElement {
  type: string;
  props: Record<string, any>;
  children?: ThreeElement[];
}
