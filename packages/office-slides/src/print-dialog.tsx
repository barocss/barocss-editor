import { useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Dialog, DialogButton } from '@barocss/office-ui';
import type { Slide } from './deck';
import { Thumbnail } from './thumbnail';

export function SlidePrintDialog({ editor, slides, revision, open, onClose, onPrint }: {
  editor: Editor | null; slides: Slide[]; revision: number; open: boolean;
  onClose: () => void; onPrint: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const visible = slides.filter(slide => !slide.hidden);
  return <Dialog open={open} title="인쇄 / PDF 저장" onOpenChange={value => { if (!value) onClose(); }}
    footer={<>
      <DialogButton onClick={onClose}>닫기</DialogButton>
      <DialogButton variant="primary" disabled={busy || !visible.length} onClick={async () => {
        setBusy(true); setError('');
        try { await onPrint(); } catch { setError('출력을 준비하지 못했습니다. 다시 시도해 주세요.'); }
        finally { setBusy(false); }
      }}>{busy ? '출력 준비 중…' : '인쇄 / PDF 저장…'}</DialogButton>
    </>}>
    <p>{visible.length}개 슬라이드 · 슬라이드 순서대로 한 장씩 출력합니다.</p>
    <p>숨긴 슬라이드와 발표자 노트는 제외합니다. 영상은 포스터가 있는 경우에만 그림을 출력합니다.
      PDF 파일은 인쇄 창의 저장 대상으로 선택하세요.</p>
    {error && <p role="alert">{error}</p>}
    <div style={{ display: 'grid', justifyItems: 'center', gap: 16, maxHeight: '50vh', overflowY: 'auto' }}>
      {open && visible.map(slide => <figure key={slide.sid} style={{ margin: 0 }}>
        <Thumbnail editor={editor} slideSid={slide.sid} width={240} revision={revision} />
        <figcaption>{slide.number}. {slide.name}</figcaption>
      </figure>)}
    </div>
  </Dialog>;
}
