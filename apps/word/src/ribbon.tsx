import { ControlRows } from '@barocss/office-editor-ui';
import { useMemo } from 'react';
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
  listKindOf,
  listState,
  currentStyle,
  cellAttributeState,
  tableLookState,
  WORD_FONTS,
  WORD_FONT_SIZES,
  WORD_STYLES,
  WORD_TOOLBAR,
  WORD_TEXT_COLOR,
  WORD_TEXT_HIGHLIGHT,
  WORD_CELL_SHADING,
  currentPaletteColor
} from '@barocss/office-word';
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
  ChoiceSelect,
  ColorPalette,
  Icon,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarToggle
} from '@barocss/office-ui';
import { useEditorRevision } from './revision';
import { ZoomControl } from './zoom';
import type { FontLoader } from './font-loader';

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

export function Ribbon({
  editor,
  view,
  fonts,
  panes,
  zoom,
  onZoom
}: {
  editor: Editor;
  view: EditorViewDOM;
  fonts: FontLoader;
  panes: RibbonPanes;
  zoom: number;
  onZoom: (zoom: number) => void;
}) {
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

  const summary = useMemo(() => editor.getSelectionSummary(), [editor, tick]);

  const style = currentStyle(summary);

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

  return (
    <Toolbar className="w-toolbar">
      <ChoiceSelect
        testClass="w-toolbar-style"
        ariaLabel="Paragraph style"
        options={WORD_STYLES}
        value={style}
        disabled={summary.empty}
        onChange={(id) => {
          const chosen = WORD_STYLES.find((entry) => entry.id === id);
          if (chosen) void editor.run(chosen.command);
        }}
      />

      <ToolbarSeparator />
      {choice(WORD_FONTS, 'min-w-40')}
      {choice(WORD_FONT_SIZES, 'min-w-16')}
      {palette(WORD_TEXT_COLOR)}
      {/*
        The highlighter's colour, beside the highlighter itself.

        The toggle in the character group applies Word's yellow in one press,
        which is what that button means; this is the choice of colour, and it
        runs `setHighlight` rather than the toggle because pressing yellow on
        green text means "make it yellow" and a toggle would take it off.
      */}
      {palette(WORD_TEXT_HIGHLIGHT)}

      {table && tableStyles.length > 0 && (
        <>
          <ToolbarSeparator />
          <ChoiceSelect
            testClass="w-toolbar-table-style"
            ariaLabel="Table style"
            className="min-w-40"
            // A named option rather than an empty one: an empty value is how
            // Radix spells "nothing is selected", and "no style" is a choice.
            options={[
              { id: 'none', label: 'No table style' },
              ...tableStyles.map((entry) => ({ id: entry.id, label: entry.name }))
            ]}
            value={
              typeof table.attributes?.styleId === 'string' && table.attributes.styleId
                ? table.attributes.styleId
                : 'none'
            }
            onChange={(id) =>
              void editor.run('setTableStyle', { styleId: id === 'none' ? undefined : id })
            }
          />
        </>
      )}

      {/*
        Shading, beside the table style and only inside a table — the same rule
        the style gallery follows, and for the same reason: a shading control
        with no cell to shade is a button that cannot do anything.
      */}
      {cell && palette(WORD_CELL_SHADING)}

      {/*
        What is showing, which is the host's and not the document's — and last,
        because it is the group a reader reaches for least.
      */}
      <span className="contents">
        <ToolbarSeparator />
        <ToolbarGroup id="view">
          <ToolbarToggle
            id="view-outline"
            label="개요"
            state={panes.outline ? 'on' : 'off'}
            onActivate={panes.onOutline}
          >
            <Icon name="outline" />
          </ToolbarToggle>
          <ToolbarToggle
            id="view-comments"
            label="댓글"
            state={panes.comments ? 'on' : 'off'}
            onActivate={panes.onComments}
          >
            <Icon name="comments" />
          </ToolbarToggle>
        </ToolbarGroup>
      </span>

      {/* Its own group: it is not a pane switch, and it is wide enough that
          sharing one made the group too wide to keep on a single row. */}
      <span className="contents">
        <ToolbarSeparator />
        <ToolbarGroup id="zoom">
          <ZoomControl zoom={zoom} onChange={onZoom} />
        </ToolbarGroup>
      </span>

      {/*
        A **contextual** group is drawn only when there is something for it to act on.

        Measured with a caret in an ordinary paragraph: of 69 controls, arrange was 12 of 12 disabled
        and table 15 of 15, and everything else was live — two rows of glyphs that could do nothing,
        on screen always, and the second row exists because of them.

        The two are answered differently and both readings are real. A table is the one **around the
        caret**, which this component already computes for the look flags. A shape has no such
        anchor: what "a shape is selected" means is exactly what the arrange commands answer, so the
        group asks its own controls. Neither is a guess at the other's question.
      */}
      {WORD_TOOLBAR.filter((group) =>
        group.when === 'table'
          ? !!table
          : group.when === 'shape'
            ? group.controls.some((control) => editor.canRun(control.command, control.payload))
            : true
      ).map((group) => (
        // `contents` so the separator and the group are laid out by the ribbon
        // itself: wrapped inside a span of their own they could only move as a
        // pair, and a row would break in the middle of a group instead of
        // between two.
        <span key={group.id} className="contents">
          <ToolbarSeparator />
          <ToolbarGroup id={group.id}>
            {/*
              **`useControls` is the shared chrome**, and what stays here is what is Word's own.

              Subscribing to the editor, working out each control's key and chord, asking whether it
              may run and running it — all four of those were written here, and again in the site's
              ribbon, and again in the deck's. What is not shared is the state: Word answers four
              ways, and a list, a table look and a cell attribute are none of them marks.
            */}
            {/*
              **`ControlRows` is the shared chrome** — subscribing to the editor, keying each
              control, working out its chord and whether it may run, and running it. All four of
              those were written here, and again in the site's ribbon, and again in the deck's.

              A render prop because a hook cannot be called inside a `.map`, and because holding that
              call in a component of Word's own is what made this file *longer* the first time the
              logic moved out.
            */}
            <ControlRows
              editor={editor}
              controls={group.controls}
              options={{
                can: (control) => editor.canRun(control.command, control.payload),
                onRun: (control) => void editor.run(control.command, control.payload),
                /*
                 * **Word's four answers.** A list button resolves a numbering definition, a
                 * table-look button reads a flag off the table the caret is in, a cell button reads
                 * an attribute, and everything else asks the control's own function. None of them is
                 * a mark, which is why the shared layer takes this rather than guessing.
                 */
                state: (control) =>
                  control.listKind
                    ? listState(control.listKind, summary, currentListKind)
                    : control.lookFlag
                      ? tableLookState(control.lookFlag, table)
                      : control.cellAttribute
                        ? cellAttributeState(control.cellAttribute, cell)
                        : (control.state?.(summary) ?? 'off')
              }}
            >
              {(rows) =>
                rows.map((one) => (
                  <ToolbarToggle
                    key={one.key}
                    id={one.key}
                    label={one.says}
                    shortcut={one.shortcut}
                    state={one.state}
                    disabled={one.disabled}
                    onActivate={one.run}
                  >
                    {one.control.icon ? <Icon name={one.control.icon} /> : one.label}
                  </ToolbarToggle>
                ))
              }
            </ControlRows>
          </ToolbarGroup>
        </span>
      ))}
    </Toolbar>
  );
}
