import { useEffect, useRef, useState } from 'react';
import { Button } from '@barocss/office-ui';
import { getCriterionSpecimen } from '../../../packages/office-word/src/criterion-confirmation';
import type { WordRuntime } from './runtime';
import { captureBusinessPairIntent } from './business-pair-intent';
import { stableWordSnapshotText, serverWordFileText } from './server-file';
import { ServerWordError } from './server-documents';
import { currentVerification, type CriterionVerificationHost, type VerificationView } from './criterion-verification-client';

const labels = { passed: '통과', failed: '실패', unsupported: '지원 불가', error: '실행 오류' };
const specimens: Record<string, string> = { dark: '불투명 · 검정과 흰색', low: '불투명 · 비슷한 회색', transparent: '반투명 · 지원 불가 표본' };
export function CriterionVerificationPanel({ runtime, host, readOnly }: { runtime: WordRuntime; host?: CriterionVerificationHost; readOnly: boolean }) {
  const [view, setView] = useState<VerificationView>(), [selected, setSelected] = useState('dark');
  const [activity, setActivity] = useState<'idle' | 'loading' | 'running'>('idle'), [problem, setProblem] = useState(''), [uncertain, setUncertain] = useState(false);
  const busy = activity !== 'idle';
  const lifetime = useRef(0), permission = useRef({ readOnly, version: 0 });
  if (permission.current.readOnly !== readOnly) permission.current = { readOnly, version: permission.current.version + 1 };
  const root = runtime.editor.getRootId();
  useEffect(() => {
    const generation = ++lifetime.current;
    setView(undefined); setActivity('idle'); setProblem(''); setUncertain(false);
    return () => { if (lifetime.current === generation) lifetime.current++; };
  }, [host, runtime, root, readOnly]);
  const matches = !!view && stableWordSnapshotText(serverWordFileText(runtime.exportNativeDocument(), '')) === stableWordSnapshotText(view.basis.snapshotText);
  const specimen = getCriterionSpecimen(selected);
  const currentRun = matches && specimen ? [...view!.runs].reverse().find(run => currentVerification(view!.basis, run, specimen)) : undefined;
  const load = async () => {
    if (!host || readOnly || busy) return;
    const generation = lifetime.current, version = permission.current.version;
    setActivity('loading'); setProblem('');
    try {
      const result = await host.load();
      if (generation === lifetime.current && version === permission.current.version) { setView(result); setUncertain(!!result.pendingSpecimenIds?.includes(selected)); }
    } catch { if (generation === lifetime.current) { setView(undefined); setProblem('저장한 원문·확인 기록·현재 권한을 읽지 못했습니다. 원본은 유지됩니다.'); } }
    finally { if (generation === lifetime.current) setActivity('idle'); }
  };
  const run = async () => {
    if (!host || !view || !matches || !specimen || readOnly || busy || !view.basis.confirmationId || view.basis.executable.status !== 'executable') return;
    const generation = lifetime.current, version = permission.current.version;
    const current = () => generation === lifetime.current && version === permission.current.version && !permission.current.readOnly;
    const intent = captureBusinessPairIntent(runtime, current);
    if (!intent) { setProblem('입력과 선택이 끝난 뒤 실행하세요.'); return; }
    const captured = structuredClone(view);
    setActivity('running'); setProblem('');
    try {
      await runtime.flushCommands();
      if (!intent.current()) throw new Error('verification_intent_changed');
      const receipt = await host.run(captured.basis, specimen, intent.current, !!currentRun && !uncertain);
      if (intent.current()) { setView({ basis: captured.basis, runs: [...captured.runs.filter(one => one.runId !== receipt.runId), receipt], pendingSpecimenIds: captured.pendingSpecimenIds?.filter(id => id !== selected) }); setUncertain(false); }
    } catch (error) {
      if (current()) {
        setUncertain(true);
        if (error instanceof ServerWordError && [401, 403].includes(error.status ?? 0)) setView(undefined);
        else setView(previous => previous ? { ...previous, pendingSpecimenIds: [...new Set([...(previous.pendingSpecimenIds ?? []), selected])] } : undefined);
        setProblem('실행 결과를 확인하지 못했습니다. 원문과 이전 결과는 유지됩니다. 연결 실패는 같은 요청으로 재시도하세요.');
      }
    } finally { intent.dispose(); if (current()) setActivity('idle'); }
  };
  return <section className="w-criterion-verification" aria-label="확인된 가상 기준의 실제 실행">
    <h3>가상 색상 기준 실행</h3>
    <p>확인 기록과 별도로 등록된 로컬 표본을 실제 브라우저로 측정합니다. 회사 승인·사람의 가독성·물리 화면 검사가 아닙니다.</p>
    <p role="status">{activity === 'running' ? '실행 중 · 결과는 아직 미확인입니다.'
      : activity === 'loading' ? '실행 문맥과 기록을 읽는 중입니다.'
      : !view ? '검증 · 실행 기록 미확인'
      : !matches ? '검증 · 현재 원문의 실행 기록 미확인'
      : uncertain ? '검증 · 실행 결과 미확인'
      : currentRun ? `실행 결과 · ${labels[currentRun.outcome]}`
      : '검증 · 실행하지 않음'}</p>
    {!host ? <p>로그인한 서버 문서의 현재 작성자만 실행 기록을 조회할 수 있습니다.</p> : <>
      <Button tone="quiet" disabled={readOnly || busy} onMouseDown={event => event.preventDefault()} onClick={() => void load()}>실행 문맥과 기록 읽기</Button>
      {view && <>
        <p>원본 · 요구사항 v{view.basis.context.requirement.version} → 결정 v{view.basis.context.decision.version} · 확인 {view.basis.confirmationId ?? '미확인'}</p>
        <p>{view.basis.executable.status === 'executable' ? `직접 작성한 가상 기준 · ${view.basis.executable.criterion.minimumRatio}:1 이상` : `실행 불가 · ${view.basis.executable.reason}`}</p>
        <div className="flex items-center gap-1">
          <select aria-label="등록된 검증 표본" className="h-8 min-w-0" value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setUncertain(!!view.pendingSpecimenIds?.includes(event.target.value)); }}>
            {view.basis.specimens.map(one => <option key={one.id} value={one.id}>{specimens[one.id]}</option>)}
          </select>
          <Button disabled={readOnly || busy || !matches || !view.basis.confirmationId || view.basis.executable.status !== 'executable'} onMouseDown={event => event.preventDefault()} onClick={() => void run()}>{uncertain ? '같은 실행 재시도' : currentRun ? '새 표본 실행' : '표본 실행'}</Button>
        </div>
        {specimen && <details><summary>표본·평가 정의 v{specimen.version}</summary><pre>{specimen.sourceText}</pre><pre>{view.basis.evaluator.definition}</pre></details>}
        {view.runs.map(record => {
          const registered = getCriterionSpecimen(record.specimen.id);
          const live = matches && !!registered && currentVerification(view.basis, record, registered);
          return <details key={record.runId} className="w-criterion-run"><summary>{live ? '현재 문맥' : '이전 문맥 · 원본·확인·권한 또는 표본 버전이 다릅니다'} · {labels[record.outcome]} · {specimens[record.specimen.id]}</summary>
            <p>요구사항 v{record.context.requirement.version} · 결정 v{record.context.decision.version} · 확인 {record.confirmationId}</p>
            <p>요청자 {record.requesterIdentityId} · 실행 ID {record.runId} · {record.startedAt} → {record.endedAt}</p>
            <p>표본 {record.specimen.id} v{record.specimen.version} · 평가 {record.evaluator.id} v{record.evaluator.version}</p>
            <p>출력 SHA-256 {record.outputHash}</p><pre>{record.outputText}</pre>
          </details>;
        })}
      </>}
    </>}
    {problem && <p role="alert">{problem}</p>}
  </section>;
}
