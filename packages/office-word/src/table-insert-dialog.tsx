import { useEffect, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Dialog, DialogButton, PropertyNumber, PropertyRow } from '@barocss/office-ui';

export function TableInsertDialog({ editor, open, onClose }: { editor: Editor | null; open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setError(''); }, [open]);
  const valid = Number.isInteger(rows) && Number.isInteger(cols) && rows >= 1 && rows <= 50 && cols >= 1 && cols <= 20;
  const insert = async () => {
    if (!editor || !valid || busy) return;
    setBusy(true); setError('');
    try {
      if (!await editor.run('insertTable', { rows, cols })) { setError('표를 넣을 문단을 선택해 주세요.'); return; }
      onClose();
    } catch { setError('표를 삽입하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) { setError(''); onClose(); } }}
    title="표 삽입" description="현재 문단에 추가할 표의 크기를 선택하세요."
    footer={<><DialogButton disabled={busy} onClick={onClose}>취소</DialogButton>
      <DialogButton variant="primary" disabled={!valid || busy} onClick={() => void insert()}>삽입</DialogButton></>}>
    <PropertyRow label="열"><PropertyNumber ariaLabel="열 수" value={cols} min={1} max={20} step={1} onCommit={setCols} /></PropertyRow>
    <PropertyRow label="행"><PropertyNumber ariaLabel="행 수" value={rows} min={1} max={50} step={1} onCommit={setRows} /></PropertyRow>
    <p className="w-table-size-summary">{cols}열 × {rows}행 · 열은 최대 20개, 행은 최대 50개</p>
    {error && <p role="alert">{error}</p>}
  </Dialog>;
}
