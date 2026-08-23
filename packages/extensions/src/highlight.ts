import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, applyMark, toggleMark } from '@barocss/model';

export interface HighlightExtensionOptions {
  defaultColor?: string;
}

export class HighlightExtension implements Extension {
  name = 'highlight';
  priority = 100;

  private _defaultColor: string;

  constructor(options: HighlightExtensionOptions = {}) {
    this._defaultColor = options.defaultColor ?? '#ffeb3b';
  }

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'toggleHighlight',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection; color?: string }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const color = payload?.color ?? this._defaultColor;
        const op = toggleMark(
          selection.startNodeId,
          selection.startOffset,
          selection.endNodeId,
          selection.endOffset,
          'highlight',
          { color }
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        const sel = payload?.selection || (_ed as any).selection;
        return !!sel && sel.type === 'range';
      }
    });

    /**
     * A highlight in a colour the reader chose, which the toggle cannot give.
     *
     * `toggleHighlight` takes a colour but *toggles*: pressing yellow on text
     * that is already green takes the highlight off rather than turning it
     * yellow, which is not what pressing a swatch means. So the palette needs a
     * command that applies — the same division `setFontColor` and its toggle
     * have had since the day the kit had marks.
     *
     * The `highlight` mark rather than `bgColor`, which is the other mark in the
     * schema that claims to paint behind text: `setBgColor` writes its colour
     * into an attribute called `color` while the schema declares `bgColor` and
     * the only reader looks for `bgColor` — so it reports success and paints
     * nothing, measured in the deck on 2026-08-19. Two marks for one idea is the
     * fault; this uses the one that works, and the dead pair is written down in
     * the backlog rather than given a second control.
     */
    (editor as any).registerCommand({
      name: 'setHighlight',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection; color?: string }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range' || !payload?.color) return false;

        const op = applyMark(
          selection.startNodeId,
          selection.startOffset,
          selection.endNodeId,
          selection.endOffset,
          'highlight',
          { color: payload.color }
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        const sel = payload?.selection || (_ed as any).selection;
        return !!sel && sel.type === 'range';
      }
    });

    /**
     * Taking it off again.
     *
     * `toggleMark` rather than `removeMark`, which works on one node at a time
     * and so cannot clear a selection that spans two paragraphs — the same
     * reason `removeFontColor` is written this way. The consequence is the same
     * too: asked of a range that has no highlight it puts one on, so this is
     * offered where the reader can see there is one to remove.
     */
    (editor as any).registerCommand({
      name: 'removeHighlight',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const op = toggleMark(
          selection.startNodeId,
          selection.startOffset,
          selection.endNodeId,
          selection.endOffset,
          'highlight'
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        const sel = payload?.selection || (_ed as any).selection;
        return !!sel && sel.type === 'range';
      }
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createHighlightExtension(options?: HighlightExtensionOptions): HighlightExtension {
  return new HighlightExtension(options);
}
