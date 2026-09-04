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
  breakageSaid,
  breaksIfGone,
  pagesOf,
  publishSaid,
  publishState,
  publishesOf,
  templatesIn,
  refCounts,
  refsIn,
  type Ref
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
export type AdminTab = 'pages' | 'data' | 'components' | 'publish' | 'files' | 'settings';

/**
 * The five, each with the sentence that says what it is **for**.
 *
 * A column of five bare nouns is a column a reader has to open all five of to learn, and a title
 * with nothing under it is a screen that opens by repeating the tab that was pressed. Both are the
 * same missing sentence, so it is written once and drawn in both places.
 */
const TABS: { id: AdminTab; label: string; what: string }[] = [
  { id: 'pages', label: '페이지', what: '주소와 틀, 그리고 무엇이 이 페이지를 가리키는지' },
  { id: 'data', label: '데이터', what: '목록이 읽어가는 표 — 직접 넣거나, 주소에서 받아오거나' },
  { id: 'components', label: '컴포넌트', what: '여러 페이지가 함께 쓰는 조각과, 그것을 쓰는 곳' },
  { id: 'publish', label: '발행', what: '펴내기 전에 고칠 것과, 지난 발행' },
  { id: 'files', label: '파일', what: '문서가 안고 있는 그림과 그 무게' },
  /*
   * **사이트 전체가 무엇인지** — last, because it is the one a reader visits once and the four above
   * are the ones they live in.
   */
  { id: 'settings', label: '설정', what: '이 사이트의 이름과 주소, 그리고 링크를 걸었을 때 보이는 것' }
];

/** What a tab is called, and the line under its title. Read by the nav and by every header. */
export function adminTab(id: AdminTab) {
  return TABS.find((one) => one.id === id) ?? TABS[0];
}

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

  /**
   * **One walk for the whole screen** — the reason `refs.ts` exists, spent here.
   *
   * This screen asks two of the three questions the index answers: what points at each page, and how
   * many places use each definition. Before it, 페이지 walked the document **once per row** and
   * 컴포넌트 walked it again; eight pages was nine walks of 740 nodes, redone on every keystroke that
   * changed the document. Built here so both tabs read the same one.
   */
  const refs = useMemo(() => refsIn(doc as never), [doc]);

  /**
   * **How many of each**, drawn beside the name.
   *
   * A column of five bare words says what a site is *made of* and nothing about what is in it, so a
   * reader had to open all five to learn whether this site has three datasets or thirty. Every one of
   * these numbers is already computed by the tab that owns it — this is the same walk, read once for
   * the nav rather than once per tab.
   */
  const counts = useMemo(
    () => ({
      pages: pagesOf(doc as never).length,
      data: datasetsOf(doc as never).length,
      components: definitionsOf(doc as never).length,
      publish: publishesOf(doc as never).length,
      files: assetsOf(doc as never).length
    }),
    [doc]
  );

  /*
   * And the one fact about the site as a whole that belongs under the list rather than inside a tab:
   * whether what is on screen is what is published. It is the question a management screen is opened
   * to answer, and it was three clicks in.
   */
  const published = useMemo(
    () => publishState(doc as never, editor.exportDocument()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, revision, editor]
  );

  /**
   * The site's own name and address, which the file has had all along and no screen was showing.
   *
   * The name is `docMeta`'s `docTitle` — the shared schema's *what this document is called* — and
   * the address is `document.address`, which the sample sets and the publish uses. Neither is
   * required, so both fall back to a sentence rather than to an empty line: a nav that opens with a
   * blank strong tag reads as broken, and *이름 없는 사이트* reads as a thing to fix.
   */
  const site = useMemo(() => {
    const root = doc.getNode(doc.rootId);
    const attrs = (root?.attributes ?? {}) as Record<string, unknown>;

    const words = (sid: string): string => {
      const node = doc.getNode(sid);
      if (!node) return '';
      if (typeof node.text === 'string') return node.text;
      return ((node.content ?? []) as string[]).map(words).join('');
    };
    const meta = ((root?.content ?? []) as string[]).find((one) => doc.getNode(one)?.stype === 'docMeta');
    const title = ((doc.getNode(meta ?? '')?.content ?? []) as string[]).find(
      (one) => doc.getNode(one)?.stype === 'docTitle'
    );

    return {
      name: (title ? words(title) : '').trim() || '이름 없는 사이트',
      host: typeof attrs.address === 'string' ? attrs.address.replace(/^https?:\/\//, '') : ''
    };
  }, [doc]);

  return (
    <div className="st-admin">
      <nav className="st-admin-nav" aria-label="관리">
        {/*
          **무엇을 열어 두었는가** — the workspace block every tool of this kind opens with.

          The screen said `Barocss Site` in the titlebar, which is the *product's* name, and nothing
          anywhere said which site the reader had open or where it goes when it is published. On a
          screen whose whole job is managing one, that is the first line.
        */}
        <div className="st-admin-who" data-admin-who>
          <strong>{site.name}</strong>
          <span>{site.host || '주소 없음'}</span>
        </div>

        <div className="st-admin-tabs">
          {TABS.map((one) => (
            <button
              key={one.id}
              type="button"
              aria-current={one.id === tab ? 'page' : undefined}
              data-admin-tab={one.id}
              onClick={() => onTab(one.id)}
            >
              <span>{one.label}</span>
              {/* 설정 has nothing to count — it is one screen, not a list. */}
              {one.id in counts ? <em data-admin-count={one.id}>{counts[one.id as keyof typeof counts]}</em> : null}
            </button>
          ))}
        </div>

        {/*
          The state, at the foot — where a status line goes, and where it can be read without
          leaving whatever tab the reader is in.
        */}
        <button
          type="button"
          className="st-admin-state"
          data-admin-state={published.state}
          onClick={() => onTab('publish')}
        >
          <span className="st-admin-dot" />
          <span>{publishSaid(published.state, published.last)}</span>
        </button>
      </nav>

      <div className="st-admin-body" data-admin={tab}>
        {tab === 'pages' ? (
          <AdminPages doc={doc} refs={refs} run={run} can={can} onOpen={onOpenPage} templates={templatesIn(doc as never)} />
        ) : null}
        {tab === 'data' ? <AdminData doc={doc} run={run} onOpen={onOpenDataset} /> : null}
        {tab === 'components' ? <AdminComponents doc={doc} refs={refs} onOpen={onOpenDefinition} /> : null}
        {tab === 'publish' ? (
          <AdminPublish editor={editor} doc={doc} run={run} can={can} declares={declares} />
        ) : null}
        {tab === 'files' ? <AdminFiles doc={doc} /> : null}
        {tab === 'settings' ? <AdminSettings doc={doc} site={site} run={run} /> : null}
      </div>
    </div>
  );
}

/**
 * **화면 머리** — the title, what the screen is for, and the acts.
 *
 * One component rather than five copies of a `<header>`, and the reason is the sentence: a title
 * with nothing under it opens the screen by repeating the tab that was pressed, and the five
 * sentences that say what each tab is *for* were written once already, in `TABS`.
 *
 * The count sits **inside** the heading as a chip rather than beside it as a sentence — a reader
 * scanning for *how many* is scanning the title line, and `8개` set as body text next to a title is
 * a caption to a picture that is not there.
 */
function AdminHead({
  tab,
  count,
  said,
  children
}: {
  tab: AdminTab;
  count?: number;
  /** For a screen whose headline fact is not a count — 발행 has a state instead. */
  said?: string;
  children?: React.ReactNode;
}) {
  const one = adminTab(tab);
  return (
    <header className="st-admin-head">
      <div className="st-admin-title">
        <h2>
          {one.label}
          {count === undefined ? null : <span className="st-admin-count">{count}</span>}
        </h2>
        <p>{said ?? one.what}</p>
      </div>
      {children ? <span className="st-admin-do">{children}</span> : null}
    </header>
  );
}

/**
 * **찾기** — a filter over the rows, and the reason it is a component and not four inputs.
 *
 * Every table here grows: a site of eight pages is a sample and a site of eighty is a Tuesday. A
 * table with no way to narrow it is a table a reader scrolls, and scrolling is how a reader misses
 * the row they came for.
 *
 * It filters on **what is drawn**, not on a chosen column: a reader typing `블로그` does not know or
 * care whether that word is in the name, the address or the template, and a filter that asks them to
 * choose is a filter with a form in front of it.
 */
function AdminFind({ value, onValue, said }: { value: string; onValue: (one: string) => void; said: string }) {
  return (
    <div className="st-admin-find">
      <input
        type="search"
        value={value}
        placeholder={said}
        aria-label={said}
        data-admin-find
        onChange={(event) => onValue(event.target.value)}
      />
      {value ? (
        <button type="button" aria-label="찾기 지우기" onClick={() => onValue('')} data-admin-find-clear>
          <Icon name="all-clear" size={12} />
        </button>
      ) : null}
    </div>
  );
}

/** Whether a row's own words contain what was typed — case and spacing folded, as a reader means it. */
function has(query: string, ...words: unknown[]): boolean {
  const said = query.trim().toLowerCase();
  if (!said) return true;
  return words.map((one) => String(one ?? '').toLowerCase()).join(' ').includes(said);
}

/**
 * **아무것도 없을 때** — a table with no rows, said rather than drawn as an empty grid.
 *
 * Both cases, because they are different and a screen that confuses them is a screen that tells a
 * reader their site is empty when they have simply mistyped: *there are none* and *none of them
 * match what you typed*.
 */
function AdminNone({ said, found }: { said: string; found?: boolean }) {
  return (
    <p className="st-admin-none" data-admin-none={found ? 'found' : 'empty'}>
      {found ? '찾는 것이 없습니다' : said}
    </p>
  );
}

/**
 * **예/아니오가 아니라 상태** — a fact drawn as a chip so it reads without being read.
 *
 * 색인 said `예` and `아니오` in the same grey as the address beside it, so *which pages a crawler
 * may not read* — the one thing on that row a reader would scan a column for — was invisible in it.
 */
function Chip({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return (
    <span className="st-admin-chip" data-on={on ? '' : undefined}>
      {on ? yes : no}
    </span>
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
  refs,
  run,
  can,
  onOpen,
  templates
}: {
  doc: { rootId: string; getNode: (sid: string) => any };
  refs: Ref[];
  run: (name: string, payload?: Record<string, unknown>) => void;
  can: (name: string, payload?: Record<string, unknown>) => boolean;
  onOpen: (sid: string) => void;
  templates: { id: string; name: string }[];
}) {
  const [starting, setStarting] = useState(false);
  const [find, setFind] = useState('');
  const all = pagesOf(doc as never).map((one) => {
    const node = doc.getNode(one.sid);
    const attrs = (node?.attributes ?? {}) as Record<string, unknown>;
    return {
      ...one,
      template: typeof attrs.template === 'string' ? attrs.template : '',
      noIndex: attrs.noIndex === true,
      description: typeof attrs.description === 'string' ? attrs.description : '',
      blocks: ((node?.content ?? []) as unknown[]).length,
      breaks: breaksIfGone(refs, 'page', one.id)
    };
  });
  /* On the name, the address and the template — the three a reader would look for a page by. */
  const pages = all.filter((one) => has(find, one.name, one.path, one.template));

  return (
    <>
      <AdminHead tab="pages" count={all.length}>
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
            <Button onClick={() => setStarting(true)} data={{ 'admin-add': 'page' }} tone="accent">
              새 페이지
            </Button>
          )}
      </AdminHead>

      <AdminFind value={find} onValue={setFind} said="페이지 찾기" />

      <div className="st-admin-scroll">
        <table className="st-admin-table">
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">주소</th>
              <th scope="col">틀</th>
              <th scope="col">블록</th>
              {/*
                **가리키는 것**, which is the column the rail had no room for and the one a reader
                most needs: removing a page breaks everything that names it, and a broken link draws
                as ordinary words. The number here is the moment before that is still preventable.

                It was 링크 and it counted link marks only, which measured wrong for six of the
                sample's eight pages. Three shapes name a page — a link, a block's 이동, a data cell
                — so the column is named for the question and the cell's tooltip says which three.
              */}
              <th scope="col">가리킴</th>
              <th scope="col">색인</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {/*
              **The index is the page's own, not the filtered list's.** 위로 moves a page to
              `index - 1`, and with a filter on, the row above on screen is not the row above in the
              document — so a search would have made 위로 move a page somewhere nobody asked for.
            */}
            {pages.map((one) => {
              const index = all.findIndex((each) => each.sid === one.sid);
              return (
              <tr key={one.sid} data-admin-page={one.id}>
                <th scope="row">
                  <TextField
                    value={one.name}
                    onCommit={(value) => run('setPageInfo', { nodeId: one.sid, name: value })}
                    ariaLabel={`${one.name} 이름`}
                  />
                </th>
                <td>
                  {/*
                    **주소는 이름이 정합니다, 한 번** — and there is deliberately no button here.
                    `setPageInfo` takes the Latin address the first time a page is named, while the
                    address is still the minted `/page-3`; after that a page's address is what has
                    been shared and indexed, and moving it is a decision a reader types out.

                    A 제안 chip was written and removed: it drew on every untouched row, including the
                    ones still called 페이지 9, so it offered `/peiji-9` — a control firing in a case
                    that barely exists, adding a second address to read on every row.
                  */}
                  <TextField
                    value={one.path}
                    onCommit={(value) => run('setPageInfo', { nodeId: one.sid, path: value })}
                    ariaLabel={`${one.name} 주소`}
                  />
                </td>
                <td className="st-admin-quiet">{one.template || '—'}</td>
                <td className="st-admin-number">{one.blocks}</td>
                <td className="st-admin-number" title={breakageSaid(one.breaks)}>
                  {one.breaks.total}
                </td>
                <td>
                  {/*
                    **Only the exception is drawn.** Seven of eight pages are indexed, so a chip on
                    every one of them is a blue column that says *normal* seven times and leaves the
                    row that is different to be found by reading. Colour is for *look at this*, which
                    is the token file's own argument — so the ordinary case is a dash.
                  */}
                  {one.noIndex ? <Chip on={false} yes="" no="색인 안 함" /> : <span className="st-admin-quiet">—</span>}
                </td>
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
              );
            })}
          </tbody>
        </table>
        {pages.length === 0 ? <AdminNone said="페이지가 없습니다" found={all.length > 0} /> : null}
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
  const [find, setFind] = useState('');
  const all = datasetsOf(doc as never);
  const datasets = all.filter((one) => has(find, one.name, one.label, columnNames(one.fields).join(' '), one.url));

  return (
    <>
      <AdminHead tab="data" count={all.length}>
        <Button
          onClick={() => run('insertDataset', { name: '새 데이터' })}
          data={{ 'admin-add': 'data' }}
          tone="accent"
        >
          새 데이터
        </Button>
      </AdminHead>

      <AdminFind value={find} onValue={setFind} said="데이터 찾기" />

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
                <td>
                  {/*
                    실시간 changes what the published page *is* — it ships a script, and a reader's
                    browser fetches the rows. That is the exception, so that is what is drawn.
                  */}
                  {one.live ? <Chip on yes="실시간" no="" /> : <span className="st-admin-quiet">—</span>}
                </td>
                <td className="st-admin-row-do">
                  <Button onClick={() => onOpen(one.name)} data={{ 'admin-open': one.name }}>
                    편집
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {datasets.length === 0 ? <AdminNone said="데이터가 없습니다" found={all.length > 0} /> : null}
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
  refs,
  onOpen
}: {
  doc: { rootId: string; getNode: (sid: string) => any };
  refs: Ref[];
  onOpen: (id: string) => void;
}) {
  /**
   * The count is the index's rather than `usesOf`'s, and the index is the screen's — see `Admin`.
   *
   * `usesOf` counts `instance` nodes, and a page drawn through a **template** names its definition in
   * `surface.template` — which is not a placement. So 글 페이지 read *0곳에서 사용 중* while two pages
   * were drawn through it, and a reader about to edit it was told they were changing nothing. The
   * index found it the first time the two were compared.
   */
  const [find, setFind] = useState('');
  const used = refCounts(refs, 'component');
  const all = definitionsOf(doc as never).map((one) => ({
    ...one,
    uses: used.get(one.id) ?? 0,
    /* Whether it is a **template** — a definition with a slot, which is what a page starts from. */
    template: templatesIn(doc as never).some((each) => each.id === one.id)
  }));
  const definitions = all.filter((one) => has(find, one.name, one.id, one.asks.join(' ')));

  return (
    <>
      <AdminHead tab="components" count={all.length} />

      <AdminFind value={find} onValue={setFind} said="컴포넌트 찾기" />

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
                <td>{one.template ? <Chip on yes="틀" no="—" /> : <span className="st-admin-quiet">—</span>}</td>
                <td className="st-admin-row-do">
                  <Button onClick={() => onOpen(one.id)} data={{ 'admin-open': one.id }}>
                    편집
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {definitions.length === 0 ? <AdminNone said="컴포넌트가 없습니다" found={all.length > 0} /> : null}
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
  const exported = editor.exportDocument();
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

  const pages = pagesOf(doc as never).length;

  return (
    <>
      <AdminHead tab="publish" said={publishSaid(state, last)}>
        <Button
          disabled={!can('publishSite')}
          onClick={() => run('publishSite')}
          data={{ 'admin-publish': 'true' }}
          tone="accent"
        >
          지금 발행
        </Button>
      </AdminHead>

      {/**
        * **나갈 것을 한 줄로** — the state card, which this screen did not have.
        *
        * It opened as a white box with two small labels in it — *고칠 것 없음* and *지난 발행* — and
        * a reader had to read both to answer the one question they came with, which is *can I press
        * the button*. The three facts that answer it are the state, what would go out, and what is
        * wrong with it, so they are one row and they are read at a glance.
        */}
      <div className="st-admin-cards">
        <div className="st-admin-card" data-admin-state={state}>
          <span className="st-admin-card-what">지금</span>
          <strong>
            {state === 'never' ? '발행 전' : state === 'current' ? '발행한 것과 같음' : '바뀐 것 있음'}
          </strong>
          <span className="st-admin-card-said">{publishSaid(state, last)}</span>
        </div>
        <div className="st-admin-card">
          <span className="st-admin-card-what">나갈 페이지</span>
          <strong>{pages}</strong>
          <span className="st-admin-card-said">
            {records.length > 0 ? `${records.length}번 발행했습니다` : '아직 한 번도 나가지 않았습니다'}
          </span>
        </div>
        <div className="st-admin-card" data-admin-faults={faults.length > 0 ? 'some' : 'none'}>
          <span className="st-admin-card-what">고칠 것</span>
          <strong>{faults.length}</strong>
          <span className="st-admin-card-said">
            {faults.length > 0 ? '먼저 고치는 것이 좋습니다' : '고칠 것 없음'}
          </span>
        </div>
      </div>

      <div className="st-admin-scroll">
        {/*
          **What is wrong, first** — above the history rather than under it, because the history is
          what already happened and this is what would go out next.
        */}
        {/*
          **The list, only when there is one.** The card above already says *고칠 것 없음*, and a
          section repeating it under a heading is the screen saying the same thing twice in two
          voices — which is what it did: three cards of summary followed by two boxes that summarised
          them again.
        */}
        {faults.length > 0 ? (
          <section className="st-admin-part">
            <h3>고칠 것 {faults.length}개</h3>
            <ul className="st-admin-faults">
              {faults.map((one, index) => (
                <li key={index} data-admin-fault={one.kind}>
                  {one.said}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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
  const [find, setFind] = useState('');
  const all = assetsOf(doc as never).map((one) => ({
    ...one,
    /* Base64 is four characters per three bytes — near enough to say a number a reader can act on. */
    bytes: Math.round((one.data.length * 3) / 4)
  }));
  const assets = all.filter((one) => has(find, one.name, one.label, one.type));
  /* The one number a reader would act on: what all of this weighs in every save and every publish. */
  const weight = all.reduce((sum, one) => sum + one.bytes, 0);

  return (
    <>
      <AdminHead
        tab="files"
        count={all.length}
        said={all.length > 0 ? `모두 ${(weight / 1024).toFixed(0)}KB — 저장할 때마다, 발행할 때마다 함께 나갑니다` : undefined}
      />

      {all.length > 0 ? <AdminFind value={find} onValue={setFind} said="파일 찾기" /> : null}

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
        {all.length > 0 && assets.length === 0 ? <AdminNone said="파일이 없습니다" found /> : null}
      </div>
    </>
  );
}

/**
 * **설정** — 사이트 하나가 무엇인지, 한 화면에.
 *
 * ## Why this tab exists
 *
 * Asked as *서비스 전체 설정하는 화면도 필요해, 도메인이라던가, 서비스(프로덕트) 제목, 설명, 등등
 * B2B 대상으로 할려면 할게 많음. wordpress 같은게 될 수도 있잖아?* — and the measurement agreed
 * before the ask: the document has carried an `address`, an `icon` and a `noIndex` for some time,
 * and the only way to reach any of them was **to select nothing on a page** and find them in the
 * properties panel. A site-level fact reached through a block's inspector is a fact nobody finds.
 *
 * Two of the fields did not exist at all and their absence was invisible in the same way: `lang` was
 * the literal `ko` in the export, so every site this product makes claims to be Korean; and a
 * `description` at the site level meant every page without one of its own published a head with no
 * `<meta name="description">` at all.
 *
 * ## 저장이라는 단추가 없는 이유
 *
 * Every field commits on blur, like every other field in this product — a settings screen with a
 * Save is a screen a reader can leave with unsaved work in it, and this document has undo.
 */
function AdminSettings({
  doc,
  site,
  run
}: {
  doc: { rootId: string; getNode: (sid: string) => any };
  site: { name: string; host: string };
  run: (name: string, payload?: Record<string, unknown>) => void;
}) {
  const attrs = (doc.getNode(doc.rootId)?.attributes ?? {}) as Record<string, unknown>;
  const said = (key: string) => String(attrs[key] ?? '');
  const write = (key: string, value: unknown) => run('setSiteInfo', { [key]: value });

  return (
    <>
      <AdminHead tab="settings" />

      <div className="st-admin-form" data-admin-settings>
        <section className="st-admin-part">
          <h3>사이트</h3>

          <Field
            label="이름"
            said="브라우저 탭과 공유한 링크에 보입니다. 이 화면 왼쪽 위에도 이 이름이 있습니다."
          >
            <TextField value={site.name} onCommit={(one) => write('name', one)} ariaLabel="사이트 이름" />
          </Field>

          <Field
            label="주소"
            said="발행한 사이트가 사는 곳. 이것이 있어야 canonical 링크와 sitemap.xml 이 나가고, 공유한 링크가 제대로 펼쳐집니다."
          >
            <TextField
              value={said('address')}
              onCommit={(one) => write('address', one)}
              ariaLabel="사이트 주소"
              placeholder="https://example.com"
            />
          </Field>

          <Field
            label="설명"
            said="페이지가 자기 설명을 갖지 않았을 때 대신 나갑니다. 검색 결과의 두 줄과, 채팅에 붙인 링크의 두 줄입니다."
          >
            <TextField
              value={said('description')}
              onCommit={(one) => write('description', one)}
              ariaLabel="사이트 설명"
            />
          </Field>

          <Field
            label="언어"
            said="화면 낭독기가 이 사이트를 어느 말로 읽을지 정합니다. 비워 두면 한국어(ko)입니다."
          >
            <TextField
              value={said('lang')}
              onCommit={(one) => write('lang', one)}
              ariaLabel="사이트 언어"
              placeholder="ko"
            />
          </Field>
        </section>

        <section className="st-admin-part">
          <h3>검색</h3>
          <Field
            label="검색 엔진에서 제외"
            said="켜면 robots.txt 가 전부 막고 모든 페이지에 noindex 가 붙습니다. 아직 보여줄 때가 아닌 사이트를 위한 것입니다."
          >
            <label className="st-admin-switch">
              <input
                type="checkbox"
                checked={attrs.noIndex === true}
                aria-label="검색 엔진에서 사이트 전체를 제외"
                data-admin-noindex
                onChange={(event) => write('noIndex', event.target.checked)}
              />
              <span>{attrs.noIndex === true ? '제외합니다' : '찾을 수 있습니다'}</span>
            </label>
          </Field>
        </section>
      </div>
    </>
  );
}

/** One setting: what it is called, what it does, and the control that changes it. */
function Field({ label, said, children }: { label: string; said: string; children: React.ReactNode }) {
  return (
    <div className="st-admin-field">
      <div className="st-admin-field-what">
        <strong>{label}</strong>
        {/*
          **무엇을 하는 것인지 한 줄.** A settings screen without these is a screen a reader guesses
          at, and the guesses are expensive here: `주소` looks optional and three things in the
          published head are missing without it.
        */}
        <span>{said}</span>
      </div>
      <div className="st-admin-field-do">{children}</div>
    </div>
  );
}
