import { useMemo, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { markState, watchAnswers } from '@barocss/editor-core';
import {
  Icon,
  IconButton,
  ChoiceSelect,
  Dialog,
  DialogButton,
  SegmentedControl,
  TextField,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarToggle,
  onApple,
  useRevision
} from '@barocss/office-ui';
import { chordFor, keyLabel } from '@barocss/office-controls';
import {
  SITE_KEYS,
  addressLinkOf,
  definitionsOf,
  pageLinkOf,
  pagesIn,
  siteControlsIn,
  assetsOf
} from '@barocss/office-site';
import type { PointerMode } from './overlay';

/**
 * What a reader can do to the page, along the top.
 *
 * ## Every control asks the editor whether it can run
 *
 * `canExecute`, on every render, rather than a rule written here about when a section may be
 * inserted. The command already knows — it has to, because a key binding and a menu reach the same
 * command and a rule kept in a toolbar is a rule the keyboard does not follow. So a control that is
 * grey is grey because the command said no.
 *
 * ## Why the widths are a set of toggles and not a picker
 *
 * They are all on at once. That is the product's opening claim — a reader answering "what does this
 * look like on a phone" while they are still deciding what it says — and a picker would quietly make
 * it one-at-a-time again, which is the tool this is meant not to be.
 */
/**
 * **What the picker offers**, and it is short on purpose.
 *
 * Fifteen hundred glyphs behind a search box is a thing a reader scrolls and abandons. Every picker
 * that works is a handful of common ones grouped the way people reach for them; the rest is what a
 * search is for, and a search over a set this size would be furniture.
 *
 * The shortcode is the name the **document** keeps — `:tada:` — and the character is what a reader
 * sees. Both travel, so a search finds the word rather than the glyph and a rename of the set changes
 * every use.
 */
const EMOJI: { label: string; items: { shortcode: string; unicode: string }[] }[] = [
  {
    label: '반응',
    items: [
      { shortcode: ':tada:', unicode: '🎉' },
      { shortcode: ':fire:', unicode: '🔥' },
      { shortcode: ':sparkles:', unicode: '✨' },
      { shortcode: ':rocket:', unicode: '🚀' },
      { shortcode: ':+1:', unicode: '👍' },
      { shortcode: ':clap:', unicode: '👏' },
      { shortcode: ':heart:', unicode: '❤️' },
      { shortcode: ':eyes:', unicode: '👀' }
    ]
  },
  {
    label: '표정',
    items: [
      { shortcode: ':smile:', unicode: '🙂' },
      { shortcode: ':laughing:', unicode: '😄' },
      { shortcode: ':thinking:', unicode: '🤔' },
      { shortcode: ':sweat:', unicode: '😅' },
      { shortcode: ':cry:', unicode: '😢' },
      { shortcode: ':wink:', unicode: '😉' }
    ]
  },
  {
    label: '표시',
    items: [
      { shortcode: ':check:', unicode: '✅' },
      { shortcode: ':x:', unicode: '❌' },
      { shortcode: ':warning:', unicode: '⚠️' },
      { shortcode: ':bulb:', unicode: '💡' },
      { shortcode: ':pin:', unicode: '📌' },
      { shortcode: ':link:', unicode: '🔗' },
      { shortcode: ':star:', unicode: '⭐' },
      { shortcode: ':point_right:', unicode: '👉' }
    ]
  }
];

export function Ribbon({
  editor,
  mode,
  onMode,
  pageId
}: {
  editor: Editor;
  mode: PointerMode;
  onMode: (mode: PointerMode) => void;
  /**
   * **Where an insert lands when nothing is selected** — the page on screen, which only the app
   * knows.
   *
   * The model has no notion of *on screen* and should not grow one, so every surface that inserts is
   * handed it: the rail takes it, the menubar takes it, and the moment this ribbon grew a door onto
   * the same commands it needed one too. Without it every entry in that dialog was greyed on a
   * freshly opened site — a list of things a reader may not have, which is exactly the fault the
   * rail had before it was given the page.
   */
  pageId?: string;
}) {
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);

  /**
   * **The stickers this document has** — which are its picture files, offered in a line.
   *
   * No new node type and no new box to keep them in: a sticker *is* an `inline-image` with an
   * `asset:이름` in it, and the assets box is where a page's files already live. What was missing was
   * somewhere to pick one, which is why this sits in the same dialog as the emoji: from a reader's
   * side they are one errand — *put a small picture here* — and splitting them into two buttons would
   * be the model's shape leaking into the toolbar.
   */
  const stickers = useMemo(() => {
    const store = editor.dataStore;
    const rootId = (editor as never as { getRootId?: () => string }).getRootId?.();
    if (!store || !rootId) return [];
    return assetsOf({ rootId, getNode: (sid: string) => store.getNode(sid) } as never).filter((one) =>
      String(one.type ?? '').startsWith('image/')
    );
    // `revision`: a reader who has just added a file should see it here.
  }, [editor, revision]);
  const [adding, setAdding] = useState(false);
  /** Whether the emoji picker is open — see the text group, and `EMOJI` below. */
  const [picking, setPicking] = useState(false);

  /**
   * Whether to write a chord Apple's way or everyone else's.
   *
   * `userAgentData` where it exists and the old `platform` where it does not, which is the only pair
   * that covers every browser this runs in — the deck's reasoning exactly, and the same two lines,
   * because *which* convention a reader reads is their platform's business and not the product's.
   */
  const apple = useMemo(() => onApple(), []);

  /**
   * The chord for a control, **asked of the key map** and written the way a reader reads it.
   *
   * It was `control.shortcut` straight onto the tooltip, which had two things wrong with it and one
   * was on screen: readers were being shown `Mod+D`. `Mod` is how a chord is *written down* so that
   * one line can mean ⌘ on a Mac and Ctrl elsewhere; it is not a key anybody has.
   *
   * And the other is the fault the menubar had: a chord typed beside a label is a second statement
   * about a binding. `SITE_KEYS` answers first; a control whose chord the *engine* binds — bold,
   * italic, underline — falls back to what the model says, which is the honest half of a product
   * that does not own the engine's key map.
   */
  const chordOf = (control: { command: string; shortcut?: string }) =>
    keyLabel(chordFor(SITE_KEYS, { command: control.command }) ?? control.shortcut, apple);

  /**
   * What the selection has to say about itself, re-read whenever it moves.
   *
   * A pressed button that remembers being pressed lies after an undo, which is the reason both other
   * products re-read this rather than holding it in state — and the reason it is read here at all is
   * that a formatting toggle has three states, not two.
   */
  const summary = useMemo(() => editor.getSelectionSummary(), [editor, revision]);
  /*
   * `canExecuteCommand`, which is the editor's own name for it — asked on every render rather than
   * cached, because a control that remembers being available is wrong the moment something is
   * undone.
   */
  const can = (name: string, payload?: Record<string, unknown>) =>
    (
      editor as never as {
        canExecuteCommand?: (n: string, p?: Record<string, unknown>) => boolean;
      }
    ).canExecuteCommand?.(name, { pageId, ...payload }) ?? false;
  /*
   * The page goes with every run for the reason it goes with every `can`: an insert with nowhere
   * named lands nowhere, and the two have to agree or a control says yes and then does nothing.
   */
  const run = (name: string, payload?: Record<string, unknown>) =>
    (
      editor as never as { executeCommand?: (n: string, p?: Record<string, unknown>) => void }
    ).executeCommand?.(name, { pageId, ...payload });

  // Read so the enabled state is recomputed when the selection or the document moves.
  void revision;

  /**
   * The pages a link can go to — **this document's**, read on every render.
   *
   * Not declared in `toolbar-model.ts` with the control, because a list of pages written anywhere
   * but the document is a list that is wrong as soon as a reader adds one. The control is declared
   * there; its choices are asked here.
   */
  const store = editor.dataStore;
  const rootId = editor.getRootId();
  const pages =
    store && rootId ? pagesIn({ rootId, getNode: (sid: string) => store.getNode(sid) as never }) : [];

  /**
   * Where the selected words already go — as a page, as an address, or not at all.
   *
   * Three answers rather than one, because the group has three controls and each shows a different
   * part of it. It was `pageLinkOf` alone doing two jobs: *which page* and *is there a link*, which
   * agreed for as long as a page link was the only kind this product could write. The day it could
   * write an address, 링크 없음 would have been grey over one — a control that disables itself out of
   * the job it exists for.
   */
  const link = (() => {
    const selection = editor.selection as { startNodeId?: string } | undefined;
    const at = selection?.startNodeId ? store?.getNode(selection.startNodeId) : undefined;
    return { page: pageLinkOf(at as never), address: addressLinkOf(at as never) };
  })();
  const linked = link.page ?? link.address;

  /**
   * What the dialog offers, read from the two declarations that already answer it.
   *
   * Grouped the way the rail groups them — what holds things, what goes in one, and the reader's own
   * definitions — because those are three different decisions and a flat grid of thirty would make
   * a reader read all of them to find the one they meant.
   */
  const offering = useMemo(() => {
    const store = editor.dataStore;
    const rootId = editor.getRootId?.();
    const doc = rootId ? { rootId, getNode: (sid: string) => store?.getNode(sid) } : undefined;
    return [
      { label: '담는 것', items: siteControlsIn('insert').filter((one) => one.puts === 'container') },
      { label: '넣는 것', items: siteControlsIn('insert').filter((one) => one.puts === 'block') },
      {
        label: '컴포넌트',
        items: (doc ? definitionsOf(doc as never) : []).map((one) => ({
          command: 'insertPlacement',
          label: one.name,
          title: `${one.name}을(를) 놓습니다`,
          icon: 'component',
          payload: { componentId: one.id }
        }))
      }
    ].filter((group) => group.items.length > 0);
    // The revision, because a reader who has just made a component expects it in here.
  }, [editor, revision]);

  return (
    <Toolbar className="st-ribbon" label="사이트 도구">
      <ToolbarGroup id="mode">
        {/*
          The pointer's owner, said out loud — and said as **one of these**.

          A reader gets here by double-clicking into text and leaves by pressing Escape, so the
          control is rarely the way it changes; what it is for is naming the mode, so that a reader
          whose gesture went wrong can see why.

          A segmented control and not two toggles, which is what it was. 선택/텍스트 is *one* of them
          and the board toggles beside it are *any* of them, and both were an accent-bordered
          `ToolbarToggle` — so nothing on screen said that turning off 태블릿 is allowed and turning
          off 선택 is not. `SegmentedControl` says it with shape.
        */}
        <SegmentedControl
          id="mode"
          label="포인터 모드"
          value={mode}
          options={[
            { id: 'select' as PointerMode, label: '선택' },
            { id: 'text' as PointerMode, label: '텍스트', shortcut: 'Escape' }
          ]}
          onChange={onMode}
        />

        {/**
          * **A door onto what can be added**, beside the tool a reader is holding.
          *
          * ## Why a fourth doorway is not a fourth list
          *
          * Everything this opens is already reachable: the 추가 rail draws it, the 삽입 menu names
          * it, and the slash menu offers it at the caret. What none of those is, is *here* — where
          * the reader's pointer already is, next to the tool they are using, on a screen where the
          * rail may be showing pages or data or nothing at all.
          *
          * So it reads the **same declaration** the rail reads (`siteControlsIn('insert')`) and the
          * same definitions the components panel reads. Not a list written out again in this file —
          * which is the mistake `toolbar-model.ts` exists to have already made once, when five
          * working inserts had no button because a hard-coded array is not a claim anything can
          * check. One source, four ways in.
          *
          * ## And why the components are in it
          *
          * Because *add something* does not distinguish them. A reader wanting a button on the page
          * does not first decide whether a button is an element or one of their own definitions —
          * that is the editor's filing system showing through, and the two lists sit in different
          * panels only because the rail has one column.
          */}
        <IconButton label="넣을 것 고르기" onClick={() => setAdding(true)}>
          <Icon name="add" />
        </IconButton>
      </ToolbarGroup>

      <ToolbarSeparator />

      {/*
        What a reader does **to what they have selected**, read from the product's own declaration.
        
        It used to be written out here in JSX — which is a declaration nothing can read, and the
        whole reason `toolbar-model.ts` exists: `every-command-can-be-reached` asks the product what
        a reader can run, and a ribbon that answers only to itself is a ribbon that can drift from
        the check that is supposed to hold it.
      */}
      <ToolbarGroup id="arrange">
        {siteControlsIn('arrange').map((control) => (
          <ToolbarToggle
            /**
             * **Keyed by the command and what it says**, not by the command alone.
             *
             * Eight controls run `alignBlocks` and differ only in the `how` they carry, so keying by
             * the command gave React eight children with one key: it drew the first and dropped the
             * other seven, and the toolbar had a 왼쪽 button and nothing else. Found the moment the
             * align controls were declared, by counting them in a browser and getting zero.
             */
            key={`${control.command}:${JSON.stringify(control.payload ?? {})}`}
            id={control.command}
            label={control.title ?? control.label}
            shortcut={chordOf(control)}
            state="off"
            disabled={!can(control.command, control.payload)}
            onActivate={() => run(control.command, control.payload)}
          >
            {/*
              The picture, not the word — and all four already declared one that nothing drew.

              복제 · 삭제 · 컴포넌트로 · 컴포넌트 해제 were plain text on a strip where everything
              else in this suite is an icon with a tooltip, so they read as links rather than as
              buttons and nothing among them was primary. The label is still the accessible name and
              still the tooltip; what changed is what a reader's eye lands on.
            */}
            <Icon name={control.icon ?? 'add'} />
          </ToolbarToggle>
        ))}
      </ToolbarGroup>

      <ToolbarSeparator />

      {/*
        **What a word looks like** — drawn only when there are words selected.

        Measured after the selection sync was fixed: this product registered four formatting commands
        and offered none of them anywhere. The gap was invisible for as long as text could not be
        selected, because every one of them was correctly refusing a collapsed caret.

        Contextual for the reason Word's and the deck's groups are: these mean nothing to a reader who
        has a *block* selected, and a page builder's reader has a block selected most of the time.
        `state` rather than a plain toggle because bold on a partly-bold selection is neither on nor
        off — `mixed` is the third state this control has for exactly that.
      */}
      {siteControlsIn('text').some((control) => can(control.command)) && (
        <>
          <ToolbarGroup id="text">
            {siteControlsIn('text').map((control) => (
              <ToolbarToggle
                key={control.command}
                id={control.command}
                label={control.title ?? control.label}
                shortcut={chordOf(control)}
                state={control.mark ? markState(summary, control.mark) : 'off'}
                /*
                 * The one control here that has to **ask which** before it can run: every other text
                 * gesture is a mark a reader already means by pressing it, and an emoji is a choice
                 * out of a set. So it opens the picker and the picker runs the command.
                 */
                disabled={
                  control.command === 'insertEmoji'
                    ? !can('insertEmoji', { unicode: '🙂' })
                    : !can(control.command)
                }
                onActivate={() =>
                  control.command === 'insertEmoji' ? setPicking(true) : run(control.command)
                }
              >
                <Icon name={control.icon ?? 'bold'} />
              </ToolbarToggle>
            ))}
          </ToolbarGroup>
          <ToolbarSeparator />
        </>
      )}

      {/*
        Where the selected words go — **drawn only when there are words**.

        A picker rather than a button, and one that offers **pages** rather than an address box: a
        page's address is a value a reader edits in the panel, so a link that spelled it would go
        nowhere the first time they did. The link stores the page's id and the address is worked out
        where it is drawn — see `page-link.ts`.

        A 144-pixel dropdown reading 링크 없음 sat here at all times, and it was the last item of the
        chrome audit: what a block links to is a fact about *words*, and a reader who has selected a
        card is not being asked about it. Chasing whether it could ever be enabled is what found the
        selection sync — it could not, in any state.
      */}
      {siteControlsIn('link').some((control) => can(control.command)) && (
      <ToolbarGroup id="link">
        {siteControlsIn('link').map((control) =>
          control.command === 'linkToPage' ? (
            <ChoiceSelect
              key={control.command}
              options={pages.map((one) => ({ id: one.id, label: one.name }))}
              value={link.page ?? null}
              ariaLabel={control.title ?? control.label}
              disabled={!can(control.command)}
              onChange={(id) => run(control.command, { id })}
              testClass="st-link-page"
            />
          ) : control.command === 'linkToAddress' ? (
            /*
              **Committed, not typed through.** `TextField` writes on Enter and on blur, which is the
              rule the whole suite follows for a field that edits the document — a link written per
              keystroke would put `h`, `ht`, `htt` into the history, and the first two are addresses
              the reader never meant.

              The value is the address only: over a *page* link this box is empty, because the page
              is what the picker beside it is showing, and a box that printed `page:홈` would be
              showing a reader the mechanism.
            */
            <TextField
              key={control.command}
              value={link.address ?? ''}
              placeholder="주소"
              ariaLabel={control.title ?? control.label}
              disabled={!can(control.command)}
              onCommit={(href) => run(control.command, { href })}
              testClass="st-link-address"
              className="w-40"
            />
          ) : (
            <ToolbarToggle
              key={control.command}
              id={control.command}
              label={control.title ?? control.label}
              state="off"
              // Only when there is a link to take away — and `removeLink` cannot say so itself,
              // because it is the shared kit's and a page's link is this product's reading of it.
              disabled={!linked}
              onActivate={() => run(control.command)}
            >
              {control.label}
            </ToolbarToggle>
          )
        )}
      </ToolbarGroup>
      )}

      {/*
        The board toggles used to be here, and they are in **보기** now.

        Which boards are on screen is a *view* setting — something a reader changes rarely and needs
        to be able to find — and a toolbar holds what acts on the selection. Three accent-bordered
        toggles beside 선택/텍스트 also put two different questions into one vocabulary: one of these
        against any of these, drawn identically, so nothing said that turning all three boards off is
        allowed while turning both modes off is not.
      */}
      {/*
        Closed by choosing, because choosing is the whole errand: a dialog a reader has to dismiss
        after it has done what they opened it for is a dialog that has asked them twice.
      */}
      {/**
       * **The emoji picker**, which is the surface the node has been waiting for.
       *
       * A short, grouped set rather than the whole of Unicode: fifteen hundred glyphs behind a search
       * box is a thing a reader scrolls and abandons, and every picker that works is a handful of
       * common ones plus a way to find the rest. The way to find the rest is the search here.
       *
       * Each one carries its **shortcode** as well as its character, because that is the point of the
       * node: the document keeps `:tada:`, a search finds the word a reader typed rather than a glyph
       * nobody can type into a search box, and a document that travels between products means the
       * same thing in each.
       *
       * Closed by choosing — a dialog a reader has to dismiss after it has done what they opened it
       * for is a dialog that has asked them twice.
       */}
      <Dialog
        open={picking}
        onOpenChange={setPicking}
        title="이모지와 그림"
        description="커서 자리에 들어갑니다. 문서에 넣은 그림 파일은 맨 위에 있습니다."
        footer={<DialogButton onClick={() => setPicking(false)}>닫기</DialogButton>}
      >
        <div className="st-emoji-sheet">
          {stickers.length > 0 ? (
            <section>
              <h3>이 문서의 그림</h3>
              <div className="st-emoji-grid" data-stickers>
                {stickers.map((one) => (
                  <button
                    key={one.name}
                    type="button"
                    className="st-emoji-item st-sticker-item"
                    data-sticker={one.name}
                    title={one.label ?? one.name}
                    aria-label={one.label ?? one.name}
                    onClick={() => {
                      /*
                       * The **name**, not the bytes: `asset:하트` is the reference every other
                       * picture on a page uses, so a rename moves every sticker and the file is
                       * written once however many times it is used.
                       */
                      run('insertImage', { src: `asset:${one.name}`, alt: one.label ?? one.name });
                      setPicking(false);
                    }}
                  >
                    <img src={one.data} alt="" />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {EMOJI.map((group) => (
            <section key={group.label}>
              <h3>{group.label}</h3>
              <div className="st-emoji-grid">
                {group.items.map((one) => (
                  <button
                    key={one.shortcode}
                    type="button"
                    className="st-emoji-item"
                    data-emoji={one.shortcode}
                    title={one.shortcode}
                    aria-label={one.shortcode.replace(/:/g, '')}
                    onClick={() => {
                      run('insertEmoji', { shortcode: one.shortcode, unicode: one.unicode });
                      setPicking(false);
                    }}
                  >
                    {one.unicode}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title="무엇을 넣을까요"
        description="고른 블록 다음에 들어갑니다. 아무것도 고르지 않았으면 페이지 끝입니다."
        footer={<DialogButton onClick={() => setAdding(false)}>닫기</DialogButton>}
      >
        <div className="st-add-sheet">
          {offering.map((group) => (
            <section key={group.label}>
              <h3>{group.label}</h3>
              <div className="st-add-grid">
                {group.items.map((one) => (
                  <button
                    key={`${one.command}-${one.label}`}
                    type="button"
                    className="st-add-item"
                    data-add={one.command}
                    title={one.title}
                    disabled={!can(one.command, (one as { payload?: Record<string, unknown> }).payload)}
                    onClick={() => {
                      run(one.command, (one as { payload?: Record<string, unknown> }).payload);
                      setAdding(false);
                    }}
                  >
                    <Icon name={one.icon ?? 'add'} />
                    <span>{one.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Dialog>
    </Toolbar>
  );
}
