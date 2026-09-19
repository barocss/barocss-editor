export function createFormatPainterSample() {
  const paragraph = (text: string, attributes = {}) => ({ stype: 'paragraph', attributes,
    content: [{ stype: 'inline-text', text }] });
  return { stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: [
    { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text: '문단 서식 복사' }] },
    paragraph('아래 기준 문단에서 서식 복사를 시작하세요. 문단 서식 포함과 연속 적용을 켠 뒤 적용할 문단을 클릭하세요.'),
    paragraph('기준 문단 · 가운데 정렬과 넉넉한 줄 간격', { alignment: 'center', indentLeft: 360, indentRight: 360,
      spacingBefore: 240, spacingAfter: 240, spacingLine: 360, spacingLineRule: 'auto', color: '2459A6', bold: true }),
    paragraph('첫 번째 적용 문단입니다. 이 문단을 클릭해 기준 문단의 배치를 적용하세요.'),
    paragraph('두 번째 적용 문단입니다. 연속 적용에서는 다시 서식을 복사할 필요가 없습니다.'),
    paragraph('Esc 키로 서식 복사를 끝냅니다. 실행 취소는 마지막 적용부터 한 단계씩 되돌립니다.'),
  ] }] };
}
