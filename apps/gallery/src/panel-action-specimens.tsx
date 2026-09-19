import { useState } from 'react';
import { Button, FloatingPanelFooter, FloatingPanelHeader, PropertyToggle, StatusNotice, TextField } from '@barocss/office-ui';

export function PanelActionSpecimens() {
  const [draft, setDraft] = useState('진행 중인 작업');
  const [saved, setSaved] = useState(draft);
  const [fail, setFail] = useState(false);
  const [error, setError] = useState(false);
  return <div style={{ maxWidth: 560, padding: 16, border: '1px solid var(--ou-line)', borderRadius: 'var(--ou-radius)' }}>
    <FloatingPanelHeader title="보기 설정 예시" onClose={() => { setDraft(saved); setError(false); }} closeLabel="예시 변경 취소" />
    <TextField ariaLabel="예시 보기 이름" value={draft} onChange={setDraft} placeholder="보기 이름" />
    <PropertyToggle ariaLabel="적용 실패 예시" label="적용 실패 예시" value={fail} onChange={setFail} />
    {error && <StatusNotice title="보기를 저장하지 못했습니다." tone="danger">입력은 유지됩니다. 실패 예시를 끈 뒤 다시 적용하세요.</StatusNotice>}
    <FloatingPanelFooter leading={<Button tone="quiet" onClick={() => setDraft('')}>초기화</Button>}>
      <Button onClick={() => { setDraft(saved); setError(false); }}>취소</Button>
      <Button tone="accent" disabled={!draft.trim()} onClick={() => { if (fail) setError(true); else { setSaved(draft); setError(false); } }}>적용</Button>
    </FloatingPanelFooter>
    <p role="status">적용된 이름: {saved}</p>
  </div>;
}
