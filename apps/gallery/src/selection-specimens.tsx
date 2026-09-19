import { useState, type CSSProperties } from 'react';
import { Button, ChoiceSelect, SelectionReadout, selectionResizeHandles } from '@barocss/office-ui';

export function SelectionSpecimens() {
  const [readout, setReadout] = useState<{ x: number; y: number }>();
  const [zoom, setZoom] = useState('100');
  const [size, setSize] = useState('normal');
  const [state, setState] = useState('selected');
  const scale = Number(zoom) / 100;
  const width = size === 'small' ? 12 : 110, height = size === 'small' ? 12 : 70;
  const handles = selectionResizeHandles(width * scale, height * scale);
  const active = state === 'selected' || state === 'multiple';
  return <>
    <div className="ds-selection-controls">
      <ChoiceSelect ariaLabel="선택 도구 상태" value={state} onChange={setState} options={[
        { id: 'hover', label: '마우스 올림' }, { id: 'selected', label: '단일 선택' },
        { id: 'multiple', label: '다중 선택' }, { id: 'editing', label: '텍스트 편집 중' },
        { id: 'locked', label: '잠금' },
      ]} />
      <ChoiceSelect ariaLabel="선택 도구 예시 배율" value={zoom} onChange={setZoom} options={['50', '100', '200'].map(id => ({ id, label: `${id}%` }))} />
      <ChoiceSelect ariaLabel="선택 객체 크기" value={size} onChange={setSize} options={[{ id: 'normal', label: '일반 객체' }, { id: 'small', label: '작은 객체 · 12px' }]} />
    </div>
    <div className="ds-selection-stage" aria-label="선택 도구 표시 예시">
      <div className="ds-selection-object" style={{ width, height, transform: `scale(${scale})`, '--ou-selection-scale': scale } as CSSProperties}>
        {size === 'normal' && <span>선택한 객체</span>}
        {state === 'multiple' && <div className="ds-selection-inner office-selection-frame" />}
        <div className="ds-selection-outline office-selection-frame" data-selection-state={state}>
          {active && handles.map(handle => <span key={handle} className="office-selection-handle ds-selection-handle" data-handle={handle} aria-hidden="true" style={{ left: handle.includes('w') ? 0 : handle.includes('e') ? '100%' : '50%', top: handle.startsWith('n') ? 0 : handle.startsWith('s') ? '100%' : '50%' }} />)}
          {state === 'selected' && <span className="office-selection-handle ds-selection-handle ds-selection-rotate" data-handle="rotate" aria-hidden="true" />}
        </div>
      </div>
    </div>
    <div className="ds-selection-controls">
      <Button onClick={() => setReadout({ x: window.innerWidth - 2, y: window.innerHeight - 2 })}>경계에서 크기 표시</Button>
      <Button disabled={!readout} onClick={() => setReadout(undefined)}>크기 표시 숨기기</Button>
    </div>
    {readout && <SelectionReadout data-selection-example-readout at={readout}>240 × 160 px</SelectionReadout>}
    <p>크기 표시는 화면 안에 배치되며 포커스와 키보드 입력을 가져가지 않습니다. 정렬 가이드는 분홍색, 표 크기 조절 경계는 선택 강조색을 사용합니다.</p>
    <div className="ds-selection-guides" aria-label="가이드 비교"><span className="ds-snap-guide">정렬 가이드</span><span className="ds-table-guide">표 너비 조절</span></div>
    <p>배율을 바꿔도 선택선은 1px, 핸들은 8px로 유지합니다. Word·Slides의 포인터 영역은 16px입니다. 작은 객체는 겹치는 핸들을 줄이고 오른쪽 아래 핸들을 우선 표시합니다. 드래그 중인 핸들은 유지합니다. 잠금·텍스트 편집 중에는 조절 핸들을 표시하지 않습니다. 실제 이동·크기 변경은 제품 화면에서 확인합니다.</p>
  </>;
}
