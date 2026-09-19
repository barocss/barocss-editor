export function createStyleManagementSample() {
  const paragraph = (text: string, styleId = 'ReportBody') => ({ stype: 'paragraph', attributes: { styleId }, content: [{ stype: 'inline-text', text }] });
  return { stype: 'document', content: [
    { stype: 'resources', content: [{ stype: 'styleDef', attributes: { id: 'ReportBody', name: '보고서 본문', type: 'paragraph', basedOn: 'Body', fontSize: 26, spacingAfter: 240 } }] },
    { stype: 'surface', attributes: { kind: 'flow' }, content: [
      { stype: 'heading', attributes: { level: 1, styleId: 'Heading1' }, content: [{ stype: 'inline-text', text: '문서 스타일 관리' }] },
      paragraph('같은 스타일을 사용하는 첫 번째 문단입니다. 스타일을 수정하면 함께 바뀝니다.'),
      paragraph('두 번째 문단에도 보고서 본문 스타일을 적용했습니다. 글꼴과 간격을 한 번에 관리하세요.'),
      paragraph('이 문단은 기본 본문 스타일입니다. 리본의 스타일 목록에서 보고서 본문을 선택해 적용해 보세요.', 'Body'),
    ] },
  ] };
}
