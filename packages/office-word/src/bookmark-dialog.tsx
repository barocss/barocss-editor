import { useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { Button, ChoiceSelect, Dialog, DialogButton, PropertyRow, TextField } from '@barocss/office-ui';
import { useEditorRevision } from '@barocss/office-editor-ui';
import { bookmarkSelection, wordBookmarks, wordCaptions, type BookmarkPayload, type BookmarkSession } from './bookmark-commands';
import { WORD_CAPTION_LABELS } from './caption-commands';

export function jumpToWordBookmark(editor: Editor, view: EditorViewDOM, name: string, kind = 'bookmark'): boolean {
  const at = bookmarkSelection(editor, name, kind);
  if (!at) return false;
  view.contentEditableElement.focus({ preventScroll: true });
  editor.updateSelection({ selection: at, applySelectionToView: true });
  view.contentEditableElement.querySelector(`[data-bc-sid="${CSS.escape(at.startNodeId)}"]`)?.scrollIntoView({ block: 'center' });
  return true;
}
export function BookmarkDialog({ editor, view, session, mode, onClose }: { editor: Editor; view: EditorViewDOM;
  session: BookmarkSession; mode: 'bookmark' | 'reference'; onClose: () => void }) {
  useEditorRevision(editor);
  const entries = wordBookmarks(editor);
  const captions = wordCaptions(editor);
  const [kind, setKind] = useState('bookmark');
  const captionMode = mode === 'reference' && kind !== 'bookmark';
  const availableCaptions = captions.filter(caption => caption.sequence === kind);
  const [target, setTarget] = useState(entries[0]?.name ?? '');
  const [name, setName] = useState('');
  const [nextName, setNextName] = useState(entries[0]?.name ?? '');
  const [format, setFormat] = useState<NonNullable<BookmarkPayload['format']>>('text');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = entries.find(entry => entry.name === target);
  const selectedCaption = availableCaptions.find(caption => caption.sid === target);
  const payload: BookmarkPayload = { ...session, name: target, nextName, format,
    ...(captionMode ? { targetKind: 'caption', targetSid: target } : {}) };
  const active = editor.getRootId() === session.rootId && !busy;
  const can = (command: string, value = payload) => active && editor.canRun(command, value);
  const run = async (command: string, value = payload, close = false) => {
    setBusy(true); setError('');
    try {
      if (!await editor.run(command, value)) { setError('작업을 적용하지 못했습니다. 이름과 문서 선택을 확인하세요.'); return; }
      if (command === 'addWordBookmark') { setTarget(name.trim()); setNextName(name.trim()); setName(''); }
      if (command === 'renameWordBookmark') setTarget(nextName.trim());
      if (close) onClose();
    } finally { setBusy(false); }
  };
  return <Dialog open title={mode === 'bookmark' ? '책갈피' : '상호 참조'} onOpenChange={open => !open && onClose()}
    description={mode === 'bookmark' ? '선택한 텍스트 또는 커서 위치에 이름을 붙입니다.' : '책갈피 또는 캡션을 가리키는 참조를 커서 위치에 삽입합니다.'}
    footer={<><DialogButton onClick={onClose}>닫기</DialogButton>{mode === 'reference' &&
      <DialogButton variant="primary" disabled={!can('insertWordReference')} onClick={() => void run('insertWordReference', payload, true)}>참조 삽입</DialogButton>}</>}>
    <div className="w-bookmark-manager">
      {mode === 'reference' && <PropertyRow label="참조 종류"><ChoiceSelect ariaLabel="참조 종류" value={kind}
        options={[{ id: 'bookmark', label: '책갈피' }, ...WORD_CAPTION_LABELS]} onChange={value => {
          setKind(value); setTarget(value === 'bookmark' ? entries[0]?.name ?? '' : captions.find(caption => caption.sequence === value)?.sid ?? '');
          setFormat(value === 'bookmark' ? 'text' : 'labelNumber'); setError('');
        }} /></PropertyRow>}
      {mode === 'bookmark' && <PropertyRow label="새 이름"><div className="w-bookmark-name-field"><TextField ariaLabel="새 책갈피 이름" value={name} maxLength={80} onChange={setName} />
        <Button disabled={!can('addWordBookmark', { ...payload, name })} onClick={() => void run('addWordBookmark', { ...payload, name })}>추가</Button></div></PropertyRow>}
      {captionMode ? <>
        <PropertyRow label="캡션"><ChoiceSelect ariaLabel="대상 캡션" value={selectedCaption ? target : null}
          options={availableCaptions.map(caption => ({ id: caption.sid, label: caption.text }))} disabled={!availableCaptions.length || !active} onChange={setTarget} /></PropertyRow>
        <p className="w-bookmark-preview">{selectedCaption ? (format === 'number' ? selectedCaption.number : format === 'labelNumber' ? selectedCaption.labelNumber : selectedCaption.text) : '해당 종류의 캡션을 먼저 추가하세요.'}</p>
      </> : <><PropertyRow label="책갈피"><ChoiceSelect ariaLabel="대상 책갈피" value={current ? target : null} options={entries.map(entry => ({ id: entry.name, label: entry.name }))}
        disabled={!entries.length || !active} onChange={value => { setTarget(value); setNextName(value); setError(''); }} /></PropertyRow>
      {current ? <p className="w-bookmark-preview">{current.kind === 'point' ? `위치 책갈피: ${current.name}` : current.text || '(빈 범위)'}</p> : <p>책갈피를 먼저 추가하세요.</p>}</>}
      {mode === 'bookmark' && current && <>
        <PropertyRow label="이름 변경"><div className="w-bookmark-name-field"><TextField ariaLabel="변경할 책갈피 이름" value={nextName} maxLength={80} onChange={setNextName} />
          <Button disabled={!can('renameWordBookmark')} onClick={() => void run('renameWordBookmark')}>이름 변경</Button></div></PropertyRow>
        <div className="w-bookmark-actions"><Button disabled={!active || !bookmarkSelection(editor, target)} onClick={() => {
          onClose(); requestAnimationFrame(() => { if (editor.getRootId() === session.rootId) jumpToWordBookmark(editor, view, target); });
        }}>위치로 이동</Button><Button disabled={!can('deleteWordBookmark')} onClick={() => void run('deleteWordBookmark')}>책갈피 삭제</Button></div>
        <p className="w-bookmark-help">이름을 바꾸면 연결된 참조도 갱신됩니다. 책갈피를 삭제하면 참조에 대상 없음이 표시됩니다.</p>
      </>}
      {mode === 'reference' && <PropertyRow label="표시"><ChoiceSelect ariaLabel="참조 표시" value={format}
        options={captionMode ? [{ id: 'labelNumber', label: '레이블과 번호' }, { id: 'number', label: '번호만' }, { id: 'text', label: '캡션 전체' }] : [{ id: 'text', label: '책갈피 텍스트 / 위치 이름' }, { id: 'aboveBelow', label: '위 / 아래 (above / below)' }]}
        onChange={value => setFormat(value as NonNullable<BookmarkPayload['format']>)} /></PropertyRow>}
      {captionMode && <p className="w-bookmark-help">번호와 설명은 원본 캡션을 따라 갱신됩니다. 참조를 누르면 원본으로 이동합니다.</p>}
      <p className="w-bookmark-help">추가·수정은 변경 추적을 끈 편집 가능한 문서에서 지원합니다. 범위 책갈피는 한 문단 안에서 선택하세요. 참조 삽입은 텍스트 선택 없이 커서만 둔 상태에서 사용합니다.</p>
      {error && <p role="alert">{error}</p>}
    </div>
  </Dialog>;
}
