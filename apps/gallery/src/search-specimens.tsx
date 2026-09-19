import { useState } from 'react';
import { Button, Dialog, PropertyToggle, SearchSelect, SelectionTag } from '@barocss/office-ui';

const options = [
  { id: 'launch', label: '제품 출시', description: '프로젝트 · 이번 달' },
  { id: 'research', label: '사용자 조사', description: '프로젝트 · 다음 달' },
  { id: 'locked', label: '보관된 프로젝트', description: '선택할 수 없는 항목', disabled: true },
  { id: 'long', label: '여러 제품에서 함께 사용하는 아주 긴 이름의 통합 오피스 디자인 시스템 검토', description: '공통 UI' },
];
export function SearchSpecimens() {
  const [single, setSingle] = useState('launch');
  const [multi, setMulti] = useState(['launch']);
  const [readOnly, setReadOnly] = useState(false);
  const [reject, setReject] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(false);
  const [opened, setOpened] = useState('');
  return <>
    <div className="ds-search-examples">
      <div><h3>원본 자료 · 단일 선택</h3><SearchSelect ariaLabel="예시 원본 자료" options={options} value={single} onChange={setSingle} readOnly={readOnly} /></div>
      <div><h3>관계 · 다중 선택</h3><SearchSelect multiple ariaLabel="예시 프로젝트" options={options} value={multi} readOnly={readOnly}
        onChange={next => { if (reject) setError('저장하지 못했습니다. 기존 선택을 유지합니다.'); else { setError(''); setMulti(next); } }} /></div>
    </div>
    <div className="ds-selection-controls"><PropertyToggle ariaLabel="선택 읽기 전용" label="읽기 전용" value={readOnly} onChange={setReadOnly} /><PropertyToggle ariaLabel="선택 저장 실패 예시" label="저장 실패 예시" value={reject} onChange={setReject} /><Button onClick={() => setDialog(true)}>자료 선택 창 열기</Button></div>
    {error && <p role="alert">{error}</p>}
    <p>검색 후 방향키와 Enter로 선택합니다. 단일 선택은 닫히고 다중 선택은 유지됩니다. Escape는 선택 목록부터 닫습니다. 한글 조합 중 Enter는 항목을 선택하지 않습니다.</p>
    <SelectionTag label="연결된 자료" onOpen={() => setOpened('연결된 자료를 열었습니다.')} /><span role="status">{opened}</span>
    <Dialog open={dialog} onOpenChange={setDialog} title="자료 선택" description="검색 목록을 먼저 닫은 뒤 창을 닫습니다."><SearchSelect ariaLabel="창 원본 자료" options={options} value={single} onChange={setSingle} /></Dialog>
  </>;
}
