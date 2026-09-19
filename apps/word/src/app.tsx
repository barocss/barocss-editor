import { EditorHeader, ProductMenu, CommandSearch, CommandSearchTrigger } from '@barocss/office-ui';
import { DocumentLibrary, type DocumentLibraryHandle } from './document-library';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { watchAnswers } from '@barocss/editor-core';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { Button, AdaptiveWorkspace, WorkspaceSidePanel, AppChrome, AppMain, AppShell, MenuBar, onApple, useRevision } from '@barocss/office-ui';
import {
  captureBookmarkSession, type BookmarkSession,
  captureCaptionSession, type CaptionSession,
  captureStyleSession, type StyleSession,
  captureTocSession, type TocSession,
  captureFurnitureTarget, type FurnitureTarget,
  authoringKind, canAuthor, captureAuthoring, type WordAuthoringSession,
  createStarterDocument,
  readWordFile,
  wordFileName,
  wordFileText,
  wordMenus,
  wordSearchCommands,
  wordTitle,
  WORD_VIEW_KEYS,
  wordMenuEntry,
  wordMenuId,
  type FontLoader
} from '@barocss/office-word';
import { useFormatPainter, captureTextSelection, clipboardAction, canUseClipboard, useClipboardActions, FileActions, type DocumentFileActions } from '@barocss/office-editor-ui';
import {
  captureWordFormat, type WordFormatSample,
  TocDialog,
  FurnitureDialog,
  CommentsPane,
  DocumentTitle,
  DrawingOverlay,
  BordersDialog,
  PageSetupDialog,
  SpacingDialog,
  ParagraphStyleDialog,
  BookmarkDialog,
  CaptionDialog,
  TableInsertDialog,
  WordAuthoringDialog,
  FindPanel,
  OutlinePane,
  Ribbon,
  Ruler,
  ZoomFrame,
  ZoomControl
} from '@barocss/office-word/ui';
import { matchesKey } from '@barocss/office-controls';
import { InputLab } from './input-lab/panel';

/**
 * The app shell.
 *
 * React owns the chrome — ribbon, dialogs, panels — and the document surface
 * stays with the DOM view, mounted into a div React does not touch after
 * creating it. Word's pagination, layout passes and header editing are wired to
 * that view, and moving the surface into React would mean re-proving all of it
 * for no gain the reader could see.
 */
const applyWordFormat = (editor: Editor, sample: WordFormatSample, selection: import('@barocss/editor-core').ModelSelection) =>
  editor.run('applyCopiedFormat', { sample, selection });
const painterOptions = {
  canApplyCollapsed: (sample: WordFormatSample) => !!sample.includeParagraph,
  description: (sample: WordFormatSample) => sample.includeParagraph
    ? '문단을 클릭하면 문단 서식을 적용합니다. 텍스트를 선택하면 글자 서식도 함께 적용합니다.'
    : '적용할 텍스트를 드래그하세요. 키보드로 선택한 뒤 서식 복사 버튼을 다시 눌러도 됩니다.',
  renderOptions: (sample: WordFormatSample, update: (value: WordFormatSample) => void) =>
    <Button pressed={!!sample.includeParagraph} onClick={() => update({ ...sample, includeParagraph: !sample.includeParagraph })}>
      문단 서식 포함
    </Button>,
};

export function App({ mount }: { mount: (host: HTMLElement, onFurniture?: (id?: string) => void) => { editor: Editor; view: EditorViewDOM; fonts: FontLoader; editFurniture: (id?: string) => void } }) {
  const library = useRef<DocumentLibraryHandle>(null);
  const [compact, setCompact] = useState(false);
  const [activePanel, setActivePanel] = useState<'navigation' | 'inspector' | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  /**
   * 페이지가 스크롤되는 칸 — **조립하는 쪽이 알고 있는 것**.
   *
   * `.w-shell-document` 는 이 파일이 `AppMain` 에 붙이는 이름이다. 자(`Ruler`)가 그것을
   * `document.querySelector` 로 찾고 있었는데, 그러면 그 부품은 이 앱의 마크업을 아는 부품이 되고
   * 다른 호스트에서는 조용히 아무것도 안 듣는다. 이름을 아는 쪽에서 찾아서 건넨다 — 그리고 전역이
   * 아니라 `closest` 로 찾는다: 자기 서브트리에서 위로 올라가는 것은 자기 것이다.
   */
  const [pane, setPane] = useState<HTMLElement | null>(null);
  const [instance, setInstance] = useState<{ editor: Editor; view: EditorViewDOM; fonts: FontLoader; editFurniture: (id?: string) => void } | null>(null);
  const [editingFurniture, setEditingFurniture] = useState<string>();
  const [toc, setToc] = useState<TocSession>();
  const [figures, setFigures] = useState<TocSession>();
  const [caption, setCaption] = useState<CaptionSession>();
  const [styleSession, setStyleSession] = useState<StyleSession>();
  const [bookmarkSession, setBookmarkSession] = useState<{ session: BookmarkSession; mode: 'bookmark' | 'reference' }>();
  const [furniture, setFurniture] = useState<{ target: FurnitureTarget; mode: 'header' | 'footer' | 'number' }>();
  const clipboard = useClipboardActions(instance?.editor ?? null, instance?.view ?? null);
  const painter = useFormatPainter(instance?.editor ?? null, instance?.view ?? null, captureWordFormat, applyWordFormat, painterOptions);

  useEffect(() => {
    if (!host.current || mounted.current) return;
    // Guarded because StrictMode runs effects twice on purpose, and it was
    // right to: without this the editor was built into the same element twice
    // and the document appeared three times over.
    //
    // Not cleaned up on unmount either. The editor owns this subtree for the
    // life of the page, and tearing it down and rebuilding it would throw away
    // the layout, the caret and the history for a re-render the user cannot see.
    mounted.current = true;
    setPane(host.current.closest('.w-shell-document') as HTMLElement | null);
    setInstance(mount(host.current, setEditingFurniture));
  }, [mount]);

  /**
   * Whether the search box is open.
   *
   * The app's, not the editor's: what a reader is looking for is not part of
   * their document. Bound here rather than through the key map because opening
   * a window is the host's business — the editor has no idea one exists.
   */
  /** 테두리 및 음영 — 서식 메뉴가 여는 것. */
  const [bordering, setBordering] = useState(false);
  /** 문단 간격 — 서식 메뉴의 다른 하나. */
  const [spacing, setSpacing] = useState(false);
  /** 페이지 설정 — 문단이 아니라 구역에 쓰는 것. */
  const [paging, setPaging] = useState(false);
  const [finding, setFinding] = useState(false);
  const [commenting, setCommenting] = useState(false);
  /**
   * The outline, which Word calls the navigation pane.
   *
   * Open on request so the initial workspace gives its width to the page.
   */
  const [outlining, setOutlining] = useState(false);
  const togglePanel = useCallback((side: 'navigation' | 'inspector') => {
    if (compact) setActivePanel(current => current === side ? null : side);
    else if (side === 'navigation') setOutlining(shown => !shown);
    else setCommenting(shown => !shown);
  }, [compact]);
  const outlineShown = compact ? activePanel === 'navigation' : outlining;
  const commentsShown = compact ? activePanel === 'inspector' : commenting;

  /** How large the page is drawn. See `office-word/src/zoom.tsx` for why it is a transform. */
  const [zoom, setZoom] = useState(1);
  /**
   * The input lab is opened by asking for it — `?lab` in the address bar.
   *
   * It is a tool for sitting down and typing on purpose while a recording runs,
   * not part of the document, and a reader who came here to write should never
   * meet it. Read once: whether it is open is not something the page changes its
   * mind about.
   */
  const [lab] = useState(() => new URLSearchParams(window.location.search).has('lab'));

  /** What the editor has to say about itself right now — see the `menus` memo. */
  const answers = useRevision(
    (reread) => watchAnswers(instance?.editor ?? null, reread),
    [instance]
  );

  /**
   * The menubar, drawn from `WORD_MENUS` and greyed against the document.
   *
   * An entry a reader can press that then does nothing is worse than one that is not there, and
   * every command in the model already answers `canExecute`. A `view` entry has no command to ask,
   * so it is never disabled: whether the outline is showing is always a question a reader may
   * answer.
   */
  const menus = useMemo(
    () =>
      wordMenus(onApple()).map((menu) => ({
        id: menu.id,
        label: menu.label,
        blocks: menu.blocks.map((block) => ({
          id: block.id,
          items: block.items.map((item, index) => ({
            id: wordMenuId(menu, block, index),
            label: item.label,
            hint: item.hint,
            checked: item.view === 'outline' ? outlineShown : item.view === 'comments' ? commentsShown : undefined,
            disabled: item.view === 'dialog.caption' ? !instance || !captureCaptionSession(instance.editor) : ['dialog.bookmark', 'dialog.reference'].includes(item.view ?? '') ? !instance || !captureBookmarkSession(instance.editor) : item.view === 'dialog.styles' ? !instance || !captureStyleSession(instance.editor) : ['dialog.toc', 'dialog.figures'].includes(item.view ?? '') ? !instance || !captureTocSession(instance.editor) : item.view === 'format-painter'
              ? !instance || (!painter.active && !captureWordFormat(instance.editor))
              : item.view && clipboardAction(item.view)
              ? clipboard.busy || !canUseClipboard(instance?.editor ?? null, clipboardAction(item.view)!)
              : item.view && authoringKind(item.view)
              ? !instance || !canAuthor(instance.editor, authoringKind(item.view)!)
              : item.command
              ? !instance?.editor?.canExecuteCommand?.(item.command, item.payload as never)
              : false
          }))
        }))
      })),
    /*
     * The **selection** as well as the editor. `watchAnswers` is what fires when a caret moves or a
     * command's availability changes, and without it 실행 취소 would read as unavailable for as long
     * as nothing else re-rendered this component — a menu that is stale is a menu a reader stops
     * trusting.
     */
    [instance, answers, outlineShown, commentsShown, clipboard.busy, painter.active]
  );

  /**
   * What a pick does — a command, or a change to how the reader is looking.
   *
   * The `view` branch is the one `switch` the model promises. Printing is here rather than in the
   * document because it is the *browser's*: `print-pages.ts` hooks `beforeprint`, so ⌘P and this
   * entry get the same paginated document, and neither is something the editor knows how to do.
   */
  /**
   * **문서를 파일로 여닫는 세 몸짓** — 이 앱이 오늘까지 못 하던 것.
   *
   * 부팅에 샘플을 싣고 그것이 전부였다. 독자가 쓴 것은 새로고침에 사라졌고, 갖고 있는 파일을
   * 열 방법이 없었다. 하는 일은 `office-editor-ui` 의 것이고 — 블롭, 앵커, 사파리의 revoke,
   * 잃을 작업이 있을 때만 묻기 — 여기서 대는 것은 Word 의 넷뿐이다.
   */
  const [insertingTable, setInsertingTable] = useState(false);
  const [authoring, setAuthoring] = useState<WordAuthoringSession>();
  const [findTarget, setFindTarget] = useState<'find' | 'replace'>('find');
  const files = useRef<DocumentFileActions>(null);
  const fileKind = useMemo(
    () => ({
      session: 'word',
      text: wordFileText,
      read: readWordFile,
      /*
       * `editor.dataStore` 는 접근자로 있으므로 캐스트로 걷어내지 않는다 —
       * `editor-is-typed` 톱니가 그것을 세고, 이 줄이 처음 쓰였을 때 357 을 358 로 만들었다.
       */
      fileName: (editor: Editor) => wordFileName(wordTitle(editor.dataStore as never)),
      starter: createStarterDocument,
      ariaLabel: '문서 파일',
      prefix: 'w'
    }),
    []
  );

  const runEntry = useCallback(
    (entry: { command?: string; view?: string; payload?: Record<string, unknown> }) => {
      if (entry.view?.startsWith('furniture.') && instance) {
        const target = captureFurnitureTarget(instance.editor);
        if (target) setFurniture({ target, mode: entry.view.slice(10) as 'header' | 'footer' | 'number' });
        return;
      }
      if (entry.view === 'format-painter') { painter.activate(); return; }
      const clip = entry.view && clipboardAction(entry.view);
      if (clip) { void clipboard.run(clip); return; }
      const kind = entry.view && authoringKind(entry.view);
      if (kind && instance) { setAuthoring(captureAuthoring(instance.editor, kind)); return; }
      switch (entry.view) {
        case 'file.new':
          return files.current?.create();
        case 'file.open':
          return files.current?.open();
        case 'file.save':
          return files.current?.save();
        case 'print':
          return window.print();
        case 'dialog.bookmark':
        case 'dialog.reference':
          if (instance) {
            const at = captureTextSelection(instance.editor, instance.view, { allowBlurred: true });
            if (at) instance.editor.updateSelection({ selection: at, applySelectionToView: false });
            const session = captureBookmarkSession(instance.editor);
            if (session) setBookmarkSession({ session, mode: entry.view === 'dialog.bookmark' ? 'bookmark' : 'reference' });
          }
          return;
        case 'dialog.styles':
          if (instance) {
            const at = captureTextSelection(instance.editor, instance.view, { allowBlurred: true });
            if (at) instance.editor.updateSelection({ selection: at, applySelectionToView: false });
            setStyleSession(captureStyleSession(instance.editor));
          }
          return;
        case 'dialog.toc':
          return instance && setToc(captureTocSession(instance.editor));
        case 'dialog.caption':
          return instance && setCaption(captureCaptionSession(instance.editor));
        case 'dialog.figures':
          return instance && setFigures(captureTocSession(instance.editor, 'captions'));
        case 'dialog.table':
          return setInsertingTable(true);
        case 'dialog.borders':
          return setBordering(true);
        case 'dialog.spacing':
          return setSpacing(true);
        case 'dialog.page':
          return setPaging(true);
        case 'replace':
          setFindTarget('replace');
          return setFinding(true);
        case 'find':
          setFindTarget('find');
          return setFinding((was) => !was);
        case 'outline':
          return togglePanel('navigation');
        case 'comments':
          return togglePanel('inspector');
        case 'zoom.in':
          return setZoom((was) => Math.min(4, Math.round((was + 0.1) * 10) / 10));
        case 'zoom.out':
          return setZoom((was) => Math.max(0.25, Math.round((was - 0.1) * 10) / 10));
        case 'zoom.reset':
          return setZoom(1);
        default:
          break;
      }

      if (entry.command) void instance?.editor?.executeCommand(entry.command, entry.payload as never);
    },
    [instance, clipboard.run, painter.activate, togglePanel]
  );

  const [commandSearchOpen, setCommandSearchOpen] = useState(false);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [commandError, setCommandError] = useState('');
  const searchTarget = useRef<{ rootId: string; selection: ModelSelection | undefined } | undefined>(undefined);
  const searchEntries = useMemo(() => wordSearchCommands(onApple()), []);
  const searchCommands = searchEntries.map(entry => {
    const menu = menus.flatMap(menu => menu.blocks.flatMap(block => block.items)).find(item => item.id === entry.id);
    const disabled = !instance || (menu ? menu.disabled : !instance.editor.canExecuteCommand(entry.command!, entry.payload as never));
    return { ...entry, disabled, disabledReason: '현재 선택 또는 문서 상태에서는 실행할 수 없습니다.' };
  });
  const openCommandSearch = () => {
    if (!instance) return;
    const rootId = instance.editor.getRootId();
    if (!rootId) return;
    searchTarget.current = { rootId, selection: structuredClone(captureTextSelection(instance.editor, instance.view, { allowBlurred: true }) ?? instance.editor.selection ?? undefined) };
    setCommandError(''); setCommandSearchOpen(true);
  };
  const pickCommand = async (id: string) => {
    const target = searchTarget.current;
    const entry = searchEntries.find(entry => entry.id === id);
    if (!instance || !target || !entry || instance.editor.getRootId() !== target.rootId) { setCommandError('문서가 변경되었습니다. 명령을 다시 선택하세요.'); return; }
    if (target.selection) instance.editor.updateSelection({ selection: target.selection, applySelectionToView: true });
    try {
      if (entry.command) {
        if (!instance.editor.canExecuteCommand(entry.command, entry.payload as never) || !await instance.editor.executeCommand(entry.command, entry.payload as never)) {
          setCommandError('현재 선택에서 명령을 실행할 수 없습니다.'); return;
        }
      } else runEntry(entry);
      setRecentCommands(previous => [id, ...previous.filter(value => value !== id)].slice(0, 5));
    } catch { setCommandError('명령을 실행하지 못했습니다. 다시 시도하세요.'); }
  };

  /** A pick in the menubar, which is `runEntry` with the entry looked up. */
  const onMenu = useCallback(
    (id: string) => {
      const entry = wordMenuEntry(id);
      if (entry) runEntry(entry);
    },
    [runEntry]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      /*
       * The **view** bindings, which are this app's half of what Word binds.
       *
       * The engine's registry runs `WORD_KEYBINDINGS` against a caret and can only run *commands*; a
       * zoom and a find pane are not commands and never will be. Until this loop existed, ⌘F was a
       * hand-written branch right here — `event.key === 'f'`, nothing declared — and ⌘+, ⌘- and ⌘0
       * were printed in 보기 and answered by nothing at all. Measured in a browser, all three.
       *
       * Read from `WORD_VIEW_KEYS`, so the menu's chords and the keyboard's are one statement.
       */
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      const at = document.activeElement as HTMLElement | null;
      // A field's own keys are the field's; the document is `contenteditable` and is not a field.
      if (at?.tagName === 'INPUT' || at?.tagName === 'TEXTAREA' || at?.tagName === 'SELECT' ||
        at?.closest('[role=dialog], [data-editor-input-owner]')) return;
      for (const binding of WORD_VIEW_KEYS) {
        if (!matchesKey(binding, event)) continue;
        event.preventDefault();
        if (instance && binding.view && authoringKind(binding.view)) {
          const selection = captureTextSelection(instance.editor, instance.view);
          if (selection) instance.editor.updateSelection({ selection, applySelectionToView: false });
        }
        return runEntry(binding);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runEntry, instance]);

  /**
   * The window is the frame.
   *
   * The whole page used to scroll, which took the ribbon and the ruler with it —
   * and a ruler the text is not beside is a ruler for nothing. So the shell
   * fills the viewport and does not scroll: the chrome holds its place at the
   * top, the panes hold theirs at the sides, and the one thing that scrolls is
   * the document.
   */
  return (
    <AppShell className="w-shell">
      <CommandSearch open={commandSearchOpen} onOpenChange={setCommandSearchOpen} commands={searchCommands} recentIds={recentCommands} onPick={id => void pickCommand(id)} />
      {commandError && <div role="alert" className="w-command-error">{commandError}<Button tone="quiet" onClick={() => setCommandError('')}>닫기</Button></div>}
      <AppChrome className="w-chrome">
        {instance && <>
          <EditorHeader product="Word" className="w-document-header"
            title={<DocumentTitle editor={instance.editor} compact />}
            menus={<MenuBar className="w-menubar" label="문서 메뉴" menus={menus} onPick={onMenu} />}
            fallbackNavigation={<ProductMenu product="Word" blocks={[{ id: 'library', items: [{ id: 'library', label: '문서 보관함' }, { id: 'actions', label: '문서 작업' }] }]} onPick={id => library.current?.open(id as 'library' | 'actions')} />}
            actions={<><CommandSearchTrigger onClick={openCommandSearch} /><DocumentLibrary ref={library} editor={instance.editor} /></>}
            view={<ZoomControl zoom={zoom} onChange={setZoom} pane={pane} />} />
          <div className="w-file-actions"><FileActions ref={files} editor={instance.editor} kind={fileKind} /></div>
        </>}
        {instance ? (
          <Ribbon
            editor={instance.editor}
            view={instance.view}
            fonts={instance.fonts}
            panes={{
              outline: outlineShown,
              comments: commentsShown,
              onOutline: () => togglePanel('navigation'),
              onComments: () => togglePanel('inspector')
            }}
            zoom={zoom}
            onZoom={setZoom}
            externalZoom
            pane={pane}
            onViewAction={view => runEntry({ view })}
            clipboardBusy={clipboard.busy}
            formatPainterActive={painter.active}
          />
        ) : null}
        {painter.feedback}
        {editingFurniture && <div className="w-furniture-editing" role="status"><span>머리글·바닥글 편집 중</span><Button onClick={() => instance?.editFurniture()}>본문으로 돌아가기</Button></div>}
        {/* Above the page and as wide as it, because every position on it is a
            position in the text below. */}
        {instance ? <Ruler editor={instance.editor} zoom={zoom} pane={pane} /> : null}
      </AppChrome>

      <AdaptiveWorkspace className="w-shell-body" panelLabels={{ navigation: '개요', inspector: '댓글' }}
        activePanel={activePanel} onActivePanelChange={setActivePanel} onCompactChange={setCompact}>
        {instance ? <WorkspaceSidePanel side="navigation" width={compact || outlining ? 240 : 40}><OutlinePane
            editor={instance.editor}
            open={compact || outlining}
            onToggle={() => togglePanel('navigation')}
            /* 어느 요소에 문서가 그려졌는지는 조립하는 쪽이 안다 — `#editor` 는 이 파일의 id 다. */
            host={host.current}
          /></WorkspaceSidePanel> : null}

        <AppMain className="w-shell-document relative" data-workspace-main>
          {clipboard.feedback}
          {instance ? (
            <FindPanel
              editor={instance.editor}
              view={instance.view}
              open={finding}
              initialField={findTarget}
              onClose={() => setFinding(false)}
            />
          ) : null}
          {/*
            테두리 및 음영. 대화상자이므로 문서 위가 아니라 문서 **밖**에 떠야 하고, `Dialog` 가
            포털로 그것을 한다 — 여기 두는 것은 편집기를 아는 자리이기 때문이다.
          */}
          {bookmarkSession && instance && <BookmarkDialog editor={instance.editor} view={instance.view} {...bookmarkSession} onClose={() => setBookmarkSession(undefined)} />}
          {styleSession && instance && <ParagraphStyleDialog editor={instance.editor} session={styleSession} onClose={() => setStyleSession(undefined)} />}
          {toc && instance && <TocDialog editor={instance.editor} session={toc} onClose={() => setToc(undefined)} />}
          {figures && instance && <TocDialog editor={instance.editor} session={figures} captions onClose={() => setFigures(undefined)} />}
          {caption && instance && <CaptionDialog editor={instance.editor} session={caption} onClose={() => setCaption(undefined)} />}
          {furniture && instance && <FurnitureDialog editor={instance.editor} {...furniture} onClose={() => setFurniture(undefined)} onEdit={instance.editFurniture} />}
          {authoring && instance && <WordAuthoringDialog key={`${authoring.kind}-${authoring.rootId}`} editor={instance.editor} session={authoring}
            onClose={kind => { setAuthoring(undefined); if (kind === 'comment') { if (compact) setActivePanel('inspector'); else setCommenting(true); } }} />}
          <TableInsertDialog editor={instance?.editor ?? null} open={insertingTable} onClose={() => setInsertingTable(false)} />
          <BordersDialog
            editor={instance?.editor ?? null}
            open={bordering}
            onClose={() => setBordering(false)}
          />
          <SpacingDialog
            editor={instance?.editor ?? null}
            open={spacing}
            onClose={() => setSpacing(false)}
          />
          <PageSetupDialog
            editor={instance?.editor ?? null}
            open={paging}
            onClose={() => setPaging(false)}
          />
          {/*
            The zoom is on a frame around the page, not on the page itself: a
            scaled element still takes up its unscaled room, so the frame is
            given the drawn size and the page is drawn inside it.
          */}
          <ZoomFrame zoom={zoom}>
            <div ref={host} id="editor" />
          </ZoomFrame>
          {/*
            Pointing at what is on a **drawing**, over the page rather than inside it.
            
            Outside the zoom frame on purpose: it draws in screen pixels, so an outline is a
            hairline at every zoom and a handle will be the same size to grab. Inside the frame it
            would be scaled with the page, which is right for the document and wrong for a control.
          */}
          {instance ? <DrawingOverlay editor={instance.editor} host={host.current} /> : null}
        </AppMain>

        {instance ? (
          <WorkspaceSidePanel side="inspector" width={compact || commenting ? 280 : 40}><CommentsPane
            editor={instance.editor}
            view={instance.view}
            open={compact || commenting}
            onToggle={() => togglePanel('inspector')}
          /></WorkspaceSidePanel>
        ) : null}
        {instance && lab ? <InputLab editor={instance.editor} view={instance.view} /> : null}
      </AdaptiveWorkspace>
    </AppShell>
  );
}
