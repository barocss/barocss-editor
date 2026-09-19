export function createCaptionSample() {
  const paragraph = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
  const figure = (color: string, alt: string) => ({ stype: 'paragraph', content: [
    { stype: 'inline-text', text: '' },
    { stype: 'inline-image', attributes: { width: 4200, height: 1350, alt,
      src: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="280" height="90"><rect width="280" height="90" rx="4" fill="#f1f5f9"/><rect x="24" y="49" width="48" height="25" fill="${color}"/><rect x="92" y="31" width="48" height="43" fill="${color}"/><rect x="160" y="15" width="48" height="59" fill="${color}"/></svg>`)}` } },
    { stype: 'inline-text', text: '' }
  ] });
  return { stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: [
    { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text: '캡션과 자동 번호' }] },
    paragraph('그림을 선택한 뒤 참조 → 캡션 삽입을 누르세요. 종류, 위치, 설명을 정할 수 있습니다.'),
    figure('#3763c7', '첫 번째 그림'),
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: '그림 ' }, { stype: 'fieldSeq', attributes: { sequence: 'Figure' } }, { stype: 'inline-text', text: ': 분기별 성장' }] },
    figure('#65758b', '두 번째 그림'),
    paragraph('두 번째 그림에도 캡션을 추가해 보세요. 앞쪽에 캡션을 넣으면 뒤의 번호가 자동으로 바뀝니다.')
  ] }] };
}
