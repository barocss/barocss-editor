import { useEffect, useRef, useState } from 'react';
import { Button, useRevision } from '@barocss/office-ui';
import { appendDecisionVersion, createBusinessPair, readBusinessPair } from '../../../packages/office-word/src/business-pair';
import { prepareBusinessPairWrite } from '../../../packages/office-word/src/business-pair-write';
import type { WordRuntime } from './runtime';
import { captureBusinessPairIntent } from './business-pair-intent';
import { readWordFile } from '@barocss/office-word';
import { watchAnswers } from '@barocss/editor-core';

function PinnedContent({ text }: { text: string }) {
  const file = readWordFile(text);
  if ('error' in file) return <p role="status">보관한 자료를 읽을 수 없습니다.</p>;
  const paragraphs: string[] = [];
  const contentText = (value: unknown): string => {
    if (!value || typeof value !== 'object') return '';
    const node = value as { text?: string; content?: unknown[] };
    return (node.text ?? '') + (node.content?.map(contentText).join('') ?? '');
  };
  const collect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const node = value as { stype?: string; content?: unknown[] };
    if (node.stype === 'resources') return;
    if (node.stype === 'paragraph' || node.stype === 'heading') paragraphs.push(contentText(node));
    else node.content?.forEach(collect);
  };
  collect(file.document);
  return <div className="w-business-pin"><p>보관된 내용 · 텍스트 보기</p>
    {paragraphs.map((paragraph, index) => <p key={index}>{paragraph || '\u00a0'}</p>)}
    <details><summary>전체 원본과 서식 데이터</summary><pre style={{ maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</pre></details>
  </div>;
}

/** Product ownership stays here; the shared buttons carry no document semantics. */
export function BusinessPairPanel({ runtime, readOnly }: { runtime: WordRuntime; readOnly: boolean }) {
  useRevision(reread => watchAnswers(runtime.editor, reread), [runtime]);
  const authority = useRef(readOnly); authority.current = readOnly;
  const authorityStamp = useRef({ readOnly, version: 0 });
  if (authorityStamp.current.readOnly !== readOnly) authorityStamp.current = { readOnly, version: authorityStamp.current.version + 1 };
  const [draft, setDraft] = useState<{ rootId: string; requirement?: string; decision?: string }>();
  const [problem, setProblem] = useState(''), [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<{ rootId: string; text: string }>();
  const generation = useRef(0);
  useEffect(() => { generation.current++; return () => { generation.current++; }; }, [runtime]);
  const rootId = runtime.editor.getRootId();
  const result = readBusinessPair(runtime.exportNativeDocument());
  const writable = !readOnly && runtime.editor.isEditable && !busy;
  const capture = async (kind: 'requirement' | 'decision') => {
    if (!writable || result.status !== 'absent') return;
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
  const write = async (nextVersion: boolean) => {
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
      if (!nextVersion && (draft?.rootId !== rootId || !draft?.requirement || !draft?.decision))
        throw new Error('요구사항과 결정 문단을 먼저 지정하세요.');
      const payload = nextVersion ? appendDecisionVersion(native) : createBusinessPair(native, draft!.requirement!, draft!.decision!);
      const prepared = prepareBusinessPairWrite(runtime, payload, current, intent.live);
      if (!prepared || !await prepared.apply()) throw new Error('원본 또는 권한이 바뀌어 적용하지 않았습니다.');
      setDraft(undefined);
    } catch (error) { setProblem(error instanceof Error ? error.message : '항목을 작성하지 못했습니다.'); }
    finally { intent?.dispose(); setBusy(false); }
  };
  return <details className="w-business-pair" open>
    <summary>요구사항과 결정</summary>
    <p>직접 작성한 항목입니다. 승인 여부는 미확인, 검증은 미실행입니다.</p>
    {result.status === 'absent' ? <>
      <p>각 문단에 커서를 놓고 지정하세요. 문단 내용과 서식을 그대로 보관합니다.</p>
      <Button disabled={!writable} onMouseDown={event => event.preventDefault()} onClick={() => void capture('requirement')}>요구사항 문단 지정</Button>
      <Button disabled={!writable} onMouseDown={event => event.preventDefault()} onClick={() => void capture('decision')}>결정 문단 지정</Button>
      <p>{draft?.rootId === rootId && draft?.requirement ? '요구사항 지정됨' : '요구사항 미지정'} · {draft?.rootId === rootId && draft?.decision ? '결정 지정됨' : '결정 미지정'}</p>
      <Button disabled={!writable || draft?.rootId !== rootId || !draft?.requirement || !draft?.decision} onMouseDown={event => event.preventDefault()} onClick={() => void write(false)}>항목과 관계 작성</Button>
    </> : result.status !== 'valid' ? <p role="status">{result.status === 'unsupported' ? '지원하지 않는 항목 버전입니다.' : '항목을 읽을 수 없습니다.'} {result.reason} 원본은 유지됩니다.</p> : <>
      {result.payload.items.map(item => <section key={item.id}>
        <strong>{item.kind === 'requirement' ? '요구사항' : '결정'} · v{item.currentVersion}</strong>
        <p><code>{item.id}</code></p>
        <p>{result.items.find(entry => entry.item.id === item.id)?.state === 'current' ? '현재 문단과 일치' : '원본 변경 또는 위치 확인 필요'}</p>
        {item.versions.map(version => <Button key={version.version} tone="quiet" onClick={() => setPin({ rootId: rootId!, text: version.snapshotText })}>보관된 v{version.version} 내용</Button>)}
      </section>)}
      <p>요구사항 v{result.payload.relations[0].source.version} → supported_by → 결정 v{result.payload.relations[0].target.version}</p>
      <p role="status">{result.review === 'needed' ? '다시 검토해야 합니다. 기존 참조 버전은 유지됩니다.' : '작성한 버전 관계입니다. 사람의 승인은 확인되지 않았습니다.'}</p>
      <Button disabled={!writable} onMouseDown={event => event.preventDefault()} onClick={() => void write(true)}>현재 결정 내용을 새 버전으로 보관</Button>
    </>}
    {pin && pin.rootId === rootId && <section><Button tone="quiet" onClick={() => setPin(undefined)}>보관 내용 닫기</Button><PinnedContent text={pin.text} /></section>}
    {problem && <p role="alert">{problem}</p>}
  </details>;
}
