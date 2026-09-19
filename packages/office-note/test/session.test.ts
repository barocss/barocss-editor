import { describe, it, expect, vi, afterEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { getSiteSchemaDefinition, createSampleSite, createSiteEditor, richTextsOf } from '@barocss/office-site';
import { openNote, openNoteTree, noteTreeOf } from '../src/index';

/**
 * **한 편의 글이 자기 세션을 갖는다** — the half `office-note` was missing, and the fix for a bug
 * that was reported out loud.
 *
 * A body was edited by a second **view** over the host's editor. One editor means one selection, and
 * a selection is applied by every view: the site's boards were told the caret is at a node they do
 * not draw, searched their own DOM for it and gave up — `[EditorViewDOM] selection retry exceeded`,
 * on every click into a body. *난 분명 office-note 를 드래그 했는데 office-site 의 editor 가
 * selection 을 넣는 느낌이야*, which is exactly what was happening.
 */
describe('a note in a session of its own', () => {
  const site = () => {
    const schema = createSchema('site', getSiteSchemaDefinition());
    const store = new DataStore(undefined as never, schema as never);
    const editor: any = createSiteEditor({ editable: true, schema, dataStore: store } as never);
    editor.loadDocument(createSampleSite(), 'site');
    return { editor, store, doc: { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) } };
  };

  it('carries the words across and not the sids', () => {
    /**
     * A sid belongs to the store that minted it. Carrying one over would make two documents claim
     * the same node — and it is what the bug was made of: the host's editor held a selection on a
     * `site:` node while the body was drawn by a view that did not own it.
     */
    const { doc } = site();
    const body = richTextsOf(doc as never).find((one) => one.id === '본문-스택')!;
    const tree = noteTreeOf(doc as never, body.sid) as any;

    expect(tree.stype).toBe('note');
    expect(tree.content.map((one: any) => one.stype)).toEqual(['heading', 'paragraph', 'paragraph']);
    expect(JSON.stringify(tree)).not.toContain('site:');
    /* The words and the marks do cross — they are the shared vocabulary. */
    expect(JSON.stringify(tree)).toContain('좌표를 먼저 만들고 나서');
  });

  it('is a document of its own, with its own root', () => {
    const { doc } = site();
    const body = richTextsOf(doc as never).find((one) => one.id === '본문-스택')!;
    const held = openNote(doc as never, body.sid);

    /* Its own store: the root is a `note`, and nothing in it is one of the site's nodes. */
    const root = held.editor.dataStore.getNode(held.rootId);
    expect(String(root?.stype)).toBe('note');
    expect(held.rootId).not.toBe(body.sid);
    expect(held.editor.dataStore).not.toBe((doc as any).getNode);

    /* And the site's document is untouched by opening one. */
    expect(richTextsOf(doc as never)).toHaveLength(4);
    held.close();
  });

  it('tells the host what changed, on a pause rather than per keystroke', async () => {
    /*
     * A designer watching a card wants it to follow; a subtree replaced on every character is a
     * transaction per character in the host's history. A pause is when the card catches up.
     */
    const { doc } = site();
    const body = richTextsOf(doc as never).find((one) => one.id === '본문-스택')!;

    const said: unknown[][] = [];
    const held = openNote(doc as never, body.sid, { onChange: (blocks) => said.push(blocks), after: 20 });

    /*
     * A caret first, because an insert lands **where the reader is** and a fresh session has nobody
     * anywhere — the same contract the site's rail has with `pageId`. Placed on the first run, which
     * is where a reader's click would put it.
     */
    const store = held.editor.dataStore;
    const root = store.getNode(held.rootId);
    const firstId = root?.content?.[0];
    if (typeof firstId !== 'string') throw new Error('Expected a stored first block');
    const first = store.getNode(firstId);
    const runId = first?.content?.[0];
    if (typeof runId !== 'string') throw new Error('Expected a stored text run');
    const run = store.getNode(runId);
    if (!run?.sid) throw new Error('Missing text run');
    (held.editor as never as { selectionManager: { setSelection: (one: unknown) => void } }).selectionManager.setSelection({
      type: 'range',
      startNodeId: run.sid,
      startOffset: 1,
      endNodeId: run.sid,
      endOffset: 1,
      collapsed: true
    });

    expect(await held.editor.executeCommand('insertBodyText')).toBe(true);
    await new Promise((done) => setTimeout(done, 60));

    expect(said.length).toBeGreaterThan(0);
    const last = said[said.length - 1] as any[];
    expect(last.length).toBeGreaterThan(3);
    expect(JSON.stringify(last)).not.toContain('site:');
    held.close();
  });

  it('stops telling once it is closed', async () => {
    const { doc } = site();
    const body = richTextsOf(doc as never).find((one) => one.id === '본문-스택')!;
    const said: unknown[][] = [];
    const held = openNote(doc as never, body.sid, { onChange: (blocks) => said.push(blocks), after: 20 });
    held.close();

    await held.editor.executeCommand('insertBodyText');
    await new Promise((done) => setTimeout(done, 60));
    expect(said).toEqual([]);
  });
});

describe('closing a note preserves pending changes', () => {
  afterEach(() => { vi.useRealTimers(); });

  const tree = {
    stype: 'note',
    content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '회의' }] }]
  };

  const write = async (held: ReturnType<typeof openNoteTree>, text: string) => {
    const store = held.editor.dataStore;
    const paragraphId = store.getNode(held.rootId)?.content?.[0];
    if (typeof paragraphId !== 'string') throw new Error('Expected a paragraph id');
    const runId = store.getNode(paragraphId)?.content?.[0];
    if (typeof runId !== 'string') throw new Error('Expected a text run id');
    const run = store.getNode(runId);
    if (!run) throw new Error('Expected the text run to exist');
    expect(await held.editor.executeCommand('replaceText', {
      range: {
        type: 'range', startNodeId: run.sid, startOffset: 0,
        endNodeId: run.sid, endOffset: String(run.text).length, collapsed: false
      },
      text
    })).toBe(true);
  };

  it('flushes once without closing, preserves undo, and delivers subsequent typing on close', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const held = openNoteTree(tree, { onChange });
    await write(held, '저장 직전 입력');
    const selection = held.editor.selection;
    held.flush(); held.flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].content[0].text).toBe('저장 직전 입력');
    expect(held.editor.selection).toEqual(selection);
    expect(held.editor.canUndo()).toBe(true);
    await write(held, '저장한 뒤에도 계속 입력');
    held.close();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0][0].content[0].text).toBe('저장한 뒤에도 계속 입력');
    held.flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('delivers the latest edit synchronously on close and can reopen it', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const held = openNoteTree(tree, { onChange });
    await write(held, '회의 초안');
    await write(held, '회의 결정 사항');
    expect(onChange).not.toHaveBeenCalled();

    held.close();

    expect(onChange).toHaveBeenCalledTimes(1);
    const blocks = onChange.mock.calls[0][0];
    expect(blocks[0].content[0].text).toBe('회의 결정 사항');
    const reopened = openNoteTree({ stype: 'note', content: blocks });
    expect(noteTreeOf({ getNode: (sid) => reopened.editor.dataStore.getNode(sid) }, reopened.rootId)?.content)
      .toEqual(blocks);
    reopened.close();
    held.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('saves the current root after a host reload, on both pause and immediate close', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const held = openNoteTree(tree, { onChange, after: 150 });
    const initialRoot = held.rootId;
    await write(held, '이전 문서의 대기 중 변경');
    held.editor.loadDocument({ stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '복원된 본문' }] }] }, held.session);
    expect(held.rootId).toBe(held.editor.getRootId());
    expect(held.rootId).not.toBe(initialRoot);
    await write(held, '복원된 본문에 새 입력');
    await vi.advanceTimersByTimeAsync(150);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].content[0].text).toBe('복원된 본문에 새 입력');
    await write(held, '닫기 직전의 최종 입력');
    held.close();
    expect(onChange).toHaveBeenCalledTimes(2);
    const blocks = onChange.mock.calls[1][0];
    expect(blocks[0].content[0].text).toBe('닫기 직전의 최종 입력');
    const reopened = openNoteTree({ stype: 'note', content: blocks });
    expect(noteTreeOf(reopened.editor.dataStore, reopened.rootId)?.content).toEqual(blocks);
    reopened.close();
    await vi.advanceTimersByTimeAsync(500);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not resend an edit already delivered on a pause', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const held = openNoteTree(tree, { onChange });
    await write(held, '전달된 회의록');
    await vi.advanceTimersByTimeAsync(350);
    expect(onChange).toHaveBeenCalledTimes(1);
    held.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not notify for an untouched note', () => {
    const onChange = vi.fn();
    const held = openNoteTree(tree, { onChange });
    held.close();
    held.close();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cleans up once even when the host closes again and throws during delivery', async () => {
    vi.useFakeTimers();
    const problem = new Error('host refused the change');
    const onChange = vi.fn(() => {
      held.close();
      throw problem;
    });
    const held = openNoteTree(tree, { onChange });
    const destroy = vi.spyOn(held.editor, 'destroy');
    await write(held, '마지막 변경');
    expect(() => held.close()).toThrow(problem);
    expect(destroy).toHaveBeenCalledTimes(1);
    held.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

/**
 * **sid 는 인스턴스마다 달라야 한다.**
 *
 * A sid is `${session}:${n}`, and the session used to be the word `note` for every body on the page.
 * Twelve notes therefore all minted `note:1`, `note:2` — and only a **static** counter inside
 * `DataStore` kept them apart, which works within one page and not between two: a body saved from one
 * page load and a body saved from another both start near `note:1`, so a host holding both has two
 * different nodes under one name.
 *
 * Reported as *sid 가 가장 큰 문제인데, instance 별로 달라야해 … instanceId:xxxx 형태로 되어야 할 수
 * 있음*, and measured on `apps/note`: twelve sessions, and **seven of them shared a root id**,
 * because that one was `doc-${Date.now()}` and they were made in the same millisecond.
 */
describe('노트마다 자기 이름을 갖는다', () => {
  const tree = { stype: 'note', content: [{ stype: 'paragraph', content: [{ stype: 'inline-text', text: '글' }] }] };

  it('mints a name no other session uses, and every sid carries it', async () => {
    const a = openNoteTree(tree);
    const b = openNoteTree(tree);

    expect(a.session).not.toBe(b.session);
    expect(a.session.startsWith('note-')).toBe(true);

    /**
     * The body's own nodes, walked from its root — not every key in the store.
     *
     * The store also holds one **orphan**: `Editor`'s constructor writes an empty document into the
     * store it is handed, before `loadDocument` replaces the root, and that first node stays. One
     * per session, unreachable, and it now carries the store's minted name rather than the clock —
     * which is the collision fix arriving where it was not aimed. Recorded in `BACKLOG.md`.
     */
    const bodyOf = (one: typeof a) => {
      const store = one.editor.dataStore;
      const out: string[] = [];
      const walk = (sid: string) => {
        out.push(sid);
        for (const kid of ((store.getNode(sid)?.content ?? []) as string[])) walk(kid);
      };
      walk(one.rootId);
      return out;
    };

    /* Every sid of a body, including its root — which was the clock and is now the session. */
    for (const sid of bodyOf(a)) expect(sid.startsWith(`${a.session}:`)).toBe(true);

    /* And no id is in both, which is the whole claim. */
    const shared = bodyOf(a).filter((one) => bodyOf(b).includes(one));
    expect(shared).toEqual([]);
    /* Including the root, which was `doc-${Date.now()}` and gave seven sessions one name. */
    expect(a.rootId).not.toBe(b.rootId);

    a.close();
    b.close();
  });

  it('takes a name from the host, because a durable one beats a minted one', async () => {
    /*
     * A host with its own name for this body — a post's id, a row's key — should give it: then the
     * sids are the same every time the body is opened, which is what lets a comment, a bookmark or a
     * diff point into one. Minting is the fallback, not the intent.
     */
    const one = openNoteTree(tree, { session: 'post-42' });
    expect(one.session).toBe('post-42');
    expect(one.rootId).toBe('post-42:1');

    /* Re-opened under the same name, the same body gets the same sids. */
    const again = openNoteTree(tree, { session: 'post-42' });
    expect(again.rootId).toBe(one.rootId);

    one.close();
    again.close();
  });

  it('keeps twenty apart, which is the case a pair cannot show', async () => {
    const many = Array.from({ length: 20 }, () => openNoteTree(tree));

    /* Twenty names, and twenty roots — the second was the live collision. */
    expect(new Set(many.map((one) => one.session)).size).toBe(20);
    expect(new Set(many.map((one) => one.rootId)).size).toBe(20);

    const seen = new Map<string, number>();
    for (const one of many) {
      const store = one.editor.dataStore;
      const walk = (sid: string) => {
        seen.set(sid, (seen.get(sid) ?? 0) + 1);
        for (const kid of ((store.getNode(sid)?.content ?? []) as string[])) walk(kid);
      };
      walk(one.rootId);
    }
    expect([...seen.values()].filter((count) => count > 1)).toEqual([]);
    for (const one of many) one.close();
  });
});
