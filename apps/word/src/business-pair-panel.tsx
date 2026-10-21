import { useEffect, useRef, useState } from 'react';
import { Button, useRevision } from '@barocss/office-ui';
import { appendDecisionVersion, appendRequirementVersion, createBusinessPair, createStandaloneRequirement, linkBusinessDecision, readBusinessPair } from '../../../packages/office-word/src/business-pair';
import { prepareBusinessPairWrite } from '../../../packages/office-word/src/business-pair-write';
import type { WordRuntime } from './runtime';
import { captureBusinessPairIntent } from './business-pair-intent';
import { PinnedContent, PinnedItemExcerpt } from './business-pair-pin';
import { CriterionConfirmationPanel } from './criterion-confirmation-panel';
import type { CriterionConfirmationHost } from './criterion-confirmation-client';
import { CriterionVerificationPanel } from './criterion-verification-panel';
import type { CriterionVerificationHost } from './criterion-verification-client';
import { WorkResultVerificationPanel } from './work-result-verification-panel';
import type { WordWorkHost } from './work-result-verification-client';
import { watchAnswers } from '@barocss/editor-core';

/** Product ownership stays here; the shared buttons carry no document semantics. */
export function BusinessPairPanel({ runtime, readOnly, confirmation, verification, workVerification }: { runtime: WordRuntime; readOnly: boolean; confirmation?: CriterionConfirmationHost; verification?: CriterionVerificationHost; workVerification?: WordWorkHost }) {
  useRevision(reread => watchAnswers(runtime.editor, reread), [runtime]);
  const authority = useRef(readOnly); authority.current = readOnly;
  const authorityStamp = useRef({ readOnly, version: 0 });
  if (authorityStamp.current.readOnly !== readOnly) authorityStamp.current = { readOnly, version: authorityStamp.current.version + 1 };
  const [draft, setDraft] = useState<{ rootId: string; requirement?: string; decision?: string }>();
  const [linkVersion, setLinkVersion] = useState<{ itemId: string; version: number; snapshotText: string }>();
  const [problem, setProblem] = useState(''), [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<{ rootId: string; text: string }>();
  const generation = useRef(0);
  const rootId = runtime.editor.getRootId();
  useEffect(() => { generation.current++; setLinkVersion(undefined); return () => { generation.current++; }; }, [runtime, rootId]);
  const result = readBusinessPair(runtime.exportNativeDocument());
  const writable = !readOnly && runtime.editor.isEditable && !busy;
  const linkRequirement = result.status === 'valid' && result.lifecycle === 'unlinked' ? result.payload.items[0] : undefined;
  const ownsLinkVersion = !!linkVersion && linkRequirement?.id === linkVersion.itemId && linkRequirement.versions.some(version => version.version === linkVersion.version && version.snapshotText === linkVersion.snapshotText);
  const capture = async (kind: 'requirement' | 'decision') => {
    if (!writable || !(result.status === 'absent' || kind === 'decision' && result.status === 'valid' && result.lifecycle === 'unlinked')) return;
    setBusy(true); setProblem('');
    const lifetime = generation.current;
    const permissionVersion = authorityStamp.current.version;
    const current = () => generation.current === lifetime && permissionVersion === authorityStamp.current.version && !authority.current && runtime.editor.getRootId() === rootId;
    const intent = captureBusinessPairIntent(runtime, current);
    try {
      if (!intent) throw new Error('입력이 끝난 뒤 문단을 다시 지정하세요.');
      await runtime.flushCommands();
      if (!intent.current())
        throw new Error('문서 또는 권한이 변경되었습니다.');
      const selection = intent.selection;
      if (selection?.type !== 'range' || selection.startNodeId !== selection.endNodeId)
        throw new Error('요구사항 또는 결정 문단 안에 커서를 놓으세요.');
      const point = { ...selection, endOffset: selection.startOffset, collapsed: true };
      const name = `business_${crypto.randomUUID()}`;
      if (!await runtime.editor.run('addWordBookmark', { name, rootId, selection: point, validateIntent: () => intent.live() ? undefined : 'The selected business paragraph changed.' }))
        throw new Error('현재 문단에 항목 위치를 만들 수 없습니다.');
      if (generation.current !== lifetime || permissionVersion !== authorityStamp.current.version || authority.current || runtime.editor.getRootId() !== rootId)
        throw new Error('문서 또는 권한이 변경되었습니다. 원본 위치는 유지됩니다.');
      setDraft(previous => ({ ...(previous?.rootId === rootId ? previous : {}), rootId: rootId!, [kind]: name }));
    } catch (error) { setProblem(error instanceof Error ? error.message : '항목 위치를 지정하지 못했습니다.'); }
    finally { intent?.dispose(); setBusy(false); }
  };
  const write = async (mode: 'create' | 'standalone' | 'link' | 'requirement' | 'decision') => {
    if (!writable) return;
    const lifetime = generation.current;
    const permissionVersion = authorityStamp.current.version;
    const current = () => generation.current === lifetime && permissionVersion === authorityStamp.current.version && !authority.current && runtime.editor.getRootId() === rootId;
    const intent = captureBusinessPairIntent(runtime, current);
    setBusy(true); setProblem('');
    try {
      if (!intent) throw new Error('입력이 끝난 뒤 다시 작성하세요.');
      await runtime.flushCommands();
      if (!intent.current()) throw new Error('문서 또는 권한이 변경되었습니다.');
      const native = runtime.exportNativeDocument();
      if (mode === 'create' && (draft?.rootId !== rootId || !draft?.requirement || !draft?.decision))
        throw new Error('요구사항과 결정 문단을 먼저 지정하세요.');
      if (mode === 'standalone' && (draft?.rootId !== rootId || !draft?.requirement))
        throw new Error('요구사항 문단을 먼저 지정하세요.');
      if (mode === 'link') {
        const original = readBusinessPair(native);
        if (draft?.rootId !== rootId || !draft?.decision || !linkVersion || original.status !== 'valid' || original.lifecycle !== 'unlinked' ||
          original.payload.items[0].id !== linkVersion.itemId || !original.payload.items[0].versions.some(version => version.version === linkVersion.version && version.snapshotText === linkVersion.snapshotText))
          throw new Error('결정 문단과 연결할 요구사항 버전을 다시 지정하세요.');
      }
      const payload = mode === 'decision' ? appendDecisionVersion(native) : mode === 'requirement' ? appendRequirementVersion(native)
        : mode === 'standalone' ? createStandaloneRequirement(native, draft!.requirement!)
        : mode === 'link' ? linkBusinessDecision(native, draft!.decision!, linkVersion!.version)
        : createBusinessPair(native, draft!.requirement!, draft!.decision!);
      const prepared = prepareBusinessPairWrite(runtime, payload, current, intent.live);
      if (!prepared || !await prepared.apply()) throw new Error('원본 또는 권한이 바뀌어 적용하지 않았습니다.');
      setDraft(undefined); setLinkVersion(undefined);
    } catch (error) { setProblem(error instanceof Error ? error.message : '항목을 작성하지 못했습니다.'); }
    finally { intent?.dispose(); setBusy(false); }
  };
  return <details className="w-business-pair" open>
    <summary>요구사항과 결정</summary>
    <p>직접 작성한 항목입니다. 문서에 적힌 승인 여부는 미확인입니다. 서버의 작성자 확인 기록은 아래에 따로 표시합니다. 원문 표기의 검증은 미실행입니다. 실제 실행 기록은 아래에서 따로 확인합니다.</p>
    {result.status === 'absent' ? <>
      <p>각 문단에 커서를 놓고 지정하세요. 문단 내용과 서식을 그대로 보관합니다.</p>
      <Button disabled={!writable} onMouseDown={event => event.preventDefault()} onClick={() => void capture('requirement')}>요구사항 문단 지정</Button>
      <Button disabled={!writable} onMouseDown={event => event.preventDefault()} onClick={() => void capture('decision')}>결정 문단 지정</Button>
      <p>{draft?.rootId === rootId && draft?.requirement ? '요구사항 지정됨' : '요구사항 미지정'} · {draft?.rootId === rootId && draft?.decision ? '결정 지정됨' : '결정 미지정'}</p>
      <Button disabled={!writable || draft?.rootId !== rootId || !draft?.requirement} onMouseDown={event => event.preventDefault()} onClick={() => void write('standalone')}>요구사항 기록</Button>
      <Button disabled={!writable || draft?.rootId !== rootId || !draft?.requirement || !draft?.decision} onMouseDown={event => event.preventDefault()} onClick={() => void write('create')}>항목과 관계 작성</Button>
    </> : result.status !== 'valid' ? <p role="status">{result.status === 'unsupported' ? '지원하지 않는 항목 버전입니다.' : '항목을 읽을 수 없습니다.'} {result.reason} 원본은 유지됩니다.</p> : <>
      {result.payload.items.map(item => <section key={item.id}>
        <strong>{item.kind === 'requirement' ? '요구사항' : '결정'} · v{item.currentVersion}</strong>
        <PinnedItemExcerpt text={item.versions[item.currentVersion - 1].snapshotText} bookmarkId={item.locator.bookmarkId} />
        <details><summary>항목 ID</summary><code>{item.id}</code></details>
        <p>{result.items.find(entry => entry.item.id === item.id)?.state === 'current' ? '현재 문단과 일치' : '원본 변경 또는 위치 확인 필요'}</p>
        {item.versions.map(version => <Button key={version.version} tone="quiet" onClick={() => setPin({ rootId: rootId!, text: version.snapshotText })}>보관된 v{version.version} 내용</Button>)}
      </section>)}
      {result.lifecycle === 'unlinked' ? <section aria-label="결정 연결">
        <p>결정 미연결 · 직접 작성한 요구사항입니다. 확인·검증은 실행하지 않았습니다.</p>
        <p>결정 문단에 커서를 놓고 지정한 뒤 연결할 요구사항 버전을 선택하세요.</p>
        <Button tone="quiet" disabled={!writable} onMouseDown={event => event.preventDefault()} onClick={() => void capture('decision')}>연결할 결정 문단 지정</Button>
        <label>요구사항 버전 <select aria-label="연결할 요구사항 버전" disabled={!writable} value={ownsLinkVersion ? linkVersion!.version : ''} onChange={event => {
          const version = linkRequirement?.versions.find(item => item.version === Number(event.target.value));
          setLinkVersion(version && linkRequirement ? { itemId: linkRequirement.id, version: version.version, snapshotText: version.snapshotText } : undefined);
        }}>
          <option value="">버전 선택</option>
          {result.payload.items.find(item => item.kind === 'requirement')!.versions.map(version => <option key={version.version} value={version.version}>v{version.version}</option>)}
        </select></label>
        <p>{draft?.rootId === rootId && draft?.decision ? '결정 지정됨' : '결정 미지정'}</p>
        <p>선택한 요구사항 버전의 보관 원본을 연결합니다. 현재 문단과 다르면 다시 검토해야 합니다.</p>
        <Button disabled={!writable || draft?.rootId !== rootId || !draft?.decision || !ownsLinkVersion} onMouseDown={event => event.preventDefault()} onClick={() => void write('link')}>결정 연결</Button>
        <Button tone="quiet" disabled={busy} onClick={() => { setDraft(undefined); setLinkVersion(undefined); runtime.view.contentEditableElement.focus(); }}>연결 취소</Button>
      </section> : <p>요구사항 v{result.payload.relations[0].source.version} → supported_by → 결정 v{result.payload.relations[0].target.version}</p>}
      <p role="status">{result.review === 'needed' ? '다시 검토해야 합니다. 기존 참조 버전은 유지됩니다.' : result.lifecycle === 'unlinked' ? '직접 작성한 요구사항입니다. 아직 결정과 연결하지 않았습니다.' : '작성한 버전 관계입니다. 사람의 승인은 확인되지 않았습니다.'}</p>
      {result.lifecycle === 'linked' && <details><summary>가상 색상 기준 작성</summary><p>원래 문장을 유지하고 요구사항 문단 끝에 직접 입력하세요: <code>Fictional active-button contrast: minimum 4.5:1.</code> 숫자는 이 가상 기준의 값이며 회사·법적 기준이 아닙니다. 새 버전 보관 → 저장 → 직접 확인 후 실행합니다.</p></details>}
      {result.lifecycle === 'linked' && <details><summary>Word 원문 보존 기준 작성</summary><p>보관된 결정 문단을 그대로 유지할 기준을 직접 작성하려면 요구사항 문단에 이 문장을 입력하세요: <code>Preserve the linked decision paragraph exactly as pinned.</code> 새 버전 보관, 서버 저장, 작성자 확인을 먼저 마칩니다. 실제 프로젝트 Word 작업 적용 뒤 아래에서 그 적용 결과를 골라 검사합니다.</p></details>}
      <Button disabled={!writable} onMouseDown={event => event.preventDefault()} onClick={() => void write('requirement')}>현재 요구사항 내용을 새 버전으로 보관</Button>
      <Button disabled={!writable || result.lifecycle !== 'linked'} onMouseDown={event => event.preventDefault()} onClick={() => void write('decision')}>현재 결정 내용을 새 버전으로 보관</Button>
    </>}
    {result.status === 'valid' && result.lifecycle === 'linked' && <CriterionConfirmationPanel runtime={runtime} host={confirmation} readOnly={readOnly} />}
    {result.status === 'valid' && result.lifecycle === 'linked' && <CriterionVerificationPanel runtime={runtime} host={verification} readOnly={readOnly} />}
    {result.status === 'valid' && result.lifecycle === 'linked' && <WorkResultVerificationPanel runtime={runtime} host={workVerification} readOnly={readOnly} />}
    {pin && pin.rootId === rootId && <section><Button tone="quiet" onClick={() => setPin(undefined)}>보관 내용 닫기</Button><PinnedContent text={pin.text} /></section>}
    {problem && <p role="alert">{problem}</p>}
  </details>;
}
