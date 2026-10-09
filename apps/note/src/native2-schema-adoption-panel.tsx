import { useEffect, useRef, useState } from 'react';
import { NoteEditor } from '@barocss/office-note/view';
import { Button } from '@barocss/office-ui';
import type { createNative2SchemaAdoptionOperation } from './native2-schema-adoption-operation';
import type { Native2AdoptionAdvisory, Native2AdoptionProposal } from './native2-schema-adoption-controller';

type Operation = ReturnType<typeof createNative2SchemaAdoptionOperation>;
type ReceiptRead = Awaited<ReturnType<Operation['confirm']>>;
type Input = { snapshotText: string; datasetPath: readonly number[]; idempotencyKey: string };

/** The host gives this panel its own operation and unmounts it on staged-read retirement. */
export function Native2SchemaAdoptionPanel({ createOperation, onClose }: {
  createOperation: () => Operation; onClose?: () => void;
}) {
  const lifetime = useRef<{ operation: Operation; receipt?: ReceiptRead; busy: boolean } | undefined>(undefined);
  const [ready, setReady] = useState(false), [closed, setClosed] = useState(false);
  const [snapshotText, setSnapshotText] = useState(''), [path, setPath] = useState(''), [key, setKey] = useState('');
  const [proposal, setProposal] = useState<{ input: Input; value: Native2AdoptionProposal }>();
  const [advisory, setAdvisory] = useState<Native2AdoptionAdvisory>();
  const [receipt, setReceipt] = useState<ReceiptRead>();
  const [confirmationStarted, setConfirmationStarted] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    const own = { operation: createOperation(), receipt: undefined as ReceiptRead | undefined, busy: false };
    lifetime.current = own; setReady(true); setClosed(false); setBusy(false);
    setProposal(undefined); setAdvisory(undefined); setReceipt(undefined); setConfirmationStarted(false);
    setMessage(''); setError('');
    return () => { lifetime.current = undefined; own.receipt?.dispose(); own.operation.dispose(); };
  }, [createOperation]);
  const close = () => {
    const own = lifetime.current; lifetime.current = undefined;
    own?.receipt?.dispose(); own?.operation.dispose(); setClosed(true); onClose?.();
  };
  const readInput = (): Input => {
    if (!/^(0|[1-9]\d*)(,(0|[1-9]\d*))*$/.test(path)) throw Error('native2_adoption_invalid_dataset_path');
    const datasetPath = path.split(',').map(Number);
    if (datasetPath.some(value => !Number.isSafeInteger(value))) throw Error('native2_adoption_invalid_dataset_path');
    return { snapshotText, datasetPath, idempotencyKey: key };
  };
  const matches = proposal && proposal.input.snapshotText === snapshotText &&
    proposal.input.datasetPath.join(',') === path && proposal.input.idempotencyKey === key;
  const current = ready && !closed && lifetime.current?.operation.isCurrent();
  const run = async (action: (operation: Operation) => Promise<void>) => {
    const own = lifetime.current;
    if (!own || own.busy) return;
    own.busy = true;
    setError(''); setBusy(true);
    try {
      if (!own.operation.isCurrent()) throw Error('native2_adoption_operation_retired');
      await action(own.operation);
    } catch (failure) {
      if (lifetime.current === own) setError(failure instanceof Error ? failure.message : 'native2_adoption_failed');
    } finally { own.busy = false; if (lifetime.current === own) setBusy(false); }
  };
  const preview = () => {
    if (!current || lifetime.current?.busy) return;
    setError(''); setAdvisory(undefined); setMessage('');
    try {
      const input = readInput(), value = lifetime.current!.operation.preview(input);
      setProposal({ input, value });
    } catch (failure) {
      setProposal(undefined); setError(failure instanceof Error ? failure.message : 'native2_adoption_failed');
    }
  };
  if (closed) return null;
  return <section aria-label="스키마 채택">
    <h2>스키마 채택</h2>
    <p>선택한 스키마와 담당자 필드 추가를 확인하세요. 원본 문서는 유지됩니다.</p>
    <label>전체 후보 문서 <textarea aria-label="전체 후보 문서" value={snapshotText}
      onChange={event => setSnapshotText(event.target.value)} /></label>
    <label>데이터 경로 <input aria-label="데이터 경로" placeholder="4,0" value={path}
      onChange={event => setPath(event.target.value)} /></label>
    <label>요청 키 <input aria-label="요청 키" value={key} onChange={event => setKey(event.target.value)} /></label>
    <Button disabled={!current || busy} onClick={preview}>후보 미리보기</Button>
    <Button disabled={!current || busy} onClick={() => void run(async operation => {
      await operation.recordCandidate(snapshotText);
      if (lifetime.current?.operation === operation) setMessage('초안을 보관했습니다.');
    })}>초안 보관</Button>
    <Button disabled={!current || busy || !matches || !proposal?.value.isCurrent()} onClick={() => void run(async operation => {
      const value = await proposal!.value.validate();
      if (lifetime.current?.operation === operation && value.isCurrent()) {
        setAdvisory(value); setMessage('구조 검사를 통과했습니다. 채택 확인은 별도입니다.');
      }
    })}>구조 검사</Button>
    <Button disabled={!current || busy || confirmationStarted || !matches || !proposal?.value.isCurrent() || !advisory?.isCurrent()}
      onClick={() => void run(async operation => {
        if (!matches || !proposal?.value.isCurrent() || !advisory?.isCurrent()) throw Error('native2_adoption_confirmation_unavailable');
        setConfirmationStarted(true);
        const value = await operation.confirm();
        const own = lifetime.current;
        if (!own || own.operation !== operation || !value.isCurrent()) { value.dispose(); return; }
        own.receipt?.dispose(); own.receipt = value; setReceipt(value);
        setMessage('영수증과 현재 읽기 결과가 일치합니다. 읽기 전용 문서를 확인하세요.');
      })}>채택 확인</Button>
    <Button disabled={!current || busy} onClick={() => void run(async operation => {
      await operation.recoverHistorical();
      if (lifetime.current?.operation === operation) setMessage('과거 요청 영수증을 확인했습니다. 현재 저장 상태는 별도입니다.');
    })}>과거 요청 영수증 확인</Button>
    <Button tone="quiet" onClick={close}>채택 화면 닫기</Button>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {proposal?.value.isCurrent() && <section aria-label="채택 후보 읽기 전용">
      <h3>후보 문서</h3>
      <p>선택 pin: {proposal.value.view.prior.version} → {proposal.value.view.next.version}</p>
      <NoteEditor key={proposal.value.view.session.session} editor={proposal.value.view.session.editor} rootId={proposal.value.view.session.rootId} writeAllowed={false} />
    </section>}
    {receipt?.isCurrent() && <section aria-label="영수증과 일치하는 현재 문서">
      <h3>현재 읽기 전용 문서</h3>
      <NoteEditor key={receipt.stage.session.session} editor={receipt.stage.session.editor} rootId={receipt.stage.session.rootId} writeAllowed={false} />
    </section>}
  </section>;
}
