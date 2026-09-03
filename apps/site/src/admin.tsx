import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Button, Icon, IconButton, TextField } from '@barocss/office-ui';
import {
  columnNames,
  datasetsOf,
  definitionsOf,
  assetsOf,
  documentFaults,
  widthsOf,
  type Declares,
  lastPublish,
  linksTo,
  pagesOf,
  publishSaid,
  publishState,
  publishesOf,
  templatesIn,
  refCounts,
  refsIn
} from '@barocss/office-site';

/**
 * **관리** — the surface a reader opens the file into, and the builder is what they go *in* to.
 *
 * ## Why this is a mode and not a fifth view of the main area
 *
 * Because of what was already scattered. Six things this product shows are about the **site** rather
 * than about a page — its pages, its data, its definitions, its publishes, its faults, its files —
 * and they had ended up in three unrelated places: some as rail tabs, two in the rail's *footer*,
 * one in the main area, and the files nowhere at all.
 *
 * All six want the same thing and none of it is what the builder's chrome offers: **width**, no
 * canvas, no properties panel. Moving the dataset table into the main area had already made half a
 * mode by accident — with one open there are no boards, no widths and no wireframe, because none of
 * those means anything to a table.
 *
 * ## And why管理 is the outside
 *
 * *관리가 밖이고 편집이 안.* Which is what every tool of this shape does, and the reason is not
 * habit: a document tool cannot decide what a page looks like without opening the page, so opening
 * one is a step **in**. A builder that started in the canvas would have to answer *which page* before
 * the reader had seen the list.
 *
 * The shell is unchanged — `office-ui` gives regions, and this fills them differently: the left is
 * the five things a site is made of, the middle is a table, and there is no right, because a
 * properties panel is about a block and there are no blocks here.
 */
export type AdminTab = 'pages' | 'data' | 'components' | 'publish' | 'files';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'pages', label: '페이지' },
  { id: 'data', label: '데이터' },
  { id: 'components', label: '컴포넌트' },
  { id: 'publish', label: '발행' },
  { id: 'files', label: '파일' }
];

export function Admin({
  editor,
  revision,
  run,
  can,
  tab,
  onTab,
  onOpenPage,
  onOpenDefinition,
  onOpenDataset
}: {
  editor: Editor;
  revision: number;
  run: (name: string, payload?: Record<string, unknown>) => void;
  can: (name: string, payload?: Record<string, unknown>) => boolean;
  tab: AdminTab;
  onTab: (tab: AdminTab) => void;
  /** Going **in** — each of these leaves the admin and opens the builder on that thing. */
  onOpenPage: (sid: string) => void;
  onOpenDefinition: (id: string) => void;
  onOpenDataset: (name: string) => void;
}) {
  const store = editor.dataStore as { getNode: (sid: string) => any } | undefined;
  /*
   * What the schema says each node type may hold, which the fault checks compare the document
   * against. Built here rather than in the tab, because it is one question about the document and
   * every surface that asks it should get the same answer.
   */
  const declares = useMemo(() => {
    const schema = (store as never as { getActiveSchema?: () => any })?.getActiveSchema?.();
    return (node: { stype?: unknown }) =>
      Object.keys(schema?.getNodeType?.(String(node?.stype ?? ''))?.attrs ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, revision]);
  const doc = useMemo(
    () => ({ rootId: editor.getRootId() ?? '', getNode: (sid: string) => store?.getNode(sid) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, store, revision]
  );

  return (
    <div className="st-admin">
      <nav className="st-admin-nav" aria-label="관리">
        {TABS.map((one) => (
          <button
            key={one.id}
            type="button"
            aria-current={one.id === tab ? 'page' : undefined}
            data-admin-tab={one.id}
            onClick={() => onTab(one.id)}
          >
            {one.label}
          </button>
        ))}
      </nav>

      <div className="st-admin-body" data-admin={tab}>
        {tab === 'pages' ? (
          <AdminPages doc={doc} run={run} can={can} onOpen={onOpenPage} templates={templatesIn(doc as never)} />
        ) : null}
        {tab === 'data' ? <AdminData doc={doc} run={run} onOpen={onOpenDataset} /> : null}
        {tab === 'components' ? <AdminComponents doc={doc} onOpen={onOpenDefinition} /> : null}
        {tab === 'publish' ? (
          <AdminPublish editor={editor} doc={doc} run={run} can={can} declares={declares} />
        ) : null}
        {tab === 'files' ? <AdminFiles doc={doc} /> : null}
      </div>
    </div>
  );
}

/**
 * **페이지** — the table a 280px rail could not draw.
 *
 * The rail listed a name and an address and had room for nothing else, so the four facts a reader
 * actually manages pages by were invisible: which template draws it, whether a crawler may read it,
 * how many links point at it, and how long its content is. All four are in the document, and the
 * third is the one that matters most — deleting a page breaks links **silently**, because a link
 * into a page that is gone draws as ordinary words.
 */
function AdminPages({
  doc,
  run,
  can,
  onOpen,
  templates
}: {
  doc: { rootId: string; getNode: (sid: string) => any };
  run: (name: string, payload?: Record<string, unknown>) => void;
  can: (name: string, payload?: Record<string, unknown>) => boolean;
  onOpen: (sid: string) => void;
  templates: { id: string; name: string }[];
}) {
  const [starting, setStarting] = useState(false);
  const pages = pagesOf(doc as never).map((one) => {
    const node = doc.getNode(one.sid);
    const attrs = (node?.attributes ?? {}) as Record<string, unknown>;
    return {
      ...one,
      template: typeof attrs.template === 'string' ? attrs.template : '',
      noIndex: attrs.noIndex === true,
      description: typeof attrs.description === 'string' ? attrs.description : '',
      blocks: ((node?.content ?? []) as unknown[]).length,
      links: linksTo(doc as never, one.id)
    };
  });

  return (
    <>
      <header className="st-admin-head">
        <h2>페이지</h2>
        <p>{pages.length}개</p>
        <span className="st-admin-do">
          {starting ? (
            <>
              {/*
                빈 페이지 first, because a list whose first row is a template reads as *you must
                choose one* — and a blank page is a starting point too. Same list as the rail's, and
                the same reason it is a list rather than a button per template: a template is not a
                kind of page, it is where one starts from.
              */}
              <Button
                onClick={() => {
                  run('insertPage');
                  setStarting(false);
                }}
                data={{ 'admin-from': 'blank' }}
              >
                빈 페이지
              </Button>
              {templates.map((one) => (
                <Button
                  key={one.id}
                  onClick={() => {
                    run('insertEntry', { template: one.id });
                    setStarting(false);
                  }}
                  data={{ 'admin-from': one.id }}
                >
                  {one.name}
                </Button>
              ))}
              <Button onClick={() => setStarting(false)}>취소</Button>
            </>
          ) : (
            <Button onClick={() => setStarting(true)} data={{ 'admin-add': 'page' }}>
              새 페이지
            </Button>
          )}
        </span>
      </header>

      <div className="st-admin-scroll">
        <table className="st-admin-table">
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">주소</th>
              <th scope="col">틀</th>
              <th scope="col">블록</th>
              {/*
                **링크 수**, which is the column the rail had no room for and the one a reader most
                needs: removing a page breaks every link into it, and a broken link draws as ordinary
                words. The number here is the moment before that is still preventable.
              */}
              <th scope="col">링크</th>
              <th scope="col">색인</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {pages.map((one, index) => (
              <tr key={one.sid} data-admin-page={one.id}>
                <th scope="row">
                  <TextField
                    value={one.name}
                    onCommit={(value) => run('setPageInfo', { nodeId: one.sid, name: value })}
                    ariaLabel={`${one.name} 이름`}
                  />
                </th>
                <td>
                  <TextField
                    value={one.path}
                    onCommit={(value) => run('setPageInfo', { nodeId: one.sid, path: value })}
                    ariaLabel={`${one.name} 주소`}
                  />
                </td>
                <td className="st-admin-quiet">{one.template || '—'}</td>
                <td className="st-admin-number">{one.blocks}</td>
                <td className="st-admin-number">{one.links}</td>
                <td className="st-admin-quiet">{one.noIndex ? '아니오' : '예'}</td>
                <td className="st-admin-row-do">
                  {/* Going **in** — the one act on this row that is not about the row. */}
                  <Button onClick={() => onOpen(one.sid)} data={{ 'admin-open': one.id }}>
                    편집
                  </Button>
                  <IconButton
                    label={`${one.name} 위로`}
                    disabled={!can('movePage', { nodeId: one.sid, to: index - 1 })}
                    onClick={() => run('movePage', { nodeId: one.sid, to: index - 1 })}
                  >
                    <Icon name="move-up" size={13} />
                  </IconButton>
                  <IconButton
                    label={`${one.name} 복제`}
                    onClick={() => run('duplicatePage', { nodeId: one.sid })}
                  >
                    <Icon name="duplicate" size={13} />
                  </IconButton>
                  <IconButton
                    label={`${one.name} 삭제`}
                    disabled={!can('removePage', { nodeId: one.sid })}
                    onClick={() => run('removePage', { nodeId: one.sid })}
                  >
                    <Icon name="delete" size={13} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * **데이터** — every dataset, and the two facts a rail row could not fit.
 *
 * Where the rows come from (typed, or an address) and whether the **published page** goes back for
 * them. The second is the one worth a column: turning it on changes what the page *is* — it ships a
 * script, a crawler reads the published rows rather than the live ones, and the list moves after the
 * first paint. `live.ts` argues all of it; a rail with room for a name argued none of it.
 */
function AdminData({
  doc,
  run,
  onOpen
}: {
  doc: { rootId: string; getNode: (sid: string) => any };
  run: (name: string, payload?: Record<string, unknown>) => void;
  onOpen: (name: string) => void;
}) {
  const datasets = datasetsOf(doc as never);

  return (
    <>
      <header className="st-admin-head">
        <h2>데이터</h2>
        <p>{datasets.length}개</p>
        <span className="st-admin-do">
          <Button onClick={() => run('insertDataset', { name: '새 데이터' })} data={{ 'admin-add': 'data' }}>
            새 데이터
          </Button>
        </span>
      </header>

      <div className="st-admin-scroll">
        <table className="st-admin-table">
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">열</th>
              <th scope="col">행</th>
              <th scope="col">어디서</th>
              <th scope="col">실시간</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {datasets.map((one) => (
              <tr key={one.name} data-admin-data={one.name}>
                <th scope="row">{one.label ?? one.name}</th>
                <td className="st-admin-quiet">{columnNames(one.fields).join(' · ')}</td>
                <td className="st-admin-number">{one.records.length}</td>
                <td className="st-admin-quiet">{one.kind === 'url' ? (one.url ?? '주소') : '직접 입력'}</td>
                <td className="st-admin-quiet">{one.live ? '예' : '—'}</td>
                <td className="st-admin-row-do">
                  <Button onClick={() => onOpen(one.name)} data={{ 'admin-open': one.name }}>
                    편집
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * **컴포넌트** — the definitions, and **how many places use each**.
 *
 * The one number that has to be said before anybody edits one: changing a definition changes every
 * page it is placed on, and a reader who did not know it was on six is a reader who has just
 * redesigned six pages. The rail said it; a table says it beside what the definition asks for, which
 * is the other half of *what am I about to change*.
 */
function AdminComponents({
  doc,
  onOpen
}: {
  doc: { rootId: string; getNode: (sid: string) => any };
  onOpen: (id: string) => void;
}) {
  /**
   * **One walk for the whole screen**, and the count is the index's rather than `usesOf`'s.
   *
   * `usesOf` counts `instance` nodes, and a page drawn through a **template** names its definition in
   * `surface.template` — which is not a placement. So 글 페이지 read *0곳에서 사용 중* while two pages
   * were drawn through it, and a reader about to edit it was told they were changing nothing. The
   * index found it the first time the two were compared.
   */
  const used = refCounts(refsIn(doc as never), 'component');
  const definitions = definitionsOf(doc as never).map((one) => ({
    ...one,
    uses: used.get(one.id) ?? 0,
    /* Whether it is a **template** — a definition with a slot, which is what a page starts from. */
    template: templatesIn(doc as never).some((each) => each.id === one.id)
  }));

  return (
    <>
      <header className="st-admin-head">
        <h2>컴포넌트</h2>
        <p>{definitions.length}개</p>
      </header>

      <div className="st-admin-scroll">
        <table className="st-admin-table">
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">쓰임</th>
              <th scope="col">변수</th>
              <th scope="col">틀</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {definitions.map((one) => (
              <tr key={one.id} data-admin-component={one.id}>
                <th scope="row">{one.name}</th>
                <td className="st-admin-number">{one.uses}</td>
                <td className="st-admin-quiet">{one.asks.join(' · ') || '—'}</td>
                <td className="st-admin-quiet">{one.template ? '예' : '—'}</td>
                <td className="st-admin-row-do">
                  <Button onClick={() => onOpen(one.id)} data={{ 'admin-open': one.id }}>
                    편집
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * **발행** — where it goes, when it last went, and what is wrong with the site now.
 *
 * Both of these were in the rail's **footer**, under the panel tabs, which is where a thing goes
 * when nobody has decided where it belongs. Neither is about a page: a publish is about the whole
 * site, and so is every fault in it.
 *
 * Together on one tab because they are one question asked twice — *is this ready to go out* — and a
 * reader about to press 발행 is exactly the reader who should be reading the faults.
 */
function AdminPublish({
  editor,
  doc,
  run,
  can,
  declares
}: {
  editor: Editor;
  doc: { rootId: string; getNode: (sid: string) => any };
  run: (name: string, payload?: Record<string, unknown>) => void;
  can: (name: string, payload?: Record<string, unknown>) => boolean;
  /** What the schema declares per node type — see the checks that use it. */
  declares: Declares;
}) {
  const records = publishesOf(doc as never);
  const last = lastPublish(doc as never);
  /*
   * **The document as a file would hold it** — `digestOf` strips the sids, the metadata and the
   * publish box itself, which is what makes *behind* mean something rather than *one instant later*.
   */
  const exported = (editor as never as { exportDocument?: () => unknown }).exportDocument?.();
  const { state } = publishState(doc as never, exported);
  const faults = documentFaults(doc as never, {
    /*
     * The schema, which is what the two attribute checks need and neither can get on its own —
     * without it they accept every name, which `faults.ts` chose deliberately so a surface with no
     * schema under-reports rather than crying wolf.
     */
    declares,
    /* And the document's **own** widths, which two more of them need. */
    widths: widthsOf(editor.dataStore as never, doc.rootId)
  });

  return (
    <>
      <header className="st-admin-head">
        <h2>발행</h2>
        <p>{publishSaid(state, last)}</p>
        <span className="st-admin-do">
          <Button disabled={!can('publishSite')} onClick={() => run('publishSite')} data={{ 'admin-publish': 'true' }}>
            지금 발행
          </Button>
        </span>
      </header>

      <div className="st-admin-scroll">
        {/*
          **What is wrong, first** — above the history rather than under it, because the history is
          what already happened and this is what would go out next.
        */}
        <section className="st-admin-part">
          <h3>{faults.length > 0 ? `고칠 것 ${faults.length}개` : '고칠 것 없음'}</h3>
          {faults.length > 0 ? (
            <ul className="st-admin-faults">
              {faults.map((one, index) => (
                <li key={index} data-admin-fault={one.kind}>
                  {one.said}
                </li>
              ))}
            </ul>
          ) : (
            <p className="st-admin-quiet">모든 링크와 참조가 가리키는 것이 있습니다.</p>
          )}
        </section>

        <section className="st-admin-part">
          <h3>지난 발행</h3>
          {records.length === 0 ? (
            <p className="st-admin-quiet">아직 발행하지 않았습니다.</p>
          ) : (
            <table className="st-admin-table">
              <thead>
                <tr>
                  <th scope="col">언제</th>
                  <th scope="col">페이지</th>
                  <th scope="col">어디로</th>
                </tr>
              </thead>
              <tbody>
                {[...records].reverse().map((one, index) => (
                  <tr key={index} data-admin-publish={one.at}>
                    <th scope="row">{one.at.slice(0, 16).replace('T', ' ')}</th>
                    <td className="st-admin-number">{one.pages}</td>
                    <td className="st-admin-quiet">{one.to ?? '파일로 내려받기'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * **파일** — the pictures the document carries, which had **nowhere at all**.
 *
 * An asset goes in when a reader drops a picture on a page or picks one in the panel, and from then
 * on the only way to see the list was to select a picture and open a dropdown. So a document could
 * carry a 2MB photograph nothing draws and there was no surface that would say so.
 *
 * The size is the column that earns the tab: `data:` URIs are what this document holds, so an
 * unused picture is weight in every save and every publish.
 */
function AdminFiles({ doc }: { doc: { rootId: string; getNode: (sid: string) => any } }) {
  const assets = assetsOf(doc as never).map((one) => ({
    ...one,
    /* Base64 is four characters per three bytes — near enough to say a number a reader can act on. */
    bytes: Math.round((one.data.length * 3) / 4)
  }));

  return (
    <>
      <header className="st-admin-head">
        <h2>파일</h2>
        <p>{assets.length}개</p>
      </header>

      <div className="st-admin-scroll">
        {assets.length === 0 ? (
          <p className="st-admin-quiet">아직 넣은 파일이 없습니다. 페이지에 그림을 끌어다 놓으면 여기 모입니다.</p>
        ) : (
          <table className="st-admin-table">
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">종류</th>
                <th scope="col">크기</th>
                <th scope="col">치수</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((one) => (
                <tr key={one.name} data-admin-file={one.name}>
                  <th scope="row">{one.label ?? one.name}</th>
                  <td className="st-admin-quiet">{one.type}</td>
                  <td className="st-admin-number">{(one.bytes / 1024).toFixed(1)}KB</td>
                  <td className="st-admin-quiet">
                    {one.width && one.height ? `${one.width}×${one.height}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
