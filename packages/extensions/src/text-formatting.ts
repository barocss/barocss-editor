import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, toggleMark, applyMark, clearFormatting } from '@barocss/model';
import { hasRange, wears } from './guards';

/**
 * TextFormattingExtension — aggregates less-common text-style marks:
 * smallCaps, kbd, spoiler, letterSpacing, wordSpacing, lineHeight,
 * textShadow, border, spanLang
 */
export class TextFormattingExtension implements Extension {
  name = 'textFormatting';
  priority = 100;

  onCreate(editor: Editor): void {
    this._registerToggle(editor, 'toggleSmallCaps', 'smallCaps');
    this._registerToggle(editor, 'toggleKbd', 'kbd');
    this._registerToggle(editor, 'toggleSpoiler', 'spoiler');

    this._registerApply(editor, 'setLetterSpacing', 'letterSpacing', 'spacing');
    this._registerApply(editor, 'setWordSpacing', 'wordSpacing', 'spacing');
    this._registerApply(editor, 'setLineHeight', 'lineHeight', 'height');
    this._registerApply(editor, 'setTextShadow', 'textShadow', 'shadow');

    this._registerApplyMulti(editor, 'setBorder', 'border', ['style', 'width', 'color']);
    this._registerApplyMulti(editor, 'setSpanLang', 'spanLang', ['lang', 'dir']);

    /**
     * **서식 지우기** — the one control that undoes all the others at once.
     *
     * Word binds it to ⌘Space and has since the first key map in this repository; nothing registered
     * it, so the key was a lie. Found by asking a question nothing had asked: *does every chord this
     * product prints name a command it registers?* Word printed 72 and answered 68.
     *
     * The eleven `remove…` commands beside it each take one mark away, which is the wrong shape for
     * this gesture: a reader who has bolded, coloured and raised a word wants it plain in one press,
     * not eleven. So this asks the runs what they are actually wearing and takes those off — which
     * also means it stays right when a mark is added to the schema, where a written list would not.
     *
     * **Marks only.** A paragraph's own formatting — its style, its indents, its alignment — is not
     * what ⌘Space clears in Word either; 스타일 지우기 is the separate gesture, and conflating them
     * would make one key destroy work a reader cannot see selected.
     */
    (editor as Editor & { registerCommand: (c: unknown) => void }).registerCommand({
      name: 'clearFormatting',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const at = payload?.selection ?? (ed as { selection?: ModelSelection }).selection;
        if (!at || at.type !== 'range') return false;

        const result = await transaction(
          ed,
          [clearFormatting(at.startNodeId, at.startOffset, at.endNodeId, at.endOffset)] as never,
          {}
        ).commit();
        return result.success;
      },
      /**
       * A range covering **something**, and something on it to clear.
       *
       * The first half is the usual one: over a caret there is no text to clear. The second half was
       * argued away when this was written — *a reader pressing 서식 지우기 on plain text has got what
       * they asked for* — and the harness disagreed the same afternoon, correctly. A control that
       * lights up, commits and changes nothing is the class this package's conformance run is named
       * after, and *plain text* is the case where it happens every time rather than rarely.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        hasRange(ed, payload, 'something') && wears(ed, payload?.selection)
    });
  }

  private _registerToggle(editor: Editor, cmdName: string, markType: string): void {
    (editor as any).registerCommand({
      name: cmdName,
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range') return false;

        const op = toggleMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          markType
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      /*
       * A mark covers the text **between two points**. On a caret `toggleMark` commits and changes
       * nothing, so a control over one lit up, ran, reported success and drew nothing — see
       * `guards.ts`, which was written for exactly this and applied to nine commands while these
       * three, registered through a helper, were not among them.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        hasRange(ed, payload, 'something')
    });
  }

  private _registerApply(editor: Editor, cmdName: string, markType: string, attrKey: string): void {
    (editor as any).registerCommand({
      name: cmdName,
      execute: async (ed: Editor, payload?: { selection?: ModelSelection; value?: string }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range' || !payload?.value) return false;

        const op = applyMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          markType, { [attrKey]: payload.value }
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      /**
       * **`() => true` was the whole guard**, on four commands, next to an execute that refuses
       * without a range *and* without a value.
       *
       * Found by the conformance run in this package's own tests — the first thing it did. It is the
       * class `guards.ts` names and this is the fourth batch of it: a control lights up, a reader
       * presses it, the command declines, and the reason goes to a console nobody is watching. What
       * kept it alive here is that these four are registered through a helper, so a sweep reading
       * `canExecute:` at each command's own declaration never saw them.
       *
       * The value is part of the guard because it is part of the execute. A colour command may
       * legitimately say yes before a colour is picked — a control has to know whether to be enabled
       * before it knows what it will send — but that is a claim about a payload the *caller* has not
       * filled in yet, and it only holds when the caller is going to. Here the value is the whole
       * command: `setLineHeight` with no height is not a control waiting for input, it is a mistake.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection; value?: string }) =>
        hasRange(ed, payload, 'something') && payload?.value !== undefined
    });
  }

  private _registerApplyMulti(editor: Editor, cmdName: string, markType: string, attrKeys: string[]): void {
    (editor as any).registerCommand({
      name: cmdName,
      execute: async (ed: Editor, payload?: { selection?: ModelSelection; attrs?: Record<string, string> }) => {
        const selection = payload?.selection || (ed as any).selection;
        if (!selection || selection.type !== 'range' || !payload?.attrs) return false;

        const filtered: Record<string, string> = {};
        for (const key of attrKeys) {
          if (payload.attrs[key] !== undefined) filtered[key] = payload.attrs[key];
        }
        if (Object.keys(filtered).length === 0) return false;

        const op = applyMark(
          selection.startNodeId, selection.startOffset,
          selection.endNodeId, selection.endOffset,
          markType, filtered
        );
        const result = await transaction(ed, [op]).commit();
        return result.success;
      },
      /**
       * The same, and one thing more: the execute also refuses `attrs` that holds **none of the keys
       * this mark takes**, so the guard has to ask the same question or it is looser again.
       *
       * `{ colour: 'red' }` on a border — a caller who spelled it the other way — passes an `attrs`
       * check and fails the filter inside, which is a yes followed by nothing.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection; attrs?: Record<string, string> }) =>
        hasRange(ed, payload, 'something') &&
        attrKeys.some((key) => payload?.attrs?.[key] !== undefined)
    });
  }
}

export function createTextFormattingExtension(): TextFormattingExtension {
  return new TextFormattingExtension();
}
