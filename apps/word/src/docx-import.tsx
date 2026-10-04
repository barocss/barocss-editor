import { useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, Dialog } from '@barocss/office-ui';
import { readWordDocx } from '@barocss/office-word';
import { captureProductNavigation, captureProductReplacementPreparation, productDocumentHost } from '@barocss/shared';
import type { WordRuntime } from './runtime';
export function DocxImport({ editor, native, beforeOpen, onOpened }: {
 editor: Editor; native?: Partial<Pick<WordRuntime, 'flushCommands' | 'captureInputIntent' | 'loadNativeDocument'>> & { view?: Pick<WordRuntime['view'], 'deliverInput' | 'captureInputOwner'> };
 beforeOpen: () => Promise<void>; onOpened?: () => void;
}) {
 const input = useRef<HTMLInputElement>(null);
 const lifetime = useRef<object | undefined>(undefined), currentEditor = useRef(editor), currentNative = useRef(native), pending = useRef<object | undefined>(undefined);
 currentEditor.current = editor; currentNative.current = native;
 const [preview, setPreview] = useState<ReturnType<typeof readWordDocx>>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
 useLayoutEffect(() => {
  const owner = {}; lifetime.current = owner;
  pending.current = undefined; setPreview(undefined); setError(''); setBusy(false);
  return () => { if (lifetime.current === owner) lifetime.current = undefined; };
 }, [editor, native]);
 const read = async (file?: File) => {
  if (!file || pending.current) return;
  const owner = lifetime.current, attempt = {}; pending.current = attempt;
  const current = () => !!owner && lifetime.current === owner && currentEditor.current === editor && currentNative.current === native;
  setBusy(true); setError('');
  try {
   if (file.size > 10 * 1024 * 1024) throw new Error('DOCX 파일은 10MB 이하로 선택하세요.');
   const bytes = await file.arrayBuffer();
   if (current()) setPreview(readWordDocx(new Uint8Array(bytes), file.name.replace(/\.docx$/i, '')));
  }
  catch (e) { if (current()) setError((e as Error).message); }
  finally { if (pending.current === attempt) pending.current = undefined; if (current()) { setBusy(false); if (input.current) input.current.value = ''; } }
 };
 const open = async () => {
  if (!preview || pending.current) return;
  const owner = lifetime.current, attempt = {}, root = editor.getRootId(), epoch = editor.dataStore.getDocumentEpoch();
  const navigation = captureProductNavigation(), replacement = captureProductReplacementPreparation();
  const mounted = () => !!owner && lifetime.current === owner && currentEditor.current === editor && currentNative.current === native;
  const owns = () => mounted() && editor.isEditable && editor.getRootId() === root && editor.dataStore.getDocumentEpoch() === epoch &&
   (navigation ? navigation.product === 'word' && navigation.isCurrent() : !productDocumentHost());
  pending.current = attempt; setBusy(true); setError('');
  try {
   if (!owns() || !await replacement.prepare() || !owns()) throw new Error('Retired document');
   if (native?.view && !await native.view.deliverInput(owns)) throw new Error('Pending input');
   await native?.flushCommands?.();
   if (!owns() || !replacement.isPrepared()) throw new Error('Retired document');
   const inputCurrent = native?.captureInputIntent?.();
   const viewCurrent = native?.view?.captureInputOwner();
   if (native?.captureInputIntent && !inputCurrent) throw new Error('Pending input');
   // Feedback can write a native comment. Capture the revision after that owned write.
   const revision = editor.dataStore.getEditRevision();
   await beforeOpen();
   if (!owns() || !replacement.isPrepared() || inputCurrent && !inputCurrent() || viewCurrent && !viewCurrent() || editor.dataStore.getEditRevision() !== revision) throw new Error('Changed document');
   if (native?.loadNativeDocument) native.loadNativeDocument(preview.document);
   else editor.loadDocument(preview.document, 'word');
   setPreview(undefined); onOpened?.();
  }
  catch { if (mounted()) setError('현재 문서 저장 또는 가져오기를 완료하지 못했습니다. 현재 문서를 확인하고 다시 시도하세요.'); }
  finally { if (pending.current === attempt) pending.current = undefined; if (mounted()) setBusy(false); }
 };
 return <>
  <Button disabled={busy} onClick={() => input.current?.click()}>DOCX 가져오기</Button>
  <input hidden type="file" accept=".docx" aria-label="DOCX 파일 선택" ref={input} onChange={event => void read(event.target.files?.[0])} />
  {error && !preview && <span role="alert">{error}</span>}
  <Dialog open={!!preview} onOpenChange={open => { if (!open && !pending.current) { setPreview(undefined); onOpened?.(); } }} title="DOCX 가져오기" description="현재 문서를 저장한 뒤 새 문서로 엽니다. 원본 DOCX 파일은 변경하지 않습니다."
   footer={<><Button disabled={busy} onClick={() => setPreview(undefined)}>취소</Button><Button disabled={busy} onClick={() => void open()}>새 문서로 열기</Button></>}>
   <ul style={{ maxHeight: '40vh', overflowY: 'auto', lineHeight: 1.6 }}>{preview?.warnings.map(w => <li key={w}>{w}</li>)}</ul>
   {error && <p role="alert">{error}</p>}
  </Dialog>
 </>;
}
