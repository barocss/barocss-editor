/** A reproducible authoring sample for the supported full-width merge case. */
export function createMergedCellSample(longParagraph = false, parallelColumns = false) {
  const paragraph = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
  const cell = (text: string) => ({ stype: 'bTableCell', content: [paragraph(text)] });
  return { stype: 'document', content: [{ stype: 'surface', attributes: {
    kind: 'flow', pageWidth: 12240, pageHeight: 9000, marginTop: 720, marginBottom: 720, marginLeft: 1440, marginRight: 1440,
  }, content: [paragraph(parallelColumns ? '여러 열의 긴 병합 셀 · 페이지 이어쓰기' : longParagraph ? '병합 셀의 긴 문단 · 줄 단위 페이지 나눔' : '긴 병합 셀 · 페이지 이어쓰기'), {
    stype: 'bTable', attributes: { grid: '3600,3600', width: 7200, widthType: 'dxa', layout: 'fixed' },
    content: [{ stype: 'bTableBody', content: [
      { stype: 'bTableRow', attributes: { isHeader: true }, content: [cell('검토 항목'), cell('상세 내용')] },
      { stype: 'bTableRow', content: parallelColumns ? [54, 34].map((count, column) => ({
        stype: 'bTableCell', attributes: { rowspan: 3, verticalAlign: 'top', shadingFill: column ? 'F3F6FA' : 'EAF1FB' },
        content: Array.from({ length: count }, (_, i) => paragraph(`${column ? '검토' : '항목'} ${String(i + 1).padStart(2, '0')}. 다음 페이지로 이어집니다.`)),
      })) : [{ stype: 'bTableCell', attributes: { rowspan: 3, colspan: 2, shadingFill: 'EAF1FB' },
        content: longParagraph
          ? [paragraph(Array.from({ length: 80 }, (_, i) => `문장 ${String(i + 1).padStart(2, '0')}. 하나의 긴 문단을 줄 단위로 나누어 다음 페이지에서도 이어서 편집할 수 있습니다.`).join(' '))]
          : Array.from({ length: 54 }, (_, i) => paragraph(`병합 문단 ${String(i + 1).padStart(2, '0')}. 다음 페이지에서도 이 셀의 내용을 계속 편집할 수 있습니다.`)) }] },
      { stype: 'bTableRow', content: [] }, { stype: 'bTableRow', content: [] },
      { stype: 'bTableRow', content: [cell('병합 셀 끝'), cell('다음 행도 유지됩니다.')] },
    ] }]
  }, paragraph('표 다음의 본문입니다.')] }] };
}

/** A continuous merge beside individually editable rows. */
export function createStaggeredCellSample() {
  const paragraph = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
  const cell = (content: ReturnType<typeof paragraph>[], attributes = {}) => ({
    stype: 'bTableCell', attributes: { verticalAlign: 'top', ...attributes }, content,
  });
  return { stype: 'document', content: [{ stype: 'surface', attributes: {
    kind: 'flow', pageWidth: 12240, pageHeight: 9000, marginTop: 720, marginBottom: 720, marginLeft: 1440, marginRight: 1440,
  }, content: [paragraph('세로 병합 셀과 일반 행 · 페이지 이어쓰기'), {
    stype: 'bTable', attributes: { grid: '3600,3600', width: 7200, widthType: 'dxa', layout: 'fixed' },
    content: [{ stype: 'bTableBody', content: [
      { stype: 'bTableRow', attributes: { isHeader: true }, content: [cell([paragraph('공통 설명')]), cell([paragraph('개별 검토')])] },
      ...Array.from({ length: 24 }, (_, row) => ({ stype: 'bTableRow', content: [
        ...(row === 0 ? [cell(Array.from({ length: 48 }, (_, i) => paragraph(`설명 ${String(i + 1).padStart(2, '0')}. 병합 셀의 본문입니다.`)),
          { rowspan: 24, shadingFill: 'EAF1FB' })] : []),
        cell([paragraph(`검토 ${String(row + 1).padStart(2, '0')}. 개별 행입니다.`), paragraph('이 행에서 내용을 편집할 수 있습니다.')],
          { shadingFill: row % 2 ? 'FFFFFF' : 'F3F6FA' }),
      ] })),
      { stype: 'bTableRow', content: [cell([paragraph('병합 구간 끝')]), cell([paragraph('다음 행도 유지됩니다.')])] },
    ] }],
  }, paragraph('표 다음의 본문입니다.')] }] };
}
