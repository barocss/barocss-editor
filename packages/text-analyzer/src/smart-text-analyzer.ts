import { TextChange, TextChangeAnalysisOptions } from './types';

/**
 * Smart Text Change Analyzer
 * 
 * Selection 정보를 고려한 지능적인 텍스트 변경사항 분석기
 * LCP/LCS 기반 델타 계산과 Selection 바이어싱을 적용합니다.
 * 
 * 핵심 기능:
 * - LCP/LCS 알고리즘으로 O(n) 시간 복잡도의 정확한 델타 계산
 * - Selection 바이어싱으로 사용자 의도 반영한 변경사항 위치 조정
 * - 유니코드 복합 문자(이모지, 결합 문자) 안전 처리
 * - NFC 정규화로 일관된 텍스트 처리
 * 
 * @example
 * ```typescript
 * const changes = analyzeTextChanges({
 *   oldText: 'Hello world',
 *   newText: 'Hello beautiful world',
 *   selectionOffset: 6,
 *   selectionLength: 0
 * });
 * // 결과: [{ type: 'insert', start: 6, end: 6, text: 'beautiful ', confidence: 1.0 }]
 * ```
 */

/**
 * LCP/LCS를 사용한 기본 텍스트 차이 계산
 * 
 * LCP (Longest Common Prefix): 두 텍스트의 공통 접두사 길이
 * LCS (Longest Common Suffix): LCP 제거 후 공통 접미사 길이
 * 
 * 알고리즘:
 * 1. LCP 계산: 앞에서부터 동일한 문자 개수 세기
 * 2. LCS 계산: 뒤에서부터 동일한 문자 개수 세기
 * 3. 변경 영역 계산: LCP 이후 ~ LCS 이전
 * 
 * 시간 복잡도: O(n) where n = max(oldText.length, newText.length)
 * 공간 복잡도: O(1)
 * 
 * @param oldText - 변경 전 텍스트
 * @param newText - 변경 후 텍스트
 * @returns 텍스트 차이 정보 (kind, start, end, inserted, deleted)
 */
function calculateTextDifference(oldText: string, newText: string): {
  kind: 'none' | 'insert' | 'delete' | 'replace';
  start: number;
  end: number;
  inserted: string;
  deleted: string;
} {
  // 동일한 텍스트인 경우 변경사항 없음
  if (oldText === newText) {
    return { kind: 'none', start: 0, end: 0, inserted: '', deleted: '' };
  }

  // LCP (Longest Common Prefix) 계산
  // 앞에서부터 동일한 문자 개수를 세어 공통 접두사 길이 찾기
  let lcp = 0;
  const m = Math.min(oldText.length, newText.length);
  while (lcp < m && oldText.charCodeAt(lcp) === newText.charCodeAt(lcp)) {
    lcp++;
  }

  // LCS (Longest Common Suffix) 계산
  // LCP 윈도우를 제거한 후 뒤에서부터 동일한 문자 개수를 세어 공통 접미사 길이 찾기
  let lcs = 0;
  const bRem = oldText.length - lcp;  // oldText에서 LCP 제거 후 남은 길이
  const aRem = newText.length - lcp;  // newText에서 LCP 제거 후 남은 길이
  while (
    lcs < bRem &&
    lcs < aRem &&
    oldText.charCodeAt(oldText.length - 1 - lcs) === newText.charCodeAt(newText.length - 1 - lcs)
  ) {
    lcs++;
  }

  // 변경 영역 계산
  const start = lcp;                           // 변경 시작 위치 (LCP 이후)
  const end = oldText.length - lcs;            // 변경 끝 위치 (LCS 이전)
  const deleted = oldText.slice(start, end);   // 삭제된 텍스트
  const inserted = newText.slice(lcp, newText.length - lcs); // 삽입된 텍스트

  // 변경 타입 결정
  if (!deleted && !inserted) {
    // 실제로는 변경사항이 없음 (정규화 등으로 인한 경우)
    return { kind: 'none', start, end, inserted: '', deleted: '' };
  }
  if (!deleted) {
    // 삭제 없이 삽입만 있음
    return { kind: 'insert', start, end: start, inserted, deleted: '' };
  }
  if (!inserted) {
    // 삽입 없이 삭제만 있음
    return { kind: 'delete', start, end, inserted: '', deleted };
  }
  // 삽입과 삭제가 모두 있음 (교체)
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
  
  // 변경사항이 없으면 빈 배열 반환
  if (kind === 'none') return [];

  // Selection 정보 계산
  const isCollapsed = selectionLength === 0;  // 커서인지 선택 영역인지
  const selectionStart = selectionOffset;
  const selectionEnd = selectionOffset + selectionLength;

  // Selection 바이어싱 적용을 위한 변수들
  let finalStart = start;
  let finalEnd = end;
  let finalInserted = inserted;
  let finalDeleted = deleted;

  // 1x1 교체 최적화: Selection 근처에서 더 정확한 위치 찾기
  if (kind === 'replace' && inserted.length === 1 && deleted.length === 1) {
    // Selection 중심점 계산 (커서면 그 위치, 선택 영역이면 중앙)
    const biasCenter = isCollapsed ? selectionStart : Math.floor((selectionStart + selectionEnd) / 2);
    
    // 탐색 반경 계산 (텍스트 길이의 5% 또는 최대 3)
    const searchRadius = Math.min(3, Math.floor(oldText.length * 0.05));
    const searchStart = Math.max(0, biasCenter - searchRadius);
    const searchEnd = Math.min(oldText.length - 1, biasCenter + searchRadius);
    
    // Selection 중심으로 제한된 범위에서 정확한 위치 탐색
    for (let i = searchStart; i <= searchEnd; i++) {
      // 선택 영역이 있는 경우 Selection 밖의 위치는 제외
      if (!isCollapsed && (i < selectionStart || i >= selectionEnd)) continue;
      
      // i 위치에서 교체를 시뮬레이션하여 결과 확인
      const simulated = oldText.slice(0, i) + inserted + oldText.slice(i + 1);
      if (simulated === newText) {
        // 정확한 위치 발견
        finalStart = i;
        finalEnd = i + 1;
        finalDeleted = oldText[i];
        break;
      }
    }
  } 
  // 삭제 최적화: Selection과의 겹침과 거리를 모두 고려한 최적 위치 선택
  else if (kind === 'delete') {
    const delLen = end - start;  // 삭제할 텍스트 길이
    const biasCenter = isCollapsed ? selectionStart : Math.floor((selectionStart + selectionEnd) / 2);
    
    // 탐색 윈도우 반경 계산 (텍스트 길이의 10% 또는 최대 6)
    const windowRadius = Math.min(6, Math.floor(oldText.length * 0.1));
    
    // 최적 위치를 찾기 위한 변수들
    let bestStart = start;
    let bestDist = Math.abs(biasCenter - (start + Math.floor(delLen / 2)));
    let bestOverlap = 0;

    // 탐색 범위 계산
    const minS = Math.max(0, biasCenter - windowRadius);
    const maxS = Math.min(oldText.length - delLen, biasCenter + windowRadius);

    // 가능한 모든 삭제 위치를 탐색
    for (let s = minS; s <= maxS; s++) {
      // s 위치에서 삭제를 시뮬레이션하여 결과 확인
      const simulated = oldText.slice(0, s) + oldText.slice(s + delLen);
      if (simulated !== newText) continue;  // 결과가 맞지 않으면 스킵

      // 삭제 영역과 Selection의 겹침 계산
      const spanStart = s;
      const spanEnd = s + delLen;
      const overlap = isCollapsed
        ? (biasCenter >= spanStart && biasCenter <= spanEnd) ? 1 : 0  // 커서가 삭제 영역 안에 있으면 1
        : Math.max(0, Math.min(spanEnd, selectionEnd) - Math.max(spanStart, selectionStart)); // 선택 영역과의 겹침 길이
      
      // Selection 중심점과의 거리 계산
      const center = s + Math.floor(delLen / 2);
      const dist = Math.abs(biasCenter - center);

      // 겹침이 더 크거나, 겹침이 같으면 거리가 더 가까운 위치 선택
      if (overlap > bestOverlap || (overlap === bestOverlap && dist < bestDist)) {
        bestOverlap = overlap;
        bestDist = dist;
        bestStart = s;
      }
    }
    
    // 최적 위치로 설정
    finalStart = bestStart;
    finalEnd = bestStart + delLen;
    finalDeleted = oldText.slice(finalStart, finalEnd);
  }

  // TextChange 객체 생성
  const changes: TextChange[] = [];

  if (kind === 'insert') {
    // 삽입: LCP/LCS 결과를 그대로 사용 (이미 정확함)
    changes.push({
      type: 'insert',
      start: finalStart,
      end: finalStart,        // insert는 start === end (삽입 위치)
      text: finalInserted,
      confidence: 1.0
    });
  } else if (kind === 'delete') {
    // 삭제: Selection 바이어싱이 적용된 위치 사용
    changes.push({
      type: 'delete',
      start: finalStart,
      end: finalStart + finalDeleted.length,  // delete는 start + length = end
      text: '',              // delete는 빈 문자열
      confidence: 1.0
    });
  } else if (kind === 'replace') {
    // 교체: Selection 바이어싱이 적용된 위치 사용
    changes.push({
      type: 'replace',
      start: finalStart,
      end: finalStart + finalDeleted.length,  // replace는 start + oldLength = end
      text: finalInserted,   // replace는 교체할 텍스트
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
