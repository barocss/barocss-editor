import { useEffect, useRef, useState } from 'react';
import { ServerWordError } from './server-documents';
import { Button } from '@barocss/office-ui';
import type { WordRuntime } from './runtime';
import { PinnedContent } from './business-pair-pin';
import { captureBusinessPairIntent } from './business-pair-intent';
import { stableWordSnapshotText, serverWordFileText } from './server-file';
import { currentCriterionReceipt, type CriterionConfirmationHost, type CriterionView } from './criterion-confirmation-client';

export function CriterionConfirmationPanel({ runtime, host, readOnly }: {
  runtime: WordRuntime; host?: CriterionConfirmationHost; readOnly: boolean;
}) {
  const [view, setView] = useState<CriterionView>();
  const [problem, setProblem] = useState(''), [busy, setBusy] = useState(false);
  const lifetime = useRef(0), permission = useRef({ readOnly, version: 0 });
  if (permission.current.readOnly !== readOnly) permission.current = { readOnly, version: permission.current.version + 1 };
  const rootId = runtime.editor.getRootId();
  useEffect(() => {
    const generation = ++lifetime.current;
    setView(undefined); setProblem(''); setBusy(false);
    if (host && !readOnly) void host.load().then(result => {
      if (lifetime.current === generation) setView(result);
    }, () => { if (lifetime.current === generation) setProblem('현재 내용을 저장한 뒤 서버 기록을 읽으세요.'); });
    return () => { lifetime.current++; };
  }, [host, runtime, rootId, readOnly]);
  const matches = !!view && stableWordSnapshotText(serverWordFileText(runtime.exportNativeDocument(), '')) === stableWordSnapshotText(view.basis.snapshotText);
  const confirmed = matches ? currentCriterionReceipt(view!.basis, view!.receipts) : undefined;
  const load = async () => {
    if (!host || readOnly || busy) return;
    const generation = lifetime.current, version = permission.current.version;
    setBusy(true); setProblem('');
    try {
      const result = await host.load();
      if (generation === lifetime.current && version === permission.current.version) setView(result);
    } catch { if (generation === lifetime.current) { setView(undefined); setProblem('저장한 문서와 현재 권한을 확인하지 못했습니다. 원본은 유지됩니다.'); } }
    finally { if (generation === lifetime.current) setBusy(false); }
  };
  const confirm = async () => {
    if (!host || !view || !matches || readOnly || busy || confirmed) return;
    const generation = lifetime.current, version = permission.current.version;
    const current = () => generation === lifetime.current && version === permission.current.version && !permission.current.readOnly;
    const intent = captureBusinessPairIntent(runtime, current);
    if (!intent) { setProblem('입력과 선택을 확인한 뒤 다시 시도하세요.'); return; }
    const captured = structuredClone(view);
    setBusy(true); setProblem('');
    try {
      await runtime.flushCommands();
      if (!intent.current()) throw new Error('changed');
      const receipt = await host.confirm(captured.basis, intent.current);
      if (intent.current()) setView({ basis: captured.basis, receipts: [...captured.receipts.filter(value => value.confirmationId !== receipt.confirmationId), receipt] });
    } catch (error) { if (current()) { if (error instanceof ServerWordError && [401, 403].includes(error.status ?? 0)) setView(undefined); setProblem('확인을 완료하지 못했습니다. 원본과 기존 기록은 유지됩니다. 연결 실패는 같은 요청으로 재시도하세요.'); } }
    finally { intent.dispose(); if (current()) setBusy(false); }
  };
  return <section className="w-criterion-confirmation" aria-label="정확한 요구사항 버전 확인">
    <p>원본 · 문서에 작성한 요구사항과 보관된 결정</p>
    <p>해석·제안 · 이 작업에서는 생성하지 않음</p>
    <p>검증 · 실행하지 않음</p>
    {!host ? <p>확인 · 로그인한 서버 문서의 작성자가 직접 확인해야 합니다.</p> : <>
      <p>확인 범위 · 현재 작성자의 본인 확인. 회사 승인이나 법적 서명이 아닙니다.</p>
      {confirmed ? <p role="status">요구사항 v{confirmed.context.requirement.version} 확인됨 · 사용자 {confirmed.actorIdentityId} · {confirmed.confirmedAt} · 결정 v{confirmed.context.decision.version}</p> :
        <p role="status">현재 버전의 서버 확인 기록은 미확인입니다.</p>}
      {view && <p>대상 · 요구사항 v{view.basis.context.requirement.version} → 보관된 결정 v{view.basis.context.decision.version} · 문서 저장 revision {view.basis.documentRevision}</p>}
      {view && <><details open><summary>확인할 요구사항 원본 v{view.basis.context.requirement.version}</summary><PinnedContent text={view.basis.context.requirement.snapshotText} /></details><details open><summary>참조 결정 v{view.basis.context.decision.version} · 현재 결정 v{view.basis.context.decision.currentVersion}</summary><PinnedContent text={view.basis.context.decision.snapshotText} /></details></>}
      <Button disabled={readOnly || busy} onMouseDown={e => e.preventDefault()} onClick={() => void load()}>서버 확인 기록 읽기</Button>
      <Button disabled={readOnly || busy || !matches || !!confirmed} onMouseDown={e => e.preventDefault()} onClick={() => void confirm()}>이 요구사항 버전을 직접 확인</Button>
    </>}
    {problem && <p role="alert">{problem}</p>}
    {view && view.receipts.length > 0 && <details><summary>이전 확인 기록 · 현재 권한으로 조회</summary>{view.receipts.map(receipt =>
      <p key={receipt.confirmationId}>요구사항 v{receipt.context.requirement.version} · 결정 v{receipt.context.decision.version} · {receipt.actorIdentityId} · {receipt.confirmedAt} · 확인 ID {receipt.confirmationId} · 검증 실행하지 않음</p>)}</details>}
  </section>;
}
