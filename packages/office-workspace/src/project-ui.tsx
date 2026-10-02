import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, Icon, SearchSelect, StatusNotice, TextField } from '@barocss/office-ui';
import { setProjectWorkPaused, type ProjectRecord, type Pin } from '@barocss/shared';
import { products, type Product, plainText } from './products';
import './project-ui.css';

export interface ProjectSnapshot { record: ProjectRecord; revision: number; commentId?: string; }
export interface ProjectDocument { product: Product; id: string; title: string; unavailable?: boolean; }
/** Both stores preserve the product's canonical document. Server implementations check access per request. */
export interface ProjectRepository {
  canCreateDocument?: boolean;
  list(): Promise<ProjectSnapshot[]>;
  read(id: string): Promise<ProjectSnapshot | null>;
  create(title: string, goal: string): Promise<ProjectSnapshot>;
  save(record: ProjectRecord, revision: number): Promise<ProjectSnapshot>;
  documents(): Promise<ProjectDocument[]>;
  createDocument(product: Product, name: string): Promise<ProjectDocument>;
  pin(document: { product: Product; id: string }): Promise<Pin>;
  readPin(project: string, pin: string): Promise<Pin & { sourceState?: 'current' | 'changed' | 'unavailable' }>;
  writable: boolean;
}

function sourceText(pin: Pin) {
  try { return plainText(JSON.parse(pin.text).document); } catch { return '원본 형식을 읽을 수 없습니다. 원본 파일을 확인하세요.'; }
}
const activityLabels: Record<string, string> = {
  'Project created': '프로젝트 생성', 'Project details updated': '프로젝트 정보 변경',
  'Result linked': '결과물 연결', 'Result unlinked': '결과물 연결 해제',
  'Comment added': '의견 기록', 'Opinion recorded': '의견 기록', 'Revision requested': '수정 요청 연결',
  'Same revision request updated': '같은 수정 요청 갱신',
  'Request paused': '작업 일시 정지', 'Work paused': '작업 일시 정지',
  'Request resumed': '같은 작업 재개', 'Same work resumed': '같은 작업 재개',
  'Input version pinned': '참고 원본 버전 보관', 'Follow-up result linked': '후속 결과물 연결'
};
export function PinnedSource({ pin }: { pin: Pin & { sourceState?: 'current' | 'changed' | 'unavailable' } }) {
  return <section className="ow-pinned-source"><p>{pin.title} · 버전 {pin.revision}</p>
    {pin.sourceState === 'changed' && <p role="status">참고 원본이 변경되었습니다. 보관 버전을 유지합니다. 결과물을 갱신할지 확인하세요.</p>}
    {pin.sourceState === 'unavailable' && <p role="status">현재 원본 버전을 확인할 수 없습니다. 보관한 버전만 표시합니다.</p>}
    <pre>{sourceText(pin)}</pre><details><summary>저장한 원본 데이터</summary><pre>{pin.text}</pre></details></section>;
}

export function ProjectHome({ repository, onOpen, onLibrary }: { repository: ProjectRepository;
  onOpen(project: string, document: ProjectDocument): Promise<void>; onLibrary(): void }) {
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]), [selected, setSelected] = useState<ProjectSnapshot | null>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [goal, setGoal] = useState('');
  const [linking, setLinking] = useState(false), [documentKey, setDocumentKey] = useState(''), [resultName, setResultName] = useState('');
  const [newDocument, setNewDocument] = useState(false), [product, setProduct] = useState<Product>('word');
  const [followup, setFollowup] = useState<string>(), [followupResult, setFollowupResult] = useState('');
  const [source, setSource] = useState<Pin>(), [pinning, setPinning] = useState<string>(), [inputKey, setInputKey] = useState('');
  const generation = useMemo(() => ({}), [repository]);
  const mounted = useRef(true), [dataGeneration, setDataGeneration] = useState<object>();
  const currentGeneration = useRef(generation); currentGeneration.current = generation;
  const owns = () => mounted.current && currentGeneration.current === generation;
  const requireOwn = () => { if (!owns()) throw new Error('프로젝트 연결이 바뀌었습니다. 다시 여세요.'); };
  const lock = useRef(false);
  const perform = async (action: () => Promise<void>) => {
    if (lock.current || !owns()) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (cause) { if (owns()) setError(cause instanceof Error ? cause.message : '작업을 완료하지 못했습니다.'); }
    finally { if (owns()) { lock.current = false; setBusy(false); } }
  };
  const refresh = async (id = selected?.record.id) => {
    const all = await repository.list(); requireOwn();
    const docs = await repository.documents(); requireOwn();
    const chosen = id ? await repository.read(id) : null; requireOwn();
    setProjects(all); setDocuments(docs); setSelected(chosen); setDataGeneration(generation);
  };
  useEffect(() => {
    mounted.current = true; lock.current = false; setBusy(false); setSource(undefined);
    setCreating(false); setLinking(false); setPinning(undefined); setFollowup(undefined);
    const id = new URLSearchParams(location.search).get('project') ?? undefined; void perform(() => refresh(id));
    return () => { mounted.current = false; };
  }, [repository]);
  const openSource = async (project: string, pin: string) => {
    const captured = await repository.readPin(project, pin); requireOwn(); setSource(captured);
  };
  const choose = async (one: ProjectSnapshot | null) => {
    requireOwn(); setSelected(one);
    const url = new URL(location.href); if (one) url.searchParams.set('project', one.record.id); else url.searchParams.delete('project');
    history.replaceState(null, '', url);
  };
  const update = async (next: ProjectRecord) => {
    requireOwn(); if (!selected || next.id !== selected.record.id) throw new Error('프로젝트가 바뀌었습니다. 다시 여세요.');
    const saved = await repository.save(next, selected.revision); requireOwn(); setSelected(saved); setProjects(all => all.map(one => one.record.id === saved.record.id ? saved : one));
  };
  const ready = dataGeneration === generation;
  const record = ready ? selected?.record : undefined;
  const resultDocuments = new Set(record?.results.map(one => `${one.document.product}:${one.document.id}`));
  const available = documents.filter(one => !one.unavailable && !resultDocuments.has(`${one.product}:${one.id}`));
  const findDocument = (key: string) => documents.find(one => `${one.product}:${one.id}` === key);
  return <div className="ow-project-home">
    <header className="ow-project-nav"><a href="/">wonffice</a><Button disabled={busy} onClick={onLibrary}>자료함</Button></header>
    <main className="ow-project-main">
      <header className="ow-project-heading"><div>{record && <Button disabled={busy} tone="quiet" onClick={() => void choose(null)}><Icon name="back" />프로젝트</Button>}
        <h1>{record?.title ?? '프로젝트'}</h1>{record && <p className="ow-project-goal">{record.goal}</p>}</div>
        {!record && <Button tone="accent" disabled={!repository.writable || busy || !ready} onClick={() => { setName(''); setGoal(''); setCreating(true); }}>프로젝트 만들기</Button>}
      </header>
      {error && <StatusNotice tone="danger" title="작업을 완료하지 못했습니다" actions={<Button disabled={busy} onClick={() => void perform(() => refresh())}>다시 불러오기</Button>}>{error} 입력한 내용은 유지합니다.</StatusNotice>}
      {!record ? <section className="ow-project-list" aria-label="프로젝트 목록">
        {!projects.length && <p>목표를 정하고 기존 결과물을 연결하세요. 자동으로 문서나 작업을 만들지 않습니다.</p>}
        {(ready ? projects : []).map(one => <Button disabled={busy} key={one.record.id} onClick={() => void choose(one)}><span><strong>{one.record.title}</strong><small>{one.record.goal}</small></span>{one.record.archived && <span>보관됨</span>}<span>{one.record.results.length}개 결과</span></Button>)}
      </section> : <>
        <section className="ow-project-section" aria-labelledby="project-results"><div className="ow-project-section-heading"><h2 id="project-results">결과물</h2>
          <Button disabled={busy || !repository.writable || record.archived} onClick={() => { setLinking(true); setDocumentKey(''); setResultName(''); setNewDocument(false); }}>결과물 연결</Button></div>
          {!record.results.length && <p>확인할 결과물이 없습니다. 기존 자료를 연결하거나 새 자료를 만드세요.</p>}
          {record.results.map(result => { const original = documents.find(one => one.product === result.document.product && one.id === result.document.id); return <article className="ow-project-result" key={result.id}>
            <div><Button tone="quiet" disabled={busy || !original || original.unavailable} onClick={() => original && void perform(() => onOpen(record.id, original))}>{result.name}</Button><small>{products[result.document.product].label} · {original?.unavailable ? '휴지통에 있음' : original ? '원본 연결' : '원본 없음'}</small></div>
            <details><summary>요청과 참고 자료</summary>{result.request && <p>연결된 요청: {record.works.find(one => one.id === result.request)?.request ?? result.request}</p>}
              {!result.inputs.length && <p>기록한 참고 버전이 없습니다.</p>}{result.inputs.map(pin => <div key={pin.id} className="ow-project-reference"><Button disabled={busy} onClick={() => void perform(() => openSource(record.id, pin.id))}>{pin.title} · 버전 {pin.revision}</Button></div>)}
              <Button disabled={busy || !repository.writable || record.archived} onClick={() => { setPinning(result.id); setInputKey(''); }}>참고 버전 연결</Button>
              <Button disabled={busy || !repository.writable} onClick={() => void perform(() => update({ ...record, results: record.results.filter(one => one.id !== result.id) }))}>프로젝트에서 연결 해제</Button><p>원본 자료는 삭제하지 않습니다.</p>
            </details>
          </article>; })}
        </section>
        <section className="ow-project-section" aria-labelledby="project-work"><h2 id="project-work">작업</h2>
          {!record.works.length && <p>수정 요청이 없습니다. 결과물의 영역에 의견을 남기고 수정 작업으로 연결할 수 있습니다.</p>}
          {record.works.map(work => <details className="ow-project-work" key={work.id}><summary>{work.request}<span>{work.state === 'paused' ? '일시 정지' : '실행기 미연결'}</span></summary>
            <p>{work.state === 'paused' ? '수정 요청을 중단했습니다. 원본 변경은 적용되지 않았습니다.' : '제품 Agent 실행기가 연결되지 않았습니다. 요청을 보관하며 원본은 자동 변경하지 않습니다.'}</p><p>담당: 연결된 Agent 없음</p><h3>입력 자료</h3>{work.inputs.map(pin => {
              const initial = record.comments.find(comment => comment.id === work.commentId)?.pin.id === pin.id;
              const uses = record.results.filter(result => result.request === work.id && result.inputs.some(input => input.id === pin.id));
              return <div key={pin.id} className="ow-project-reference" role="group" aria-label={initial ? '수정 요청의 기준 원본' : '후속 결과의 참고 원본'}><p>{initial ? '수정 요청의 기준 원본' : '후속 결과의 참고 원본'}{uses.length > 0 && ` · ${uses.map(result => result.name).join(', ')}`}</p>
                <Button disabled={busy} onClick={() => void perform(() => openSource(record.id, pin.id))}>{pin.title} · 버전 {pin.revision}</Button></div>;
            })}
            <h3>관련 결과</h3>{work.outputs.map(id => <p key={id}>{record.results.find(one => one.id === id)?.name ?? '연결 해제된 결과'}</p>)}
            <Button disabled={busy || !repository.writable || record.archived || !record.results.some(one => !work.outputs.includes(one.id))} onClick={() => { setFollowup(work.id); setFollowupResult(''); const first = work.inputs[0]; setInputKey(first ? `${first.document.product}:${first.document.id}` : ''); }}>후속 결과 연결</Button>
            <Button disabled={busy || !repository.writable || record.archived} onClick={() => void perform(() => update(setProjectWorkPaused(record, work.id, work.state !== 'paused')))}>{work.state === 'paused' ? '같은 작업 재개' : '일시 정지'}</Button>
          </details>)}
        </section>
        {record.activities.length > 0 && <section className="ow-project-section"><h2>최근 변경</h2><ol className="ow-project-activities">{record.activities.slice(-6).reverse().map(activity => <li key={activity.id}>{Object.prototype.hasOwnProperty.call(activityLabels, activity.label) ? activityLabels[activity.label] : activity.label}<time>{new Date(activity.at).toLocaleString('ko-KR')}</time></li>)}</ol></section>}
        <details className="ow-project-management"><summary>프로젝트 관리</summary><TextField ariaLabel="프로젝트 이름" value={record.title} onCommit={value => value.trim() && void perform(() => update({ ...record, title: value.trim() }))} disabled={!repository.writable || busy} />
          <Button disabled={busy || !repository.writable} onClick={() => void perform(() => update({ ...record, archived: !record.archived }))}>{record.archived ? '프로젝트 다시 열기' : '프로젝트 보관'}</Button><p>보관해도 원본 문서는 유지합니다.</p></details>
      </>}
    </main>
    <Dialog open={creating && ready} onOpenChange={value => !busy && setCreating(value)} title="프로젝트 만들기" description="목표와 결과물을 연결합니다. 문서 형식은 나중에 선택할 수 있습니다.">
      <div className="ow-project-form"><TextField ariaLabel="프로젝트 이름" value={name} onChange={setName} /><label>목표<textarea aria-label="프로젝트 목표" value={goal} onChange={event => setGoal(event.target.value)} /></label>
        <Button tone="accent" disabled={busy || !name.trim() || !goal.trim()} onClick={() => void perform(async () => { const next = await repository.create(name.trim(), goal.trim()); requireOwn(); setProjects(all => [...all, next]); await choose(next); requireOwn(); setCreating(false); })}>만들기</Button></div>
    </Dialog>
    <Dialog open={linking && ready} onOpenChange={value => !busy && setLinking(value)} title="결과물 연결" description="이름을 먼저 정하고, 원본 자료를 연결하세요."><div className="ow-project-form">
      <TextField ariaLabel="결과물 이름" value={resultName} onChange={setResultName} /><div className="ow-actions"><Button pressed={!newDocument} onClick={() => setNewDocument(false)}>기존 자료</Button><Button disabled={repository.canCreateDocument === false} pressed={newDocument} onClick={() => setNewDocument(true)}>새 자료</Button></div>
      {repository.canCreateDocument === false && <p>새 인증 문서는 기존 자료함에서 만든 뒤 연결하세요. Site 인증 편집은 아직 연결되지 않았습니다.</p>}
      {newDocument ? <SearchSelect ariaLabel="자료 형식" value={product} onChange={value => setProduct(value as Product)} options={Object.entries(products).map(([id, value]) => ({ id, label: value.label }))} /> : <SearchSelect ariaLabel="연결할 원본" value={documentKey} onChange={setDocumentKey} options={available.map(one => ({ id: `${one.product}:${one.id}`, label: one.title, description: products[one.product].label }))} />}
      <Button tone="accent" disabled={busy || !resultName.trim() || (!newDocument && !documentKey)} onClick={() => void perform(async () => {
        if (!record) throw new Error('프로젝트를 다시 여세요.');
        const doc = newDocument ? await repository.createDocument(product, resultName.trim()) : findDocument(documentKey);
        requireOwn(); if (!doc) throw new Error('원본 자료를 찾을 수 없습니다.');
        setDocumentKey(`${doc.product}:${doc.id}`); setNewDocument(false);
        await update({ ...record, results: [...record.results, { id: crypto.randomUUID(), name: resultName.trim(), document: { product: doc.product, id: doc.id }, inputs: [] }] });
        requireOwn(); const updatedDocs = await repository.documents(); requireOwn(); setDocuments(updatedDocs); setLinking(false);
      })}>연결하기</Button></div></Dialog>
    <Dialog open={!!pinning && ready} onOpenChange={value => !value && !busy && setPinning(undefined)} title="참고 버전 연결" description="현재 저장된 원본과 버전을 보관합니다. 이후 원본 변경은 결과물을 덮어쓰지 않습니다."><div className="ow-project-form">
      <SearchSelect ariaLabel="참고 자료" value={inputKey} onChange={setInputKey} options={documents.filter(one => !one.unavailable).map(one => ({ id: `${one.product}:${one.id}`, label: one.title }))} />
      <Button disabled={busy || !inputKey} onClick={() => void perform(async () => { const doc = findDocument(inputKey); if (!doc || !record) throw new Error('자료를 다시 확인하세요.'); const pin = await repository.pin(doc); await update({ ...record, results: record.results.map(one => one.id === pinning ? { ...one, inputs: [...one.inputs, pin] } : one) }); requireOwn(); setPinning(undefined); })}>이 버전 보관</Button></div></Dialog>
    <Dialog open={!!followup && ready} onOpenChange={value => !value && !busy && setFollowup(undefined)} title="후속 결과 연결" description="같은 요청에 결과물과 현재 저장된 참고 버전을 연결합니다. 자동 편집이나 작업 완료를 뜻하지 않습니다."><div className="ow-project-form">
      <SearchSelect ariaLabel="후속 결과물" value={followupResult} onChange={setFollowupResult} options={(record?.results ?? []).filter(one => !record?.works.find(work => work.id === followup)?.outputs.includes(one.id)).map(one => ({ id: one.id, label: one.name }))} />
      <SearchSelect ariaLabel="현재 참고 원본" value={inputKey} onChange={setInputKey} options={documents.filter(one => !one.unavailable).map(one => ({ id: `${one.product}:${one.id}`, label: one.title }))} />
      <Button disabled={busy || !followupResult || !inputKey} onClick={() => void perform(async () => {
        const doc = findDocument(inputKey), work = record?.works.find(one => one.id === followup);
        if (!doc || !record || !work) throw new Error('작업과 원본을 다시 확인하세요.');
        const pin = await repository.pin({ product: doc.product, id: doc.id });
        await update({ ...record, results: record.results.map(one => one.id === followupResult ? { ...one, request: work.id, inputs: [...one.inputs, pin] } : one),
          works: record.works.map(one => one.id === work.id ? { ...one, outputs: [...one.outputs, followupResult], inputs: [...one.inputs, pin] } : one),
          activities: [...record.activities, { id: crypto.randomUUID(), at: new Date().toISOString(), label: 'Follow-up result linked' }] });
        requireOwn(); setFollowup(undefined);
      })}>같은 요청에 연결</Button></div></Dialog>
    <Dialog open={!!source && ready} onOpenChange={value => !value && setSource(undefined)} title="사용한 원본 버전" description="현재 원본과 구분되는 보관 버전입니다.">{source && ready && <PinnedSource pin={source} />}</Dialog>
  </div>;
}
