import { TextChange, TextChangeAnalysisOptions } from './types';

/**
 * Smart Text Change Analyzer
 * 
 * Intelligent text change analyzer considering Selection information
 * Applies LCP/LCS-based delta calculation and Selection biasing.
 * 
 * Key features:
 * - Accurate delta calculation with O(n) time complexity using LCP/LCS algorithm
 * - Adjust change position reflecting user intent with Selection biasing
 * - Safe handling of Unicode composite characters (emojis, combining characters)
 * - Consistent text processing with NFC normalization
 * 
 * @example
 * ```typescript
 * const changes = analyzeTextChanges({
 *   oldText: 'Hello world',
 *   newText: 'Hello beautiful world',
 *   selectionOffset: 6,
 *   selectionLength: 0
 * });
 * // Result: [{ type: 'insert', start: 6, end: 6, text: 'beautiful ', confidence: 1.0 }]
 * ```
 */

/**
 * Basic text difference calculation using LCP/LCS
 * 
 * LCP (Longest Common Prefix): length of common prefix of two texts
 * LCS (Longest Common Suffix): length of common suffix after removing LCP
 * 
 * Algorithm:
 * 1. Calculate LCP: count identical characters from the front
 * 2. Calculate LCS: count identical characters from the back
 * 3. Calculate change region: after LCP ~ before LCS
 * 
 * Time complexity: O(n) where n = max(oldText.length, newText.length)
 * Space complexity: O(1)
 * 
 * @param oldText - Text before change
 * @param newText - Text after change
 * @returns Text difference info (kind, start, end, inserted, deleted)
 */
function calculateTextDifference(oldText: string, newText: string): {
  kind: 'none' | 'insert' | 'delete' | 'replace';
  start: number;
  end: number;
  inserted: string;
  deleted: string;
} {
  // No change if texts are identical
  if (oldText === newText) {
    return { kind: 'none', start: 0, end: 0, inserted: '', deleted: '' };
  }

  // Calculate LCP (Longest Common Prefix)
  // Count identical characters from the front to find common prefix length
  let lcp = 0;
  const m = Math.min(oldText.length, newText.length);
  while (lcp < m && oldText.charCodeAt(lcp) === newText.charCodeAt(lcp)) {
    lcp++;
  }

  // Calculate LCS (Longest Common Suffix)
  // After removing LCP window, count identical characters from the back to find common suffix length
  let lcs = 0;
  const bRem = oldText.length - lcp;  // Remaining length after removing LCP from oldText
  const aRem = newText.length - lcp;  // Remaining length after removing LCP from newText
  while (
    lcs < bRem &&
    lcs < aRem &&
    oldText.charCodeAt(oldText.length - 1 - lcs) === newText.charCodeAt(newText.length - 1 - lcs)
  ) {
    lcs++;
  }

  // Calculate change region
  const start = lcp;                           // Change start position (after LCP)
  const end = oldText.length - lcs;            // Change end position (before LCS)
  const deleted = oldText.slice(start, end);   // Deleted text
  const inserted = newText.slice(lcp, newText.length - lcs); // Inserted text

  // Determine change type
  if (!deleted && !inserted) {
    // Actually no change (due to normalization, etc.)
    return { kind: 'none', start, end, inserted: '', deleted: '' };
  }
  if (!deleted) {
    // Only insertion, no deletion
    return { kind: 'insert', start, end: start, inserted, deleted: '' };
  }
  if (!inserted) {
    // Only deletion, no insertion
    return { kind: 'delete', start, end, inserted: '', deleted };
  }
  // Both insertion and deletion (replacement)
  return { kind: 'replace', start, end, inserted, deleted };
}


/**
 * Selection 정보를 고려한 텍스트 변경사항 분석
 * 
 * LCP/LCS로 계산된 기본 변경사항을 사용자의 Selection 위치를 고려하여 정확도 향상
 * 
 * Selection 바이어싱 알고리즘:
 * 1. 1x1 교체: Selection 중심으로 제한된 범위에서 정확한 위치 탐색
 * 2. 삭제: Selection과의 겹침과 거리를 모두 고려한 최적 위치 선택
 * 3. 삽입: LCP/LCS 결과를 그대로 사용 (이미 정확함)
 * 
 * 시간 복잡도: O(k) where k = search radius (최대 6)
 * 
 * @param oldText - 변경 전 텍스트
 * @param newText - 변경 후 텍스트
 * @param textDifference - LCP/LCS로 계산된 기본 차이 정보
 * @param selectionOffset - 사용자 Selection 시작 위치
 * @param selectionLength - 사용자 Selection 길이 (0이면 커서)
 * @returns Selection 바이어싱이 적용된 TextChange 배열
 */
function analyzeTextChangesWithSelection(
  oldText: string,
  newText: string,
  textDifference: ReturnType<typeof calculateTextDifference>,
  selectionOffset: number,
  selectionLength: number
): TextChange[] {
  const { kind, start, end, inserted, deleted } = textDifference;
  
  // Return empty array if no changes
  if (kind === 'none') return [];

  // Calculate selection information
  const isCollapsed = selectionLength === 0;  // Whether cursor or selection range
  const selectionStart = selectionOffset;
  const selectionEnd = selectionOffset + selectionLength;

  // Variables for applying selection biasing
  let finalStart = start;
  let finalEnd = end;
  let finalInserted = inserted;
  let finalDeleted = deleted;

  // 1x1 replace optimization: find more accurate position near Selection
  if (kind === 'replace' && inserted.length === 1 && deleted.length === 1) {
    // Calculate selection center point (cursor position if collapsed, center if selection range)
    const biasCenter = isCollapsed ? selectionStart : Math.floor((selectionStart + selectionEnd) / 2);
    
    // Calculate search radius (5% of text length or max 3)
    const searchRadius = Math.min(3, Math.floor(oldText.length * 0.05));
    const searchStart = Math.max(0, biasCenter - searchRadius);
    const searchEnd = Math.min(oldText.length - 1, biasCenter + searchRadius);
    
    // Search for accurate position within range limited to selection center
    for (let i = searchStart; i <= searchEnd; i++) {
      // Exclude positions outside Selection if selection range exists
      if (!isCollapsed && (i < selectionStart || i >= selectionEnd)) continue;
      
      // Simulate replace at position i and check result
      const simulated = oldText.slice(0, i) + inserted + oldText.slice(i + 1);
      if (simulated === newText) {
        // Found accurate position
        finalStart = i;
        finalEnd = i + 1;
        finalDeleted = oldText[i];
        break;
      }
    }
  } 
  // Delete optimization: select optimal position considering both overlap and distance with Selection
  else if (kind === 'delete') {
    const delLen = end - start;  // Length of text to delete
    const biasCenter = isCollapsed ? selectionStart : Math.floor((selectionStart + selectionEnd) / 2);
    
    // Calculate search window radius (10% of text length or max 6)
    const windowRadius = Math.min(6, Math.floor(oldText.length * 0.1));
    
    // Variables to find optimal position
    let bestStart = start;
    let bestDist = Math.abs(biasCenter - (start + Math.floor(delLen / 2)));
    let bestOverlap = 0;

    // Calculate search range
    const minS = Math.max(0, biasCenter - windowRadius);
    const maxS = Math.min(oldText.length - delLen, biasCenter + windowRadius);

    // Search all possible delete positions
    for (let s = minS; s <= maxS; s++) {
      // Simulate delete at position s and check result
      const simulated = oldText.slice(0, s) + oldText.slice(s + delLen);
      if (simulated !== newText) continue;  // Skip if result doesn't match

      // Calculate overlap between delete area and Selection
      const spanStart = s;
      const spanEnd = s + delLen;
      const overlap = isCollapsed
        ? (biasCenter >= spanStart && biasCenter <= spanEnd) ? 1 : 0  // 1 if cursor is inside delete area
        : Math.max(0, Math.min(spanEnd, selectionEnd) - Math.max(spanStart, selectionStart)); // Overlap length with selection range
      
      // Calculate distance from selection center point
      const center = s + Math.floor(delLen / 2);
      const dist = Math.abs(biasCenter - center);

      // Select position with larger overlap, or if overlap is same, select closer position
      if (overlap > bestOverlap || (overlap === bestOverlap && dist < bestDist)) {
        bestOverlap = overlap;
        bestDist = dist;
        bestStart = s;
      }
    }
    
    // Set to optimal position
    finalStart = bestStart;
    finalEnd = bestStart + delLen;
    finalDeleted = oldText.slice(finalStart, finalEnd);
  }

  // Create TextChange object
  const changes: TextChange[] = [];

  if (kind === 'insert') {
    // Insert: use LCP/LCS result as-is (already accurate)
    changes.push({
      type: 'insert',
      start: finalStart,
      end: finalStart,        // insert: start === end (insert position)
      text: finalInserted,
      confidence: 1.0
    });
  } else if (kind === 'delete') {
    // Delete: use position with Selection biasing applied
    changes.push({
      type: 'delete',
      start: finalStart,
      end: finalStart + finalDeleted.length,  // delete: start + length = end
      text: '',              // delete: empty string
      confidence: 1.0
    });
  } else if (kind === 'replace') {
    // Replace: use position with Selection biasing applied
    changes.push({
      type: 'replace',
      start: finalStart,
      end: finalStart + finalDeleted.length,  // replace: start + oldLength = end
      text: finalInserted,   // replace: text to replace
      confidence: 1.0
    });
  }

  return changes;
}

/**
 * 안전한 문자 분할 지점 확인 (이모지, 결합 문자 등)
 * 
 * UTF-16에서 복합 문자(이모지, 결합 문자, 서로게이트 페어)의 경계를 안전하게 확인
 * 문자 분할을 방지하여 유니코드 텍스트의 무결성을 보장
 * 
 * 확인하는 유니코드 범위:
 * - 서로게이트 페어: U+D800-U+DBFF (High), U+DC00-U+DFFF (Low)
 * - 결합 문자: U+0300-U+036F, U+1AB0-U+1AFF, U+1DC0-U+1DFF, U+20D0-U+20FF, U+FE20-U+FE2F
 * 
 * @param text - 확인할 텍스트
 * @param index - 확인할 인덱스 위치
 * @returns true면 안전한 분할 지점, false면 문자 내부 (분할하면 안됨)
 * 
 * @example
 * ```typescript
 * isSafeCharacterSplit("👨‍👩‍👧‍👦", 2); // false (이모지 내부 - 분할하면 안됨)
 * isSafeCharacterSplit("café", 4); // true (é는 단일 문자 - 분할 가능)
 * isSafeCharacterSplit("cafe\u0301", 4); // false (e + 결합 문자 - 분할하면 안됨)
 * ```
 */
function isSafeCharacterSplit(text: string, index: number): boolean {
  // 텍스트 경계는 항상 안전한 경계
  if (index <= 0 || index >= text.length) return true;
  
  // 인덱스 앞뒤의 유니코드 코드 포인트 가져오기
  const before = text.codePointAt(index - 1);
  const after = text.codePointAt(index);
  
  // 코드 포인트를 가져올 수 없으면 안전한 경계로 간주
  if (!before || !after) return true;
  
  // 서로게이트 페어 확인 (UTF-16에서 4바이트 유니코드 문자)
  // High Surrogate (U+D800-U+DBFF): 4바이트 문자의 첫 번째 부분
  if (before >= 0xD800 && before <= 0xDBFF) return false;
  // Low Surrogate (U+DC00-U+DFFF): 4바이트 문자의 두 번째 부분
  if (after >= 0xDC00 && after <= 0xDFFF) return false;
  
  // 결합 문자 확인 (Combining Marks)
  // U+0300-U+036F: Combining Diacritical Marks (가장 일반적인 결합 문자)
  // 예: é = e + ́ (U+0065 + U+0301)
  if (after >= 0x0300 && after <= 0x036F) return false;
  
  // U+1AB0-U+1AFF: Combining Diacritical Marks Extended
  // 예: ẹ = e + ̣ (U+0065 + U+0323)
  if (after >= 0x1AB0 && after <= 0x1AFF) return false;
  
  // U+1DC0-U+1DFF: Combining Diacritical Marks Supplement
  // 예: ẹ = e + ̣ (U+0065 + U+0323)
  if (after >= 0x1DC0 && after <= 0x1DFF) return false;
  
  // U+20D0-U+20FF: Combining Diacritical Marks for Symbols
  // 예: 기호에 결합되는 발음 구별 부호
  if (after >= 0x20D0 && after <= 0x20FF) return false;
  
  // U+FE20-U+FE2F: Combining Half Marks
  // 예: 반각 결합 문자
  if (after >= 0xFE20 && after <= 0xFE2F) return false;
  
  // 위의 모든 조건에 해당하지 않으면 안전한 경계
  return true;
}

/**
 * 안전한 문자 분할 지점으로 인덱스 조정
 * 
 * 주어진 인덱스를 가장 가까운 안전한 문자 분할 지점으로 조정
 * 복합 문자(이모지, 결합 문자)의 분할을 방지하여 유니코드 텍스트 무결성 보장
 * 
 * @param text - 조정할 텍스트
 * @param index - 조정할 인덱스 위치
 * @param direction - 조정 방향 ('left': 왼쪽으로, 'right': 오른쪽으로)
 * @returns 안전한 문자 분할 지점으로 조정된 인덱스
 * 
 * @example
 * ```typescript
 * adjustToSafeSplitPoint("👨‍👩‍👧‍👦", 2, 'left'); // 0 (이모지 시작)
 * adjustToSafeSplitPoint("cafe\u0301", 4, 'right'); // 5 (결합 문자 끝)
 * adjustToSafeSplitPoint("hello", 3, 'left'); // 3 (이미 안전한 분할 지점)
 * ```
 */
function adjustToSafeSplitPoint(text: string, index: number, direction: 'left' | 'right'): number {
  // 인덱스를 텍스트 범위 내로 제한
  let adjusted = Math.max(0, Math.min(text.length, index));
  
  if (direction === 'left') {
    // 왼쪽으로 이동하면서 안전한 분할 지점 찾기
    while (adjusted > 0 && !isSafeCharacterSplit(text, adjusted)) {
      adjusted--;
    }
  } else {
    // 오른쪽으로 이동하면서 안전한 분할 지점 찾기
    while (adjusted < text.length && !isSafeCharacterSplit(text, adjusted)) {
      adjusted++;
    }
  }
  
  return adjusted;
}

/**
 * Smart Text Change Analyzer 메인 함수
 * 
 * 텍스트 변경사항을 분석하여 정확한 TextChange 배열을 반환
 * 
 * 처리 과정:
 * 1. 유니코드 정규화 (NFC) - 일관된 텍스트 처리
 * 2. LCP/LCS 기반 델타 계산 - O(n) 시간 복잡도의 정확한 차이 계산
 * 3. Selection 바이어싱 - 사용자 의도 반영한 위치 조정
 * 4. 유니코드 안전성 조정 - 복합 문자 경계 보호
 * 
 * 시간 복잡도: O(n) where n = max(oldText.length, newText.length)
 * 공간 복잡도: O(k) where k = number of changes (보통 1)
 * 
 * @param options - 텍스트 변경사항 분석 옵션
 * @param options.oldText - 변경 전 텍스트
 * @param options.newText - 변경 후 텍스트
 * @param options.selectionOffset - 사용자 Selection 시작 위치
 * @param options.selectionLength - 사용자 Selection 길이 (0이면 커서)
 * @returns 분석된 TextChange 배열
 * 
 * @example
 * ```typescript
 * // 기본 삽입
 * const changes = analyzeTextChanges({
 *   oldText: 'Hello world',
 *   newText: 'Hello beautiful world',
 *   selectionOffset: 6,
 *   selectionLength: 0
 * });
 * // 결과: [{ type: 'insert', start: 6, end: 6, text: 'beautiful ', confidence: 1.0 }]
 * 
 * // Selection 바이어싱이 적용된 교체
 * const changes2 = analyzeTextChanges({
 *   oldText: 'abcdef',
 *   newText: 'abXdef',
 *   selectionOffset: 2,
 *   selectionLength: 1
 * });
 * // 결과: [{ type: 'replace', start: 2, end: 3, text: 'X', confidence: 1.0 }]
 * 
 * // 유니코드 안전 처리
 * const changes3 = analyzeTextChanges({
 *   oldText: 'Hello 👋',
 *   newText: 'Hello 👋 world',
 *   selectionOffset: 8,
 *   selectionLength: 0
 * });
 * // 결과: [{ type: 'insert', start: 8, end: 8, text: ' world', confidence: 1.0 }]
 * ```
 */
export function analyzeTextChanges(options: TextChangeAnalysisOptions): TextChange[] {
  const { oldText, newText, selectionOffset, selectionLength = 0 } = options;
  
  // 1. 유니코드 정규화 (NFC - Canonical Decomposition, followed by Canonical Composition)
  // 결합 문자 형태(e + ́)를 정규화된 형태(é)로 통일하여 일관된 처리 보장
  const normalizedOldText = oldText.normalize('NFC');
  const normalizedNewText = newText.normalize('NFC');
  
  // 정규화 후 동일한 텍스트인 경우 변경사항 없음
  if (normalizedOldText === normalizedNewText) {
    return [];
  }

  // 2. LCP/LCS 기반 기본 텍스트 차이 계산
  // O(n) 시간 복잡도로 정확한 델타 계산
  const textDifference = calculateTextDifference(normalizedOldText, normalizedNewText);
  
  // 3. Selection 정보를 고려한 변경사항 분석
  // 사용자의 Selection 위치를 바탕으로 변경사항 위치를 정확하게 조정
  const changes = analyzeTextChangesWithSelection(
    normalizedOldText,
    normalizedNewText,
    textDifference,
    selectionOffset,
    selectionLength
  );

  // 4. 안전한 문자 분할 지점으로 조정
  // 이모지, 결합 문자 등 복합 문자의 분할을 방지하여 유니코드 무결성 보장
  const adjustedChanges = changes.map(change => ({
    ...change,
    // 시작 위치를 왼쪽으로 조정하여 안전한 분할 지점으로 이동
    start: adjustToSafeSplitPoint(normalizedOldText, change.start, 'left'),
    // 끝 위치를 오른쪽으로 조정하여 안전한 분할 지점으로 이동
    end: adjustToSafeSplitPoint(normalizedOldText, change.end, 'right')
  }));

  return adjustedChanges;
}
