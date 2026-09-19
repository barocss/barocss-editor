import { useState } from 'react';
import { Button, ChoiceSelect, RibbonGroup, RibbonToolbar, TextField, ToolbarToggle, Icon } from '@barocss/office-ui';

export function OverflowSpecimens() {
  const [width, setWidth] = useState('360');
  const [name, setName] = useState('분기 계획');
  const [bold, setBold] = useState(false);
  const [count, setCount] = useState(0);
  return <div className="ds-overflow-example">
    <div className="ds-overflow-settings"><span>도구 모음 너비</span><ChoiceSelect ariaLabel="예시 도구 모음 너비" value={width} onChange={setWidth} options={[{ id: '280', label: '280px' }, { id: '360', label: '360px' }, { id: '960', label: '960px' }]} /></div>
    <div className="ds-overflow-frame" style={{ width: Number(width) }}>
      <RibbonToolbar compact label="예시 편집 도구">
        <RibbonGroup id="name" label="문서 이름"><TextField ariaLabel="도구 예시 문서 이름" value={name} onCommit={setName} /></RibbonGroup>
        <RibbonGroup id="format" label="글자 서식"><ToolbarToggle id="overflow-bold" label="넘침 예시 굵게" state={bold ? 'on' : 'off'} onActivate={() => setBold(value => !value)}><Icon name="bold" size={16} /></ToolbarToggle><Button disabled>기울임</Button></RibbonGroup>
        <RibbonGroup id="insert" label="삽입"><Button onClick={() => setCount(value => value + 1)}>항목 삽입</Button><Button disabled>연결 삽입</Button></RibbonGroup>
        <RibbonGroup id="advanced" label="상세 설정"><Button onClick={() => setCount(value => value + 1)}>설정 적용</Button></RibbonGroup>
      </RibbonToolbar>
    </div>
    <p>오른쪽 점 세 개를 누르면 도구 그룹을 찾을 수 있습니다. 그룹을 선택하면 원래 도구로 이동합니다. 키보드로 이동해도 현재 도구가 화면 안에 표시됩니다.</p>
    <span role="status">저장된 이름: {name} · 굵게: {bold ? '켜짐' : '꺼짐'} · 실행: {count}회</span>
  </div>;
}
