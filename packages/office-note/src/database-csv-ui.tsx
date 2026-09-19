import { useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, FloatingSurface, MenuAction } from '@barocss/office-ui';
import { getNoteDatabase } from './database';
import { databaseCSVRows, databaseCSVText } from './database-csv';

export function DatabaseCSVControl({ editor, nodeId, disabled }: { editor: Editor; nodeId: string; disabled: boolean }) {
  const host = useRef<HTMLDivElement>(null), picker = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [open, setOpen] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ source: string; count: number; name: string }>();
  const load = async (file: File) => {
    const token = ++request.current; setPreview(undefined); setError('');
    try { const source = await file.text(); if (token !== request.current) return; const db = getNoteDatabase(editor, nodeId); if (!db) return;
      const rows = databaseCSVRows(source, db); setPreview({ source, count: rows.length, name: file.name }); setError('');
    } catch (error) { if (token !== request.current) return; setPreview(undefined); setError(error instanceof Error ? error.message : 'CSV를 읽지 못했습니다.'); }
  };
  const save = () => {
    const db = getNoteDatabase(editor, nodeId); if (!db) return;
    const url = URL.createObjectURL(new Blob([databaseCSVText(db)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = (db.label || '데이터베이스').replace(/[\\/:*?"<>|]/g, '_') + '.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const apply = async () => {
    if (!preview || busy) return; setBusy(true);
    try { if (await editor.executeCommand('importNoteDatabaseCSV', { nodeId, csv: preview.source })) { setPreview(undefined); setOpen(false); setError(''); }
      else setError('필드나 편집 권한이 변경되었습니다. 파일을 다시 선택하세요.');
    } finally { setBusy(false); }
  };
  return <div ref={host}>
    <Button tone="quiet" ariaLabel="데이터베이스 CSV" pressed={open} onClick={() => setOpen(value => !value)}>CSV</Button>
    <input ref={picker} hidden type="file" accept=".csv,text/csv" aria-label="데이터베이스 CSV 파일" disabled={disabled || busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void load(file); }} />
    <FloatingSurface open={open} at={host.current?.getBoundingClientRect() ?? null} portalRoot={host.current} variant="menu" aria-label="데이터베이스 CSV 작업" prefer="below" align="end" ownedElements={[host]} onDismiss={() => setOpen(false)}>
      <MenuAction onClick={save}>전체 행 CSV 내보내기</MenuAction>
      <MenuAction disabled={disabled || busy} onClick={() => picker.current?.click()}>CSV 행 가져오기</MenuAction>
      <p className="px-3 py-1 text-xs opacity-60">첫 행의 필드 이름으로 연결합니다. 기존 행 뒤에 추가합니다.<br />내보내기는 필터와 관계없이 전체 값이며, 항목 본문은 포함하지 않습니다.</p>
      {preview && <div className="px-3 py-2"><p>{preview.name} · {preview.count}개 행</p><Button disabled={disabled || busy} onClick={() => void apply()}>행 추가하기</Button><Button tone="quiet" onClick={() => setPreview(undefined)}>취소</Button></div>}
      {error && <p role="alert" className="px-3 py-2">{error}</p>}
    </FloatingSurface>
  </div>;
}
