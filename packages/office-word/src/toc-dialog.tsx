import { useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { ChoiceSelect, Dialog, DialogButton, PropertyRow } from '@barocss/office-ui';
import type { TocSession, TocSettings } from './structure-commands';
import { WORD_CAPTION_LABELS } from './caption-commands';

export function TocDialog({ editor, session, onClose, captions = false }: { editor: Editor; session: TocSession; onClose: () => void; captions?: boolean }) {
  const attrs = session.tocId ? editor.dataStore.getNode(session.tocId)?.attributes : undefined;
  const [settings, setSettings] = useState<TocSettings>({
    levels: String(attrs?.levels ?? '1-3'), scope: attrs?.scope === 'section' ? 'section' : 'document',
    showPageNumbers: attrs?.showPageNumbers !== false, useHyperlinks: attrs?.useHyperlinks !== false,
    leader: attrs?.leader === 'none' ? 'none' : 'dot',
    ...(captions ? { caption: String(attrs?.caption ?? 'Figure') } : {})
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const apply = async (action: 'insert' | 'update' | 'remove') => {
    setBusy(true);
    try {
      if (await editor.run('setTableOfContents', { ...session, settings, action })) onClose();
      else setError('적용할 수 없습니다. 문서와 목차 위치를 확인하세요.');
    } catch { setError('목차를 적용하지 못했습니다. 다시 시도하세요.'); }
    finally { setBusy(false); }
  };
  const toggle = (key: 'showPageNumbers' | 'useHyperlinks', label: string) => <PropertyRow label={label}>
    <ChoiceSelect ariaLabel={label} value={settings[key] ? 'yes' : 'no'} options={[{ id: 'yes', label: '사용' }, { id: 'no', label: '사용 안 함' }]}
      onChange={id => setSettings(now => ({ ...now, [key]: id === 'yes' }))} />
  </PropertyRow>;
  return <Dialog open title={captions ? '그림 목차' : '목차'} description={session.tocId ? (captions ? '이 구역의 첫 그림 목차를 설정합니다.' : '이 구역의 첫 제목 목차를 설정합니다.') : '현재 문단 앞에 목차를 넣습니다.'}
    onOpenChange={open => { if (!open && !busy) onClose(); }} footer={<>
      {session.tocId && <DialogButton disabled={busy} onClick={() => void apply('remove')}>목차 제거</DialogButton>}
      <DialogButton disabled={busy} onClick={onClose}>취소</DialogButton>
      <DialogButton variant="primary" disabled={busy} onClick={() => void apply(session.tocId ? 'update' : 'insert')}>{session.tocId ? '설정 적용' : '목차 삽입'}</DialogButton>
    </>}>
    <div className="w-furniture-settings">
      <PropertyRow label="범위"><ChoiceSelect ariaLabel="목차 범위" value={settings.scope} options={[{ id: 'document', label: '문서 전체' }, { id: 'section', label: '현재 구역' }]}
        onChange={id => setSettings(now => ({ ...now, scope: id as TocSettings['scope'] }))} /></PropertyRow>
      {captions ? <PropertyRow label="캡션 종류"><ChoiceSelect ariaLabel="목차 캡션 종류" value={settings.caption ?? 'Figure'} options={[...WORD_CAPTION_LABELS]}
        onChange={caption => setSettings(now => ({ ...now, caption }))} /></PropertyRow> :
        <PropertyRow label="제목 단계"><ChoiceSelect ariaLabel="제목 단계" value={settings.levels} options={[1, 2, 3, 4, 5, 6].map(n => ({ id: `1-${n}`, label: n === 1 ? '제목 1' : `제목 1–${n}` }))}
          onChange={levels => setSettings(now => ({ ...now, levels }))} /></PropertyRow>}
      {toggle('showPageNumbers', '페이지 번호')}{toggle('useHyperlinks', captions ? '캡션으로 이동' : '제목으로 이동')}
      <PropertyRow label="연결선"><ChoiceSelect ariaLabel="목차 연결선" value={settings.leader} options={[{ id: 'dot', label: '점선' }, { id: 'none', label: '없음' }]}
        onChange={id => setSettings(now => ({ ...now, leader: id as TocSettings['leader'] }))} /></PropertyRow>
      <p>{captions ? '캡션 번호·설명·페이지 번호는 문서 편집 후 자동으로 갱신됩니다.' : '제목과 페이지 번호는 문서 편집 후 자동으로 갱신됩니다.'}</p>
      {error && <p role="alert">{error}</p>}
    </div>
  </Dialog>;
}
