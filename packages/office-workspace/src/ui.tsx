import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, EmptyState, FileItem, FilePick, Icon, SearchSelect, StatusIndicator, StatusNotice, TextField } from '@barocss/office-ui';
import { OfficeWorkspace, workspaceIdentity, type WorkspaceDocument } from './workspace';
import { documentURL, productKeys, products, type Product } from './products';

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function WorkspaceHome() {
  const workspace = useMemo(() => new OfficeWorkspace(workspaceIdentity()), []);
  const [rows, setRows] = useState<WorkspaceDocument[]>([]), [ready, setReady] = useState(false);
  const [query, setQuery] = useState(''), [view, setView] = useState<'all' | 'recent' | 'favorites' | 'trash'>('all');
  const [product, setProduct] = useState<Product | 'all'>('all'), [folder, setFolder] = useState('');
  const [problem, setProblem] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<Product>(), [name, setName] = useState('');
  const [managing, setManaging] = useState<WorkspaceDocument>(), [destination, setDestination] = useState('');
  const [linkTarget, setLinkTarget] = useState('');
  const [backupOpen, setBackupOpen] = useState(false), [restoreFile, setRestoreFile] = useState<File>();
  const lock = useRef(false);
  const refresh = async () => { setRows(await workspace.list()); setReady(true); };
  const perform = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setProblem(''); setNotice('');
    try { await action(); }
    catch (error) { setProblem(error instanceof Error ? error.message : '작업을 완료하지 못했습니다. 다시 시도하세요.'); }
    finally { lock.current = false; setBusy(false); }
  };
  useEffect(() => { void perform(refresh); }, []);
  const open = async (row: Pick<WorkspaceDocument, 'id' | 'key' | 'product'>) => {
    const meta = await workspace.meta(row.key);
    if (meta.trashedAt !== null) throw new Error('휴지통에서 복원한 뒤 열 수 있습니다.');
    await workspace.update(row.key, { openedAt: Date.now() });
    location.assign(documentURL({ workspace: workspace.id, product: row.product, id: row.id }));
  };
  const manage = (row: WorkspaceDocument) => { setManaging(row); setName(row.title); setDestination(row.folder); setLinkTarget(''); setProblem(''); };
  const needle = query.trim().normalize('NFC').toLocaleLowerCase();
  const shown = rows.filter(row => (view === 'trash' ? row.trashedAt !== null : row.trashedAt === null)
    && (view !== 'favorites' || row.favorite) && (view !== 'recent' || row.openedAt > 0)
    && (product === 'all' || row.product === product) && (!folder || row.folder === folder)
    && (!needle || `${row.title} ${row.searchText}`.normalize('NFC').toLocaleLowerCase().includes(needle)));
  const folders = [...new Set<string>(rows.map(row => row.folder).filter(Boolean))].sort();
  return <div className="ow-home">
    <aside className="ow-sidebar">
      <a className="ow-brand" href="/">wonffice<span>하나의 작업 공간</span></a>
      <nav aria-label="자료함">
        {([['all', '전체 자료'], ['recent', '최근 자료'], ['favorites', '즐겨찾기'], ['trash', '휴지통']] as const).map(([key, label]) =>
          <Button key={key} pressed={view === key && !folder} onClick={() => { setView(key); setFolder(''); }}>{label}</Button>)}
      </nav>
      {folders.length > 0 && <><p className="ow-section-label">폴더</p><nav aria-label="폴더">{folders.map(value =>
        <Button key={value} pressed={folder === value} onClick={() => { setView('all'); setFolder(value); }}>{value}</Button>)}</nav></>}
      <div className="ow-sidebar-bottom"><Button disabled={busy} onClick={() => { setProblem(''); setNotice(''); setBackupOpen(true); }}>백업 및 가져오기</Button><p>이 브라우저에 저장됩니다.</p></div>
    </aside>
    <main className="ow-main">
      <header className="ow-heading"><div><p className="ow-eyebrow">WORKSPACE</p><h1>{folder || { all: '전체 자료', recent: '최근 자료', favorites: '즐겨찾기', trash: '휴지통' }[view]}</h1></div>
        <TextField ariaLabel="자료 검색" placeholder="이름과 본문 검색" value={query} onChange={setQuery} />
      </header>
      {view !== 'trash' && <div className="ow-create" aria-label="제품별 새 자료">
        {productKeys.map(key => <Button key={key} disabled={busy} onClick={() => { setCreating(key); setName(''); }}>
          <span className="ow-product-mark" style={{ color: products[key].color }}>{products[key].label.charAt(0)}</span><span><strong>{products[key].label}</strong><small>새 자료 만들기</small></span><span aria-hidden><Icon name="add" /></span>
        </Button>)}
      </div>}
      <div className="ow-filters" aria-label="제품 필터"><Button pressed={product === 'all'} onClick={() => setProduct('all')}>모든 제품</Button>
        {productKeys.map(key => <Button key={key} pressed={product === key} onClick={() => setProduct(key)}>{products[key].label}</Button>)}
        <span>{shown.length}개</span><Button disabled={busy} onClick={() => void perform(refresh)}>새로 고침</Button>
      </div>
      {problem && <StatusNotice tone="danger" title="작업을 완료하지 못했습니다"
        actions={!ready && <Button disabled={busy} onClick={() => void perform(refresh)}>다시 불러오기</Button>}>{problem}</StatusNotice>}
      {notice && <StatusIndicator tone="success">{notice}</StatusIndicator>}
      {!ready ? (!problem && <StatusIndicator busy>자료를 불러오는 중입니다.</StatusIndicator>) : !shown.length ?
        <EmptyState className="ow-empty" title={needle || product !== 'all' || folder ? '검색 결과가 없습니다.' : view === 'trash' ? '휴지통이 비어 있습니다.' : view === 'favorites' ? '즐겨찾는 자료가 없습니다.' : view === 'recent' ? '최근에 연 자료가 없습니다.' : '여기에서 일을 시작하세요.'}
          action={(needle || product !== 'all' || folder || view === 'favorites' || view === 'recent')
            ? <Button onClick={() => { setQuery(''); setProduct('all'); setFolder(''); setView('all'); }}>전체 자료 보기</Button> : undefined}>
          {needle || product !== 'all' || folder ? '검색어와 필터를 확인하거나 전체 자료를 보세요.' : view === 'trash' ? '휴지통으로 옮긴 자료를 여기에서 복원할 수 있습니다.' : 'Note, Word, Slides, Site 자료를 한곳에서 관리합니다.'}
        </EmptyState> :
        <table className="ow-table"><thead><tr><th>이름</th><th>제품</th><th>폴더</th><th>수정일</th><th><span className="sr-only">작업</span></th></tr></thead><tbody>{shown.map(row =>
          <tr key={row.key} data-document={row.key}><td><Button tone="quiet" disabled={busy || row.trashedAt !== null} onClick={() => void perform(() => open(row))}>
            <span className="ow-file-mark" style={{ color: products[row.product].color }}>{products[row.product].label.charAt(0)}</span><span>{row.title}{row.error && <small>{row.error}</small>}</span>
          </Button>{row.references.length > 0 && <small className="ow-reference-count">연결 {row.references.length}</small>}</td><td>{products[row.product].label}</td><td>{row.folder || '—'}</td><td>{new Date(row.savedAt).toLocaleDateString('ko-KR')}</td>
            <td><Button ariaLabel={`${row.title} 즐겨찾기`} pressed={row.favorite} disabled={busy} onClick={() => void perform(async () => { await workspace.update(row.key, { favorite: !row.favorite }); await refresh(); })}><Icon name="favorite" /></Button>
              <Button ariaLabel={`${row.title} 관리`} disabled={busy} onClick={() => manage(row)}>관리</Button></td></tr>)}</tbody></table>}
    </main>
    <Dialog open={!!creating} onOpenChange={value => { if (!value && !busy) setCreating(undefined); }} title={`새 ${creating ? products[creating].label : ''} 자료`} description="새 자료를 만들고 편집기를 엽니다.">
      <TextField ariaLabel="새 자료 이름" placeholder="자료 이름" value={name} onChange={setName} />
      <div className="ow-actions"><Button tone="accent" disabled={busy || !creating} onClick={() => void perform(async () => {
        const kind = creating!; const id = await workspace.create(kind, name); await open({ product: kind, id, key: `${kind}:${id}` });
      })}>만들기</Button></div>{problem && <StatusNotice tone="danger" title="작업을 완료하지 못했습니다">{problem}</StatusNotice>}
    </Dialog>
    <Dialog open={!!managing} onOpenChange={value => { if (!value && !busy) setManaging(undefined); }} title="자료 관리" description={managing?.title}>
      {managing && <div className="ow-manage">
        <label>이름<TextField ariaLabel="자료 이름" value={name} onChange={setName} /></label>
        <label>폴더<TextField ariaLabel="자료 폴더" placeholder="비워 두면 전체 자료에만 표시" value={destination} onChange={setDestination} /></label>
        <div className="ow-actions"><Button tone="accent" disabled={busy || !name.trim()} onClick={() => void perform(async () => {
          if (name.trim() !== managing.title) await workspace.rename(managing.product, managing.id, name);
          await workspace.update(managing.key, { folder: destination.trim() }); await refresh(); setManaging(undefined);
        })}>변경 저장</Button><Button disabled={busy} onClick={() => void perform(async () => {
          await workspace.copy(managing.product, managing.id); await refresh(); setManaging(undefined); setNotice('독립된 사본을 만들었습니다. 원본 변경은 사본에 반영되지 않습니다.');
        })}>독립 사본 만들기</Button><Button disabled={busy} onClick={() => void perform(async () => {
          await workspace.update(managing.key, { trashedAt: managing.trashedAt === null ? Date.now() : null }); await refresh(); setManaging(undefined);
        })}>{managing.trashedAt === null ? '휴지통으로 이동' : '복원'}</Button></div>
        {managing.product === 'note' && managing.trashedAt === null && <div><Button disabled={busy} onClick={() => void perform(async () => {
          await workspace.noteToSite(managing.id); await refresh(); setManaging(undefined); setNotice('Note 본문으로 Site 사본을 만들었습니다. 이후 원본 변경은 자동 반영되지 않습니다.');
        })}>Site 본문 사본 만들기</Button><p>지원하는 본문을 새 사이트로 복사합니다. 원본 페이지와 외부 자산 참조는 유지하며, 지원하지 않는 블록이 있으면 복사를 중단합니다.</p></div>}
        <div className="ow-links"><h3>연결한 자료</h3><p>원본을 여는 참조입니다. 본문을 복사하거나 자동 변환하지 않습니다.</p>
          {managing.references.map(key => { const target = rows.find(row => row.key === key); return <div className="ow-link-row" key={key}>
            <Button disabled={busy || !target || target.trashedAt !== null} onClick={() => target && void perform(() => open(target))}>{target?.title || '없는 자료'}{target?.trashedAt !== null ? ' · 사용할 수 없음' : ''}</Button>
            <Button ariaLabel={`${target?.title || key} 연결 해제`} disabled={busy} onClick={() => void perform(async () => {
              const references = managing.references.filter(one => one !== key); await workspace.update(managing.key, { references }); setManaging({ ...managing, references }); await refresh();
            })}>연결 해제</Button></div>; })}
          <div>연결할 자료<SearchSelect ariaLabel="연결할 자료" value={linkTarget} onChange={setLinkTarget}
            disabled={busy || managing.trashedAt !== null} placeholder="이름 또는 제품으로 자료 찾기"
            options={rows.filter(row => row.key !== managing.key && row.trashedAt === null && !managing.references.includes(row.key))
              .map(row => ({ id: row.key, label: row.title, description: [products[row.product].label, row.folder].filter(Boolean).join(' · ') }))} /></div>
          <Button disabled={busy || !linkTarget || managing.trashedAt !== null} onClick={() => void perform(async () => {
            await workspace.link(managing.key, linkTarget); setManaging({ ...managing, references: [...managing.references, linkTarget] }); setLinkTarget(''); await refresh();
          })}>원본 참조 추가</Button>
        </div>{problem && <StatusNotice tone="danger" title="작업을 완료하지 못했습니다">{problem}</StatusNotice>}
      </div>}
    </Dialog>
    <Dialog open={backupOpen} onOpenChange={value => { if (!busy) setBackupOpen(value); }} title="백업 및 가져오기" description="백업에는 휴지통 자료도 포함합니다. 복원은 새 사본을 만듭니다. 기존 자료는 바꾸지 않습니다.">
      <div className="ow-manage"><Button disabled={busy} onClick={() => void perform(async () => { download(JSON.stringify(await workspace.backup(), null, 2), 'wonffice-workspace.json'); setNotice('백업 파일을 다운로드했습니다.'); })}>전체 자료 백업</Button>
        <section className="ow-import" aria-label="복원할 파일">
          <h3>백업 또는 제품 JSON 파일</h3>
          <p>파일을 선택한 뒤 새 사본으로 복원하세요.</p>
          <FilePick accept=".json,application/json" ariaLabel="백업 또는 제품 JSON 파일" disabled={busy}
            onPick={file => { setRestoreFile(file); setProblem(''); setNotice(''); }}>{restoreFile ? '파일 바꾸기' : '파일 선택'}</FilePick>
          {restoreFile && <FileItem name={restoreFile.name} bytes={restoreFile.size} disabled={busy}
            onRemove={() => { setRestoreFile(undefined); setProblem(''); }} />}
        </section>
        <Button disabled={busy || !restoreFile} onClick={() => void perform(async () => {
          let count: number;
          try { count = await workspace.importFile(await restoreFile!.text()); }
          catch (error) {
            if (error instanceof SyntaxError) throw new Error('JSON 파일을 읽을 수 없습니다. 올바른 백업 파일을 선택하세요.');
            throw error;
          }
          await refresh(); setNotice(`${count}개 자료를 새 사본으로 복원했습니다.`); setRestoreFile(undefined); setBackupOpen(false);
        })}>새 사본으로 복원</Button>{busy && <StatusIndicator busy>자료를 처리하고 있습니다.</StatusIndicator>}<p>이미지 URL 등 외부 자산은 백업 파일에 포함되지 않을 수 있습니다. 다른 개발 주소의 자료는 해당 주소에서 내보낸 파일을 가져오세요.</p>
        {problem && <StatusNotice tone="danger" title="작업을 완료하지 못했습니다">{problem}</StatusNotice>}{notice && <StatusIndicator tone="success">{notice}</StatusIndicator>}
      </div>
    </Dialog>
  </div>;
}
