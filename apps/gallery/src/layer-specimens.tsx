import { useState } from 'react';
import { Icon, LayerActions } from '@barocss/office-ui';

const initial = [
  { id: 'cover', label: '표지', icon: 'insert-frame', hidden: false, locked: false, depth: 0 },
  { id: 'title', label: '제품 소개', icon: 'insert-textbox', hidden: false, locked: false, depth: 1 },
  { id: 'image', label: '분기별 제품 출시 계획을 설명하는 긴 이름의 이미지', icon: 'insert-image', hidden: false, locked: true, depth: 1 },
  { id: 'draft', label: '검토 중인 문구', icon: 'insert-textbox', hidden: true, locked: false, depth: 1 },
];
export function LayerSpecimens() {
  const [rows, setRows] = useState(initial);
  const [selected, setSelected] = useState('title');
  const [expanded, setExpanded] = useState(true);
  const update = (id: string, patch: { hidden?: boolean; locked?: boolean }) => setRows(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row));
  return <div className="ds-navigation-examples">
    <div className="ds-layer-panel" aria-label="레이어 예시">
      <div className="ds-layer-heading">레이어 <span>4개 객체</span></div>
      <div className="ds-layer-list">
        {rows.filter(row => expanded || row.depth === 0).map(row => <div key={row.id} className="office-layer-row"
          data-example-layer={row.id} data-row-selected={selected === row.id || undefined} data-row-hidden={row.hidden || undefined}
          style={{ paddingLeft: 4 + row.depth * 12 }}>
          {row.depth === 0 ? <button type="button" className="office-layer-disclosure" aria-label={`표지 ${expanded ? '접기' : '펼치기'}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            <Icon name={expanded ? 'disclosed' : 'collapsed'} size={12} />
          </button> : <span className="office-layer-disclosure-space" />}
          <button type="button" className="office-layer-pick" title={row.label} aria-pressed={selected === row.id} onClick={() => setSelected(row.id)}>
            <Icon name={row.icon} size={14} /><span>{row.label}</span>
          </button>
          <LayerActions label={row.label} hidden={row.hidden} locked={row.locked} onHiddenChange={hidden => update(row.id, { hidden })} onLockedChange={locked => update(row.id, { locked })} />
        </div>)}
      </div>
    </div>
    <div className="ds-navigation-guidance"><strong>선택과 행 도구를 분리</strong><p>이름을 누르면 객체를 선택합니다. 눈과 자물쇠는 해당 객체의 상태만 바꿉니다.</p><p>Tab 키로 도구에 이동할 수 있습니다. 숨김·잠금 상태는 마우스를 올리지 않아도 표시합니다.</p><p>긴 이름은 말줄임합니다. 마우스를 올리면 전체 이름을 확인할 수 있습니다.</p><span>선택한 객체: {rows.find(row => row.id === selected)?.label}</span></div>
  </div>;
}
