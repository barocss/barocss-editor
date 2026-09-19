import { useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { ChoiceSelect, Dialog, DialogButton, PropertyRow, TextField } from '@barocss/office-ui';
import { useEditorRevision } from '@barocss/office-editor-ui';
import { WORD_CAPTION_LABELS, type CaptionSession, type CaptionSettings } from './caption-commands';

export function CaptionDialog({ editor, session, onClose }: { editor: Editor; session: CaptionSession; onClose: () => void }) {
  useEditorRevision(editor);
  const [settings, setSettings] = useState<CaptionSettings>({ sequence: 'Figure', text: '', position: 'after' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const payload = { ...session, ...settings };
  const apply = async () => {
    setBusy(true); setError('');
    try {
      if (await editor.run('insertWordCaption', payload)) onClose();
      else setError('캡션을 넣을 수 없습니다. 문서와 삽입 위치를 확인하세요.');
    } catch { setError('캡션을 넣지 못했습니다. 다시 시도하세요.'); }
    finally { setBusy(false); }
  };
  return <Dialog open title="캡션 삽입" description="현재 문단이나 객체 위아래에 번호와 설명을 넣습니다."
    onOpenChange={open => { if (!open && !busy) onClose(); }} footer={<>
      <DialogButton disabled={busy} onClick={onClose}>취소</DialogButton>
      <DialogButton variant="primary" disabled={busy || !editor.canRun('insertWordCaption', payload)} onClick={() => void apply()}>캡션 넣기</DialogButton>
    </>}>
    <div className="w-furniture-settings">
      <PropertyRow label="종류"><ChoiceSelect ariaLabel="캡션 종류" value={settings.sequence} options={[...WORD_CAPTION_LABELS]}
        onChange={sequence => setSettings(now => ({ ...now, sequence }))} /></PropertyRow>
      <PropertyRow label="위치"><ChoiceSelect ariaLabel="캡션 위치" value={settings.position}
        options={[{ id: 'before', label: '현재 블록 위' }, { id: 'after', label: '현재 블록 아래' }]}
        onChange={position => setSettings(now => ({ ...now, position: position as CaptionSettings['position'] }))} /></PropertyRow>
      <PropertyRow label="설명"><TextField ariaLabel="캡션 설명" value={settings.text} maxLength={1000}
        onChange={text => setSettings(now => ({ ...now, text }))} /></PropertyRow>
      <p>그림·표·수식은 각각 따로 번호를 매깁니다. 캡션을 추가하거나 삭제하면 번호가 자동으로 갱신됩니다. 설명은 삽입 후 본문에서 편집할 수 있습니다.</p>
      {error && <p role="alert">{error}</p>}
    </div>
  </Dialog>;
}
