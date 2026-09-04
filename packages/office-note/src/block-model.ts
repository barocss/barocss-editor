import type { Control } from '@barocss/office-controls';
import type { NoteBlock } from './note-schema';

/**
 * **고른 블록에 무엇을 물어보나** — declared, for the reason the toolbar is.
 *
 * ## Why a body needs this
 *
 * A picture arrives as a placeholder and a video as a blank `src`, because both are *required* by
 * the schema and a reader has not chosen a file yet. Without somewhere to give it one, 이미지 is a
 * button that puts a grey rectangle in a post forever. Reported as *이미지나 동영상은 파일을 넣을
 * 수 있어야하고*.
 *
 * ## And why it is a declaration rather than a component
 *
 * The same argument `toolbar-model.ts` makes: a control written in JSX is a control nothing can
 * read. A check cannot ask *does every block a reader can hold offer what it needs*, and the answer
 * to that question is exactly this table — one row per kind, and a kind with no row is a block a
 * reader can select and do nothing with.
 */
export type NoteFieldKind = 'file' | 'text' | 'choice' | 'number';

/**
 * **What a held block can be told to do**, as against what it can be asked.
 *
 * A picture is *asked* for a file — a value goes into an attribute. A table is *told* to grow a row
 * — nothing is stored, a command runs. Two different things, and folding them into one list would
 * make `attr` a lie for half the entries.
 */
export interface NoteAct extends Control {
  /** The `office-icons` name. Never a character — see the repository's rule about that. */
  icon: string;
  /** What the tooltip says — always, because these are pictures with no word beside them. */
  title: string;
}

export interface NoteField {
  /** The attribute it writes. */
  attr: string;
  /** What a reader calls it. */
  label: string;
  kind: NoteFieldKind;
  /** For a `file` — what the picker accepts. */
  accept?: string;
  /** For a `choice` — what it may be. */
  options?: { id: string; label: string }[];
  /** For a `number` — the range a reader may type. */
  min?: number;
  max?: number;
}

/**
 * What each kind of held block is asked.
 *
 * **Only the blocks a click can hold**, which is the same list `NOTE_PICKED` draws: a paragraph is
 * written in rather than configured, and a body that offered a panel for one would be a page
 * builder wearing a smaller size.
 */
export const NOTE_FIELDS: Partial<Record<NoteBlock, NoteField[]>> = {
  picture: [
    /*
     * A **file**, and the picture is where that gesture belongs: a body has no asset store to name
     * one out of, so what a reader picks becomes the `src` itself. See `fileSrc`.
     */
    { attr: 'src', label: '파일', kind: 'file', accept: 'image/*' },
    /*
     * And the words for it, which is not a nicety: a body is read by people who cannot see it, and
     * an image in a post with nothing written for it is the commonest accessibility fault there is.
     */
    { attr: 'alt', label: '설명', kind: 'text' }
  ],
  mediaVideo: [{ attr: 'src', label: '파일', kind: 'file', accept: 'video/*' }],
  mediaEmbed: [
    {
      attr: 'provider',
      label: '어디',
      kind: 'choice',
      options: [
        { id: 'youtube', label: 'YouTube' },
        { id: 'vimeo', label: 'Vimeo' }
      ]
    },
    /*
     * The **id**, not the address. An id survives a provider changing its URL shape; an address does
     * not, and a post written last year would then point at a page that has moved.
     */
    { attr: 'id', label: 'id', kind: 'text' }
  ],
  codeBlock: [{ attr: 'language', label: '언어', kind: 'text' }]
};

/**
 * **표에 행과 열을 더하고 뺀다** — the four acts, on the one block that has any.
 *
 * A table inserted at a chosen size is still a table a reader cannot change, and the change they
 * want first is one more row. The operations for it were already in `@barocss/model` — a grid walk
 * that handles spans, written and never called by anything — so this is four buttons over work that
 * existed. See `element-commands.ts`.
 *
 * All four read **the cell the caret is in**, which is why a table is the held block that keeps its
 * caret: 행 추가 with nothing to be after is not a question this can answer, and the buttons say so
 * by going quiet rather than guessing the last row.
 *
 * ## 그리고 이 넷은 공유 명령입니다 — 한 번 아니었다가 검사가 잡았습니다
 *
 * Written first as `addNoteRow` · `removeNoteRow` · `addNoteColumn` · `removeNoteColumn`, registered
 * in this package, over operations *"the model has and nothing calls"*. Both halves of that were
 * wrong: `@barocss/extensions`' `TableExtension` — **already in this kit** — registers
 * `insertRowAbove` · `insertRowBelow` · `deleteRow` · `insertColumnLeft` · `insertColumnRight` ·
 * `deleteColumn` · `splitCell` over exactly those operations, with the same `cellId` payload, and
 * **all three other products already declared them.**
 *
 * Found by `three-agree.test.ts` on the day it was written, two hours after the duplication was.
 * Four new commands over six that were there.
 */
export const NOTE_ACTS: Partial<Record<NoteBlock, NoteAct[]>> = {
  bTable: [
    /*
     * **위와 아래, 왼쪽과 오른쪽 — 넷 다.** Offered as *아래에* and *오른쪽에* only for an afternoon,
     * on the reasoning that a body's table is simple and a reader can add below and move. Then
     * `three-agree.test.ts` asked why the other three products offer six and this one four, and the
     * honest answer was that nobody had thought about the reader who wants a row **above** the first
     * one — for whom *add below and move* is two gestures and a table with the wrong header.
     */
    { command: 'insertRowAbove', label: '위에 행', icon: 'row-above', title: '위에 행을 넣습니다' },
    { command: 'insertRowBelow', label: '아래에 행', icon: 'row-below', title: '아래에 행을 넣습니다' },
    { command: 'deleteRow', label: '행 삭제', icon: 'row-delete', title: '이 행을 지웁니다' },
    { command: 'insertColumnLeft', label: '왼쪽에 열', icon: 'column-left', title: '왼쪽에 열을 넣습니다' },
    { command: 'insertColumnRight', label: '오른쪽에 열', icon: 'column-right', title: '오른쪽에 열을 넣습니다' },
    { command: 'deleteColumn', label: '열 삭제', icon: 'column-delete', title: '이 열을 지웁니다' }
  ]
};

/**
 * **위로, 아래로** — the two acts every held block has, whatever kind it is.
 *
 * Kept apart from `NOTE_ACTS` because those are a kind's own; these belong to *being held* and would
 * otherwise be copied into every row of that table, which is how a list stops being a declaration.
 *
 * A picture put in the wrong place could only be deleted and made again, losing the file a reader
 * chose for it — so this is not an arrangement nicety, it is the difference between a mistake that
 * costs a press and one that costs the work.
 */
export const NOTE_MOVES: NoteAct[] = [
  { command: 'moveNoteBlockUp', label: '위로', icon: 'move-up', title: '위로 옮깁니다' },
  { command: 'moveNoteBlockDown', label: '아래로', icon: 'move-down', title: '아래로 옮깁니다' }
];

/** What a held block can be told to do, or nothing. */
export function actsFor(stype: unknown): NoteAct[] {
  return NOTE_ACTS[String(stype) as NoteBlock] ?? [];
}

/** What a held block is asked, or nothing — a rule and a table have no attributes of their own. */
export function fieldsFor(stype: unknown): NoteField[] {
  return NOTE_FIELDS[String(stype) as NoteBlock] ?? [];
}

/**
 * A picked file as something a `src` can hold.
 *
 * **A data URI**, because a body has nowhere else to put it: a site keeps files in the document's
 * `resources` and names them, and a note standalone has no such region — it is one written thing.
 * The cost is the file's own size in the document, which is why the picker says so above a limit and
 * why a host with a store of its own should hand in its own `onFile`.
 */
export function fileSrc(file: File): Promise<string> {
  return new Promise((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result ?? ''));
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(file);
  });
}
