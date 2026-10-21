export const PARAGRAPH_PROPOSAL_SAMPLE = {
  original: '승인 버튼의 글자는 읽기 쉬워야 한다.',
  source: '일반 크기의 활성 승인 버튼은 흰 글자와 검정 배경을 사용한다. 적용 범위는 활성 상태이며, 실제 테스트 결과는 아직 없다.',
  proposal: '일반 크기의 활성 승인 버튼은 흰 글자와 검정 배경을 사용하며 글자 대비가 4.5:1 이상이어야 한다. 실제 테스트 결과는 아직 없다.',
  before: '가상 업무 문서 · 승인 버튼의 활성 상태만 검토한다.',
  after: '이후 검토 · 비활성 상태와 실제 테스트 결과는 별도 확인한다.',
  interpretation: '근거 기록은 일반 크기의 활성 승인 버튼에 한해 글자와 배경 색을 정한다.',
  assumption: '4.5:1은 REQ-01@v1과 DEC-01@v1에 없는 새 제안 기준이다. 승인된 기준이나 측정 결과가 아니다.',
  reason: '읽기 쉽다는 표현을 근거의 적용 범위 안에서 검토할 수 있는 제안으로 만든다.',
  limitation: '원문과 문서 구조를 정확히 복원하는 검증이 끝나지 않았습니다. 이 예시는 미리 보기와 거절만 제공합니다.'
};

export function createParagraphProposalSample() {
  const paragraph = (text: string, bookmark: string, marks?: unknown[]) => ({ stype: 'paragraph', attributes: { bookmark },
    content: [{ stype: 'inline-text', text, ...(marks ? { marks } : {}) }] });
  return { stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: [
    paragraph(PARAGRAPH_PROPOSAL_SAMPLE.before, 'fictional-context-before', [{ stype: 'bold', range: [0, 8] }]),
    paragraph(PARAGRAPH_PROPOSAL_SAMPLE.original, 'fictional-requirement'),
    paragraph(PARAGRAPH_PROPOSAL_SAMPLE.after, 'fictional-context-after', [{ stype: 'italic', range: [0, 7] }]),
    { stype: 'bTable', content: [{ stype: 'bTableBody', content: [{ stype: 'bTableRow', content: [{ stype: 'bTableCell', content: [
      paragraph('가상 검토 표 · 구조와 주변 서식은 유지한다.', 'fictional-table-context')
    ] }] }] }] }
  ] }] };
}
