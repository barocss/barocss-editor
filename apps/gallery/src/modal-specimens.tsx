import { useState } from 'react';
import { Button, ChoiceSelect, ColorField, Dialog, DialogButton, Drawer, TextField } from '@barocss/office-ui';

export function ModalSpecimens() {
  const [mode, setMode] = useState<'dialog' | 'drawer' | null>(null);
  const [name, setName] = useState('팀 문서 설정');
  const [saved, setSaved] = useState(name);
  const [color, setColor] = useState<string | null>('#2563eb');
  const [choice, setChoice] = useState('team');
  const [long, setLong] = useState(false);
  const content = <div className="ds-modal-form">
    <label>문서 이름<TextField ariaLabel="창 문서 이름" value={name} onChange={setName} /></label>
    <label>공유 범위<ChoiceSelect ariaLabel="창 공유 범위" value={choice} onChange={setChoice} options={[{ id: 'team', label: '팀 구성원' }, { id: 'private', label: '나만 보기' }]} className="w-full" /></label>
    <div><span>표시 색상</span><ColorField ariaLabel="창 표시 색상" value={color} onChange={setColor} onClear={() => setColor(null)} /></div>
    <Button tone="quiet" onClick={() => setLong(!long)}>{long ? '간단한 내용 보기' : '긴 내용 확인'}</Button>
    {long && Array.from({ length: 16 }, (_, i) => <label key={i}>검토 항목 {i + 1}<TextField ariaLabel={`검토 항목 ${i + 1}`} value={`문서 설정 확인 ${i + 1}`} readOnly /></label>)}
  </div>;
  const open = (next: 'dialog' | 'drawer') => { setName(saved); setLong(false); setMode(next); };
  return <div className="ds-surface ds-modal-examples">
    <div><strong>설정 다이얼로그</strong><p>본문이 길어도 제목과 적용 버튼을 유지합니다.</p><Button onClick={() => open('dialog')}>설정 창 열기</Button></div>
    <div><strong>오른쪽 Drawer</strong><p>전체 높이에서 내용을 편집합니다. 작은 화면에서는 너비를 채웁니다.</p><Button onClick={() => open('drawer')}>상세 패널 열기</Button></div>
    <p role="status">적용된 이름: {saved}</p>
    <Dialog open={mode === 'dialog'} onOpenChange={value => { if (!value) setMode(null); }} title="문서 설정" description="설정값을 확인한 뒤 적용하세요. 색상 팝업은 Esc로 먼저 닫습니다."
      footer={<><DialogButton onClick={() => setMode(null)}>취소</DialogButton><DialogButton variant="primary" onClick={() => { setSaved(name); setMode(null); }}>적용</DialogButton></>}>{content}</Dialog>
    <Drawer open={mode === 'drawer'} onOpenChange={value => { if (!value) setMode(null); }} title="팀에서 함께 검토하는 문서의 상세 속성" description="긴 제목과 설명을 잘라내지 않습니다. 본문만 스크롤합니다.">{content}</Drawer>
  </div>;
}
