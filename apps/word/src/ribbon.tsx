import { useEffect, useMemo, useReducer } from 'react';
import type { Editor } from '@barocss/editor-core';
import {
  currentChoice,
  inheritedChoice,
  listKindOf,
  listState,
  currentStyle,
  WORD_FONTS,
  WORD_FONT_SIZES,
  WORD_STYLES,
  WORD_TOOLBAR,
  getWordStyles,
  type ToolbarChoice
} from '@barocss/office-word';
import type { EditorViewDOM } from '@barocss/editor-view-dom';
import { Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarToggle } from './ui/toolbar';
import { StyleSelect } from './ui/style-select';
import { ControlIcon } from './ui/icons';
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
export function Ribbon({
  editor,
  view,
  fonts
}: {
  editor: Editor;
  view: EditorViewDOM;
  fonts: FontLoader;
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
   */
  const [tick, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    editor.on('editor:selection.model', bump);
    editor.on('editor:content.change', bump);
    bump();
    return () => {
      editor.off('editor:selection.model', bump);
      editor.off('editor:content.change', bump);
    };
  }, [editor]);

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

  const inherited = (model: ToolbarChoice) =>
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
   * A font or size control: the same control with different options, so it is
   * built from the model rather than written twice.
   */
  const choice = (model: ToolbarChoice, width: string) => (
    <StyleSelect
      key={model.id}
      testClass={`w-toolbar-${model.id}`}
      ariaLabel={model.label}
      className={width}
      options={model.options.map((option) => ({ id: String(option.value), label: option.label }))}
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
    <Toolbar>
      <StyleSelect
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

      {WORD_TOOLBAR.map((group) => (
        <span key={group.id} className="flex items-center">
          <ToolbarSeparator />
          <ToolbarGroup id={group.id}>
            {group.controls.map((control) => (
              <ToolbarToggle
                key={control.id}
                id={control.id}
                label={control.label}
                state={
                  control.listKind
                    ? listState(control.listKind, summary, currentListKind)
                    : (control.state?.(summary) ?? 'off')
                }
                disabled={!editor.canRun(control.command, control.payload)}
                onActivate={() => void editor.run(control.command, control.payload)}
              >
                <ControlIcon id={control.id} fallback={control.icon} />
              </ToolbarToggle>
            ))}
          </ToolbarGroup>
        </span>
      ))}
    </Toolbar>
  );
}
