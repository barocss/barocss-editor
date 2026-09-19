import { useState } from 'react';
import { Button, CommandSearch, Dialog } from '@barocss/office-ui';

export function CommandSpecimens() {
  const [open, setOpen] = useState(false);
  const [followup, setFollowup] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [result, setResult] = useState('아직 실행한 명령이 없습니다.');
  return <>
    <Button onClick={() => setOpen(true)}>예시 명령 검색 열기</Button><p role="status">{result}</p>
    <p>검색 결과에는 작업 분류와 단축키가 표시됩니다. 실행할 수 없는 작업은 이유를 표시합니다. 최근 사용 목록은 이번 세션에서 실행한 항목입니다.</p>
    <CommandSearch open={open} onOpenChange={setOpen} recentIds={recent} commands={[
      { id: 'bold', label: '굵게', category: '글자', hint: '⌘B' },
      { id: 'merge', label: '셀 병합', category: '표', disabled: true, disabledReason: '서로 붙어 있는 셀을 두 개 이상 선택하세요.' },
      { id: 'settings', label: '문서 설정', category: '문서' },
    ]} onPick={id => { setResult(`실행: ${id}`); setRecent(previous => [id, ...previous.filter(value => value !== id)].slice(0, 5)); if (id === 'settings') setFollowup(true); }} />
    <Dialog open={followup} onOpenChange={setFollowup} title="명령으로 연 문서 설정"><input aria-label="예시 문서 제목" className="office-search-query" defaultValue="제품 계획" /></Dialog>
  </>;
}
