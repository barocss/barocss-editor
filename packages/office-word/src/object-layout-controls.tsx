import { useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { ChoiceSelect, Icon, NumberField, RibbonAction, RibbonGroup, ToolbarToggle } from '@barocss/office-ui';
import { WordObjectPropertiesDialog } from './object-properties-dialog';
import { TWIPS_PER_CM, type WordObjectChange, type WordObjectTarget } from './object-layout';
import { WordTableDimensionControls } from './table-dimension-controls';

export function WordObjectLayoutControls({ editor, target, container }: { editor: Editor; target: WordObjectTarget; container?: HTMLElement | null }) {
  const [locked, setLocked] = useState(true);
  const [error, setError] = useState('');
  const [properties, setProperties] = useState(false);
  const attrs = editor.dataStore.getNode(target.nodeId)?.attributes ?? {};
  const image = target.kind === 'image' ? Array.from(container?.querySelectorAll<HTMLImageElement>('img.w-image') ?? [])
    .find(el => el.getAttribute('data-bc-sid') === target.nodeId) : undefined;
  const cm = (key: 'width' | 'height') => typeof attrs[key] === 'number' ? Number(attrs[key]) / TWIPS_PER_CM
    : image ? (key === 'width' ? image.offsetWidth : image.offsetHeight) * 2.54 / 96 : null;
  const ratio = Number(attrs.width) / Number(attrs.height);
  const cropValue = attrs.cropMode !== 'cover' ? 'reset' : Math.abs(ratio - 1) < 0.01 ? 'square' : Math.abs(ratio - 16 / 9) < 0.01 ? 'landscape' : Math.abs(ratio - 3 / 4) < 0.01 ? 'portrait' : 'custom';
  const apply = async (change: WordObjectChange) => {
    setError('');
    try {
      if (!await editor.run('setWordObjectLayout', { ...target, ...change })) setError('변경하지 못했습니다. 표나 그림을 다시 선택하세요.');
    } catch { setError('변경하지 못했습니다. 다시 시도하세요.'); }
  };
  const size = (key: 'width' | 'height') => <NumberField
    ariaLabel={`${target.kind === 'table' ? '표' : '그림'} ${key === 'width' ? '너비' : '높이'}`}
    prefix={key === 'width' ? '너비' : '높이'} suffix="cm" value={target.kind === 'table' && attrs.widthType !== 'dxa' ? null : cm(key)}
    min={0.1} max={55} step={0.1} decimals={2} disabled={!editor.isEditable}
    onCommit={value => {
      const other = key === 'width' ? 'height' : 'width';
      const old = cm(key); const paired = cm(other);
      void apply({ [key]: value, ...(target.kind === 'image' && locked && old && paired ? { [other]: paired * value / old } : {}) });
    }} />;
  return <><RibbonGroup id={`${target.kind}-layout`} label={target.kind === 'table' ? '표 크기·배치' : '그림 크기·배치'}>
    <div className="w-object-layout-controls">
      <div className="w-ribbon-row">{size('width')}{target.kind === 'image' && size('height')}</div>
      <div className="w-ribbon-row">
        {target.kind === 'table' ? <>
          <ChoiceSelect ariaLabel="표 정렬" value={String(attrs.alignment ?? 'left')} disabled={!editor.isEditable}
            options={[{ id: 'left', label: '왼쪽 정렬' }, { id: 'center', label: '가운데 정렬' }, { id: 'right', label: '오른쪽 정렬' }]}
            onChange={alignment => void apply({ alignment: alignment as WordObjectChange['alignment'] })} />
          <ChoiceSelect ariaLabel="표 자동 맞춤" value={attrs.widthType === 'pct' ? 'page' : attrs.layout === 'fixed' ? 'fixed' : 'content'} disabled={!editor.isEditable}
            options={[{ id: 'content', label: '내용에 맞춤' }, { id: 'page', label: '본문 너비에 맞춤' }, { id: 'fixed', label: '고정 너비' }]}
            onChange={fit => {
              if (fit !== 'fixed') void apply({ fit: fit as 'content' | 'page' });
              else {
                const table = Array.from(container?.querySelectorAll<HTMLElement>('table') ?? []).find(el => el.getAttribute('data-bc-sid') === target.nodeId);
                const width = table ? table.offsetWidth * 2.54 / 96 : cm('width');
                if (width) void apply({ width });
              }
            }} />
        </> : <>
          <ToolbarToggle id="image-lock-ratio" label="그림 비율 유지" state={locked ? 'on' : 'off'} onActivate={() => setLocked(value => !value)}><Icon name="type-url" /><span>비율 유지</span></ToolbarToggle>
          <ChoiceSelect ariaLabel="그림 본문 배치" value={attrs.wrap === 'square' ? String(attrs.side ?? 'right') : String(attrs.wrap ?? 'inline')} disabled={!editor.isEditable}
            options={[{ id: 'inline', label: '글자처럼 배치' }, { id: 'left', label: '왼쪽에 배치' }, { id: 'right', label: '오른쪽에 배치' }, { id: 'topAndBottom', label: '위아래로 본문 배치' }]}
            onChange={placement => void apply({ placement: placement as WordObjectChange['placement'] })} />
        </>}
      </div>
      {error && <span role="alert">{error}</span>}
    </div>
  </RibbonGroup>
  {target.kind === 'table' ? <WordTableDimensionControls key={`${target.nodeId}:${editor.selection?.startNodeId}`} editor={editor} target={target} container={container} /> :
    <RibbonGroup id="image-crop" label="그림 자르기"><div className="w-object-layout-controls">
      <ChoiceSelect ariaLabel="그림 자르기 비율" value={cropValue} disabled={!editor.isEditable}
        options={[{ id: 'reset', label: '자르기 해제 · 원래 크기' }, { id: 'square', label: '정사각형 1:1' }, { id: 'landscape', label: '가로 16:9' }, { id: 'portrait', label: '세로 3:4' }, ...(cropValue === 'custom' ? [{ id: 'custom', label: '사용자 비율' }] : [])]}
        onChange={crop => { if (crop !== 'custom') void apply({ crop: crop as WordObjectChange['crop'], ...(typeof attrs.width !== 'number' && cm('width') ? { width: cm('width')! } : {}), ...(typeof attrs.height !== 'number' && cm('height') ? { height: cm('height')! } : {}) }); }} />
      <div className="w-ribbon-row">{(['X', 'Y'] as const).map(axis => <NumberField key={axis} ariaLabel={`자르기 ${axis === 'X' ? '가로' : '세로'} 위치`} prefix={axis === 'X' ? '가로' : '세로'} suffix="%"
        value={Number(attrs[`cropPosition${axis}`] ?? 50)} min={0} max={100} step={5} decimals={0} disabled={!editor.isEditable || attrs.cropMode !== 'cover'}
        onCommit={value => void apply({ [`cropPosition${axis}`]: value })} />)}</div>
    </div></RibbonGroup>}
  <RibbonGroup id="object-properties" label={target.kind === 'table' ? '셀 속성' : '접근성'}>
    <RibbonAction id="object-properties-open" label={target.kind === 'table' ? '셀 안쪽 여백' : '대체 텍스트'} icon={<Icon name={target.kind === 'table' ? 'insert-table' : 'type-text'} />} disabled={!editor.isEditable} onActivate={() => setProperties(true)} />
  </RibbonGroup>
  {properties && <WordObjectPropertiesDialog editor={editor} target={target} onClose={() => setProperties(false)} />}
  </>;
}
