import { captureBookmarkSession } from './bookmark-commands';
import { captureCaptionSession } from './caption-commands';
import { captureStyleSession, paragraphStylesOf } from './paragraph-styles';
import { captureTocSession } from './structure-commands';
import { selectedWordObject } from './object-layout';
import { WordObjectLayoutControls } from './object-layout-controls';
import { ControlRows } from '@barocss/office-editor-ui';
import { useEffect, useId, useMemo, useState } from 'react';
import { WordMathEditor } from './math-editor-dialog';
import { useWordMathInplace } from './math-inplace';
import type { Editor } from '@barocss/editor-core';
import {
  cellOf,
  tableOf,
  tableStylesOf,
  getWordStyles
} from '@barocss/office-text';
import {
  choiceOptions,
  currentChoice,
  inheritedChoice,
  listState,
  currentStyle,
  cellAttributeState,
  tableLookState,
  WORD_STYLES,
  WORD_TOOLBAR,
  WORD_TEXT_COLOR,
  WORD_TEXT_HIGHLIGHT,
  WORD_CELL_SHADING,
  currentPaletteColor
} from './toolbar-model';
import { listKindOf } from './list-commands';
import { WORD_FONTS, WORD_FONT_SIZES } from '@barocss/office-controls';
import type { FontLoader } from './font-loader';
/**
 * The control shapes come from the shared layer, not from this product.
 *
 * They were declared in `office-word` — which is how the deck's ribbon ended up
 * importing its own font box's type from Word. What a choice control and a
 * palette *are* is nobody's product; what this file declares with them is Word's.
 */
import type { ChoiceControl, PaletteControl } from '@barocss/office-controls';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import {
  RibbonTabs, RibbonGroup, RibbonAction, RibbonToggle,
  ChoiceSelect,
  ColorPalette,
  Icon,
  RibbonToolbar,
  ToolbarGroup,
  ToolbarToggle
} from '@barocss/office-ui';
import { useEditorRevision, CLIPBOARD_ACTIONS, canUseClipboard, type ClipboardAction } from '@barocss/office-editor-ui';
import { ZoomControl } from './zoom';
import { WORD_AUTHORING_ACTIONS, canAuthor, type WordAuthoringKind } from './authoring-actions';
import { currentSpacing } from './spacing-commands';
import { LINE_PRESETS, LINE_UNIT, NO_SPACING } from './spacing-model';
import { captureWordFormat } from './format-painter';
import { isWordTracking } from './word-commands';

/**
 * Word's ribbon.
 *
 * It draws the toolbar model the product ships and holds nothing else. State it
 * held would be state that could disagree with the document — a bold button that
 * remembers being pressed is a button that lies after an undo — so the summary
 * is re-read whenever the selection or the content changes, which are the only
 * two things that can change the answer.
 */
/**
 * Which chrome is showing.
 *
 * The app's, not the editor's — the same reason the find box is: opening a
 * window is the host's business and the editor has no idea one exists. So these
 * come in as state and go out as calls, rather than through `WORD_TOOLBAR`,
 * which names commands the *document* has.
 */
export interface RibbonPanes {
  outline: boolean;
  comments: boolean;
  onOutline: () => void;
  onComments: () => void;
}

/** 리본에게 필요한 것 — 문서, 그것을 그리는 뷰, 글꼴을 싣는 것, 그리고 열려 있는 칸들. */
export interface RibbonProps {
  clipboardBusy?: boolean;
  formatPainterActive?: boolean;
  editor: Editor;
  view: EditorViewDOM;
  fonts: FontLoader;
  panes: RibbonPanes;
  zoom: number;
  onZoom: (zoom: number) => void;
  /** The host already renders the zoom control in its persistent header. */
  externalZoom?: boolean;
  /** 페이지가 담긴 칸 — 배율 위젯이 휠을 듣고 너비를 재는 곳. 호스트가 안다. */
  pane?: HTMLElement | null;
  /** Host-owned dialogs and document navigation. */
  onViewAction?: (view: string) => void;
}

export function Ribbon({ editor, view, fonts, panes, zoom, onZoom, externalZoom = false, pane = null, onViewAction, clipboardBusy, formatPainterActive }: RibbonProps) {
  const [expanded, setExpanded] = useState(false);
  const mathInplace = useWordMathInplace(editor, view);
  const [section, setSection] = useState<'home' | 'insert' | 'layout' | 'references' | 'review' | 'view' | 'object'>('home');
  const panelId = useId();
  /**
   * A count of the events that can change any answer here, not the answers
   * themselves.
   *
   * Holding the summary in state looked equivalent and was not. With no
   * selection `getSelectionSummary()` returns a shared constant, so setting it
   * twice in a row hands React the same object and React skips the render — and
   * whether a button can run is read during that render from `editor.canRun`,
   * which is not React's state and had changed. Accepting every tracked change
   * left Accept lit with nothing to accept, and it was never only that button:
   * anything whose availability turns on the document rather than the selection
   * was stale until something else forced a render.
   *
   * The subscription is the suite's now (`useEditorRevision`), which is how this
   * ribbon gained the third event it was missing: a *cleared* selection is
   * announced on `selection.change` alone, and deleting a table clears it. Slides
   * had learnt that and written it down; this file had not.
   */
  const tick = useEditorRevision(editor);
  const objectTarget = selectedWordObject(editor);
  useEffect(() => {
    if (objectTarget) setSection('object');
    else setSection(current => current === 'object' ? 'home' : current);
  }, [objectTarget?.rootId, objectTarget?.nodeId]);

  const summary = useMemo(() => editor.getSelectionSummary(), [editor, tick]);

  const documentStyles = paragraphStylesOf(editor);
  const customStyles = documentStyles.filter(entry => !['Body', ...Array.from({ length: 6 }, (_, i) => `Heading${i + 1}`)].includes(entry.id));
  const selectedStyleId = summary.blockAttributes.styleId;
  const style = summary.mixedAttributes.includes('styleId') ? null : customStyles.some(entry => entry.id === selectedStyleId) ? String(selectedStyleId) : currentStyle(summary);

  /**
   * What the selection's font or size resolves to through the style cascade.
   *
   * Read from the view's current environment rather than one captured earlier:
   * the layout pass rebuilds the environment on every round, so a resolver held
   * across renders would answer with styles the document has moved on from.
   */
  const docOf = () => {
    const store: any = (editor as any).dataStore;
    return { getNode: (id: string) => store?.getNode?.(id), rootId: (editor as any).getRootId?.() };
  };

  /** The block the caret is in, which is what carries a style and a list. */
  const blockAtCaret = () => {
    const selection = editor.selection;
    if (!selection) return undefined;
    const doc = docOf();
    let node = doc.getNode(selection.startNodeId);
    for (let depth = 0; node && depth < 64; depth++) {
      if (node.stype && typeof node.text !== 'string' && node.stype !== 'inline-text') break;
      node = node.parentId ? doc.getNode(node.parentId) : undefined;
    }
    return node;
  };

  const inherited = (model: ChoiceControl) =>
    inheritedChoice(model, getWordStyles(view.getEnv()), blockAtCaret());

  /**
   * The kind of list the selection is in.
   *
   * Resolved from the document rather than read from the selection: a paragraph
   * carries the name of a numbering definition, and what that name means is the
   * definition's answer.
   */
  const currentListKind = () => listKindOf(docOf(), blockAtCaret());

  /**
   * The table the caret is in, and the styles the document offers for it.
   *
   * Word puts these on a tab that appears only in a table; here the controls
   * appear only there, for the same reason — a table style gallery with no table
   * to apply it to is a row of buttons that cannot do anything.
   */
  const tableAtCaret = () => tableOf(docOf(), blockAtCaret());
  const table = useMemo(() => tableAtCaret(), [editor, tick]);
  const cell = useMemo(() => cellOf(docOf(), blockAtCaret()), [editor, tick]);
  const spacing = useMemo(() => currentSpacing(editor), [editor, tick]);
  const lineSpacing = spacing.rule === 'auto' && spacing.line !== null ? spacing.line / LINE_UNIT : null;
  const lineOptions = LINE_PRESETS.map(preset => ({ id: String(preset.lines), label: preset.label }));
  if (lineSpacing !== null && !LINE_PRESETS.some(preset => preset.lines === lineSpacing)) {
    lineOptions.push({ id: String(lineSpacing), label: `${lineSpacing}줄` });
  }
  const tableStyles = useMemo(() => (table ? tableStylesOf(docOf()) : []), [editor, tick, table]);

  /**
   * A font or size control: the same control with different options, so it is
   * built from the model rather than written twice.
   */
  /**
   * A colour control, from the model that says which command it runs.
   *
   * The current colour comes from two different places and the model says which:
   * a mark for text, an attribute for a cell. Neither is something the palette
   * component knows about — it draws swatches and reports one back.
   */
  const palette = (model: PaletteControl) => (
    <ColorPalette
      key={model.id}
      id={model.id}
      label={model.label}
      icon={<Icon name={model.icon} />}
      value={currentPaletteColor(model, summary, cell)}
      swatches={model.swatches}
      // `canRun` with a real colour in it: `setFontColor` refuses a payload
      // with no colour, so asking with an empty one would report every colour
      // control as permanently unavailable — the same trap the picture button
      // fell into in the deck.
      disabled={!editor.canRun(model.command, { [model.key]: model.swatches[0].value })}
      clearLabel={model.clearCommand || model.cellAttribute ? '없음' : undefined}
      onPick={(value) => void editor.run(model.command, { [model.key]: value })}
      onClear={() =>
        void editor.run(model.clearCommand ?? model.command, model.clearCommand ? undefined : {})
      }
    />
  );

  const choice = (model: ChoiceControl, width: string) => (
    <ChoiceSelect
      key={model.id}
      testClass={`w-toolbar-${model.id}`}
      ariaLabel={model.label}
      className={width}
      // The current value is among them even when it is not a preset: a
      // paragraph set in 13pt used to leave this box blank, which reads as "the
      // selection disagrees with itself" when it agrees perfectly.
      options={choiceOptions(model, currentChoice(model, summary, () => inherited(model)))}
      value={currentChoice(model, summary, () => inherited(model))}
      disabled={
        summary.empty || !editor.canRun(model.command, { [model.key]: model.options[0].value })
      }
      onChange={(id) => {
        const chosen = model.options.find((option) => String(option.value) === id);
        if (!chosen) return;
        // Fetched before it is applied, not after. Applying first would lay the
        // document out in a fallback and break its pages against the wrong
        // widths, and the correction would arrive as a visible reflow.
        void fonts
          .ensure(typeof chosen.value === 'string' ? chosen.value : undefined)
          .then(() => editor.run(model.command, { [model.key]: chosen.value }));
      }}
    />
  );

  const controls = (id: string, labeled = false, only?: string[]) => {
    const group = WORD_TOOLBAR.find(group => group.id === id)!;
    return <ToolbarGroup id={id}>
      <ControlRows editor={editor} controls={group.controls.filter(control => (!only || (control.id !== undefined && only.includes(control.id))) && (id !== 'review' || control.id !== 'math-linear'))} options={{
        can: control => editor.canRun(control.command, control.payload),
        onRun: control => void editor.run(control.command, control.payload),
        state: control => control.id === 'track-changes' ? (isWordTracking(editor) ? 'on' : 'off') : control.listKind ? listState(control.listKind, summary, currentListKind) :
          control.lookFlag ? tableLookState(control.lookFlag, table) :
          control.cellAttribute ? cellAttributeState(control.cellAttribute, cell) :
          (control.state?.(summary) ?? 'off')
      }}>
        {rows => rows.map(one => labeled ?
          <RibbonAction key={one.key} id={one.key} label={CAPTIONS[one.key] ?? one.label}
            icon={<Icon name={one.control.icon ?? 'more'} />} state={one.state} disabled={one.disabled}
            shortcut={one.shortcut} onActivate={one.run} /> :
          <ToolbarToggle key={one.key} id={one.key} label={one.says} shortcut={one.shortcut}
            state={one.state} disabled={one.disabled} onActivate={one.run}>
            {one.control.icon ? <Icon name={one.control.icon} /> : one.label}
          </ToolbarToggle>)}
      </ControlRows>
    </ToolbarGroup>;
  };
  const viewAction = (id: string, label: string, icon: string) => <RibbonAction id={id}
    label={label} icon={<Icon name={icon} />} disabled={!onViewAction || (id === 'dialog.caption' && !captureCaptionSession(editor)) || (['dialog.toc', 'dialog.figures'].includes(id) && !captureTocSession(editor)) || (['dialog.bookmark', 'dialog.reference'].includes(id) && !captureBookmarkSession(editor))}
    onActivate={() => onViewAction?.(id)} />;
  const authoring = (kind: WordAuthoringKind) => {
    const action = WORD_AUTHORING_ACTIONS[kind];
    return <RibbonAction id={`authoring.${kind}`} label={action.label} icon={<Icon name={action.icon} />}
      disabled={!onViewAction || !canAuthor(editor, kind)} onActivate={() => onViewAction?.(`authoring.${kind}`)} />;
  };
  const command = (id: string, label: string, icon: string, payload?: Record<string, unknown>) =>
    <RibbonAction id={id} label={label} icon={<Icon name={icon} />}
      disabled={!editor.canRun(id, payload)} onActivate={() => void editor.run(id, payload)} />;
  const launch = (view: string) => onViewAction ? () => onViewAction(view) : undefined;

  const stylePicker = (<ChoiceSelect testClass="w-toolbar-style" ariaLabel="Paragraph style" options={[...WORD_STYLES.map(entry => ({ ...entry, label: documentStyles.find(style => style.id === (entry.level ? `Heading${entry.level}` : 'Body'))?.name ?? entry.label })), ...customStyles.map(entry => ({ id: entry.id, label: entry.name, disabled: !editor.canRun('applyParagraphStyle', { id: entry.id }) }))]}
                value={style} disabled={summary.empty} onChange={id => {
                  const entry = WORD_STYLES.find(entry => entry.id === id);
                  if (entry) void editor.run(entry.command);
                  else void editor.run('applyParagraphStyle', { id });
                }} />);

  return <div className="w-ribbon office-command-surface">
    {mathInplace.surface}
    {!expanded && <RibbonToolbar compact className="w-toolbar w-quick-toolbar" label="기본 문서 도구">
      {controls('history')}
      <RibbonGroup id="quick-style" label="스타일">{stylePicker}</RibbonGroup>
      <RibbonGroup id="quick-font" label="글꼴">{choice(WORD_FONTS, 'w-quick-font')}{choice(WORD_FONT_SIZES, 'w-quick-size')}</RibbonGroup>
      <RibbonGroup id="quick-character" label="글자">{controls('character', false, ['bold', 'italic', 'underline'])}{palette(WORD_TEXT_COLOR)}{palette(WORD_TEXT_HIGHLIGHT)}</RibbonGroup>
      <RibbonGroup id="quick-paragraph" label="문단">{controls('paragraph')}</RibbonGroup>
      <RibbonToggle expanded={expanded} onChange={setExpanded} panelId={panelId} />
    </RibbonToolbar>}
    {expanded && <>
    <div className="w-ribbon-tabs-row">
    <RibbonTabs label="도구 모음 선택" value={section} onChange={setSection} panelId={panelId}
      options={[{ id: 'home', label: '홈' }, { id: 'insert', label: '삽입' },
        { id: 'layout', label: '레이아웃' }, { id: 'references', label: '참조' }, { id: 'review', label: '검토' }, { id: 'view', label: '보기' }, ...(objectTarget ? [{ id: 'object' as const, label: objectTarget.kind === 'table' ? '표 레이아웃' : '그림 서식' }] : [])]} />
    <RibbonToggle expanded={expanded} onChange={setExpanded} panelId={panelId} />
    </div>
    <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${section}`}>
      <RibbonToolbar className="w-toolbar w-toolbar-ribbon" label="문서 편집 도구">
        {section === 'home' && <>
          <RibbonGroup id="clipboard" label="클립보드">
            <div className="w-ribbon-stack"><div className="w-ribbon-row">
            {(Object.keys(CLIPBOARD_ACTIONS) as ClipboardAction[]).map(action =>
              <ToolbarToggle key={action} id={`clipboard-${action}`} label={CLIPBOARD_ACTIONS[action].label} state="off"
                disabled={!onViewAction || clipboardBusy || !canUseClipboard(editor, action)}
                onActivate={() => onViewAction?.(`clipboard.${action}`)}>
                <Icon name={CLIPBOARD_ACTIONS[action].icon} />
              </ToolbarToggle>)}
            </div><ToolbarToggle id="format-painter" label="서식 복사" state={formatPainterActive ? 'on' : 'off'}
              disabled={!onViewAction || (!formatPainterActive && !captureWordFormat(editor))}
              onActivate={() => onViewAction?.('format-painter')} className="w-format-painter">
              <Icon name="format-painter" /><span>서식 복사</span>
            </ToolbarToggle></div>
          </RibbonGroup>
          <RibbonGroup id="history" label="실행 기록">{controls('history')}</RibbonGroup>
          <RibbonGroup id="font" label="글꼴">
            <div className="w-ribbon-stack">
              <div className="w-ribbon-row">{choice(WORD_FONTS, 'w-ribbon-font')}{choice(WORD_FONT_SIZES, 'w-ribbon-size')}</div>
              <div className="w-ribbon-row">{controls('character')}{palette(WORD_TEXT_COLOR)}{palette(WORD_TEXT_HIGHLIGHT)}</div>
            </div>
          </RibbonGroup>
          <RibbonGroup id="paragraph" label="문단" onLaunch={launch('dialog.spacing')}>
            <div className="w-ribbon-row">
              <div className="w-ribbon-stack">{controls('list')}{controls('paragraph')}</div>
              <div className="w-ribbon-stack">
                <span className="w-ribbon-spacing-label">줄 간격</span>
                <ChoiceSelect ariaLabel="줄 간격" testClass="w-toolbar-line-spacing" className="w-ribbon-line-spacing"
                  options={lineOptions}
                  value={lineSpacing === null ? null : String(lineSpacing)}
                  disabled={!editor.canRun('setParagraphSpacing', { spacing: { ...NO_SPACING, rule: 'auto', line: LINE_UNIT } })}
                  onChange={id => {
                    const preset = LINE_PRESETS.find(one => String(one.lines) === id);
                    if (preset) void editor.run('setParagraphSpacing', {
                      spacing: { ...NO_SPACING, rule: 'auto', line: Math.round(preset.lines * LINE_UNIT) }
                    });
                  }} />
              </div>
            </div>
          </RibbonGroup>
          <RibbonGroup id="styles" label="스타일" onLaunch={captureStyleSession(editor) ? launch('dialog.styles') : undefined}>
            <div className="w-ribbon-stack">
              <div className="w-style-gallery">
                {WORD_STYLES.slice(0, 3).map(entry => <ToolbarToggle key={entry.id} id={`style-${entry.id}`}
                  label={entry.level ? `제목 ${entry.level} 적용` : '본문 적용'} state={style === entry.id ? 'on' : 'off'}
                  disabled={summary.empty} onActivate={() => void editor.run(entry.command)} className="w-style-preview">
                  <span className={`w-style-sample w-style-sample-${entry.id}`} aria-hidden="true">가나다</span>
                  <span>{entry.level ? `제목 ${entry.level}` : '본문'}</span>
                </ToolbarToggle>)}
              </div>
              {stylePicker}
            </div>
          </RibbonGroup>
          <RibbonGroup id="editing" label="편집">{viewAction('find', '찾기', 'document-search')}{viewAction('replace', '바꾸기', 'document-search')}</RibbonGroup>
          {table && <>
            <RibbonGroup id="table" label="표 편집"><div className="w-table-ribbon-tools">{controls('table')}</div></RibbonGroup>
            <RibbonGroup id="table-style" label="표 스타일">
              <div className="w-ribbon-stack">
                <ChoiceSelect testClass="w-toolbar-table-style" ariaLabel="Table style" options={[
                  { id: 'none', label: 'No table style' }, ...tableStyles.map(entry => ({ id: entry.id, label: entry.name }))
                ]} value={typeof table.attributes?.styleId === 'string' ? table.attributes.styleId : 'none'}
                  onChange={id => void editor.run('setTableStyle', { styleId: id === 'none' ? undefined : id })} />
                <div className="w-ribbon-row">{cell && palette(WORD_CELL_SHADING)}{viewAction('dialog.borders', '테두리', 'insert-table')}</div>
              </div>
            </RibbonGroup>
          </>}
        </>}
        {section === 'insert' && <>
          <RibbonGroup id="pages" label="페이지">{command('insertPageBreak', '페이지 나누기', 'page-break')}</RibbonGroup>
          <RibbonGroup id="furniture" label="머리글·바닥글">{viewAction('furniture.header', '머리글', 'page-header')}{viewAction('furniture.footer', '바닥글', 'page-footer')}{viewAction('furniture.number', '페이지 번호', 'page-number')}</RibbonGroup>
          <RibbonGroup id="tables" label="표">{viewAction('dialog.table', '표 삽입', 'insert-table')}</RibbonGroup>
          <RibbonGroup id="media" label="그림·링크">{authoring('image')}{authoring('link')}</RibbonGroup>
          <RibbonGroup id="drawing" label="도형">{controls('drawing', true)}</RibbonGroup>
          <RibbonGroup id="frames" label="콘텐츠 배치">{controls('layout', true)}</RibbonGroup>
          <RibbonGroup id="math" label="수식">
            <RibbonAction id="math-inplace" label="본문 수식" icon={<Icon name="math" />}
              disabled={!mathInplace.available || mathInplace.active} onActivate={mathInplace.open} />
            <div className="w-ribbon-stack w-math-secondary-actions"><WordMathEditor editor={editor} ribbon />
            <RibbonAction id="math-linear" label="수식 표시" icon={<Icon name="math" />}
              disabled={!editor.canRun('toggleMathLinear')} onActivate={() => void editor.run('toggleMathLinear')} />
            </div>
          </RibbonGroup>
          {WORD_TOOLBAR.find(group => group.id === 'arrange')!.controls.some(control => editor.canRun(control.command, control.payload)) &&
            <RibbonGroup id="arrange" label="도형 정렬">{controls('arrange')}</RibbonGroup>}
        </>}
        {section === 'layout' && <>
          <RibbonGroup id="page-setup" label="페이지 설정" onLaunch={launch('dialog.page')}>
            {viewAction('dialog.page', '용지·여백', 'page-setup')}
            {command('insertPageBreak', '페이지 나누기', 'page-break')}
            {command('insertColumnBreak', '단 나누기', 'frame-row')}
            {command('insertSectionBreak', '구역 나누기 (다음 페이지)', 'page-break')}
          </RibbonGroup>
          <RibbonGroup id="spacing" label="문단" onLaunch={launch('dialog.spacing')}>
            {viewAction('dialog.spacing', '들여쓰기·간격', 'paragraph-spacing')}
            {viewAction('dialog.borders', '테두리·음영', 'insert-table')}
          </RibbonGroup>
        </>}
        {section === 'references' && <>
          <RibbonGroup id="toc" label="목차">{viewAction('dialog.toc', '목차', 'outline')}</RibbonGroup>
          <RibbonGroup id="references" label="문서 참조">{viewAction('dialog.bookmark', '책갈피', 'outline')}{viewAction('dialog.reference', '상호 참조', 'type-url')}</RibbonGroup>
          <RibbonGroup id="captions" label="캡션">{viewAction('dialog.caption', '캡션 삽입', 'type-text')}{viewAction('dialog.figures', '그림 목차', 'outline')}</RibbonGroup>
          <RibbonGroup id="notes" label="각주·미주">{authoring('footnote')}{authoring('endnote')}</RibbonGroup>
          <RibbonGroup id="navigation" label="문서 탐색"><RibbonAction id="view-outline" label="개요" icon={<Icon name="outline" />} state={panes.outline ? 'on' : 'off'} onActivate={panes.onOutline} /></RibbonGroup>
        </>}
        {section === 'review' && <>
          <RibbonGroup id="comments" label="댓글">{authoring('comment')}<RibbonAction id="view-comments" label="댓글" icon={<Icon name="comments" />}
            state={panes.comments ? 'on' : 'off'} onActivate={panes.onComments} /></RibbonGroup>
          <RibbonGroup id="review" label="변경 내용 추적">{controls('review', true)}</RibbonGroup>
        </>}
        {section === 'view' && <>
          <RibbonGroup id="view" label="표시">
            <RibbonAction id="view-outline" label="개요" icon={<Icon name="outline" />}
              state={panes.outline ? 'on' : 'off'} onActivate={panes.onOutline} />
            <RibbonAction id="view-comments" label="댓글" icon={<Icon name="comments" />}
              state={panes.comments ? 'on' : 'off'} onActivate={panes.onComments} />
          </RibbonGroup>
          {!externalZoom && <RibbonGroup id="zoom" label="확대/축소"><ZoomControl zoom={zoom} onChange={onZoom} pane={pane} /></RibbonGroup>}
          <RibbonGroup id="print" label="출력">{viewAction('print', '인쇄', 'print')}</RibbonGroup>
        </>}
        {section === 'object' && table && <RibbonGroup id="table" label="표 편집"><div className="w-table-ribbon-tools">{controls('table')}</div></RibbonGroup>}
        {section === 'object' && objectTarget && <WordObjectLayoutControls key={`${objectTarget.rootId}:${objectTarget.nodeId}`} editor={editor} target={objectTarget} container={pane} />}
      </RibbonToolbar>
    </div>
    </>}
  </div>;
}

const CAPTIONS: Record<string, string> = {
  'insert-rectangle': '사각형', 'insert-ellipse': '타원', 'insert-line': '선', 'insert-drawing': '그리기',
  'frame-row': '가로 배치', 'frame-column': '세로 배치', 'frame-grid': '그리드',
  'track-changes': '변경 내용 추적', 'math-linear': '수식 표시', 'prev-revision': '이전 변경',
  'next-revision': '다음 변경', 'accept-revision': '적용', 'reject-revision': '거부',
  'accept-all-revisions': '모두 적용', 'reject-all-revisions': '모두 거부'
};
