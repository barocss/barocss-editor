/**
 * DSL → React: interpret RendererRegistry + ModelData and produce ReactNode directly.
 * No VNode; same DSL templates (element/slot/data) as renderer-dom, output is React.
 * Decorators (inline/block/layer) are rendered in the same tree as content, matching renderer-dom.
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
import type { Decorator } from './decorator/types';
import {
  findDecoratorsForNode,
  findInlineDecorators,
  categorizeDecorators,
  splitTextByDecorators,
  convertDecoratorRangesToMarkRunRelative,
} from './decorator/processor';

const { createElement, cloneElement } = React;
type ReactNode = React.ReactNode;

export interface BuildOptions {
  contextStub?: Partial<ComponentContext>;
  decorators?: Decorator[];
  sid?: string;
}

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
 * Uses registry.get(nodeType) to get definition (define() stores in _renderers); resolves element/slot/data to React.
 * When options.decorators is provided, inline/block/layer decorators are rendered in the same tree as content (parity with renderer-dom).
 */
export function buildToReact(
  registry: RendererRegistry,
  nodeType: string,
  model: ModelData,
  options?: BuildOptions
): ReactNode {
  const def = (registry as any).get?.(nodeType);
  if (!def || !def.template) {
    throw new Error(`[renderer-react] No renderer for node type '${nodeType}'. Register with define().`);
  }

  const templateOrComponent = def.template;
  if ((templateOrComponent as any)?.managesDOM === true) {
    return createElement('div', {
      key: (model as any).sid,
      'data-bc-sid': (model as any).sid,
      'data-bc-stype': nodeType,
      className: 'react-renderer-external-placeholder',
    }, 'Component');
  }

  const opts: BuildOptions = { ...options, sid: (model as any).sid };

  let template = templateOrComponent;
  if (typeof template === 'function') {
    const ctx = opts.contextStub ?? makeMinimalContext(registry);
    template = (template as ContextualComponent)({}, model, ctx as ComponentContext);
  }

  if (isElementTemplate(template)) {
    return buildElement(registry, template, model, opts);
  }
  if (isComponentTemplate(template) && typeof template.component === 'function') {
    const ctx = opts.contextStub ?? makeMinimalContext(registry);
    const resolved = template.component({}, model, ctx as ComponentContext);
    if (isElementTemplate(resolved)) {
      return buildElement(registry, resolved, model, opts);
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

function buildElement(
  registry: RendererRegistry,
  template: ElementTemplate,
  model: ModelData,
  options?: BuildOptions
): ReactNode {
  const tag = resolveTag(template.tag as string | ((d: ModelData) => string), model);
  const attrs = resolveAttrs(template.attributes as Record<string, unknown>, model);
  const children = processChildren(registry, template.children ?? [], model, options);

  const props: Record<string, unknown> = {
    ...attrs,
    key: (model as any).sid,
    'data-bc-sid': (model as any).sid,
    'data-bc-stype': (model as any).stype,
  };

  return createElement(tag, props, ...children);
}

/** Build a single decorator as ReactNode. Template from registry.get(decorator.stype) or getComponent(decorator.stype). */
function buildDecoratorToReact(registry: RendererRegistry, decorator: Decorator): ReactNode {
  const def = (registry as any).get?.(decorator.stype);
  const comp = (registry as any).getComponent?.(decorator.stype);
  const templateOrComponent = def?.template ?? comp;
  if (!templateOrComponent) {
    return createElement('div', {
      key: decorator.sid,
      'data-decorator-sid': decorator.sid,
      'data-decorator-stype': decorator.stype,
      'data-decorator-category': decorator.category,
      'data-decorator-missing-renderer': decorator.stype,
    });
  }
  const data: ModelData = (decorator.data ?? {}) as ModelData;
  let template = templateOrComponent;
  if (typeof template === 'function') {
    const ctx = makeMinimalContext(registry);
    template = (template as ContextualComponent)({}, data, ctx as ComponentContext);
  }
  if (!isElementTemplate(template)) {
    return createElement('div', {
      key: decorator.sid,
      'data-decorator-sid': decorator.sid,
      'data-decorator-stype': decorator.stype,
      'data-decorator-category': decorator.category,
    });
  }
  const node = buildElement(registry, template, data, { decorators: [] });
  const position =
    decorator.position ?? (decorator.category !== 'inline' ? 'after' : undefined);
  const decoratorProps: Record<string, unknown> = {
    key: decorator.sid,
    'data-decorator-sid': decorator.sid,
    'data-decorator-stype': decorator.stype,
    'data-decorator-category': decorator.category,
  };
  if (position) decoratorProps['data-decorator-position'] = position;
  if (React.isValidElement(node) && typeof node === 'object' && node.props) {
    return cloneElement(node as React.ReactElement<Record<string, unknown>>, decoratorProps);
  }
  return createElement('span', decoratorProps, node);
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

function processChildren(
  registry: RendererRegistry,
  children: ElementChild[],
  model: ModelData,
  options?: BuildOptions
): ReactNode[] {
  const flat = flattenChildren(children, model);
  const out: ReactNode[] = [];
  const decorators = options?.decorators ?? [];
  const sid = options?.sid ?? (model as any).sid;

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
          const childSid = (childModel as any).sid;
          if (stype) {
            const childNode = buildToReact(registry, stype, childModel as ModelData, {
              ...options,
              decorators,
            });
            if (childSid && decorators.length > 0) {
              const childDecorators = findDecoratorsForNode(childSid, decorators);
              const categorized = categorizeDecorators(childDecorators);
              const blockLayer = [...categorized.block, ...categorized.layer];
              if (blockLayer.length > 0) {
                const beforeNodes: ReactNode[] = [];
                const afterNodes: ReactNode[] = [];
                for (const d of blockLayer) {
                  const node = buildDecoratorToReact(registry, d);
                  const pos = d.position ?? 'after';
                  if (pos === 'before') beforeNodes.push(node);
                  else afterNodes.push(node);
                }
                out.push(...beforeNodes, childNode, ...afterNodes);
              } else {
                out.push(childNode);
              }
            } else {
              out.push(childNode);
            }
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
      const isTextData = dt.path === 'text' || (dt.path == null && typeof v === 'string');
      const inlineDecorators = sid ? findInlineDecorators(sid, decorators) : [];
      if (
        isTextData &&
        (Array.isArray(marks) && marks.length > 0 || inlineDecorators.length > 0)
      ) {
        const markRuns =
          Array.isArray(marks) && marks.length > 0
            ? splitTextByMarks(text, marks)
            : [{ start: 0, end: text.length, text, types: [] as string[] }];
        const sidBase = (model as any).sid ?? '';
        for (let ri = 0; ri < markRuns.length; ri++) {
          const markRun = markRuns[ri];
          const relativeDecorators = convertDecoratorRangesToMarkRunRelative(
            inlineDecorators,
            { start: markRun.start, end: markRun.end, text: markRun.text }
          );
          const decoratorRuns = splitTextByDecorators(markRun.text, relativeDecorators);
          for (const dr of decoratorRuns) {
            if (!dr.text) continue;
            const inner =
              markRun.types?.length
                ? buildMarkRunToReact(
                    registry,
                    { ...markRun, text: dr.text, start: dr.start, end: dr.end },
                    model,
                    `${sidBase}_r${ri}`
                  )
                : dr.text;
            const toProcess = dr.decorators ?? (dr.decorator ? [dr.decorator] : []);
            if (toProcess.length === 0) {
              out.push(inner);
              continue;
            }
            const before = toProcess.filter((d) => d.category === 'inline' && d.position === 'before');
            const after = toProcess.filter((d) => d.category === 'inline' && d.position === 'after');
            const overlay = toProcess.filter(
              (d) => !(d.category === 'inline' && (d.position === 'before' || d.position === 'after'))
            );
            for (const d of before) out.push(buildDecoratorToReact(registry, d));
            let wrapped: ReactNode = inner;
            for (const d of overlay) {
              const decNode = buildDecoratorToReact(registry, d);
              wrapped = React.isValidElement(decNode)
                ? React.cloneElement(decNode as React.ReactElement<{ children?: ReactNode }>, {}, wrapped)
                : createElement('span', { key: d.sid, 'data-decorator-sid': d.sid }, wrapped);
            }
            out.push(wrapped);
            for (const d of after) out.push(buildDecoratorToReact(registry, d));
          }
        }
      } else if (Array.isArray(marks) && marks.length > 0 && isTextData) {
        const runs = splitTextByMarks(text, marks);
        const sidBase = (model as any).sid ?? '';
        for (let ri = 0; ri < runs.length; ri++) {
          const run = runs[ri];
          if (!run.types || run.types.length === 0) out.push(run.text);
          else out.push(buildMarkRunToReact(registry, run, model, `${sidBase}_r${ri}`));
        }
      } else {
        out.push(text);
      }
      continue;
    }
    if (t === 'element') {
      out.push(buildElement(registry, c as ElementTemplate, model, options));
      continue;
    }
  }

  return out;
}

/** Build overlay layer content from a list of decorators (for decorator/selection/context/custom layers). */
export function buildOverlayDecorators(registry: RendererRegistry, decorators: Decorator[]): ReactNode {
  if (!decorators?.length) return null;
  return createElement(React.Fragment, null, ...decorators.map((d) => buildDecoratorToReact(registry, d)));
}
