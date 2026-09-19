import { useEffect, useMemo, useState } from 'react';
import { Button, SearchSelect, Dialog, ProductMenu, type EditorNavigationProps } from '@barocss/office-ui';
import { prepareProductNavigation, productDocumentHost } from '@barocss/shared';
import { OfficeWorkspace, workspaceIdentity, type WorkspaceDocument } from './workspace';
import { documentURL, products, referenceKey } from './products';

/** This shell never reads editor internals. The mounted product owns its flush contract. */
export function ProductNavigation({ product }: EditorNavigationProps) {
  const workspace = useMemo(() => new OfficeWorkspace(workspaceIdentity()), []);
  const [ready, setReady] = useState(!!productDocumentHost()), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WorkspaceDocument[]>([]), [current, setCurrent] = useState<WorkspaceDocument>();
  const [target, setTarget] = useState('');
  useEffect(() => {
    const update = () => setReady(!!productDocumentHost());
    window.addEventListener('wonffice:host-change', update); update();
    return () => window.removeEventListener('wonffice:host-change', update);
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '작업을 완료하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const flush = async () => { if (!await prepareProductNavigation()) throw new Error('마지막 입력을 저장하지 못했습니다. 현재 화면에서 저장을 다시 시도하세요.'); };
  const go = async (row?: WorkspaceDocument) => {
    const root = document.getElementById('root');
    if (root) root.inert = true;
    try {
      await flush();
      if (row) {
        if ((await workspace.meta(row.key)).trashedAt !== null) throw new Error('휴지통에 있는 자료입니다. 자료함에서 복원하세요.');
        await workspace.update(row.key, { openedAt: Date.now() });
      }
      location.assign(row ? documentURL({ workspace: workspace.id, product: row.product, id: row.id }) : `/?workspace=${encodeURIComponent(workspace.id)}`);
    } catch (error) { if (root) root.inert = false; throw error; }
  };
  const refresh = async () => {
    const host = productDocumentHost();
    const all = await workspace.list(); setRows(all);
    setCurrent(all.find(row => host && row.key === referenceKey({ product: host.product, id: host.id() })));
  };
  return <><nav className="ow-shell-nav office-command-surface" aria-label="Wonffice 작업 공간">
    <ProductMenu product={product} id="workspace" label="작업 공간 메뉴" blocks={[{ id: 'navigation', items: [
      { id: 'home', label: '자료함', disabled: !ready || busy },
      { id: 'references', label: '연결한 자료', disabled: !ready || busy }
    ] }]} onPick={id => {
      if (id === 'home') void run(() => go());
      if (id === 'references') void run(async () => { await flush(); await refresh(); setOpen(true); });
    }} />
    {error && <span role="alert">{error}</span>}
  </nav><Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }} title="연결한 자료" description="같은 작업 공간의 원본 자료를 연결합니다. 사본을 만들려면 자료함의 관리 메뉴를 사용하세요.">
    <div className="ow-manage">{current?.references.map(key => { const row = rows.find(one => one.key === key); return <div key={key} className="ow-link-row">
      <Button disabled={!row || row.trashedAt !== null || busy} onClick={() => row && void run(() => go(row))}>{row?.title || '없는 자료'} · {row ? products[row.product].label : '원본 없음'}{row?.trashedAt !== null ? ' · 사용할 수 없음' : ''}</Button>
      <Button disabled={busy} onClick={() => void run(async () => { await workspace.update(current.key, { references: current.references.filter(one => one !== key) }); await refresh(); })}>연결 해제</Button>
    </div>; })}
    {!current?.references.length && <p>연결한 자료가 없습니다.</p>}
    <div>원본 자료<SearchSelect ariaLabel="원본 자료" value={target} onChange={setTarget} disabled={busy} placeholder="자료 선택" options={rows.filter(row => row.key !== current?.key && row.trashedAt === null && !current?.references.includes(row.key)).map(row => ({ id: row.key, label: row.title, description: products[row.product].label }))} /></div>
    <Button disabled={busy || !target || !current} onClick={() => void run(async () => { await workspace.link(current!.key, target); setTarget(''); await refresh(); })}>원본 참조 추가</Button>{error && <p role="alert">{error}</p>}
    </div></Dialog></>;
}
