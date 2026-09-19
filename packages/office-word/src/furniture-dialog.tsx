import { useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { ChoiceSelect, Dialog, DialogButton, PropertyNumber, PropertyRow, TextAreaField } from '@barocss/office-ui';
import { furnitureNode, PAGE_NUMBER_FORMATS, type FurnitureRole, type FurnitureTarget, type FurnitureVariant } from './furniture-commands';

export function FurnitureDialog({ editor, target, mode, onClose, onEdit }: {
  editor: Editor; target: FurnitureTarget; mode: 'header' | 'footer' | 'number';
  onClose: () => void; onEdit: (id?: string) => void;
}) {
  const [role, setRole] = useState<FurnitureRole>(mode === 'header' ? 'header' : 'footer');
  const [variant, setVariant] = useState<FurnitureVariant>('default');
  const [text, setText] = useState('');
  const attrs = editor.dataStore.getNode(target.surfaceId)?.attributes;
  const [format, setFormat] = useState(String(attrs?.pageNumberFormat ?? 'decimal'));
  const [start, setStart] = useState(Number(attrs?.pageNumberStart ?? 1));
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>('center');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = furnitureNode(editor, target, role, variant);
  const title = mode === 'number' ? '페이지 번호' : mode === 'header' ? '머리글' : '바닥글';
  const apply = async (remove = false) => {
    setBusy(true); setError('');
    try {
      const ok = await editor.run('setPageFurniture', { ...target, role, variant, text, format, start, alignment,
        action: remove ? 'remove' : mode === 'number' ? 'number' : existing ? 'edit' : 'create' });
      if (!ok) { setError('적용할 수 없습니다. 문서와 입력 값을 확인하세요.'); return; }
      const node = furnitureNode(editor, target, role, variant);
      onClose();
      if (remove) onEdit();
      if (!remove && mode !== 'number' && node?.attributes?.id) {
        const id = String(node.attributes.id);
        // The dialog releases its focus trap before the document takes the caret.
        requestAnimationFrame(() => { if (editor.getRootId() === target.rootId) onEdit(id); });
      }
    } catch {
      setError('적용하지 못했습니다. 다시 시도하세요.');
    } finally { setBusy(false); }
  };
  return <Dialog open title={title} description="현재 구역의 머리글과 바닥글을 설정합니다."
    onOpenChange={open => { if (!open && !busy) onClose(); }} footer={<>
      {existing && mode !== 'number' && <DialogButton disabled={busy} onClick={() => void apply(true)}>이 구역에서 제거</DialogButton>}
      <DialogButton disabled={busy} onClick={onClose}>취소</DialogButton>
      <DialogButton variant="primary" disabled={busy || (mode === 'number' && (!Number.isInteger(start) || start < 1 || start > 9999))}
        onClick={() => void apply()}>{mode === 'number' ? '적용' : existing ? '문서에서 편집' : '만들고 편집'}</DialogButton>
    </>}>
    <div className="w-furniture-settings">
      {mode === 'number' && <PropertyRow label="위치"><ChoiceSelect ariaLabel="번호 위치" value={role}
        options={[{ id: 'header', label: '머리글' }, { id: 'footer', label: '바닥글' }]} onChange={id => setRole(id as FurnitureRole)} /></PropertyRow>}
      <PropertyRow label="페이지 대상"><ChoiceSelect ariaLabel="페이지 대상" value={variant} options={[
        { id: 'default', label: '기본 페이지' }, { id: 'first', label: '첫 페이지' }, { id: 'even', label: '짝수 페이지' }
      ]} onChange={id => setVariant(id as FurnitureVariant)} /></PropertyRow>
      {variant !== 'default' && <p>적용하면 {variant === 'first' ? '첫 페이지' : '짝수 페이지'} 구분을 켭니다. 다른 대상의 내용은 유지합니다.</p>}
      {mode === 'number' ? <>
        <PropertyRow label="번호 형식"><ChoiceSelect ariaLabel="번호 형식" value={format}
          options={PAGE_NUMBER_FORMATS.map((id, i) => ({ id, label: ['1, 2, 3', 'I, II, III', 'i, ii, iii', 'A, B, C', 'a, b, c'][i] }))} onChange={setFormat} /></PropertyRow>
        <PropertyRow label="시작 번호"><PropertyNumber ariaLabel="시작 번호" value={start} onCommit={setStart} /></PropertyRow>
        <p>번호 형식과 시작 번호는 이 구역 전체에 적용됩니다. 기존 번호가 있으면 위치를 조정하고, 없으면 새 문단에 추가합니다.</p>
      </> : existing ? <p>기존 내용을 문서에서 직접 편집합니다. 다른 구역과 공유한 머리글이나 바닥글은 함께 바뀝니다.</p>
        : <TextAreaField ariaLabel={`${title} 내용`} value={text} onChange={setText} />}
      {(mode === 'number' || !existing) && <PropertyRow label="정렬"><ChoiceSelect ariaLabel="정렬" value={alignment} options={[
        { id: 'left', label: '왼쪽' }, { id: 'center', label: '가운데' }, { id: 'right', label: '오른쪽' }
      ]} onChange={id => setAlignment(id as typeof alignment)} /></PropertyRow>}
      {error && <p role="alert">{error}</p>}
    </div>
  </Dialog>;
}
