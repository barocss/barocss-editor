import { useEffect, useRef, useState } from 'react';
import { Button, StatusIndicator, StatusNotice, TextField } from '@barocss/office-ui';

/** Local transitions only. No product document or browser storage is changed. */
export function StatusSpecimens() {
  const [phase, setPhase] = useState<'error' | 'saving' | 'saved' | 'conflict' | 'recovered'>('error');
  const [name, setName] = useState('분기 출시 계획');
  const [savedName, setSavedName] = useState('');
  const [fail, setFail] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const retry = () => {
    if (lock.current) return;
    lock.current = true; setPhase('saving'); setAttempts(n => n + 1);
    timer.current = setTimeout(() => {
      if (!fail) setSavedName(name);
      setPhase(fail ? 'error' : 'saved'); lock.current = false;
    }, 700);
  };
  return <div className="ds-operation-examples">
    <div className="ds-operation-states" aria-label="저장 상태 비교">
      <StatusIndicator busy>불러오는 중</StatusIndicator>
      <StatusIndicator busy>저장 중</StatusIndicator>
      <StatusIndicator tone="success">저장됨</StatusIndicator>
      <StatusIndicator tone="danger">저장 실패</StatusIndicator>
      <StatusIndicator tone="warning">충돌한 초안 보관됨</StatusIndicator>
    </div>
    <div className="ds-operation-demo">
      <div className="ds-operation-heading"><strong>작업을 유지한 채 다시 시도</strong><span>로컬 시뮬레이션 · 실제 저장 없음</span></div>
      <label>문서 이름<TextField ariaLabel="복구 예시 문서 이름" value={name} onChange={setName} disabled={phase === 'saving'} /></label>
      {phase === 'error' && <StatusNotice tone="danger" title="변경 사항을 저장하지 못했습니다" actions={<Button onClick={retry}>저장 다시 시도</Button>}>현재 입력은 이 화면에 남아 있습니다. 창을 닫기 전에 다시 시도하세요.</StatusNotice>}
      {phase === 'saving' && <div className="ds-operation-progress"><StatusIndicator busy>저장 중</StatusIndicator><Button disabled>저장 다시 시도</Button></div>}
      {phase === 'saved' && <StatusNotice tone="success" title="변경 사항을 저장했습니다">이 예시에서 적용한 이름: {savedName}</StatusNotice>}
      {phase === 'conflict' && <StatusNotice tone="warning" title="복구할 초안이 있습니다" actions={<Button onClick={() => { setSavedName(name); setPhase('recovered'); }}>새 자료로 복구</Button>}>다른 창의 최신본은 유지됩니다. 내 초안을 별도 자료로 복구해 비교하세요.</StatusNotice>}
      {phase === 'recovered' && <StatusNotice tone="success" title="초안을 새 자료로 복구했습니다">복구한 이름: {savedName}. 이 예시는 원본을 변경하지 않습니다.</StatusNotice>}
      <div className="ds-operation-scenarios">
        <Button tone="quiet" disabled={phase === 'saving'} onClick={() => { setFail(false); setPhase('error'); }}>저장 실패 확인</Button>
        <Button tone="quiet" disabled={phase === 'saving'} onClick={() => { setFail(true); setPhase('error'); }}>재시도 실패 확인</Button>
        <Button tone="quiet" disabled={phase === 'saving'} onClick={() => setPhase('conflict')}>충돌 복구 확인</Button>
        <span>재시도 횟수: {attempts}</span>
      </div>
    </div>
  </div>;
}
