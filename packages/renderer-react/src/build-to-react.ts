/**
 * DSL → React: interpret RendererRegistry + ModelData and produce ReactNode directly.
 * No VNode; same DSL templates (element/slot/data) as renderer-dom, output is React.
 */
import * as React from 'react';
import type {
  RendererRegistry,
  ModelData,
  ElementTemplate,
  ElementChild,
  ComponentTemplate,
  ContextualComponent,
  ComponentContext,
} from '@barocss/dsl';
import { splitTextByMarks } from './utils/marks';
import type { TextRun } from './utils/marks';

const { createElement } = React;
type ReactNode = React.ReactNode;

function getDataValue(data: ModelData, path: string): unknown {
  return path.split('.').reduce((obj: any, key) => obj?.[key], data);
}

function isElementTemplate(c: unknown): c is ElementTemplate {
  return !!c && typeof c === 'object' && (c as any).type === 'element';
}

function isSlotTemplate(c: unknown): c is { type: 'slot'; name: string } {
  return !!c && typeof c === 'object' && (c as any).type === 'slot';
}

function isDataTemplate(c: unknown): c is { type: 'data'; path?: string; getter?: (d: ModelData) => unknown; defaultValue?: unknown } {
  return !!c && typeof c === 'object' && (c as any).type === 'data';
}

function isComponentTemplate(c: unknown): c is ComponentTemplate {
  return !!c && typeof c === 'object' && (c as any).type === 'component';
}

function isAttrBinding(value: unknown): value is { __attrData: true; path: string; defaultValue?: unknown } {
  return !!value && typeof value === 'object' && (value as any).__attrData === true;
}

function resolveTag(tag: string | ((data: ModelData) => string), data: ModelData): string {
  return typeof tag === 'function' ? tag(data) : tag;
}

function resolveAttrValue(value: unknown, data: ModelData): unknown {
  if (typeof value === 'function') {
    return (value as (d: ModelData) => unknown)(data);
  }
  if (isAttrBinding(value)) {
    const v = getDataValue(data, value.path);
    return v !== undefined && v !== null ? v : value.defaultValue;
  }
  if (isDataTemplate(value)) {
    const v = value.getter ? value.getter(data) : (value.path ? getDataValue(data, value.path) : undefined);
    return v !== undefined && v !== null ? v : value.defaultValue;
  }
  return value;
}

function resolveStyleObject(styleValue: Record<string, unknown>, data: ModelData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(styleValue)) {
    const resolved = resolveAttrValue(v, data);
    if (resolved !== undefined && resolved !== null) {
      (out as any)[k] = resolved;
    }
  }
  return out;
}

function resolveAttrs(attrs: Record<string, unknown> | undefined, data: ModelData): Record<string, unknown> {
  if (!attrs) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const resolved = resolveAttrValue(value, data);
    if (resolved !== undefined && resolved !== null) {
      if (key === 'className' || key === 'class') {
        out.className = typeof resolved === 'object' && resolved !== null && !Array.isArray(resolved)
          ? Object.entries(resolved as Record<string, boolean>)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(' ')
          : Array.isArray(resolved)
            ? resolved.filter(Boolean).join(' ')
            : String(resolved);
      } else if (key === 'style' && typeof resolved === 'object' && resolved !== null && !Array.isArray(resolved)) {
        (out as any).style = resolveStyleObject(resolved as Record<string, unknown>, data);
      } else {
        (out as any)[key] = resolved;
      }
    }
  }
  return out;
}

function flattenChildren(children: ElementChild[], data: ModelData): ElementChild[] {
  const out: ElementChild[] = [];
  for (const c of children) {
    if (Array.isArray(c)) {
      out.push(...flattenChildren(c, data));
    } else if (typeof c === 'function') {
      const result = (c as (d: ModelData) => ElementChild | ElementChild[])(data);
      if (Array.isArray(result)) {
        out.push(...flattenChildren(result, data));
      } else {
        out.push(result);
      }
    } else {
      out.push(c);
    }
  }
  return out;
}

/**
 * Build ReactNode from (registry, nodeType, model).
 * Uses registry.getComponent(nodeType) to get template; resolves element/slot/data to React.
 */
export function buildToReact(
  registry: RendererRegistry,
  nodeType: string,
  model: ModelData,
  options?: { contextStub?: Partial<ComponentContext> }
): ReactNode {
  const component = registry.getComponent?.(nodeType);
  if (!component) {
    throw new Error(`[renderer-react] No renderer for node type '${nodeType}'. Register with define().`);
  }

  if ((component as any).managesDOM === true) {
    return createElement('div', {
      key: (model as any).sid,
      'data-bc-sid': (model as any).sid,
      'data-bc-stype': nodeType,
      className: 'react-renderer-external-placeholder',
    }, 'Component');
  }

  let template = (component as any).template;
  if (typeof template === 'function') {
    const ctx = options?.contextStub ?? makeMinimalContext(registry);
    template = (template as ContextualComponent)({}, model, ctx as ComponentContext);
  }

  if (isElementTemplate(template)) {
    return buildElement(registry, template, model);
  }
  if (isComponentTemplate(template) && typeof template.component === 'function') {
    const ctx = options?.contextStub ?? makeMinimalContext(registry);
    const resolved = template.component({}, model, ctx as ComponentContext);
    if (isElementTemplate(resolved)) {
      return buildElement(registry, resolved, model);
    }
  }
  return null;
}

function makeMinimalContext(registry: RendererRegistry): Partial<ComponentContext> {
  return {
    registry: {
      get: () => undefined,
      getComponent: (name: string) => registry.getComponent?.(name),
      register: () => {},
      setState: () => false,
      getState: () => ({}),
      toggleState: () => false,
    },
    getState: () => undefined,
    setState: () => {},
    toggleState: () => {},
    initState: () => {},
  };
}

function buildElement(registry: RendererRegistry, template: ElementTemplate, model: ModelData): ReactNode {
  const tag = resolveTag(template.tag as string | ((d: ModelData) => string), model);
  const attrs = resolveAttrs(template.attributes as Record<string, unknown>, model);
  const children = processChildren(registry, template.children ?? [], model);

  const props: Record<string, unknown> = {
    ...attrs,
    key: (model as any).sid,
    'data-bc-sid': (model as any).sid,
    'data-bc-stype': (model as any).stype,
  };

  return createElement(tag, props, ...children);
}

/** Resolve mark template to ElementTemplate (defineMark stores as ComponentTemplate that returns element). */
function resolveMarkTemplate(registry: RendererRegistry, markTmpl: unknown, markModel: ModelData): ElementTemplate | null {
  if (markTmpl && isElementTemplate(markTmpl)) return markTmpl as ElementTemplate;
  if (markTmpl && isComponentTemplate(markTmpl)) {
    const comp = (markTmpl as ComponentTemplate).component;
    if (typeof comp === 'function') {
      const ctx = makeMinimalContext(registry);
      const resolved = comp({}, markModel, ctx as ComponentContext);
      if (resolved && isElementTemplate(resolved)) return resolved as ElementTemplate;
    }
  }
  return null;
}

/** Build a React node for a single text run. Only wrap with mark elements when the mark is registered with defineMark (getMarkRenderer returns a template); otherwise render as plain text. */
function buildMarkRunToReact(
  registry: RendererRegistry,
  run: TextRun,
  model: ModelData,
  keyBase: string
): ReactNode {
  const markModel: ModelData = { text: run.text, run, model } as any;
  let inner: ReactNode = run.text;

  const types = run.types ?? [];
  for (let i = types.length - 1; i >= 0; i--) {
    const markType = types[i];
    const markTmpl = registry.getMarkRenderer?.(markType);
    const elementTmpl = markTmpl ? resolveMarkTemplate(registry, markTmpl, markModel) : null;
    if (!elementTmpl) continue;
    const key = `${keyBase}_${markType}_${i}`;
    const tag = resolveTag(elementTmpl.tag as string | ((d: ModelData) => string), markModel);
    const attrs = resolveAttrs(elementTmpl.attributes as Record<string, unknown>, markModel);
    inner = createElement(tag, { ...attrs, key }, inner);
  }
  return inner;
}

function processChildren(registry: RendererRegistry, children: ElementChild[], model: ModelData): ReactNode[] {
  const flat = flattenChildren(children, model);
  const out: ReactNode[] = [];

  for (const c of flat) {
    if (typeof c === 'string' || typeof c === 'number') {
      out.push(c);
      continue;
    }
    if (!c || typeof c !== 'object') continue;

    const t = (c as any).type;
    if (t === 'slot') {
      const content = (model as any).content;
      if (Array.isArray(content)) {
        for (const childModel of content) {
          const stype = (childModel as any).stype;
          if (stype) {
            out.push(buildToReact(registry, stype, childModel as ModelData));
          }
        }
      }
      continue;
    }
    if (t === 'data') {
      const dt = c as { path?: string; getter?: (d: ModelData) => unknown; defaultValue?: unknown };
      const value = dt.getter ? dt.getter(model) : (dt.path ? getDataValue(model, dt.path) : undefined);
      const v = value !== undefined && value !== null ? value : dt.defaultValue;
      const text = v !== undefined && v !== null ? String(v) : '';
      const marks = (model as any).marks as Array<{ stype: string; range?: [number, number] }> | undefined;
      if (Array.isArray(marks) && marks.length > 0 && (dt.path === 'text' || (dt.path == null && typeof v === 'string'))) {
        const runs = splitTextByMarks(text, marks);
        const sid = (model as any).sid ?? '';
        for (let ri = 0; ri < runs.length; ri++) {
          const run = runs[ri];
          if (!run.types || run.types.length === 0) {
            out.push(run.text);
          } else {
            out.push(buildMarkRunToReact(registry, run, model, `${sid}_r${ri}`));
          }
        }
      } else {
        out.push(text);
      }
      continue;
    }
    if (t === 'element') {
      out.push(buildElement(registry, c as ElementTemplate, model));
      continue;
    }
  }

  return out;
}
