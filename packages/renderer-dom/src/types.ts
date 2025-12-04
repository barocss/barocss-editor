import type { VNode } from './vnode/types';
import type {
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
  ModelData
} from '@barocss/dsl';
// DataStore type (minimal interface for type safety)
export interface DataStore {
  getNode(sid: string): any | undefined;
}
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
  ModelData
} from '@barocss/dsl';
import type { Decorator } from './vnode/decorator';
import type { BaseComponentState } from './state/base-component-state';

export type ClassNameType = string | string[] | Record<string, boolean> | Array<string | Record<string, boolean> | Array<string | Record<string, boolean>>>;

// Enhanced type-safe element attributes
export type ElementAttributes<T = string> = {
  // Keep backward compatibility
  className?: ClassNameType | ((data: any) => ClassNameType);
  style?: Record<string, any> | ((data: any) => Record<string, any>);
  id?: string | ((data: any) => string);
  
  // Allow custom data attributes
  [K: `data-${string}`]: any;
  // Allow custom aria attributes
  [K: `aria-${string}`]: any;
  // Allow custom event handlers
  [K: `on${string}`]: any;
  
  // Fallback for any other attributes
  [key: string]: any;
};

// More specific types for better type safety
export type DataValue = any;
// ModelData re-exported from @barocss/dsl
export type ComponentProps = Record<string, any>;
export type ComponentState = Record<string, any>;


// EventHandler removed - all events are handled via contentEditable surface

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

// ExternalComponent interface
export interface ExternalComponent {
  template?: ContextualComponent;
  mount: (props: Record<string, any>, container: HTMLElement) => HTMLElement;
  update?: (instance: ComponentInstance, prevProps: Record<string, any>, nextProps: Record<string, any>) => void;
  unmount: (instance: ComponentInstance) => void;
  managesDOM?: boolean;
}

export type ElementTagGetter = (data: Record<string, any>) => string;
export type ElementTag = string | ElementTagGetter;

export interface AttrBinding {
  __attrData: true;
  path: string;
  defaultValue?: any;
  formatter?: (value: any) => string | number | boolean | null | undefined;
}

// Use ElementTemplate/ComponentTemplate from @barocss/dsl

// Component instance
export interface ComponentInstance {
  id: string;
  element: HTMLElement | null;
  component: ExternalComponent;
  state: ComponentState;
  props: ComponentProps;      // 순수 props (stype/sid/type 제외)
  vnode?: VNode; 
  template?: ContextualComponent; 
  parentElement?: HTMLElement; 
  renderer?: any;
  mounted?: boolean;
  // State management method
  setState?: (newState: Record<string, any>) => void;
  // Get model from dataStore by sid
  getModel: () => ModelData | undefined;
}

// Simple function component type (legacy)
export type SimpleComponent = (props: ComponentProps) => ElementTemplate;

// Function component with context (preferred)
export type ContextualComponent = (props: ComponentProps, model: ModelData, context: ComponentContext) => ElementTemplate | ComponentTemplate;

// Component context
export interface ComponentContext {
  id: string;
  state: ComponentState;
  props: ComponentProps;      // 순수 props (stype/sid/type 제외)
  model: ModelData;           // 원본 모델 데이터 (stype/sid 포함)
  registry: any;
  // BaseComponentState instance (for direct state management)
  // context.instance는 componentManager.getInstance(sid)로 가져온 BaseComponentState 인스턴스
  instance?: BaseComponentState;
  // State management methods
  initState: (initial: Record<string, any>) => void;
  getState: (key: string) => DataValue;
  setState: (newState: Record<string, any>) => void;
  toggleState: (key: string) => void;
}

// External component interface

// Unified template union for element/component branches used by renderer/registry
export type RenderTemplate = ElementTemplate | ComponentTemplate | PortalTemplate;

export type ElementChild = any;

// RendererDefinition/RendererTemplate are re-exported from @barocss/dsl

export type TNodeType = string;

// VNode: virtual node used by reconcile
// ThreeElement: Three.js DSL element
export interface ThreeElement {
  type: string;
  props: Record<string, any>;
  children?: ThreeElement[];
}

