import { useEffect, useState } from 'react';
import type { Editor, SelectionSummary } from '@barocss/editor-core';
import {
  currentChoice,
  inheritedChoice,
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
  const [summary, setSummary] = useState<SelectionSummary>(() => editor.getSelectionSummary());

  useEffect(() => {
    const refresh = () => setSummary(editor.getSelectionSummary());
    editor.on('editor:selection.model', refresh);
    editor.on('editor:content.change', refresh);
    refresh();
    return () => {
      editor.off('editor:selection.model', refresh);
      editor.off('editor:content.change', refresh);
    };
  }, [editor]);

  const style = currentStyle(summary);

  /**
   * What the selection's font or size resolves to through the style cascade.
   *
   * Read from the view's current environment rather than one captured earlier:
   * the layout pass rebuilds the environment on every round, so a resolver held
   * across renders would answer with styles the document has moved on from.
   */
  const inherited = (model: ToolbarChoice) => {
    const selection = editor.selection;
    if (!selection) return undefined;
    const store: any = (editor as any).dataStore;
    let node = store?.getNode?.(selection.startNodeId);
    // Up to the block, which is what carries a style.
    for (let depth = 0; node && depth < 64; depth++) {
      if (node.stype && typeof node.text !== 'string' && node.stype !== 'inline-text') break;
      node = node.parentId ? store.getNode(node.parentId) : undefined;
    }
    return inheritedChoice(model, getWordStyles(view.getEnv()), node);
  };

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
                state={control.state?.(summary) ?? 'off'}
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
