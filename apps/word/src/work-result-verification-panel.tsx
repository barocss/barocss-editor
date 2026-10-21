import { useEffect, useRef, useState } from 'react';
import { Button } from '@barocss/office-ui';
import { PinnedContent, PinnedItemExcerpt } from './business-pair-pin';
import { stableWordSnapshotText, serverWordFileText } from './server-file';
import { ServerWordError } from './server-documents';
import type { WordRuntime } from './runtime';
import { currentWordWorkRun, matchingWordWorkRun, matchingWorkConfirmations, wordWorkKey,
  type WordWorkHost, type WordWorkView } from './work-result-verification-client';

const labels = { passed: '통과', failed: '실패', unsupported: '지원하지 않음', error: '검사 오류' } as const;
const phaseLabels = { 'not-run': '작업 미실행', unknown: '작업 결과 미확인', proposal: '제안만 있음',
  blocked: '작업 보류', failed: '작업 실패', accepted: '제안 수락', applied: '실제 Word 반영',
  rejected: '제안 거절', unsupported: '작업 지원하지 않음' } as const;
const loadProblem = (error: unknown) => error instanceof ServerWordError && [401, 403].includes(error.status ?? 0) ?
  '계정 접근이 거부되었습니다. 현재 권한을 확인한 뒤 다시 읽으세요.' :
  error instanceof ServerWordError && error.status === 409 ?
    '서버의 현재 저장본과 검사 기준이 달라 기록을 읽지 못했습니다. 최신 문서를 다시 확인하세요.' :
    '서버 기록을 확인하지 못했습니다. 연결을 확인한 뒤 다시 읽으세요. 기존 문서는 유지됩니다.';

export function WorkResultVerificationPanel({ runtime, host, readOnly }: {
  runtime: WordRuntime; host?: WordWorkHost; readOnly: boolean;
}) {
  const [view, setView] = useState<WordWorkView>();
  const [selected, setSelected] = useState(''), [confirmationId, setConfirmationId] = useState('');
  const [activity, setActivity] = useState<'idle' | 'loading' | 'running'>('idle');
  const [uncertain, setUncertain] = useState(false), [problem, setProblem] = useState('');
  const lifetime = useRef(0), permission = useRef({ readOnly, version: 0 });
  if (permission.current.readOnly !== readOnly) permission.current = { readOnly, version: permission.current.version + 1 };
  const rootId = runtime.editor.getRootId();
  useEffect(() => {
    const generation = ++lifetime.current;
    setView(undefined); setSelected(''); setConfirmationId(''); setActivity('idle'); setProblem(''); setUncertain(false);
    if (host) void host.load().then(result => { if (lifetime.current === generation) setView(result); },
      error => { if (lifetime.current === generation) setProblem(loadProblem(error)); });
    return () => { lifetime.current++; };
  }, [host, runtime, rootId]);
  const keyOf = (option: WordWorkView['options'][number]) =>
    [option.projectId, option.workId, option.resultId, option.attemptId ?? ''].join(':');
  const option = view?.options.find(one => keyOf(one) === selected);
  const confirmations = option && view ? matchingWorkConfirmations(option, view.confirmations) : [];
  const confirmation = confirmations.find(one => one.confirmationId === confirmationId);
  const staleAuthority = !!confirmation && !!view?.currentAuthorityEpoch &&
    (confirmation.authorityEpoch !== view.currentAuthorityEpoch || confirmation.actorIdentityId !== view.currentActorIdentityId);
  let matches = false;
  try { matches = !!view && stableWordSnapshotText(serverWordFileText(runtime.exportNativeDocument(), '')) ===
    stableWordSnapshotText(view.currentText); } catch { /* Retain the current document and refuse a run. */ }
  const savedOutput = !!option && !!view && option.phase === 'applied' &&
    option.outputRevision === view.currentRevision && option.outputHash === view.currentHash;
  const currentRun = option && confirmation && view?.runs.find(run =>
    currentWordWorkRun(option, confirmation, run, view.currentRevision, view.currentHash,
      view.currentActorIdentityId, view.currentAuthorityEpoch));
  const matchingRun = option && confirmation && view?.runs.find(run =>
    matchingWordWorkRun(option, confirmation, run, view.currentRevision, view.currentHash));
  const busy = activity !== 'idle';
  const load = async () => {
    if (!host || busy) return;
    const generation = lifetime.current, version = permission.current.version;
    setActivity('loading'); setProblem('');
    try {
      const result = await host.load();
      if (generation === lifetime.current && version === permission.current.version) {
        setView(result);
        const nextOption = result.options.find(one => keyOf(one) === selected);
        const nextConfirmation = nextOption && matchingWorkConfirmations(nextOption, result.confirmations)
          .find(one => one.confirmationId === confirmationId);
        setUncertain(!!nextOption && !!nextConfirmation && result.pendingKeys.includes(wordWorkKey(nextOption, nextConfirmation)));
      }
    } catch (error) { if (generation === lifetime.current) { setView(undefined); setProblem(loadProblem(error)); } }
    finally { if (generation === lifetime.current) setActivity('idle'); }
  };
  const run = async () => {
    if (!host || !option || !confirmation || !savedOutput || !matches || staleAuthority || readOnly || busy) return;
    const generation = lifetime.current, version = permission.current.version;
    const selection = JSON.stringify(runtime.editor.selection);
    const input = runtime.captureInputIntent({ selection: 'gesture' });
    const current = () => !!input && generation === lifetime.current && version === permission.current.version &&
      !permission.current.readOnly && runtime.editor.getRootId() === rootId &&
      JSON.stringify(runtime.editor.selection) === selection && input();
    if (!current()) { setProblem('입력과 선택이 끝난 뒤 검사하세요.'); return; }
    setActivity('running'); setProblem('');
    try {
      const receipt = await host.run(option, confirmation, current, !!matchingRun && !uncertain);
      if (current()) {
        setView(previous => previous ? { ...previous, runs: [...previous.runs.filter(one => one.runId !== receipt.runId), receipt],
          pendingKeys: previous.pendingKeys.filter(key => key !== wordWorkKey(option, confirmation)) } : undefined);
        setUncertain(false);
      }
    } catch (error) {
      if (generation === lifetime.current && version === permission.current.version) {
        setUncertain(true);
        if (error instanceof ServerWordError && [401, 403].includes(error.status ?? 0)) setView(undefined);
        setProblem(error instanceof ServerWordError && [401, 403].includes(error.status ?? 0) ? loadProblem(error) :
          '검사 결과를 확인하지 못했습니다. 원문과 이전 결과는 유지됩니다. 같은 요청으로 확인하거나 다시 시도하세요.');
      }
    } finally { if (generation === lifetime.current) setActivity('idle'); }
  };
  return <section className="w-work-result-verification" aria-label="Word 작업 결과 원문 보존 검사">
    <h3>실제 Word 작업 결과 검사</h3>
    <p>원본의 확인 기록과 적용된 Word 작업을 연결합니다. 프로젝트 제안이나 문서 저장만으로 통과가 되지 않습니다.</p>
    <p role="status">{activity === 'running' ? '검사 중 · 결과는 아직 미확인입니다.' : activity === 'loading' ?
      '서버 기록을 읽는 중입니다.' : !view ? '검사 · 서버 기록 미확인' : !option ? '검사 · 작업 결과를 선택하지 않음' :
      !confirmation ? '검사 · 이 작업 입력에 맞는 작성자 확인 기록 미선택' : staleAuthority ?
      '검사 · 확인 기록의 권한이 현재 계정 권한과 다릅니다.' : !savedOutput || !matches ?
      '검사 · 선택한 적용 결과는 현재 Word 원문과 다릅니다.' : uncertain ? '검사 · 실행 결과 미확인' :
      currentRun ? `검사 결과 · ${labels[currentRun.outcome]}` : matchingRun ?
        `검사 기록 · ${labels[matchingRun.outcome]} · 현재 권한 미확인 또는 변경` : '검사 · 실행하지 않음'}</p>
    {!host ? <p>로그인한 서버 Word 문서에서 작업 기록을 읽을 수 있습니다.</p> : <>
      <Button tone="quiet" disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => void load()}>작업·확인·검사 기록 읽기</Button>
      {view && <>
        {view.currentCriterionContext === 'unavailable' && <p role="alert">현재 저장본의 보호 기준이 변경되어 있거나 모호하여 현재 기준 문맥을 확인할 수 없습니다. 이전 검사 기록은 유지됩니다. 선택한 적용본을 검사하면 서버가 결과를 판정합니다.</p>}
        <p>현재 Word 서버 저장본 · revision {view.currentRevision} · SHA-256 {view.currentHash}</p>
        <label>실제 작업 결과 <select aria-label="Word 작업 결과 선택" value={selected} disabled={busy} onChange={event => {
          setSelected(event.target.value); setConfirmationId(''); setUncertain(false);
        }}><option value="">선택하세요</option>{view.options.map(one =>
          <option key={keyOf(one)} value={keyOf(one)}>{one.projectTitle} · {one.resultName} · {phaseLabels[one.phase]}</option>)}</select></label>
        {view.options.length === 0 && <p>이 Word 문서에 연결된 프로젝트 작업 결과가 없습니다.</p>}
        {option && <>
          <p>원본 · 프로젝트 {option.projectTitle} · 결과 {option.resultName} · 작업 {option.workId}</p>
          <p>제안 · {option.proposal ?? '제안 없음'} · 상태 {phaseLabels[option.phase]}</p>
          <p>적용 · {option.phase === 'applied' ? `시도 ${option.attemptId} · revision ${option.outputRevision}` : '실제 반영 미확인'}</p>
          <p>작업 수행자 · {option.attemptActorIdentityId ?? '시도 없음'} · 현재 검사 요청자 · {option.requesterIdentityId}</p>
          <p>저장 · {savedOutput && matches ? '선택한 적용본과 현재 서버 Word 저장본 일치' : '현재 저장본과 일치하지 않음 또는 미확인'}</p>
          {option.inputText && <details><summary>작업 입력 원본 · revision {option.inputRevision}</summary><PinnedContent text={option.inputText} /></details>}
          <details><summary>프로젝트에 보관된 참조 원문</summary><PinnedContent text={option.referenceText} /></details>
          <label>입력 원본의 작성자 확인 <select aria-label="Word 기준 확인 기록 선택" value={confirmationId} disabled={busy}
            onChange={event => { setConfirmationId(event.target.value); const found = confirmations.find(one => one.confirmationId === event.target.value);
              setUncertain(!!found && view.pendingKeys.includes(wordWorkKey(option, found))); }}>
            <option value="">선택하세요</option>{confirmations.map(one =>
              <option key={one.confirmationId} value={one.confirmationId}>확인 {one.confirmationId} · {one.confirmedAt}</option>)}</select></label>
          {confirmation ? <>
            <p>확인 · 원본 revision {confirmation.documentRevision} · 확인 ID {confirmation.confirmationId}</p>
            <p>비교 대상 · 보관된 결정 v{confirmation.context.decision.version}</p>
            <PinnedItemExcerpt text={confirmation.context.decision.snapshotText} bookmarkId={confirmation.context.decision.locator.bookmarkId} />
            {savedOutput && <><p>적용된 현재 Word의 같은 위치</p>
              <PinnedItemExcerpt text={view.currentText} bookmarkId={confirmation.context.decision.locator.bookmarkId} /></>}
          </> : <p>이 작업 입력과 같은 버전의 작성자 확인을 선택해야 합니다. 문구만 같은 다른 확인은 사용할 수 없습니다.</p>}
          {staleAuthority && <p role="alert">현재 권한에 맞는 확인 기록과 작업 결과를 선택하세요. 이전 확인은 바꾸지 않습니다.</p>}
          <Button disabled={readOnly || busy || !confirmation || staleAuthority || !savedOutput || !matches} onMouseDown={event => event.preventDefault()}
            onClick={() => void run()}>{uncertain ? '같은 검사 요청 확인·재시도' : matchingRun ? '새 검사 실행' : '선택한 작업 결과 검사'}</Button>
        </>}
        {option && view.runs.filter(one => one.specimen.projectId === option.projectId && one.specimen.workId === option.workId &&
          one.specimen.attemptId === option.attemptId && one.specimen.resultId === option.resultId).map(record => {
          const linked = confirmations.find(one => one.confirmationId === record.confirmationId);
          const live = linked && currentWordWorkRun(option, linked, record, view.currentRevision, view.currentHash,
            view.currentActorIdentityId, view.currentAuthorityEpoch);
          return <details key={record.runId}><summary>{live ? '현재 원문' : '이전 원문·권한·참조의 기록'} · {labels[record.outcome]}</summary>
            <p>검사 ID {record.runId} · 확인 ID {record.confirmationId} · {record.startedAt} → {record.endedAt}</p>
            <p>입력 revision {record.specimen.inputRevision} · 출력 revision {record.specimen.outputRevision}</p>
            <p>출력 SHA-256 {record.outputHash}</p><pre>{record.outputText}</pre>
          </details>;
        })}
        <details><summary>이전 작업 검사 기록 · {view.runs.length}건</summary>{view.runs.map(record =>
          <p key={record.runId}>검사 {record.runId} · 작업 {record.specimen.workId} · 적용 시도 {record.specimen.attemptId} ·
            확인 {record.confirmationId} · 입력 revision {record.specimen.inputRevision} → 출력 revision {record.specimen.outputRevision} ·
            {labels[record.outcome]} · 현재 결과에 자동 적용하지 않음</p>)}</details>
      </>}
    </>}
    {problem && <p role="alert">{problem}</p>}
  </section>;
}
