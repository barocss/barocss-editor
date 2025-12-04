import { describe, it, expect } from 'vitest';
import { analyzeTextChanges } from '@barocss/text-analyzer';
import { buildTextRunIndex, binarySearchRun } from '@barocss/renderer-dom';

function el(html: string): Element {
  const root = document.createElement('div');
  root.innerHTML = html.trim();
  return root.firstElementChild as Element;
}

describe('Selection Mapping Test', () => {
  it('Selection 정보가 newText 기준일 때 올바른 매핑이 되어야 함', () => {
    const result = analyzeTextChanges({
      oldText: 'hello world',
      newText: 'hello beautiful world',
      selectionOffset: 6, // newText 기준 위치
      selectionLength: 0
    });

    // 기대 결과: oldText의 6번째 위치에 "beautiful " 삽입됨
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'insert',
      start: 6,
      end: 6,
      text: 'beautiful ',
      confidence: 1
    });
  });

  it('Selection 정보가 oldText 기준일 때도 동작해야 함', () => {
    const result = analyzeTextChanges({
      oldText: 'hello world',
      newText: 'hello beautiful world',
      selectionOffset: 6, // oldText 기준 위치
      selectionLength: 0
    });

    // 기대 결과: oldText의 6번째 위치에 "beautiful " 삽입됨
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'insert',
      start: 6,
      end: 6,
      text: 'beautiful ',
      confidence: 1
    });
  });

  it('Selection 정보가 newText 기준일 때 삭제 케이스', () => {
    const result = analyzeTextChanges({
      oldText: 'hello beautiful world',
      newText: 'hello world',
      selectionOffset: 6, // newText 기준 위치
      selectionLength: 10
    });

    // 기대 결과: oldText의 "beautiful " 부분이 삭제됨
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: 'delete',
      start: 6,
      end: 16,
      text: '',
      confidence: 1
    });
  });

  it('Text Run Index 기반 id+offset 매핑이 mark 중첩에서도 정확해야 함', () => {
    const container = el(`<span data-bc-sid="text-red-bold"><span class="custom-bold mark-bold" data-mark-type="bold" data-weight="bold"><span class="custom-font-color mark-fontColor" data-mark-type="fontColor" data-color="#ff0000">Red Bold</span></span></span>`);
    document.body.appendChild(container);
    const runs = buildTextRunIndex(container, 'text-red-bold', { buildReverseMap: true });
    expect(runs.total).toBe('Red Bold'.length);
    // caret at 3 should map inside the single text node
    const txt = container.querySelector('.custom-font-color')!.firstChild as Text;
    const entry = runs.byNode!.get(txt)!;
    expect(entry.start).toBe(0);
    expect(entry.end).toBe(runs.total);
    const idx = binarySearchRun(runs.runs, 3);
    expect(idx).toBe(0);
  });

  it('anchorId/focusId는 closest([data-bc-sid]) 기준으로 추출되어야 함', () => {
    const container = el(`<span data-bc-sid="text-blue-bg"><span class="custom-bg-color mark-bgColor" data-mark-type="bgColor" data-bg-color="#007bff">Blue Background</span></span>`);
    document.body.appendChild(container);
    const inner = container.querySelector('.custom-bg-color')!.firstChild as Text;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(inner, 2);
    range.setEnd(inner, 2);
    sel.removeAllRanges();
    sel.addRange(range);
    const id = (inner.parentElement as Element).closest('[data-bc-sid]')!.getAttribute('data-bc-sid');
    expect(id).toBe('text-blue-bg');
  });

  it('샘플 구조: text-yellow-bg 컨테이너에서 마크 내부/외부 텍스트가 하나의 논리 스트림으로 누적되어야 함', () => {
    const container = el(`<span data-bc-sid="text-yellow-bg"><span class="custom-bg-color mark-bgColor">yellow backgroun</span>d</span>`);
    document.body.appendChild(container);
    const runs = buildTextRunIndex(container, 'text-yellow-bg', { buildReverseMap: true });
    expect(runs.total).toBe('yellow background'.length);
    // 두 개 이상의 run을 가질 수 있으나, total은 전체 논리 텍스트 길이와 동일해야 함
    expect(runs.runs.length).toBeGreaterThanOrEqual(1);
    // 마지막 문자 'd'가 포함되는지 확인: total-1 위치 검색
    const lastIdx = binarySearchRun(runs.runs, runs.total - 1);
    expect(lastIdx).toBeGreaterThanOrEqual(0);
  });

  it('샘플 구조: text-red-bold과 text-blue-bg 사이 교차 선택 시 각 컨테이너에서 글로벌 오프셋이 정확해야 함', () => {
    const red = el(`<span data-bc-sid="text-red-bold"><span class="custom-bold mark-bold"><span class="custom-font-color mark-fontColor">Red Bold</span></span></span>`);
    const blue = el(`<span data-bc-sid="text-blue-bg"><span class="custom-bg-color mark-bgColor">Blue Background</span></span>`);
    document.body.appendChild(red);
    document.body.appendChild(blue);
    const redRuns = buildTextRunIndex(red, 'text-red-bold', { buildReverseMap: true });
    const blueRuns = buildTextRunIndex(blue, 'text-blue-bg', { buildReverseMap: true });
    // caret in red at 3
    const redText = red.querySelector('.custom-font-color')!.firstChild as Text;
    const redEntry = redRuns.byNode!.get(redText)!;
    const redGlobal = redEntry.start + 3;
    expect(redGlobal).toBe(3);
    // caret in blue at 4
    const blueText = blue.querySelector('.custom-bg-color')!.firstChild as Text;
    const blueEntry = blueRuns.byNode!.get(blueText)!;
    const blueGlobal = blueEntry.start + 4;
    expect(blueGlobal).toBe(4);
  });

  it('샘플 구조: RTL 텍스트(lang-1) 컨테이너에서 run과 길이/탐색이 정상', () => {
    const arabic = el(`<span data-bc-sid="lang-1"><span class="mark-spanLang" lang="ar" dir="rtl">مرحبا</span></span>`);
    document.body.appendChild(arabic);
    const runs = buildTextRunIndex(arabic, 'lang-1', { buildReverseMap: true });
    expect(runs.total).toBe('مرحبا'.length);
    const midIdx = binarySearchRun(runs.runs, Math.floor(runs.total / 2));
    expect(midIdx).toBeGreaterThanOrEqual(0);
  });
});