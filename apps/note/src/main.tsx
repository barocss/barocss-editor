import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { openNoteTree, type NoteSession } from '@barocss/office-note';
import { NoteEditor } from '@barocss/office-note/view';
import './style.css';

/**
 * **`office-note`, without a site builder** — which is the whole point of the app.
 *
 * ## Why this exists
 *
 * A package is only independent if something independent uses it. `office-note` was carved out of
 * the site builder, and every claim made about it — its own schema, its own kit, its own toolbar,
 * its own chrome, its own session — was true *inside* the thing it came from, which is the one place
 * the claims are hardest to check. Four borrowed parts had been working for the wrong reason
 * (`insertHeading` was `office-site`'s, the `/` menu was the host's surface, the `note` node had no
 * renderer, 번호 목록 did not exist) and each was found by taking one thing away.
 *
 * So: an app that imports the package and **nothing else of the products**. Three stylesheets,
 * `registerNoteRenderers()`, and `openNote`. If a body needs something this app has to supply, that
 * is a gap in the package.
 *
 * ## And several at once, which is the case a drawer could not show
 *
 * A row already draws two — 요약 and 본문 — but both inside one host. Here they are mounted side by
 * side, empty and full, so the questions a second mount raises can be asked: does a caret in one
 * move the other's toolbar, does undo cross, does a `/` menu open over the right one.
 */
/*
 * **Nothing registered globally.** A note builds its renderers into a registry of its own the first
 * time one is mounted (`noteRegistry`), and hands it to every view. This app used to call
 * `registerNoteStandalone()` here, which wrote 30 renderers into the global registry — fine for an
 * app that holds one product, and exactly what stopped two products sharing a screen.
 */

/** How many characters a reader actually wrote, which is what a count of them should say. */
const lettersIn = (blocks: unknown[]): number => {
  let many = 0;
  const dig = (one: unknown) => {
    const node = one as { text?: unknown; content?: unknown[] };
    if (typeof node?.text === 'string') many += node.text.length;
    for (const child of node?.content ?? []) dig(child);
  };
  for (const one of blocks) dig(one);
  return many;
};

/** A body as a tree, which is what a host hands in — the same shape a site keeps in `resources`. */
const body = (blocks: unknown[]) => ({ stype: 'note', content: blocks });
const p = (text: string) => ({ stype: 'paragraph', content: [{ stype: 'inline-text', text }] });
const h = (level: number, text: string) => ({
  stype: 'heading',
  attributes: { level },
  content: [{ stype: 'inline-text', text }]
});

const CASES: { id: string; title: string; why: string; doc: unknown }[] = [
  {
    id: 'empty',
    title: '빈 글',
    why: '아무것도 없는 본문. 커서가 없어도 바가 블록을 내주는지 — 노트에는 페이지가 없으니 커서 없는 자리는 “끝”입니다.',
    doc: body([p('')])
  },
  {
    id: 'post',
    title: '글 한 편',
    why: '제목과 문단 몇. 제목이 제목처럼 보이는지, 문단 사이에 숨 쉴 자리가 있는지 — 본문은 사이트 env 없이 그려지므로 이 타이포는 패키지 자신의 것입니다.',
    doc: body([
      h(2, '좌표를 먼저 만들고 나서'),
      p('자유 배치가 페이지에 필요하다고 믿었고, 세 폭에 같은 카드를 세 번 놓아본 뒤에 그게 약속이라는 것을 알았습니다.'),
      p('쌓임은 브라우저가 이미 아는 문법이고, 좌표는 우리가 폭마다 다시 말해야 하는 것입니다.')
    ])
  },
  {
    id: 'long',
    title: '긴 글',
    why: '스무 문단. 본문이 자기 안에서 스크롤되는지 — 뷰는 자기 컨테이너에 `overflow: clip`을 박으므로 스크롤은 그 위에 있어야 합니다.',
    doc: body([h(2, '스무 문단'), ...Array.from({ length: 20 }, (_, at) => p(`${at + 1}번째 문단입니다. 여기서 스크롤이 걸려야 합니다.`))])
  }
];

/** One mounted body, with what it writes home printed under it. */
function Case({
  id,
  title,
  why,
  doc,
  small
}: {
  id: string;
  title: string;
  why: string;
  doc: unknown;
  /** One of many, drawn without the heading and the sentence a single case gets. */
  small?: boolean;
}) {
  const [held, setHeld] = useState<NoteSession | undefined>(undefined);
  const [said, setSaid] = useState('아직 바뀐 것 없음');

  useEffect(() => {
    /**
     * **A tree, not a store** — and the difference is what this app found on its first run.
     *
     * `openNote` reads a body out of a host's *store*, because a site keeps one as nodes in its own
     * document and walks them by sid. A host without one — a CMS with rows in a database, or this,
     * with a literal — has the tree already. Handing a tree to the store door drew an **empty
     * body**, silently: every child was filtered out as *not a string*.
     */
    const one = openNoteTree(doc, {
      /*
       * **The words, not the JSON.** It printed `JSON.stringify(blocks).length` — every stype,
       * attribute and bracket counted as a character, so three paragraphs read as 2,636자. A number
       * a reader cannot check against what they see is worse than no number.
       */
      onChange: (blocks) => setSaid(`${blocks.length}개 블록 · ${lettersIn(blocks)}자`),
      after: 250
    });
    setHeld(one);
    /*
     * The session, reachable from a test. `apps/note` exists to press this package from outside, and
     * some of what has to be checked — *does the caret's cell resolve* — is a question about the
     * model that no amount of clicking answers from the DOM.
     */
    ((window as never as Record<string, unknown>).__notes ??= {} as Record<string, unknown>);
    ((window as never as { __notes: Record<string, unknown> }).__notes)[id] = one;
    return () => {
      one.close();
      setHeld(undefined);
    };
  }, [doc]);

  return (
    <section className="an-case" data-case={id} data-small={small ? '' : undefined}>
      {small ? null : (
        <>
          <h2>{title}</h2>
          <p>{why}</p>
        </>
      )}
      {held ? <NoteEditor editor={held.editor} rootId={held.rootId} /> : null}
      <div className="an-out" data-out={id}>
        {said}
      </div>
    </section>
  );
}

/**
 * **여럿** — mount, unmount and remount, with the count under a reader's control.
 *
 * The body is short on purpose: what is being measured is the *session*, not the prose, and twelve
 * long notes would measure the renderer instead.
 */
function Many() {
  /**
   * **Starts empty**, which is a decision about the other checks rather than about this one.
   *
   * It opened with three, so every check on this page mounted **six** bodies — and the ones that
   * press keys started failing at random: a click that used to land in 300ms did not, and each run
   * failed a different check. A stress case that runs during every other case is a stress case that
   * measures the others.
   */
  const [many, setMany] = useState(0);
  const [round, setRound] = useState(0);

  const notes = useMemo(
    () =>
      Array.from({ length: many }, (_, at) => ({
        id: `many-${round}-${at}`,
        doc: body([h(3, `${at + 1}번째 글`), p(`${at + 1}번 노트의 본문입니다.`)])
      })),
    [many, round]
  );

  return (
    <section className="an-case" data-case="many">
      <h2>여럿을 한꺼번에</h2>
      <p>
        하나씩 늘리고 줄이면서 봅니다 — 다 그려지는지, 커서가 자기 글에만 들어가는지, 지운 뒤에 남는
        것이 없는지. 세션 하나가 스토어·스키마·에디터·뷰를 하나씩 만들므로, 닫을 때 빠뜨린 것은 둘에서는
        안 보이고 마흔에서 보입니다.
      </p>

      <div className="an-many-do">
        <button type="button" onClick={() => setMany((was) => Math.max(0, was - 1))} data-many="less">
          하나 줄이기
        </button>
        <button type="button" onClick={() => setMany((was) => Math.min(40, was + 1))} data-many="more">
          하나 늘리기
        </button>
        <button type="button" onClick={() => setMany(12)} data-many="twelve">
          열둘
        </button>
        {/* Remounting every one of them, which is what a reader closing and reopening a list does. */}
        <button type="button" onClick={() => setRound((was) => was + 1)} data-many="again">
          모두 새로
        </button>
        <span data-many-count>{many}개</span>
      </div>

      <div className="an-many">
        {many === 0 ? <p className="an-many-none">아직 없습니다. 늘려 보세요.</p> : null}
        {notes.map((one) => (
          <Case key={one.id} id={one.id} title={one.id} why="" doc={one.doc} small />
        ))}
      </div>
    </section>
  );
}

function App() {
  return (
    <div className="an-shell">
      <h1 className="an-head">Barocss Note</h1>
      <p className="an-why">
        `office-note` 하나만 씁니다 — 사이트 빌더도, 캔버스도, 리본도 없습니다. 여기서 되는 것은
        패키지가 하는 것이고, 여기서 안 되는 것은 패키지에 없는 것입니다.
      </p>

      {CASES.slice(0, 1).map((one) => (
        <Case key={one.id} {...one} />
      ))}

      {/**
        * **여럿을 한꺼번에 만들고, 지우고, 또 만든다.**
        *
        * Two side by side answers *do the sessions stay apart*. It does not answer what happens when
        * a host makes twelve of them and then takes six away — which is what a CMS does with a list
        * of posts, and what a site's drawer does every time a reader opens another row.
        *
        * Each session builds a `DataStore`, a schema, an `Editor` and an `EditorViewDOM`, and hangs
        * a listener on the editor. If `close()` misses any of it the cost is invisible at two and
        * obvious at forty, which is exactly the shape of fault that ships.
        */}
      <Many />

      <section className="an-case" data-case="pair">
        <h2>둘을 나란히</h2>
        <p>
          한쪽에 커서를 넣고 다른 쪽 바를 봅니다. 세션이 갈라져 있으면 서로의 상태를 건드리지 않고,
          되돌리기도 각자입니다 — 한 에디터를 둘이 나눠 쓰던 시절에는 둘 다 아니었습니다.
        </p>
        <div className="an-pair">
          {CASES.slice(1).map((one) => (
            <Case key={one.id} {...one} />
          ))}
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
