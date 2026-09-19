import { useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, ChoiceSelect, Dialog, DialogButton, PropertyRow, PropertyNumber, PropertyColor, TextField } from '@barocss/office-ui';
import { useEditorRevision } from '@barocss/office-editor-ui';
import { canManageParagraphStyles, paragraphStyleFormat, paragraphStylesOf, type ParagraphStyleFormat, type StyleSession } from './paragraph-styles';

export function ParagraphStyleDialog({ editor, session, onClose }: { editor: Editor; session: StyleSession; onClose: () => void }) {
  useEditorRevision(editor);
  const entries = paragraphStylesOf(editor);
  const initial = entries.find(entry => entry.id === session.styleId) ?? entries.find(entry => entry.id === 'Body')!;
  const [id, setId] = useState(initial?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [format, setFormat] = useState<ParagraphStyleFormat>(() => initial ? paragraphStyleFormat(editor, initial.id) : session.format);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const validRoot = editor.getRootId() === session.rootId;
  const enabled = validRoot && canManageParagraphStyles(editor) && !busy;
  const patch = (value: Partial<ParagraphStyleFormat>) => { setFormat(old => ({ ...old, ...value })); setError(''); };
  const payload = { rootId: session.rootId, selection: session.selection, id, name, format };
  const saved = entries.find(entry => entry.id === id);
  const dirty = !!id && (saved?.name !== name || JSON.stringify(paragraphStyleFormat(editor, id)) !== JSON.stringify(format));
  const saveCommand = id ? 'updateParagraphStyle' : 'createParagraphStyle';
  const choose = (next: string) => {
    const entry = entries.find(entry => entry.id === next)!;
    setId(next); setName(entry.name); setFormat(paragraphStyleFormat(editor, next)); setError('');
  };
  const run = async (command: string) => {
    setBusy(true); setError('');
    try {
      if (await editor.run(command, payload)) onClose();
      else setError('스타일을 적용하지 못했습니다. 이름과 문서 선택을 확인하세요.');
    } finally { setBusy(false); }
  };
  const duplicate = entries.some(entry => entry.id !== id && entry.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  return <Dialog open className="w-style-dialog" onOpenChange={open => !open && onClose()} title="스타일 관리"
    description="문단 스타일을 만들고 수정합니다. 스타일 수정은 이 스타일을 사용하는 문단에 함께 반영됩니다."
    footer={<><DialogButton onClick={onClose}>취소</DialogButton>
      {id && <DialogButton disabled={!enabled || dirty || !editor.canRun('applyParagraphStyle', payload)} onClick={() => void run('applyParagraphStyle')}>선택 문단에 적용</DialogButton>}
      <DialogButton variant="primary" disabled={!enabled || !editor.canRun(saveCommand, payload)} onClick={() => void run(saveCommand)}>{id ? '변경 저장' : '만들고 적용'}</DialogButton></>}>
    <div className="w-style-manager">
      <div className="w-style-manager-picker">
        <ChoiceSelect ariaLabel="편집할 스타일" value={id || null} options={entries.map(entry => ({ id: entry.id, label: entry.name }))} onChange={choose} />
        <Button disabled={!enabled} onClick={() => { setId(''); setName(''); setFormat(session.format); setError(''); }}>새 스타일</Button>
      </div>
      <PropertyRow label="이름"><TextField ariaLabel="스타일 이름" value={name} maxLength={80} onChange={setName} /></PropertyRow>
      <div className="w-style-manager-fields">
        <PropertyRow label="글꼴"><TextField ariaLabel="스타일 글꼴" value={format.fontFamily} onChange={fontFamily => patch({ fontFamily })} /></PropertyRow>
        <PropertyRow label="크기"><PropertyNumber ariaLabel="스타일 글자 크기" value={format.fontSize / 2} suffix="pt" min={1} max={200} step={0.5} onCommit={size => patch({ fontSize: size * 2 })} /></PropertyRow>
        <PropertyRow label="글자색"><PropertyColor ariaLabel="스타일 글자색" value={`#${format.color}`} onChange={value => patch({ color: value.replace(/^#/, '') })} /></PropertyRow>
        <PropertyRow label="강조"><div className="w-style-manager-picker"><Button ariaLabel="스타일 굵게" pressed={format.bold} onClick={() => patch({ bold: !format.bold })}>굵게</Button><Button ariaLabel="스타일 기울임" pressed={format.italic} onClick={() => patch({ italic: !format.italic })}>기울임</Button></div></PropertyRow>
        <PropertyRow label="정렬"><ChoiceSelect ariaLabel="스타일 정렬" value={format.alignment} options={[
          { id: 'left', label: '왼쪽' }, { id: 'center', label: '가운데' }, { id: 'right', label: '오른쪽' }, { id: 'justify', label: '양쪽' }
        ]} onChange={alignment => patch({ alignment })} /></PropertyRow>
        <PropertyRow label="줄 간격"><ChoiceSelect ariaLabel="스타일 줄 간격" value={format.spacingLineRule === 'auto' ? String(format.spacingLine) : null}
          options={[{ id: '240', label: '1줄' }, { id: '276', label: '1.15줄' }, { id: '360', label: '1.5줄' }, { id: '480', label: '2줄' }]}
          onChange={value => patch({ spacingLine: Number(value), spacingLineRule: 'auto' })} /></PropertyRow>
        <PropertyRow label="문단 앞"><PropertyNumber ariaLabel="스타일 문단 앞 간격" suffix="pt" value={format.spacingBefore / 20} min={0} onCommit={value => patch({ spacingBefore: value * 20 })} /></PropertyRow>
        <PropertyRow label="문단 뒤"><PropertyNumber ariaLabel="스타일 문단 뒤 간격" suffix="pt" value={format.spacingAfter / 20} min={0} onCommit={value => patch({ spacingAfter: value * 20 })} /></PropertyRow>
      </div>
      <div className="w-style-manager-preview" aria-label="스타일 미리보기" style={{ fontFamily: format.fontFamily, fontSize: `${format.fontSize / 2}pt`,
        color: /^[0-9a-f]{6}$/i.test(format.color) ? `#${format.color}` : undefined, fontWeight: format.bold ? 'bold' : 'normal',
        fontStyle: format.italic ? 'italic' : 'normal', textAlign: format.alignment as 'left', lineHeight: format.spacingLineRule === 'auto' ? format.spacingLine / 240 : undefined }}>문서의 스타일을 일관되게 만드세요.</div>
      <Button disabled={!enabled} onClick={() => { setFormat(session.format); setError(''); }}>현재 문단 서식 가져오기</Button>
      <p className="w-style-manager-help">수정한 서식은 변경 저장 후 적용할 수 있습니다. 적용 시 문단 직접 서식을 스타일로 교체합니다. 글자별 강조와 링크, 제목 레벨은 유지합니다.</p>
      {!validRoot ? <p role="alert">문서가 변경되었습니다. 닫은 뒤 다시 열어 주세요.</p> : !canManageParagraphStyles(editor) ? <p role="status">스타일 관리는 편집 가능한 문서에서 변경 추적을 끈 상태로 사용합니다.</p> : null}
      {duplicate && <p role="alert">같은 이름의 스타일이 있습니다. 다른 이름을 입력하세요.</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </Dialog>;
}
