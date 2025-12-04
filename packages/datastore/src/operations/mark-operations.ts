import type { IMark } from '../types';
import type { DataStore } from '../data-store';

/**
 * Mark Management 연산들
 * 
 * 마크의 정규화, 병합, 제거 등의 마크 관리 기능들을 담당합니다.
 */
export class MarkOperations {
  constructor(private dataStore: DataStore) {}

  /**
   * 노드의 마크를 정규화합니다.
   *
   * Spec:
   * - If node has no marks or text length is 0, persist marks: [] (explicit empty) via update path.
   * - Otherwise:
   *   1) Assign full-range to marks missing range.
   *   2) Clamp ranges to [0, textLength].
   *   3) Drop empty/invalid ranges.
   *   4) Remove duplicates by (type, attrs, range).
   *   5) Merge overlapping marks with identical (type, attrs) into minimal spans, then sort by start.
   * - Persist through updateNode to honor overlay and emit operations.
   */
  normalizeMarks(nodeId: string): void {
    const node = this.dataStore.getNode(nodeId);
    if (!node) return;
    if (!node.marks || node.marks.length === 0) {
      // Explicitly persist empty marks for normalize() path per tests
      this.dataStore.updateNode(node.sid!, { marks: [] }, false);
      return;
    }

    const textLength = node.text?.length || 0;
    if (textLength === 0) {
      // Clear marks via update path to emit operation and honor overlay
      this.dataStore.updateNode(node.sid!, { marks: [] }, false);
      return;
    }

    // 1. Range가 없는 mark에 전체 범위 할당
    const marksWithRange = node.marks.map(mark => {
      if (!mark.range) {
        return { ...mark, range: [0, textLength] as [number, number] };
      }
      return mark;
    });

    // 2. 범위 정규화 (clamp to [0, textLength])
    const normalizedMarks = marksWithRange.map(mark => ({
      ...mark,
      range: [
        Math.max(0, Math.min(mark.range![0], textLength)),
        Math.max(0, Math.min(mark.range![1], textLength))
      ] as [number, number]
    }));

    // 3. 빈 범위 마크 제거
    const validMarks = normalizedMarks.filter(mark => 
      mark.range![0] < mark.range![1]
    );

    // 4. 중복 마크 제거
    const uniqueMarks = this.removeDuplicateMarks(validMarks);

    // 5. 겹치는 마크 병합
    const mergedMarks = this.mergeOverlappingMarks(uniqueMarks);

    // 6. 마크 정렬
    const sortedMarks = mergedMarks.sort((a, b) => a.range![0] - b.range![0]);

    // Persist via update path to emit operation and honor overlay, then reflect locally
    this.dataStore.updateNode(node.sid!, { marks: sortedMarks }, false);
    const local = this.dataStore.getNode(node.sid!);
    if (local) (local as any).marks = sortedMarks;
  }

  /**
   * 중복 마크를 제거합니다.
   */
  private removeDuplicateMarks(marks: IMark[]): IMark[] {
    const seen = new Set<string>();
    return marks.filter(mark => {
      // Range가 없는 mark는 stype과 attrs만으로 중복 체크
      const key = mark.range 
        ? `${mark.stype}:${JSON.stringify(mark.attrs || {})}:${mark.range[0]}-${mark.range[1]}`
        : `${mark.stype}:${JSON.stringify(mark.attrs || {})}:global`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * 겹치는 마크를 병합합니다.
   *
   * Spec:
   * - Only marks with identical (type, attrs) can merge.
   * - Adjacent or overlapping ranges coalesce into a single continuous span.
   * - Adjacent means current.range[1] === next.range[0] (touching but not overlapping)
   */
  private mergeOverlappingMarks(marks: IMark[]): IMark[] {
    if (marks.length <= 1) return marks;

    // Range가 없는 mark는 이 함수에 전달되지 않아야 함 (이미 분리되어 있음)
    // 하지만 안전성을 위해 체크
    const marksWithRange = marks.filter(m => m.range);
    if (marksWithRange.length <= 1) return marksWithRange;

    const result: IMark[] = [];
    let current = { ...marksWithRange[0] };

    for (let i = 1; i < marksWithRange.length; i++) {
      const next = marksWithRange[i];

      if (this.canMergeMarks(current, next)) {
        // Merge if overlapping (current.range[1] > next.range[0]) or adjacent (current.range[1] === next.range[0])
        if (current.range![1] >= next.range![0]) {
          current.range![1] = Math.max(current.range![1], next.range![1]);
        } else {
          result.push(current);
          current = { ...next };
        }
      } else {
        result.push(current);
        current = { ...next };
      }
    }

    result.push(current);
    return result;
  }

  /**
   * 두 마크가 병합 가능한지 확인합니다.
   */
  private canMergeMarks(mark1: IMark, mark2: IMark): boolean {
    if (mark1.stype !== mark2.stype) return false;

    const attrs1 = mark1.attrs || {};
    const attrs2 = mark2.attrs || {};
    
    const keys1 = Object.keys(attrs1);
    const keys2 = Object.keys(attrs2);
    
    if (keys1.length !== keys2.length) return false;
    
    for (const key of keys1) {
      if (attrs1[key] !== attrs2[key]) return false;
    }
    
    return true;
  }

  /**
   * 모든 노드의 마크를 정규화합니다.
   *
   * Spec:
   * - Iterates all nodes and normalizes only when marks exist and non-empty.
   * - Returns the count of nodes that were normalized.
   */
  normalizeAllMarks(): number {
    const nodes = this.dataStore.getAllNodes();
    let normalizedCount = 0;

    for (const node of nodes) {
      if (this.isTextNode(node) && Array.isArray((node as any).marks)) {
        this.normalizeMarks(node.sid!);
        normalizedCount++;
      }
    }

    return normalizedCount;
  }

  /** 텍스트 노드 판별 (.text 필드 존재 여부로 판단) */
  private isTextNode(node: { text?: string }): boolean {
    return typeof node.text === 'string';
  }

  /**
   * 마크 통계를 반환합니다.
   */
  getMarkStatistics(nodeId: string): {
    totalMarks: number;
    markTypes: Record<string, number>;
    overlappingMarks: number;
    emptyMarks: number;
  } {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.marks) {
      return {
        totalMarks: 0,
        markTypes: {},
        overlappingMarks: 0,
        emptyMarks: 0
      };
    }

    const textLength = node.text?.length || 0;
    const markTypes: Record<string, number> = {};
    let overlappingMarks = 0;
    let emptyMarks = 0;

    for (const mark of node.marks) {
      markTypes[mark.stype] = (markTypes[mark.stype] || 0) + 1;

      if (!mark.range || mark.range[0] >= mark.range[1]) {
        emptyMarks++;
      }
    }

    // 겹치는 마크 확인
    const sortedMarks = node.marks
      .filter(mark => mark.range && mark.range[0] < mark.range[1])
      .sort((a, b) => a.range![0] - b.range![0]);

    const marksByType = new Map<string, IMark[]>();
    for (const mark of sortedMarks) {
      const key = `${mark.stype}:${JSON.stringify(mark.attrs || {})}`;
      if (!marksByType.has(key)) {
        marksByType.set(key, []);
      }
      marksByType.get(key)!.push(mark);
    }

    for (const marks of marksByType.values()) {
      for (let i = 0; i < marks.length - 1; i++) {
        const current = marks[i];
        const next = marks[i + 1];
        
        if (current.range![1] > next.range![0]) {
          overlappingMarks++;
        }
      }
    }

    return {
      totalMarks: node.marks.length,
      markTypes,
      overlappingMarks,
      emptyMarks
    };
  }

  /**
   * 마크 정리 (빈 마크 제거)
   *
   * Spec:
   * - Removes marks with empty/invalid ranges after validating against current text length.
   * - Persists only when count changes.
   */
  removeEmptyMarks(nodeId: string): number {
    const node = this.dataStore.getNode(nodeId);
    if (!node || !node.marks) return 0;

    const textLength = node.text?.length || 0;
    const originalLength = node.marks.length;

    const nextMarks = node.marks.filter(mark => {
      if (!mark.range) return false;
      return mark.range[0] < mark.range[1] && mark.range[0] >= 0 && mark.range[1] <= textLength;
    });

    if (nextMarks.length !== originalLength) {
      // Persist via update path first to ensure op emission, then reflect locally
      this.dataStore.updateNode(node.sid!, { marks: nextMarks }, false);
      const local = this.dataStore.getNode(node.sid!);
      if (local) (local as any).marks = nextMarks;
    }

    return originalLength - nextMarks.length;
  }

  /**
   * 노드의 marks 배열을 설정합니다.
   * 기본적으로 유효성/정규화를 적용한 뒤 update 경로로 저장합니다.
   *
   * Spec setMarks:
   * - When normalize=true (default):
   *   - Fill missing ranges to full text, clamp, drop empty, dedupe, merge, sort.
   * - Writes via updateNode(false) and mirrors to local node for immediate reads.
   * - No-op suppression handled in DataStore.updateNode; we mirror locally regardless to keep views consistent.
   *
   * @param nodeId 대상 노드 ID
   * @param marks 설정할 마크 목록
   * @param options.normalize 정규화 수행 여부 (기본값: true)
   * @returns { valid, errors }
   */
  setMarks(
    nodeId: string,
    marks: IMark[],
    options: { normalize?: boolean } = {}
  ): { valid: boolean; errors: string[] } {
    const node = this.dataStore.getNode(nodeId);
    if (!node) {
      return { valid: false, errors: [`Node not found: ${nodeId}`] };
    }

    const textLength = node.text?.length || 0;
    const shouldNormalize = options.normalize !== false;

    try {
      let next = Array.isArray(marks) ? marks.slice() : [];

      if (shouldNormalize) {
        // 1. Range가 없는 mark에 전체 범위 할당
        const marksWithRange = next.map(mark => {
          if (!mark.range) {
            return { ...mark, range: [0, textLength] as [number, number] };
          }
          return mark;
        });

        // 2. 범위 정규화 (clamp to [0, textLength])
        const normalizedMarks = marksWithRange.map(mark => ({
          ...mark,
          range: [
            Math.max(0, Math.min(mark.range![0], textLength)),
            Math.max(0, Math.min(mark.range![1], textLength))
          ] as [number, number]
        }));

        // 3. 빈 범위 마크 제거
        const validMarks = normalizedMarks.filter(mark => 
          mark.range![0] < mark.range![1]
        );

        // 4. 중복 마크 제거
        const uniqueMarks = this.removeDuplicateMarks(validMarks);

        // 5. 겹치는 마크 병합
        const mergedMarks = this.mergeOverlappingMarks(uniqueMarks);

        // 6. 마크 정렬
        next = mergedMarks.sort((a, b) => a.range![0] - b.range![0]);
      }

      const result = this.dataStore.updateNode(nodeId, { marks: next }, false);
      // Reflect locally for immediate read consistency
      const localNode = this.dataStore.getNode(nodeId);
      if (localNode) {
        (localNode as any).marks = next;
      }
      if (!result || result.valid !== true) {
        return { valid: false, errors: result?.errors || ['Update failed'] };
      }
      return { valid: true, errors: [] };
    } catch (e) {
      return { valid: false, errors: [e instanceof Error ? e.message : 'Unknown error'] };
    }
  }

  /**
   * 특정 범위의 특정 타입 마크를 제거합니다.
   */
  removeMark(
    nodeId: string,
    markType: string,
    range: [number, number]
  ): { valid: boolean; errors: string[] } {
    const node = this.dataStore.getNode(nodeId);
    if (!node) return { valid: false, errors: [`Node not found: ${nodeId}`] };

    const textLength = node.text?.length || 0;
    const [start, end] = range;
    if (start < 0 || end < 0 || start > textLength || end > textLength || start > end) {
      return { valid: false, errors: ['Invalid range'] };
    }

    // Remove exact range match of markType
    const next = (node.marks || []).filter((m: IMark) => {
      if (m.stype !== markType) return true;
      if (!m.range) return true;
      return !(m.range[0] === start && m.range[1] === end);
    });

    const result = this.dataStore.updateNode(nodeId, { marks: next }, false);
    const localNode = this.dataStore.getNode(nodeId);
    if (localNode) {
      (localNode as any).marks = next;
    }
    if (!result || result.valid !== true) {
      return { valid: false, errors: result?.errors || ['Update failed'] };
    }
    return { valid: true, errors: [] };
  }

  /**
   * 특정 범위의 특정 타입 마크 속성을 업데이트합니다.
   */
  updateMark(
    nodeId: string,
    markType: string,
    range: [number, number],
    newAttrs: Record<string, any>
  ): { valid: boolean; errors: string[] } {
    const node = this.dataStore.getNode(nodeId);
    if (!node) return { valid: false, errors: [`Node not found: ${nodeId}`] };

    const textLength = node.text?.length || 0;
    const [start, end] = range;
    if (start < 0 || end < 0 || start > textLength || end > textLength || start >= end) {
      return { valid: false, errors: ['Invalid range'] };
    }

    const next = (node.marks || []).map((m: IMark) => {
      if (m.stype === markType && m.range && m.range[0] === start && m.range[1] === end) {
        return { ...m, attrs: { ...(m.attrs || {}), ...(newAttrs || {}) } };
      }
      return m;
    });

    const result = this.dataStore.updateNode(nodeId, { marks: next }, false);
    if (!result || result.valid !== true) {
      return { valid: false, errors: result?.errors || ['Update failed'] };
    }
    return { valid: true, errors: [] };
  }

  /**
   * 특정 범위의 특정 타입 마크를 토글합니다.
   * 동일 범위/타입이 존재하면 제거, 없으면 추가합니다.
   *
   * Spec toggleMark:
   * - Validates [start,end) within [0,textLength].
   * - If an exact (type, attrs) mark exists over the exact range, no-op.
   * - Otherwise removes overlaps per split/trim rules and adds new mark when none overlapped.
   * - Normalizes resulting marks and persists via updateNode(false).
   */
  toggleMark(
    nodeId: string,
    markType: string,
    range: [number, number],
    attrs?: Record<string, any>
  ): { valid: boolean; errors: string[] } {
    const node = this.dataStore.getNode(nodeId);
    if (!node) return { valid: false, errors: [`Node not found: ${nodeId}`] };

    const textLength = node.text?.length || 0;
    const [start, end] = range;
    if (start < 0 || end < 0 || start > textLength || end > textLength || start >= end) {
      return { valid: false, errors: ['Invalid range'] };
    }

    const current = (node.marks || []) as IMark[];
    // 동일 범위/타입/attrs가 완전히 덮여있으면 제거 수행 대상이므로 no-op 아님
    const [rs, re] = range;
    const resultMarks: IMark[] = [];
    let overlapped = false;
    for (const m of current) {
      if (m.stype !== markType || !m.range) {
        resultMarks.push(m);
        continue;
      }
      const [ms, me] = m.range;
      // no overlap
      if (me <= rs || ms >= re) {
        resultMarks.push(m);
        continue;
      }
      overlapped = true;
      // fully inside removal -> drop
      if (ms >= rs && me <= re) {
        continue;
      }
      // spans across -> split
      if (ms < rs && me > re) {
        if (rs > ms) resultMarks.push({ ...m, range: [ms, rs] });
        if (me > re) resultMarks.push({ ...m, range: [re, me] });
        continue;
      }
      // overlaps left only -> trim right to rs
      if (ms < rs && me > rs && me <= re) {
        resultMarks.push({ ...m, range: [ms, rs] });
        continue;
      }
      // overlaps right only -> trim left to re
      if (ms >= rs && ms < re && me > re) {
        resultMarks.push({ ...m, range: [re, me] });
        continue;
      }
    }

    if (!overlapped) {
      // add mark then normalize/merge
      resultMarks.push({ stype: markType, attrs, range });
    }

    // Normalize and persist
    const normalized = this.mergeOverlappingMarks(this.removeDuplicateMarks(
      resultMarks
        .filter(m => !m.range || (m.range[0] < m.range[1]))
        .map(m => ({ ...m, range: m.range || [0, (this.dataStore.getNode(nodeId)?.text?.length || 0)] as [number, number] }))
    )).sort((a, b) => (a.range![0] - b.range![0]));

    // no-op check: if same as current (ignoring order), skip update
    const currentMarks = (this.dataStore.getNode(nodeId)?.marks || []) as IMark[];
    const same = JSON.stringify(currentMarks) === JSON.stringify(normalized);
    if (same) {
      return { valid: true, errors: [] };
    }
    const res = this.dataStore.updateNode(nodeId, { marks: normalized }, false);
    const localNode = this.dataStore.getNode(nodeId);
    if (localNode) {
      (localNode as any).marks = normalized;
    }
    if (!res || res.valid !== true) {
      return { valid: false, errors: res?.errors || ['Update failed'] };
    }
    return { valid: true, errors: [] };
  }
}
