import { useState } from 'react';
import { Button, PropertyToggle, TaskStatus, type TaskPhase } from '@barocss/office-ui';

export function TaskSpecimens() {
  const [phase, setPhase] = useState<TaskPhase>('running');
  const [visible, setVisible] = useState(true);
  const [known, setKnown] = useState(false);
  const start = () => { setPhase('running'); setVisible(true); };
  return <>
    <p>상태 전환을 확인하는 예시입니다. 실제 파일을 읽거나 저장하지 않습니다.</p>
    <div className="ds-selection-controls">
      <Button onClick={start}>예시 작업 시작</Button>
      <Button disabled={!visible || phase !== 'running'} onClick={() => setPhase('success')}>완료 상태 보기</Button>
      <Button disabled={!visible || phase !== 'running'} onClick={() => setPhase('error')}>실패 상태 보기</Button>
      <PropertyToggle ariaLabel="진행률 제공 예시" label="진행률 제공" value={known} onChange={setKnown} />
    </div>
    {visible && <TaskStatus title={phase === 'running' ? '예시 파일 처리 중' : phase === 'success' ? '예시 작업 완료' : phase === 'error' ? '예시 작업 실패' : '예시 작업 취소됨'} phase={phase}
      description={phase === 'error' ? '파일을 처리하지 못했습니다. 입력 파일을 확인한 뒤 다시 시도하세요.' : phase === 'success' ? '분기 계획과 검토 의견이 포함된 최종 문서.json' : phase === 'cancelled' ? '문서를 변경하지 않았습니다.' : '실제 진행률이 없으면 회전 표시만 사용합니다.'}
      progress={known ? 45 : undefined} onDismiss={() => setVisible(false)}
      actions={phase === 'running' ? <Button tone="quiet" onClick={() => setPhase('cancelled')}>예시 작업 취소</Button> : phase === 'error' ? <Button tone="quiet" onClick={start}>예시 작업 다시 시도</Button> : undefined} />}
    <p>실제 취소·재시도를 제공하는 작업에만 해당 버튼을 표시합니다. 완료와 오류 안내는 자동으로 닫지 않습니다.</p>
  </>;
}
