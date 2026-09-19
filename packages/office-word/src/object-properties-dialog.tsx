import { useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { ChoiceSelect, Dialog, DialogButton, NumberField, PropertyRow, TextAreaField } from '@barocss/office-ui';
import { TWIPS_PER_CM, wordMarginCells, type WordObjectChange, type WordObjectTarget } from './object-layout';

const sides = [['Top', '위쪽'], ['Bottom', '아래쪽'], ['Left', '왼쪽'], ['Right', '오른쪽']] as const;

export function WordObjectPropertiesDialog({ editor, target, onClose }: { editor: Editor; target: WordObjectTarget; onClose(): void }) {
  const isTable = target.kind === 'table';
  const [scope, setScope] = useState<'selection' | 'table'>(() => wordMarginCells(editor, target, 'selection').length ? 'selection' : 'table');
  const [captured] = useState(() => ({ selection: wordMarginCells(editor, target, 'selection').map(cell => cell.sid!), table: wordMarginCells(editor, target, 'table').map(cell => cell.sid!) }));
  const [margins, setMargins] = useState<NonNullable<WordObjectChange['cellMargins']>>({});
  const attrs = editor.dataStore.getNode(target.nodeId)?.attributes;
  const [alt, setAlt] = useState(String(attrs?.alt ?? ''));
  const [decorative, setDecorative] = useState(attrs?.alt === '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cells = captured[scope].flatMap(id => { const cell = editor.dataStore.getNode(id); return cell ? [cell] : []; });
  const displayed = (side: typeof sides[number][0]) => {
    if (side in margins) return margins[side] ?? null;
    const values = cells.map(cell => cell.attributes?.[`margin${side}`]);
    return values.length && typeof values[0] === 'number' && values.every(value => value === values[0]) ? values[0] / TWIPS_PER_CM : null;
  };
  const apply = async () => {
    if (!isTable && !decorative && !alt.trim()) { setError('그림의 내용이나 용도를 입력하세요. 장식용 그림이면 장식용을 선택하세요.'); return; }
    setBusy(true); setError('');
    try {
      const change: WordObjectChange = isTable ? { cellMargins: margins, marginScope: scope, marginCellIds: captured[scope] } : { alt: decorative ? '' : alt.trim() };
      if (await editor.run('setWordObjectLayout', { ...target, ...change })) onClose();
      else setError('적용하지 못했습니다. 문서와 선택한 대상을 확인하세요.');
    } catch { setError('적용하지 못했습니다. 다시 시도하세요.'); }
    finally { setBusy(false); }
  };
  return <Dialog open title={isTable ? '셀 안쪽 여백' : '그림 대체 텍스트'}
    description={isTable ? '셀 테두리와 내용 사이의 간격을 설정합니다.' : '화면을 볼 수 없는 사용자에게 그림의 내용과 용도를 전달합니다.'}
    onOpenChange={open => { if (!open && !busy) onClose(); }} footer={<>
      <DialogButton disabled={busy} onClick={onClose}>취소</DialogButton>
      <DialogButton variant="primary" disabled={busy || !editor.isEditable || (isTable && !Object.keys(margins).length)} onClick={() => void apply()}>적용</DialogButton>
    </>}>
    <div className="w-furniture-settings">
      {isTable ? <>
        <PropertyRow label="적용 대상"><ChoiceSelect ariaLabel="여백 적용 대상" value={scope} disabled={busy}
          options={[...(captured.selection.length ? [{ id: 'selection', label: '선택한 셀' }] : []), { id: 'table', label: '표의 모든 셀' }]}
          onChange={value => { setScope(value as 'selection' | 'table'); setMargins({}); }} /></PropertyRow>
        <div className="w-cell-margin-fields">{sides.map(([side, label]) => <NumberField key={side} ariaLabel={`${label} 셀 여백`} prefix={label} suffix="cm" value={displayed(side)}
          min={0} max={5} step={0.05} decimals={2} disabled={busy} onCommit={value => setMargins(now => ({ ...now, [side]: value }))} />)}</div>
        <p>숫자를 바꾼 방향만 적용합니다. — 표시는 기본값 또는 서로 다른 값입니다.</p>
        <DialogButton disabled={busy} onClick={() => setMargins({ Top: null, Bottom: null, Left: null, Right: null })}>기본 여백으로 복원</DialogButton>
        {Object.values(margins).some(value => value === null) && <p role="status">적용하면 표 스타일의 기본 여백을 사용합니다.</p>}
      </> : <>
        <PropertyRow label="그림 용도"><ChoiceSelect ariaLabel="그림 용도" value={decorative ? 'decorative' : 'meaningful'} disabled={busy}
          options={[{ id: 'meaningful', label: '내용을 전달하는 그림' }, { id: 'decorative', label: '장식용 그림' }]} onChange={value => setDecorative(value === 'decorative')} /></PropertyRow>
        <TextAreaField ariaLabel="그림 설명" value={alt} onChange={setAlt} rows={4} disabled={busy || decorative} placeholder="예: 1분기부터 4분기까지 매출이 증가하는 막대그래프" />
        <p>{decorative ? '장식용 그림은 빈 대체 텍스트로 저장하여 화면 읽기 프로그램이 건너뛰도록 합니다.' : '주변 본문에 없는 정보와 그림의 용도를 간단히 적으세요.'}</p>
      </>}
      {error && <p role="alert">{error}</p>}
    </div>
  </Dialog>;
}
