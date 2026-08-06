import { useEffect, useState } from 'react';
import type { Editor, SelectionSummary } from '@barocss/editor-core';
import { currentStyle, WORD_STYLES, WORD_TOOLBAR } from '@barocss/office-word';
import { Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarToggle } from './ui/toolbar';
import { StyleSelect } from './ui/style-select';

/**
 * Word's ribbon.
 *
 * It draws the toolbar model the product ships and holds nothing else. State it
 * held would be state that could disagree with the document — a bold button that
 * remembers being pressed is a button that lies after an undo — so the summary
 * is re-read whenever the selection or the content changes, which are the only
 * two things that can change the answer.
 */
export function Ribbon({ editor }: { editor: Editor }) {
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

  return (
    <Toolbar>
      <StyleSelect
        options={WORD_STYLES}
        value={style}
        disabled={summary.empty}
        onChange={(id) => {
          const chosen = WORD_STYLES.find((entry) => entry.id === id);
          if (chosen) void editor.run(chosen.command);
        }}
      />

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
                {control.icon}
              </ToolbarToggle>
            ))}
          </ToolbarGroup>
        </span>
      ))}
    </Toolbar>
  );
}
