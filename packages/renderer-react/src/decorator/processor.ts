/**
 * Pure decorator processing: range extraction, node matching, text splitting.
 * No React/VNode; used by build-to-react to produce decorator React nodes.
 */
import type { Decorator, DecoratorTextRun, CategorizedDecorators } from './types';

export function getDecoratorRange(d: Decorator): { start?: number; end?: number } {
  if (!d.target) return {};
  if ('sid' in d.target) {
    return { start: d.target.startOffset, end: d.target.endOffset };
  }
  return { start: d.target.startOffset, end: d.target.endOffset };
}

export function findDecoratorsForNode(sid: string | undefined, decorators: Decorator[]): Decorator[] {
  if (!sid || !decorators?.length) return [];
  return decorators.filter((d) => {
    if (!d?.target) return false;
    if ('sid' in d.target) return d.target.sid === sid;
    return d.target.startSid === sid || d.target.endSid === sid;
  });
}

export function findInlineDecorators(sid: string | undefined, decorators: Decorator[]): Decorator[] {
  if (!sid || !decorators?.length) return [];
  return decorators.filter((d) => {
    if (d.category !== 'inline' || !d.target) return false;
    if ('sid' in d.target) return d.target.sid === sid;
    return d.target.startSid === sid || d.target.endSid === sid;
  });
}

export function categorizeDecorators(decorators: Decorator[]): CategorizedDecorators {
  const categorized: CategorizedDecorators = { block: [], layer: [], inline: [] };
  for (const d of decorators) {
    if (!d?.category) continue;
    const cat = d.category as keyof CategorizedDecorators;
    if (Array.isArray(categorized[cat])) categorized[cat].push(d);
  }
  return categorized;
}

export function splitTextByDecorators(text: string, decorators: Decorator[]): DecoratorTextRun[] {
  const len = text.length;
  if (len === 0 || decorators.length === 0) {
    return [{ text, start: 0, end: len }];
  }

  const boundaries = new Set<number>([0, len]);
  const decoratorIndex = new Map<number, Decorator[]>();

  for (const d of decorators) {
    if (d.category !== 'inline') continue;
    const range = getDecoratorRange(d);
    if (range.start === undefined || range.end === undefined) continue;
    const s = Math.max(0, Math.min(range.start, len));
    const e = Math.max(s, Math.min(range.end, len));
    if (e <= s) continue;
    boundaries.add(s);
    boundaries.add(e);
    if (!decoratorIndex.has(s)) decoratorIndex.set(s, []);
    decoratorIndex.get(s)!.push(d);
  }

  const points = Array.from(boundaries).sort((a, b) => a - b);
  const runs: DecoratorTextRun[] = [];
  const sortedStarts = Array.from(decoratorIndex.keys()).sort((a, b) => a - b);

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    const slice = text.slice(start, end);
    const matchingDecorators: Decorator[] = [];
    for (const decoratorStart of sortedStarts) {
      if (decoratorStart > start) break;
      const candidates = decoratorIndex.get(decoratorStart) ?? [];
      for (const d of candidates) {
        const r = getDecoratorRange(d);
        if (r.start === undefined || r.end === undefined) continue;
        if (r.start <= start && r.end >= end) matchingDecorators.push(d);
      }
    }
    if (matchingDecorators.length === 0) {
      const found = decorators.find((d) => {
        if (d.category !== 'inline') return false;
        const r = getDecoratorRange(d);
        return r.start !== undefined && r.end !== undefined && r.start <= start && r.end >= end;
      });
      if (found) matchingDecorators.push(found);
    }
    const decorator = matchingDecorators[0];
    const decoratorsArray = matchingDecorators.length > 1 ? matchingDecorators : undefined;
    runs.push({ text: slice, decorator, decorators: decoratorsArray, start, end });
  }
  return runs;
}

/** Convert decorator ranges from full text to markRun-relative. */
export function convertDecoratorRangesToMarkRunRelative(
  inlineDecorators: Decorator[],
  markRun: { start: number; end: number; text: string }
): Decorator[] {
  return inlineDecorators
    .map((d) => {
      const range = getDecoratorRange(d);
      if (range.start == null || range.end == null) return d;
      if (range.end <= markRun.start || range.start >= markRun.end) return null;
      const relativeStart = Math.max(0, range.start - markRun.start);
      const relativeEnd = Math.min(markRun.text.length, range.end - markRun.start);
      return {
        ...d,
        target: { ...d.target, startOffset: relativeStart, endOffset: relativeEnd } as Decorator['target'],
      };
    })
    .filter((d): d is Decorator => d !== null);
}
