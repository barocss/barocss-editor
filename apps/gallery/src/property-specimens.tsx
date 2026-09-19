import { useState } from 'react';
import { Button, PropertyGroup, PropertyNumber, PropertyPanel, PropertyRow, PropertySheet } from '@barocss/office-ui';
const initial = [
  { name: '제목', width: 240, rotation: 15, opacity: 100, visible: true, locked: false },
  { name: '설명', width: 320, rotation: 0, opacity: 60, visible: false, locked: true },
];
export function PropertySpecimens() {
  const [objects, setObjects] = useState(initial);
  const [folded, setFolded] = useState(false);
  const [writes, setWrites] = useState(0);
  const value = (key: keyof typeof initial[0]) => objects.every(item => item[key] === objects[0][key]) ? objects[0][key] : null;
  const write = (patch: Partial<typeof initial[0]>) => { setObjects(items => items.map(item => ({ ...item, ...patch }))); setWrites(n => n + 1); };
  return <div className="ds-property-examples">
    <PropertyPanel title="2개 객체 선택">
      <PropertyGroup label="배치와 표시를 함께 조정하는 속성" folded={folded} onFold={setFolded}
        onReset={() => write({ rotation: 0, opacity: 100 })} resetLabel="예시 회전·불투명도 초기화" resetDisabled={value('rotation') === 0 && value('opacity') === 100}>
        <PropertyRow label="너비"><PropertyNumber ariaLabel="예시 너비" value={value('width') as number | null} onCommit={width => write({ width })} suffix="px" min={1} /></PropertyRow>
        <PropertyRow label="회전"><PropertyNumber ariaLabel="예시 회전" value={value('rotation') as number | null} onCommit={rotation => write({ rotation })} suffix="°" /></PropertyRow>
        <PropertyRow label="불투명도"><PropertyNumber ariaLabel="예시 불투명도" value={value('opacity') as number | null} onCommit={opacity => write({ opacity })} suffix="%" min={0} max={100} /></PropertyRow>
      </PropertyGroup>
      <PropertySheet groups={[{ label: '상태', rows: [
        { attr: 'visible', group: 'state', label: '표시', ariaLabel: '예시 표시', control: 'toggle' },
        { attr: 'locked', group: 'state', label: '잠금', ariaLabel: '예시 잠금', control: 'toggle' },
      ] }]} value={row => value(row.attr as 'visible' | 'locked')} onWrite={(row, next) => write({ [row.attr]: next })} />
    </PropertyPanel>
    <div className="ds-property-readout"><strong>서로 다른 값은 혼합 상태로 표시</strong><p>숫자는 —, 체크박스는 가로선으로 표시합니다. 입력하면 두 객체에 같은 값을 적용합니다.</p><p>초기화는 회전과 불투명도만 되돌립니다. 너비·표시·잠금은 유지합니다.</p>
      <div className="ds-property-values">{objects.map(item => <div key={item.name}><strong>{item.name}</strong><span>너비 {item.width}px · 회전 {item.rotation}° · 불투명도 {item.opacity}%</span><span>{item.visible ? '표시' : '숨김'} · {item.locked ? '잠금' : '잠금 해제'}</span></div>)}</div>
      <span role="status">적용 횟수: {writes}</span><Button onClick={() => { setObjects(initial); setWrites(0); }}>혼합 상태 다시 보기</Button>
    </div>
  </div>;
}
