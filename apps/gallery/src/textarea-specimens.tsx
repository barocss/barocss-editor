import { useRef, useState } from 'react';
import { Button, PropertyToggle, TextAreaField } from '@barocss/office-ui';

export function TextAreaSpecimens() {
  const [saved, setSaved] = useState('첫 줄\n둘째 줄');
  const [live, setLive] = useState('실시간 입력');
  const [fail, setFail] = useState(false);
  const [delay, setDelay] = useState(false);
  const release = useRef<(() => void) | undefined>(undefined);
  const [waiting, setWaiting] = useState(false);
  const [count, setCount] = useState(0);
  return <div className="ds-field-examples">
    <div className="ds-surface ds-field-cases"><strong>확정형 입력</strong>
      <TextAreaField ariaLabel="확정형 여러 줄" value={saved} onCommit={async value => { setCount(n => n + 1); if (delay) { setWaiting(true); await new Promise<void>(resolve => { release.current = resolve; }); setWaiting(false); } if (fail) return false; setSaved(value); return true; }} />
      <PropertyToggle ariaLabel="다중행 실패 예시" label="적용 실패 예시" value={fail} onChange={setFail} />
      <PropertyToggle ariaLabel="다중행 대기 예시" label="적용 대기 예시" value={delay} onChange={setDelay} />
      {waiting && <Button onClick={() => release.current?.()}>대기 완료</Button>}
      <Button onClick={() => setSaved('외부에서 갱신한 값')}>외부 값 변경</Button>
      <p data-multiline-count>적용 횟수: {count}</p><pre data-multiline-saved>{saved}</pre>
    </div>
    <div className="ds-surface ds-field-cases"><strong>실시간 입력과 읽기 전용</strong>
      <TextAreaField ariaLabel="실시간 여러 줄" value={live} onChange={setLive} />
      <TextAreaField ariaLabel="읽기 전용 여러 줄" value="검토가 끝난 내용입니다." readOnly />
      <TextAreaField ariaLabel="비활성 여러 줄" value="권한이 없는 항목입니다." disabled />
    </div>
  </div>;
}
