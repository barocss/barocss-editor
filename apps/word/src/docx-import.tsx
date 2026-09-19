import { useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, Dialog } from '@barocss/office-ui';
import { readWordDocx } from '@barocss/office-word';
export function DocxImport({ editor, beforeOpen, onOpened }: { editor: Editor; beforeOpen: () => Promise<void>; onOpened?: () => void }) {
 const input = useRef<HTMLInputElement>(null);
 const [preview, setPreview] = useState<ReturnType<typeof readWordDocx>>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
 const read = async (file?: File) => {
  if (!file) return; setBusy(true); setError('');
  try { if (file.size > 10 * 1024 * 1024) throw new Error('DOCX 파일은 10MB 이하로 선택하세요.'); setPreview(readWordDocx(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.docx$/i, ''))); }
  catch (e) { setError((e as Error).message); }
  finally { setBusy(false); if (input.current) input.current.value = ''; }
 };
 const open = async () => {
  if (!preview || busy) return; setBusy(true); setError('');
  try { await beforeOpen(); editor.loadDocument(preview.document, 'word'); setPreview(undefined); onOpened?.(); }
  catch { setError('현재 문서 저장 또는 가져오기를 완료하지 못했습니다. 현재 문서를 확인하고 다시 시도하세요.'); }
  finally { setBusy(false); }
 };
 return <>
  <Button disabled={busy} onClick={() => input.current?.click()}>DOCX 가져오기</Button>
  <input hidden type="file" accept=".docx" aria-label="DOCX 파일 선택" ref={input} onChange={event => void read(event.target.files?.[0])} />
  {error && !preview && <span role="alert">{error}</span>}
  <Dialog open={!!preview} onOpenChange={open => { if (!open && !busy) setPreview(undefined); onOpened?.(); }} title="DOCX 가져오기" description="현재 문서를 저장한 뒤 새 문서로 엽니다. 원본 DOCX 파일은 변경하지 않습니다."
   footer={<><Button disabled={busy} onClick={() => setPreview(undefined)}>취소</Button><Button disabled={busy} onClick={() => void open()}>새 문서로 열기</Button></>}>
   <ul style={{ maxHeight: '40vh', overflowY: 'auto', lineHeight: 1.6 }}>{preview?.warnings.map(w => <li key={w}>{w}</li>)}</ul>
   {error && <p role="alert">{error}</p>}
  </Dialog>
 </>;
}
