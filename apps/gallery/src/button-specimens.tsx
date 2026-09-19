import { useState } from 'react';
import { Button, Dialog, DialogButton, Icon, IconButton, PropertyGroup, PropertyPanel, Toolbar, ToolbarToggle } from '@barocss/office-ui';

/** Exercise the same buttons on a neutral surface, in an inspector and in a portal. */
export function ButtonSpecimens() {
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState(true);
  const [mixed, setMixed] = useState<'mixed' | 'on' | 'off'>('mixed');
  const [dialog, setDialog] = useState(false);
  const [result, setResult] = useState('버튼을 눌러 동작을 확인하세요.');
  const activate = () => setCount(value => value + 1);
  return <>
    <div className="ds-button-examples">
      <div className="ds-surface ds-button-cases">
        <div><strong>기본 동작</strong><div><Button onClick={activate} ariaLabel="기본 버튼 확인"><Icon name="add" />새 문서</Button><Button tone="accent" onClick={activate} ariaLabel="강조 버튼 확인">적용</Button><Button tone="quiet" onClick={activate} ariaLabel="보조 버튼 확인">취소</Button></div><p>주요 동작 한 개만 강조합니다. 보조 동작은 배경을 채우지 않습니다.</p></div>
        <div><strong>선택 상태</strong><div><Button pressed={selected} onClick={() => setSelected(!selected)} ariaLabel="텍스트 선택 버튼">가운데 정렬</Button><IconButton label="아이콘 선택 버튼" pressed={selected} onClick={() => setSelected(!selected)}><Icon name="align-center" /></IconButton><Toolbar label="버튼 혼합 상태" variant="inline"><ToolbarToggle id="button-mixed" label="버튼 혼합 굵게" state={mixed} onActivate={() => setMixed(mixed === 'on' ? 'off' : 'on')}><Icon name="bold" /></ToolbarToggle></Toolbar></div><p>선택은 옅은 강조 배경, 혼합 값은 빗금으로 구분합니다.</p></div>
        <div><strong>아이콘과 크기</strong><div><IconButton label="기본 아이콘 버튼" onClick={activate}><Icon name="close" /></IconButton><IconButton label="작은 아이콘 버튼" size="sm" onClick={activate}><Icon name="close" /></IconButton><Button square ariaLabel="테두리 아이콘 버튼" onClick={activate}><Icon name="add" /></Button><Button onClick={() => setDialog(true)}>다이얼로그 버튼 확인</Button></div><p>아이콘은 16px, 작은 버튼은 14px입니다. 작은 클릭 영역도 24px를 확보합니다.</p></div>
        <div><strong>비활성</strong><div><Button disabled onClick={activate}>새 문서</Button><Button tone="accent" disabled onClick={activate} ariaLabel="비활성 강조 버튼">적용</Button><IconButton label="비활성 아이콘 버튼" disabled onClick={activate}><Icon name="close" /></IconButton></div><p>비활성 버튼은 마우스와 키보드로 실행되지 않습니다.</p></div>
      </div>
      <PropertyPanel title="버튼 표면 비교"><PropertyGroup label="같은 강조 버튼"><Button tone="accent" ariaLabel="속성 패널 강조 버튼" onClick={activate}>적용</Button><Button ariaLabel="속성 패널 기본 버튼" onClick={activate}>초기화</Button><Button tone="quiet" onClick={activate}>취소</Button></PropertyGroup><PropertyGroup label="확인 방법"><p className="ds-button-hint">마우스를 올리고 누른 상태를 비교하세요. Tab 키로 이동하면 포커스 테두리가 나타납니다.</p></PropertyGroup></PropertyPanel>
    </div>
    <p className="ds-feedback" role="status" data-button-feedback>실행 횟수: {count} · {result}</p>
    <Dialog title="버튼 동작 확인" description="이 예시는 문서를 저장하지 않습니다." open={dialog} onOpenChange={setDialog}
      footer={<><DialogButton onClick={() => setDialog(false)}>취소</DialogButton><DialogButton variant="primary" type="submit" form="button-audit-form" name="action" value="적용">적용</DialogButton></>}>
      <form id="button-audit-form" onSubmit={event => { event.preventDefault(); const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement; setResult(`${submitter.value} 완료`); setDialog(false); }}>
        <p>하단 적용 버튼으로 폼 제출과 닫기 동작을 확인합니다.</p>
      </form>
    </Dialog>
  </>;
}
