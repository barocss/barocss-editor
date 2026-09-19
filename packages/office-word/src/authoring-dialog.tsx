import { useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, FileDropZone, FileItem, Dialog, DialogButton, PropertyRow, TextAreaField, TextField } from '@barocss/office-ui';
import { selectedLink, usableHref } from '@barocss/office-editor-ui';
import { WORD_AUTHORING_ACTIONS, type WordAuthoringSession } from './authoring-actions';

/** Mounted per session: form focus never changes the saved insertion/annotation target. */
export function WordAuthoringDialog({ editor, session, onClose }: {
  editor: Editor; session: WordAuthoringSession; onClose: (kind?: WordAuthoringSession['kind']) => void;
}) {
  const { kind, selection, rootId } = session;
  const [value, setValue] = useState(() => kind === 'link' ? selectedLink(editor, selection) : '');
  const [alt, setAlt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const action = WORD_AUTHORING_ACTIONS[kind];
  const apply = async (remove = false) => {
    if (busy || loading) return;
    if (editor.getRootId() !== rootId || !editor.dataStore.getNode(selection.type === 'range' ? selection.startNodeId : '')) {
      setError('문서가 변경되었습니다. 창을 닫고 적용할 위치를 다시 선택해 주세요.'); return;
    }
    const text = value.trim();
    if (!remove && (!text || (kind === 'link' && !usableHref(text)))) { setError(kind === 'link' ? '유효한 링크 주소를 입력하세요.' : '내용을 입력해 주세요.'); return; }
    setBusy(true); setError('');
    try {
      editor.selectionManager.setSelection(selection);
      const payload = kind === 'link' ? { href: text, replace: true } : kind === 'image' ? { src: value, alt } :
        kind === 'comment' ? { text: value, selection } : { id: crypto.randomUUID(), text: value, selection };
      const command = remove ? 'removeLink' : action.command;
      if (!editor.canRun(command, payload) || !await editor.run(command, payload)) { setError('선택 영역에 적용할 수 없습니다. 텍스트를 다시 선택해 주세요.'); return; }
      onClose(kind);
    } catch { setError('적용하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy && !loading) onClose(); }} title={action.label}
    description={kind === 'image' ? '선택한 그림을 현재 커서 위치에 삽입합니다.' : '선택한 텍스트에 적용합니다.'}
    footer={<>
      {kind === 'link' && <Button disabled={busy || !editor.canRun('removeLink', { selection })} onClick={() => void apply(true)}>링크 해제</Button>}
      <DialogButton disabled={busy || loading} onClick={() => onClose()}>취소</DialogButton>
      <DialogButton variant="primary" disabled={busy || loading || !value.trim()} onClick={() => void apply()}>적용</DialogButton>
    </>}>
    {kind === 'link' ? <PropertyRow label="주소"><TextField ariaLabel="링크 주소" value={value} onChange={setValue} placeholder="https://" /></PropertyRow> :
      kind === 'image' ? <>
        <FileDropZone label="그림 파일" accept="image/png,image/jpeg,image/webp,image/gif" maxBytes={5 * 1024 * 1024} hint="PNG, JPEG, WebP, GIF · 최대 5MB" disabled={busy || loading}
          onPick={async chosen => {
            setError(''); setValue(''); setFile(null); setLoading(true);
            try {
              const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(chosen); });
              await new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(); image.onerror = reject; image.src = data; });
              setValue(data); setAlt(chosen.name.replace(/\.[^.]+$/, '')); setFile(chosen);
            } catch { throw new Error('그림을 읽을 수 없습니다. 다른 파일을 선택하세요.'); }
            finally { setLoading(false); }
          }} />
        {file && <FileItem name={file.name} bytes={file.size} disabled={busy || loading} onRemove={() => { setFile(null); setValue(''); }} />}
        {value && <img className="w-authoring-image" src={value} alt={alt} />}
        <PropertyRow label="대체 텍스트"><TextField ariaLabel="그림 대체 텍스트" value={alt} onChange={setAlt} /></PropertyRow>
      </> : <TextAreaField ariaLabel={kind === 'comment' ? '댓글 내용' : '주석 내용'} value={value} onChange={setValue} />}
    {error && <p role="alert">{error}</p>}
  </Dialog>;
}
