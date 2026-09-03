/**
 * The widths a site is designed at, as commands a reader can run.
 *
 * ## Why the document holds them at all
 *
 * It did not. `BREAKPOINTS` was a `const` with three entries, so a site with a fourth board — or two,
 * or one whose phone is 360 rather than 390 — was unsayable. Asked as three things that turned out
 * to be one: *사이즈를 더 추가할 수도 있지 않을까 / 순서도 바꿀 수 있어야할 듯 / 미리보기에 실제 장치
 * 테두리가 있으면*. All three need the same missing fact.
 *
 * ## Why a width is a node
 *
 * Because it is **referred to by name**: every `overrides` key in every document is one, every board
 * is keyed by one, and `attrsAt` walks them. That is this repository's reference shape, and the answer
 * it has always given is a declared node — see `site-schema.ts`, and `variable` for the pattern this
 * copies down to the two names.
 *
 * ## What these refuse
 *
 * - **The last one.** A site with no widths is a site with no boards, which is a document this
 *   product cannot draw and offers no gesture to repair. The same rule `removePage` follows.
 * - **A name something else already has.** A duplicate name would make two boards one, and every
 *   `overrides` key naming it ambiguous.
 * - **Renaming.** A width's `name` is what references point at, so changing it would mean rewriting
 *   every `overrides` map in the document — a migration rather than an edit. The `label` is what a
 *   reader changes, which is the whole reason it exists.
 */

import type { Editor, Extension } from '@barocss/editor-core';
import { node, addChild, removeChild, setAttrs, transaction } from '@barocss/model';
import { widthsOf, type SiteWidth } from './breakpoints';
import { DEVICES, deviceNamed } from './devices';

type Node = Record<string, any>;

export class SiteWidthExtension implements Extension {
  name = 'siteWidths';
  priority = 47;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (payload?: Record<string, unknown>) => Promise<boolean>,
      can: (payload?: Record<string, unknown>) => boolean
    ) =>
      editor.registerCommand({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) => await execute(payload),
        canExecute: (_ed: Editor, payload?: Record<string, unknown>) => can(payload)
      });

    /**
     * A width, at the end of the list.
     *
     * A device by name fills the numbers in — which is what *장치별로 사이즈가 자동으로 바뀌던가*
     * asks for, and the honest shape for it: the device is a shorthand, and what the document keeps
     * is still the numbers.
     */
    register(
      'insertWidth',
      async (payload) => await this._insert(editor, payload),
      () => !!this._store(editor)
    );

    /** What it is called, how wide, how tall a window, and which device — never its `name`. */
    register(
      'setWidth',
      async (payload) => await this._set(editor, payload),
      (payload) => this._named(editor, payload?.name)
    );

    /**
     * **어느 폭이 기준인지**, which is the one thing about the list that is not about a width.
     *
     * A node says `gap: 40` and `{ mobile: { gap: 6 } }`, so which width is the base decides what
     * every unqualified attribute in the document means. It used to be *the widest*, computed — and
     * that is a trap the moment a reader adds a wider board: every page silently stops meaning what
     * it meant. See `baseOf`.
     *
     * On the `widths` box rather than on a width, because it is a fact about the **list**: exactly
     * one of them is the base, and putting a flag on each would let a document say two.
     */
    register(
      'setBaseWidth',
      async (payload) => await this._setBase(editor, payload),
      (payload) => this._named(editor, payload?.name) && this._notBase(editor, payload?.name)
    );

    register(
      'removeWidth',
      async (payload) => await this._remove(editor, payload),
      (payload) => this._canRemove(editor, payload?.name)
    );

    /** Reorder, by where it should end up — 0 is first, the same shape `movePage` takes. */
    register(
      'moveWidth',
      async (payload) => await this._move(editor, payload),
      (payload) => this._canMove(editor, payload?.name, payload?.to)
    );
  }

  onDestroy(_editor: Editor): void {}

  private _store(editor: Editor): { getNode: (sid: string) => Node | undefined } | undefined {
    const store = editor.dataStore as { getNode: (sid: string) => Node | undefined } | undefined;
    return store && editor.getRootId() ? store : undefined;
  }

  private _widths(editor: Editor): SiteWidth[] {
    return widthsOf(this._store(editor), editor.getRootId());
  }

  /** The `widths` box, which a document written before there were any does not have. */
  private _box(editor: Editor): string | undefined {
    const store = this._store(editor);
    const root = store?.getNode(editor.getRootId()!);
    return ((root?.content ?? []) as unknown[])
      .filter((sid): sid is string => typeof sid === 'string')
      .find((sid) => store!.getNode(sid)?.stype === 'widths');
  }

  /** The sid of the width with this name, when the document actually declares one. */
  private _at(editor: Editor, name: unknown): string | undefined {
    const store = this._store(editor);
    const box = this._box(editor);
    if (!store || !box || typeof name !== 'string') return undefined;
    return ((store.getNode(box)?.content ?? []) as unknown[])
      .filter((sid): sid is string => typeof sid === 'string')
      .find((sid) => String(store.getNode(sid)?.attributes?.name ?? '') === name);
  }

  /**
   * Whether this is a width the document is **drawing at** — which is not the same as one it has
   * written down, and that difference is the whole of what was reported as *순서 이동 눌러도 동작을
   * 안해*.
   *
   * A document that has said nothing about widths draws at three, and those three are a **default**
   * rather than nodes. So the panel listed them, a reader pressed ↑ on one, and the command looked
   * for a node with that name, found none, and refused — correctly, and uselessly.
   */
  private _named(editor: Editor, name: unknown): boolean {
    return typeof name === 'string' && this._widths(editor).some((one) => one.id === name);
  }

  /**
   * **The list, written down** — done by the first change of any kind, and by nothing else.
   *
   * The alternative was writing the three into every document as it opened, which would put three
   * nodes nobody asked for into every file the moment this shipped. This way a document that never
   * touches its widths never grows a `widths` box, and the first reader who moves one gets a list
   * that says exactly what they were already looking at.
   *
   * `insertWidth` has done this since the day it existed, for the same reason said the other way
   * round: a first insert that wrote one width alone would make `widthsOf` return it by itself, and
   * three boards would silently become one.
   */
  private async _ensure(editor: Editor): Promise<string | undefined> {
    const already = this._box(editor);
    if (already) return already;

    const rootId = editor.getRootId();
    const store = this._store(editor);
    if (!rootId || !store) return undefined;

    const done = await transaction(editor, [
      addChild(
        rootId,
        node('widths', {}, this._widths(editor).map((one) => this._nodeOf(one)) as never) as never,
        ((store.getNode(rootId)?.content ?? []) as unknown[]).length
      )
    ] as never).commit();
    return done.success === true ? this._box(editor) : undefined;
  }

  /**
   * A name nothing else is using, from what a reader typed or from the device.
   *
   * Durable and never shown: the `label` is what a reader reads, and this is what `overrides` keys.
   * Numbered rather than derived from the label, because a label is a reader's sentence and may be
   * anything at all — including a duplicate.
   */
  private _fresh(taken: SiteWidth[], wanted?: unknown): string {
    const ids = new Set(taken.map((one) => one.id));
    const said = typeof wanted === 'string' ? wanted.trim() : '';
    if (said && !ids.has(said)) return said;
    for (let n = taken.length + 1; ; n += 1) {
      const id = `width-${n}`;
      if (!ids.has(id)) return id;
    }
  }

  private async _insert(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const store = this._store(editor);
    const rootId = editor.getRootId();
    if (!store || !rootId) return false;

    const widths = this._widths(editor);
    const device = deviceNamed(payload?.device);
    /**
     * **A step narrower than the narrowest**, when nobody said.
     *
     * A reader pressing `+` wants *a width*, and a command that refused without a number would be a
     * control that lights up and does nothing — which the harness says out loud and is right to. Half
     * the narrowest, floored at 320, which is the narrowest screen anybody designs for and is what
     * the default three produce here: 390 becomes 320.
     */
    const narrowest = Math.min(...widths.map((one) => one.width));
    const size = Number(
      payload?.size ?? device?.width ?? Math.max(320, Math.round(narrowest / 2 / 10) * 10)
    );
    if (!Number.isFinite(size) || size <= 0) return false;

    const made = node('width', {
      name: this._fresh(widths, payload?.name),
      label: String(payload?.label ?? device?.label ?? `${Math.round(size)}px`),
      size: Math.round(size),
      viewport: Math.round(Number(payload?.viewport ?? device?.viewport ?? size)),
      icon: typeof payload?.icon === 'string' ? payload.icon : device?.icon,
      device: device?.name
    }) as never;

    /*
     * **The first one writes the whole list.** A document with no `widths` box is a document drawing
     * the three every site starts with, so adding a fourth has to write those three first — otherwise
     * the box holds one width, `widthsOf` returns it alone, and three boards silently become one.
     */
    const box = this._box(editor);
    const steps: unknown[] = [];
    if (box) {
      steps.push(addChild(box, made, ((store.getNode(box)?.content ?? []) as unknown[]).length));
    } else {
      steps.push(
        addChild(
          rootId,
          node(
            'widths',
            {},
            [...widths.map((one) => this._nodeOf(one)), made] as never
          ) as never,
          ((store.getNode(rootId)?.content ?? []) as unknown[]).length
        )
      );
    }

    const done = await transaction(editor, steps as never).commit();
    return done.success === true;
  }

  /** One of the built-in three, as a node — see `_insert`. */
  private _nodeOf(one: SiteWidth): unknown {
    return node('width', {
      name: one.id,
      label: one.label,
      size: one.width,
      viewport: one.viewport,
      icon: one.icon,
      device: one.device
    });
  }

  /**
   * Whether the document does not **already say** this one.
   *
   * Not *whether it is the base*, which is what this asked first and is the wrong comparison: the
   * base is the widest until the document says otherwise, so naming the width that already happens
   * to be widest is not a no-op — it moves the document from *implicitly the widest* to
   * **explicitly this**, and those are different documents.
   *
   * Which is also the gesture a reader needs most, and refusing it broke exactly the thing this
   * command exists for: pin the base, *then* add a wider board. The first version refused the pin
   * and the board silently became the base.
   */
  private _notBase(editor: Editor, name: unknown): boolean {
    const store = this._store(editor);
    const rootSid = editor.getRootId();
    if (!store || !rootSid) return false;

    const box = this._box(editor);
    const said = box ? store.getNode(box)?.attributes?.base : undefined;
    return said !== String(name ?? '');
  }

  private async _setBase(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._named(editor, payload?.name) || !this._notBase(editor, payload?.name)) return false;
    /*
     * The list has to exist as nodes first, the same reason every other write here calls this: a
     * document that has said nothing about widths draws at the default three, and those are a
     * **default rather than nodes** — which is what made 순서 이동 do nothing until it was measured.
     */
    await this._ensure(editor);
    const box = this._box(editor);
    if (!box) return false;

    const step = setAttrs(box, { base: String(payload!.name) });
    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  private async _set(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._named(editor, payload?.name)) return false;
    await this._ensure(editor);
    const sid = this._at(editor, payload?.name);
    if (!sid) return false;

    const device = deviceNamed(payload?.device);
    const said: Record<string, unknown> = {};
    if (typeof payload?.label === 'string') said.label = payload.label;
    if (Number.isFinite(Number(payload?.size))) said.size = Math.round(Number(payload!.size));
    if (Number.isFinite(Number(payload?.viewport))) said.viewport = Math.round(Number(payload!.viewport));
    if (typeof payload?.icon === 'string') said.icon = payload.icon;
    /* A device is a shorthand for the numbers, so choosing one writes them as well as itself. */
    if (device) {
      said.device = device.name;
      said.size = device.width;
      said.viewport = device.viewport;
      said.icon = device.icon;
      if (said.label === undefined) said.label = device.label;
    } else if (payload?.device === null || payload?.device === '') {
      said.device = undefined;
    }
    if (Object.keys(said).length === 0) return false;

    const done = await transaction(editor, [setAttrs(sid, said as never)] as never).commit();
    return done.success === true;
  }

  private _canRemove(editor: Editor, name: unknown): boolean {
    /* Never the last one: a site with no widths is a site with no boards. */
    return this._named(editor, name) && this._widths(editor).length > 1;
  }

  private async _remove(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canRemove(editor, payload?.name)) return false;
    await this._ensure(editor);
    const sid = this._at(editor, payload?.name);
    const box = this._box(editor);
    if (!sid || !box) return false;

    /*
     * The width goes; every `overrides` written at it **stays**. Deleting a width is not a reason to
     * destroy the work done at it, and a file that silently lost half a design because somebody
     * tidied a list is the worst kind of data loss — see `overridesOf`, which keeps what it finds.
     */
    const done = await transaction(editor, [removeChild(box, sid)] as never).commit();
    return done.success === true;
  }

  private _canMove(editor: Editor, name: unknown, to: unknown): boolean {
    if (!this._named(editor, name) || typeof to !== 'number' || !Number.isInteger(to)) return false;
    const widths = this._widths(editor);
    if (to < 0 || to >= widths.length) return false;
    /*
     * Asked of the **list the document is drawing at** rather than of the box, which may not exist
     * yet — and which is the same order either way, because `_ensure` writes it in that order.
     */
    return widths.findIndex((one) => one.id === name) !== to;
  }

  private async _move(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canMove(editor, payload?.name, payload?.to)) return false;
    await this._ensure(editor);
    const sid = this._at(editor, payload?.name);
    const box = this._box(editor);
    if (!sid || !box) return false;
    const to = Number(payload!.to);

    const tree = (editor as never as { exportDocument?: (s: string) => unknown }).exportDocument?.(sid);
    if (!tree) return false;

    const done = await transaction(editor, [
      removeChild(box, sid),
      addChild(box, tree as never, to)
    ] as never).commit();
    return done.success === true;
  }
}

export function createWidthCommands(): Extension {
  return new SiteWidthExtension();
}

/** Every device this product knows, for a panel offering the list. */
export { DEVICES };
