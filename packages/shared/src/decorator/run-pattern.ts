/**
 * Run pattern configs against (nodeId, text) or model; return Decorator[] (shared).
 */

import type { Decorator } from './types.js';
import type { PatternDecoratorConfig } from './pattern-decorator-config-manager.js';

export function runPatternConfigs(
  nodeId: string,
  text: string,
  configs: PatternDecoratorConfig[]
): Decorator[] {
  if (!text || !nodeId || configs.length === 0) {
    return [];
  }

  const sorted = [...configs].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  const decorators: Decorator[] = [];

  for (const config of sorted) {
    if (config.enabled === false) continue;

    let matches: Array<{
      match: string;
      index: number;
      groups?: RegExpMatchArray['groups'];
      [key: number]: string | undefined;
    }>;

    if (typeof config.pattern === 'function') {
      matches = config.pattern(text);
    } else {
      const regexMatches = Array.from(text.matchAll(config.pattern));
      matches = regexMatches.map((match) => ({
        match: match[0],
        index: match.index ?? -1,
        groups: match.groups,
        ...Object.fromEntries(
          Array.from({ length: match.length }, (_, i) => [i, match[i]])
        ),
      }));
    }

    for (const match of matches) {
      if (match.index === undefined || match.index < 0) continue;

      const startOffset = match.index;
      const endOffset = startOffset + match.match.length;

      const regexMatchArray = {
        0: match.match,
        index: match.index,
        input: text,
        groups: match.groups,
        length: 1,
        ...Object.fromEntries(
          Object.entries(match).filter(([key]) => !isNaN(Number(key)))
        ),
      } as RegExpMatchArray;

      const extractedData = config.extractData(regexMatchArray);
      const decoratorResult = config.createDecorator(
        nodeId,
        startOffset,
        endOffset,
        extractedData
      );

      const arr = Array.isArray(decoratorResult) ? decoratorResult : [decoratorResult];
      for (const d of arr) {
        decorators.push({
          sid: d.sid,
          stype: config.stype,
          category: d.category ?? config.category,
          layerTarget: d.layerTarget,
          target: d.target,
          data: d.data ?? {},
        });
      }
    }
  }

  return decorators;
}

/** Model node shape for traversal (content or children, sid or id). */
export type PatternModelLike = Record<string, unknown> & {
  sid?: string;
  id?: string;
  text?: string;
  content?: PatternModelLike[];
  children?: PatternModelLike[];
};

export function runPatternFromModel(
  model: PatternModelLike | null,
  configs: PatternDecoratorConfig[]
): Decorator[] {
  if (!model || configs.length === 0) return [];
  const out: Decorator[] = [];

  function traverse(node: PatternModelLike): void {
    const nodeId = (node.sid ?? node.id) as string | undefined;
    const text = typeof node.text === 'string' ? node.text : undefined;
    if (nodeId && text) {
      out.push(...runPatternConfigs(nodeId, text, configs));
    }
    const children = node.content ?? node.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child === 'object') traverse(child as PatternModelLike);
      }
    }
  }

  traverse(model);
  return out;
}
