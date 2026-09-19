export function createReferenceSample() {
  return { stype: 'document', content: [{ stype: 'surface', attributes: { kind: 'flow' }, content: [
    { stype: 'heading', attributes: { level: 1 }, content: [{ stype: 'inline-text', text: '책갈피와 상호 참조' }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: '프로젝트 목표', marks: [{ stype: 'bookmark', attrs: { name: '목표' }, range: [0, 7] }] }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: '참조: ' }, { stype: 'fieldRef', attributes: { targetId: '목표', format: 'text', useHyperlink: true } }, { stype: 'inline-text', text: ' — 클릭하면 목표로 이동합니다.' }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: '새 참조를 여기에 삽입하세요.' }] },
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: '참조 탭에서 책갈피를 관리하세요. 이름 변경, 위치 이동, 삭제와 실행 취소를 확인할 수 있습니다.' }] },
  ] }] };
}
