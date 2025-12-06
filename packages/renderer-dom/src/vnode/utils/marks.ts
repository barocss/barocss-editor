/**
 * Text mark and run types for VNode text processing
 * 
 * IMPORTANT: Uses 'stype' to match IMark interface (not 'type')
 */

export type TextMark = { stype: string; range?: [number, number]; attrs?: Record<string, any> };

export type TextRun = {
  start: number;
  end: number;
  text: string;
  classes: string[];
  styles?: Record<string, any>;
  types?: string[];
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function splitTextByMarks(text: string, marks: TextMark[] | undefined | null): TextRun[] {
  const len = text?.length ?? 0;
  if (!text || len === 0) return [];
  const ms = Array.isArray(marks) ? marks : [];

  // Apply marks without range to entire text
  const globalMarks = ms.filter(m => m && !m.range);
  const rangedMarks = ms.filter(m => m && m.range);

  // Collect boundaries
  const boundaries = new Set<number>();
  boundaries.add(0);
  boundaries.add(len);
  for (const m of rangedMarks) {
    if (!m || !m.range) continue;
    const s = clamp(m.range[0] ?? 0, 0, len);
    const e = clamp(m.range[1] ?? 0, 0, len);
    if (e <= s) continue;
    boundaries.add(s);
    boundaries.add(e);
  }
  const points = Array.from(boundaries.values()).sort((a, b) => a - b);

  const runs: TextRun[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    const slice = text.slice(start, end);
    const classes: string[] = [];
    const types: string[] = [];
    
    // Global marks (no range) - apply to entire text
    // IMPORTANT: do not automatically add mark-{stype} class
    // Only use className explicitly defined by user
    for (const m of globalMarks) {
      const markStype = (m as any).stype;
      if (markStype) {
        // classes.push(`mark-${markStype}`); // Auto-add removed
        types.push(markStype);
      }
    }
    
    // Ranged marks - apply only if they overlap with this run
    // IMPORTANT: do not automatically add mark-{stype} class
    // Only use className explicitly defined by user
    for (const m of rangedMarks) {
      const s = clamp(m.range[0] ?? 0, 0, len);
      const e = clamp(m.range[1] ?? 0, 0, len);
      if (e <= s) continue;
      if (s < end && e > start) {
        const markStype = (m as any).stype;
        if (markStype) {
          // classes.push(`mark-${markStype}`); // 자동 추가 제거
          types.push(markStype);
        }
      }
    }
    const run = { start, end, text: slice, classes: Array.from(new Set(classes)), types: Array.from(new Set(types)) };
    runs.push(run);
  }
  
  return runs;
}


