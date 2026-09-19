import { useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, Dialog, TaskStatus, type TaskPhase } from '@barocss/office-ui';
import { exportWordDocx, wordFileName, wordTitle, type WordDocx } from '@barocss/office-word';

export function DocxExport({ editor }: { editor: Editor }) {
  const [result, setResult] = useState<(WordDocx & { filename: string }) | null>(null);
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState<{ phase: TaskPhase; title: string; description: string; retry: 'prepare' | 'download' }>();
  const busy = useRef(false);
  const prepare = async () => {
    if (busy.current) return;
    busy.current = true;
    const rootId = editor.getRootId();
    setOpen(true); setResult(null);
    setTask({ phase: 'running', title: 'DOCX 변환 중', description: '문서 내용과 변환 안내를 준비합니다.', retry: 'prepare' });
    try {
      // Let the working state paint before the synchronous converter runs.
      await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (editor.getRootId() !== rootId) throw new Error('문서가 변경되었습니다. 현재 문서에서 다시 내보내세요.');
      setResult({ ...exportWordDocx(editor.exportDocument()), filename: wordFileName(wordTitle(editor.dataStore)).replace(/\.word\.json$/, '.docx') });
      setTask(undefined);
    } catch {
      setTask({ phase: 'error', title: 'DOCX 변환 실패', description: 'DOCX를 만들지 못했습니다. 원본 문서는 그대로 유지됩니다.', retry: 'prepare' });
    } finally { busy.current = false; }
  };
  const download = () => {
    if (!result || busy.current) return;
    busy.current = true;
    try {
      const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      const link = document.createElement('a');
      try {
        link.href = url; link.download = result.filename;
        document.body.append(link); link.click();
      } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      setTask({ phase: 'success', title: 'DOCX 다운로드 요청됨', description: `${result.filename} · 완료 여부는 브라우저 다운로드 목록에서 확인하세요.`, retry: 'prepare' });
      setResult(null); setOpen(false);
    } catch {
      setTask({ phase: 'error', title: 'DOCX 다운로드 실패', description: '준비한 파일을 다운로드하지 못했습니다. 다시 시도하세요.', retry: 'download' });
    } finally { busy.current = false; }
  };
  const close = () => {
    if (busy.current) return;
    setOpen(false); setResult(null);
    setTask({ phase: 'cancelled', title: 'DOCX 내보내기 취소됨', description: '원본 문서를 유지합니다.', retry: 'prepare' });
  };
  const status = task && <TaskStatus title={task.title} phase={task.phase} description={task.description}
    onDismiss={open ? undefined : () => setTask(undefined)}
    actions={task.phase === 'error' ? <Button onClick={task.retry === 'download' ? download : () => void prepare()}>다시 시도</Button> : undefined} />;
  return <>
    <Button disabled={task?.phase === 'running'} onClick={() => void prepare()}>DOCX 내보내기</Button>
    {!open && status}
    <Dialog open={open} onOpenChange={value => { if (!value) close(); }} title="DOCX 내보내기" description="문단·글자 스타일, 본문 책갈피·상호 참조와 기본 서식을 DOCX로 변환합니다."
      footer={<><Button disabled={task?.phase === 'running'} onClick={close}>취소</Button><Button disabled={!result || task?.phase === 'running' || task?.phase === 'error'} onClick={download}>DOCX 다운로드</Button></>}>
      {status}
      {result && <><p>파일: {result.filename}</p><p>변환 시 달라지는 부분</p>
        <ul style={{ maxHeight: 'min(40vh, 20rem)', overflow: 'auto', paddingLeft: '1.25rem', listStyle: 'disc', lineHeight: 1.6 }}>
          {result.warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul></>}
    </Dialog>
  </>;
}
