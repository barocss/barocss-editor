/**
 * A recorder for input typed by hand.
 *
 * The browser suite can drive the input path faster and more repeatably than a
 * person, and it still misses things — it types what it was told to type, on one
 * engine, through a synthesised IME. A reader at a real keyboard, with a real
 * IME, doing what they would actually do, reaches states no spec here has asked
 * for. What they cannot do is see why something went wrong: by the time a
 * character lands in the wrong place, the events that put it there are gone.
 *
 * So this keeps them. It records one timeline of everything that writes to the
 * document — beforeinput, composition, mutations, transactions, renders,
 * selection — takes a snapshot of the text before and after, and then asks the
 * questions that every input defect found so far would have failed:
 *
 *   - does the page show what the document holds?
 *   - did each character the browser announced arrive, once, in order?
 *   - was one keystroke written by two writers?
 *   - did anything render while an IME was composing?
 *   - did the caret end where the text it wrote ended?
 *
 * The answers go to disk with the timeline that produced them, so a failure can
 * be read after the fact instead of reproduced.
 */

export type Entry = { at: number; stage: string; [key: string]: unknown };

export type Finding = {
  /** `bug` is an invariant broken; `suspect` is a shape worth reading. */
  severity: 'bug' | 'suspect';
  what: string;
  detail: string;
};

export type Report = {
  scenario: string;
  title: string;
  startedAt: string;
  durationMs: number;
  /** What the browser said it was inserting, in order. */
  announced: string;
  /** Where the caret was when recording began — not necessarily where writing went. */
  caretAtStart: { sid: string; offset: number } | null;
  /** Where the first thing written went, and where the caret ended up. */
  caret: { sid: string; before: number; after: number; endedIn: string } | null;
  text: { sid: string; before: string; after: string; dom: string } | null;
  changed: { sid: string; before: string; after: string; dom: string }[];
  findings: Finding[];
  counts: Record<string, number>;
  timeline: Entry[];
};

/** The renderer's caret filler is bookkeeping, not text, and never counts. */
const FILLER = /﻿/g;

type Snapshot = Map<string, { model: string; dom: string }>;

const MAX_ENTRIES = 8000;

export class InputRecorder {
  private log: Entry[] = [];
  private t0 = 0;
  private startedAt = '';
  private before: Snapshot = new Map();
  private caretBefore: { sid: string; offset: number } | null = null;
  /** Where the first thing written actually went. See `onBeforeInput`. */
  private anchor: { sid: string; offset: number } | null = null;
  private observer: MutationObserver | null = null;
  private restore: (() => void)[] = [];
  private scenarioId = '';
  private scenarioTitle = '';
  private announced = '';
  private deleted = 0;
  private counts: Record<string, number> = {};

  constructor(
    private editor: any,
    private view: any
  ) {}

  get recording(): boolean {
    return this.t0 !== 0;
  }

  private at(): number {
    return Math.round(performance.now() - this.t0);
  }

  private push(stage: string, extra: Record<string, unknown> = {}): void {
    this.counts[stage] = (this.counts[stage] ?? 0) + 1;
    if (this.log.length >= MAX_ENTRIES) return;
    this.log.push({ at: this.at(), stage, ...extra });
  }

  private get element(): HTMLElement {
    return this.view.contentEditableElement ?? document.querySelector('.barocss-editor-content')!;
  }

  /**
   * Every node that holds text, as the document has it and as the page shows it.
   *
   * Both are needed because the fault that has outlived every other one is the
   * two disagreeing — the document right, the page a few characters behind.
   */
  private snapshot(): Snapshot {
    const snap: Snapshot = new Map();
    const store = this.editor.dataStore;
    for (const el of Array.from(this.element.querySelectorAll('[data-bc-sid]'))) {
      const sid = el.getAttribute('data-bc-sid');
      if (!sid) continue;
      const node = store?.getNode?.(sid);
      if (typeof node?.text !== 'string') continue;
      snap.set(sid, { model: node.text, dom: (el.textContent ?? '').replace(FILLER, '') });
    }
    return snap;
  }

  private caretNow(): { sid: string; offset: number } | null {
    const selection = this.editor.selection;
    if (!selection?.startNodeId) return null;
    return { sid: selection.startNodeId, offset: selection.startOffset ?? 0 };
  }

  start(scenario: { id: string; title: string }): void {
    if (this.recording) this.stop();

    this.scenarioId = scenario.id;
    this.scenarioTitle = scenario.title;
    this.log = [];
    this.counts = {};
    this.announced = '';
    this.deleted = 0;
    this.t0 = performance.now();
    this.startedAt = new Date().toISOString();
    this.before = this.snapshot();
    this.caretBefore = this.caretNow();
    this.anchor = null;

    const el = this.element;

    // Capture phase for the record, bubble phase for the verdict: one says what
    // arrived, the other says whether the editor stopped it.
    const onBeforeInput = (event: InputEvent) => {
      // Where the writing actually started, which is not where the caret was
      // when the button was pressed. A reader presses 시작, *then* puts the caret
      // where the scenario says — measured on the first recording made by hand,
      // where the caret moved to another node in between and every check that
      // used the starting position judged a paragraph nobody had typed in.
      this.anchor ??= this.caretNow();
      this.push('beforeinput', {
        inputType: event.inputType,
        data: event.data,
        isComposing: event.isComposing,
        composingFlag: this.view._isComposing === true
      });
      if (!event.isComposing) {
        if (event.inputType === 'insertText' && event.data) this.announced += event.data;
        if (event.inputType.startsWith('delete')) this.deleted += 1;
      }
    };
    const onBeforeInputAfter = (event: InputEvent) =>
      this.push('beforeinput:after', { inputType: event.inputType, prevented: event.defaultPrevented });
    const onInput = (event: InputEvent) =>
      this.push('input', { inputType: event.inputType, isComposing: event.isComposing });
    const onKeydown = (event: KeyboardEvent) => {
      // What the door would answer, asked at the moment the key arrives. A
      // character refused at keydown never fires `beforeinput`, so nothing
      // downstream can put it right — and a recording of six spaces that simply
      // vanished could say only that they had, not why.
      let gate: boolean | null = null;
      try {
        gate = this.view.isSelectionInsideEditableText?.() === true;
      } catch {
        gate = null;
      }
      const selection = window.getSelection();
      const anchor = selection?.anchorNode ?? null;
      const host =
        anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as Element | null);
      const nearest = host?.closest?.('[data-bc-sid]')?.getAttribute('data-bc-sid') ?? null;
      this.push('keydown', {
        key: event.key,
        keyCode: event.keyCode,
        composingFlag: this.view._isComposing === true,
        gate,
        burst: this.view.inputHandler?.isTypingBurst === true,
        anchorIsText: anchor?.nodeType === Node.TEXT_NODE,
        nearestSid: nearest,
        modelSid: this.editor.selection?.startNodeId ?? null
      });
    };
    const onKeydownAfter = (event: KeyboardEvent) =>
      this.push('keydown:after', { key: event.key, prevented: event.defaultPrevented });
    const onCompositionStart = () => {
      this.anchor ??= this.caretNow();
      this.push('compositionstart', { composingFlag: this.view._isComposing === true });
    };
    const onCompositionUpdate = (event: CompositionEvent) => this.push('compositionupdate', { data: event.data });
    const onCompositionEnd = (event: CompositionEvent) => {
      this.push('compositionend', { data: event.data });
      if (event.data) this.announced += event.data;
    };
    const onSelectionChange = () => {
      const caret = this.caretNow();
      if (caret) this.push('selection', { sid: caret.sid, offset: caret.offset });
    };

    el.addEventListener('beforeinput', onBeforeInput as EventListener, true);
    el.addEventListener('beforeinput', onBeforeInputAfter as EventListener, false);
    el.addEventListener('input', onInput as EventListener, true);
    el.addEventListener('keydown', onKeydown, true);
    el.addEventListener('keydown', onKeydownAfter, false);
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionupdate', onCompositionUpdate as EventListener);
    el.addEventListener('compositionend', onCompositionEnd as EventListener);
    document.addEventListener('selectionchange', onSelectionChange);

    this.restore.push(() => {
      el.removeEventListener('beforeinput', onBeforeInput as EventListener, true);
      el.removeEventListener('beforeinput', onBeforeInputAfter as EventListener, false);
      el.removeEventListener('input', onInput as EventListener, true);
      el.removeEventListener('keydown', onKeydown, true);
      el.removeEventListener('keydown', onKeydownAfter, false);
      el.removeEventListener('compositionstart', onCompositionStart);
      el.removeEventListener('compositionupdate', onCompositionUpdate as EventListener);
      el.removeEventListener('compositionend', onCompositionEnd as EventListener);
      document.removeEventListener('selectionchange', onSelectionChange);
    });

    /**
     * Where each DOM change landed, and whether the observer's own guard would
     * have turned it away.
     *
     * The guard declines records while characters are arriving one after another
     * and no composition is open. Reading the same two flags here says, for each
     * batch, which side of that test it fell on — which is the difference
     * between a record the editor read and one it never saw.
     */
    this.observer = new MutationObserver((records) => {
      const composing = this.view._isComposing === true;
      const burst = this.view.inputHandler?.isTypingBurst === true;
      const surface = records.filter((record) => {
        const target = record.target as Node;
        const host = target.nodeType === Node.TEXT_NODE ? target.parentElement : (target as Element);
        return !!host?.closest?.('.w-surface');
      });
      if (surface.length === 0) return;
      this.push('mutation', {
        n: surface.length,
        types: Array.from(new Set(surface.map((r) => r.type))).join('+'),
        guardWouldDrop: !composing && burst,
        composing,
        burst
      });
    });
    this.observer.observe(el, { subtree: true, childList: true, characterData: true });

    const emit = this.editor.emit.bind(this.editor);
    this.editor.emit = (name: string, payload: any) => {
      if (name === 'editor:content.change') {
        const operations = payload?.transaction?.operations ?? [];
        this.push('transaction', {
          ops: operations.map((operation: any) => operation?.type).join('+'),
          from: payload?.from ?? '?',
          skipRender: payload?.skipRender === true
        });
      }
      return emit(name, payload);
    };
    this.restore.push(() => {
      this.editor.emit = emit;
    });

    const render = this.view.render.bind(this.view);
    this.view.render = (...args: unknown[]) => {
      this.push('render:start', { composing: this.view._isComposing === true });
      const result = render(...args);
      this.push('render:end');
      return result;
    };
    this.restore.push(() => {
      this.view.render = render;
    });
  }

  stop(): Report {
    const durationMs = this.at();
    for (const undo of this.restore.splice(0)) undo();
    this.observer?.disconnect();
    this.observer = null;

    const after = this.snapshot();
    const caretAfter = this.caretNow();

    const changed: Report['changed'] = [];
    for (const [sid, now] of after) {
      const then = this.before.get(sid);
      if (!then) continue;
      if (then.model !== now.model || then.dom !== now.dom) {
        changed.push({ sid, before: then.model, after: now.model, dom: now.dom });
      }
    }

    const caretSid = this.anchor?.sid ?? this.caretBefore?.sid ?? caretAfter?.sid ?? null;
    const caretNode = caretSid
      ? {
          sid: caretSid,
          before: this.before.get(caretSid)?.model ?? '',
          after: after.get(caretSid)?.model ?? '',
          dom: after.get(caretSid)?.dom ?? ''
        }
      : null;

    const report: Report = {
      scenario: this.scenarioId,
      title: this.scenarioTitle,
      startedAt: this.startedAt,
      durationMs,
      announced: this.announced,
      caretAtStart: this.caretBefore,
      caret:
        this.anchor && caretAfter
          ? {
              sid: this.anchor.sid,
              before: this.anchor.offset,
              after: caretAfter.sid === this.anchor.sid ? caretAfter.offset : -1,
              endedIn: caretAfter.sid
            }
          : null,
      text: caretNode,
      changed,
      findings: [],
      counts: this.counts,
      timeline: this.log
    };
    report.findings = this.judge(report, after);

    this.t0 = 0;
    return report;
  }

  /**
   * The questions, asked of the recording.
   *
   * Each one is an invariant that a defect already found in this editor broke.
   * None of them depend on knowing what the reader meant to type — only on what
   * the browser announced and what the document and page then held.
   */
  private judge(report: Report, after: Snapshot): Finding[] {
    const findings: Finding[] = [];

    // 1. The page must show what the document holds. Every other fault here is
    //    survivable; this one is the reader watching their own text be wrong.
    for (const [sid, now] of after) {
      if (now.model !== now.dom) {
        findings.push({
          severity: 'bug',
          what: '문서와 화면이 다릅니다',
          detail: `${sid}\n  문서: ${JSON.stringify(now.model)}\n  화면: ${JSON.stringify(now.dom)}`
        });
      }
    }

    // 2. Every character the browser announced must have arrived, once, in the
    //    order it was announced. Only checkable when nothing was deleted — a
    //    delete moves text this cannot account for.
    if (report.text && this.deleted === 0 && report.announced) {
      const at = report.caret?.before ?? 0;
      const expected =
        report.text.before.slice(0, at) + report.announced + report.text.before.slice(at);
      if (report.text.after !== expected) {
        findings.push({
          severity: 'bug',
          what: '입력한 것과 문서에 들어간 것이 다릅니다',
          detail:
            `announced: ${JSON.stringify(report.announced)} at ${at}\n` +
            `  기대: ${JSON.stringify(expected)}\n` +
            `  실제: ${JSON.stringify(report.text.after)}`
        });
      }
    }

    /**
     * 3. One write, one writer.
     *
     * Counted against every `beforeinput`, composing or not. Composing ones
     * were left out at first, and the count then read a Korean session as 9
     * keystrokes against 117 transactions and called it a double write — when
     * 131 of those keystrokes were composition steps, each of which legitimately
     * produces exactly one transaction as the observer imports what the IME
     * wrote. A check that cannot count the writing it is judging is worse than
     * no check.
     */
    const keystrokes = this.log.filter((entry) => entry.stage === 'beforeinput').length;
    const transactions = this.log.filter(
      (entry) => entry.stage === 'transaction' && entry.skipRender !== true
    ).length;
    if (keystrokes > 0 && transactions > keystrokes) {
      findings.push({
        severity: 'suspect',
        what: '키 입력보다 트랜잭션이 많습니다',
        detail: `beforeinput ${keystrokes}회에 트랜잭션 ${transactions}회 — 한 번의 입력을 두 곳에서 썼을 수 있습니다.`
      });
    }

    /**
     * 4. A key that was typed must become an input.
     *
     * `beforeinput` is where every character enters, so a keystroke that never
     * fires one is gone for good — nothing downstream can put it right. This is
     * what a recording of six spaces in a row looked like: six keydowns and then
     * nothing at all, no input, no transaction, no mutation. The keys had been
     * refused at the door, and the recording could only say that they had
     * vanished, not where.
     */
    const swallowed: Entry[] = [];
    for (let index = 0; index < this.log.length; index += 1) {
      const entry = this.log[index];
      if (entry.stage !== 'keydown') continue;
      const key = String(entry.key ?? '');
      // Only keys that carry a character, and not the ones an IME has taken —
      // those are answered by composition, not by an input of their own.
      if (key.length !== 1 || entry.keyCode === 229 || entry.composingFlag === true) continue;
      let becameInput = false;
      for (let ahead = index + 1; ahead < this.log.length; ahead += 1) {
        const next = this.log[ahead];
        if (next.stage === 'keydown' || next.stage === 'compositionstart') break;
        if (next.stage === 'beforeinput') {
          becameInput = true;
          break;
        }
      }
      if (!becameInput) swallowed.push(entry);
    }
    if (swallowed.length > 0) {
      const first = swallowed[0];
      findings.push({
        severity: 'bug',
        what: '친 글자가 입력으로 이어지지 않았습니다',
        detail:
          `${swallowed.length}개: ${swallowed.map((entry) => JSON.stringify(entry.key)).join(', ')}\n` +
          `  첫 번째 ${first.at}ms — 편집 가능 판정 ${first.gate}, 연타 ${first.burst}, ` +
          `커서가 가리키는 노드 ${first.nearestSid}, 문서상 노드 ${first.modelSid}`
      });
    }

    // 5. Nothing may render while an IME is composing: the composed text is
    //    already in the DOM, and redrawing under it commits the half-built
    //    syllable and strands the piece it was holding.
    const rendersWhileComposing = this.log.filter(
      (entry) => entry.stage === 'render:start' && entry.composing === true
    ).length;
    if (rendersWhileComposing > 0) {
      findings.push({
        severity: 'bug',
        what: '조합 중에 렌더가 일어났습니다',
        detail: `${rendersWhileComposing}회 — 조합 중 렌더는 만들던 음절을 확정시키고 조각을 남깁니다.`
      });
    }

    // 6. The flag that says a composition is open must not outlive one. While it
    //    is set, a content change is dropped without drawing and without being
    //    remembered.
    if (this.view._isComposing === true) {
      findings.push({
        severity: 'bug',
        what: '조합이 끝났는데 조합 상태가 남아 있습니다',
        detail: '이 상태에서는 타이핑이 아닌 변경(명령·주석·다른 작성자)이 화면에 그려지지 않습니다.'
      });
    }

    // 7. Records the observer's guard turned away. Expected while the editor is
    //    redrawing its own typing; worth reading if an IME wrote in that window.
    const dropped = this.log.filter((entry) => entry.stage === 'mutation' && entry.guardWouldDrop === true);
    const droppedDuringComposition = dropped.filter((entry) => entry.composing === true).length;
    if (droppedDuringComposition > 0) {
      findings.push({
        severity: 'bug',
        what: 'IME가 쓴 기록을 관찰자가 버렸습니다',
        detail: `${droppedDuringComposition}건 — 조합 결과가 화면에만 있고 문서에 없을 수 있습니다.`
      });
    }

    // 8. How much drawing one keystroke costs. Two renders a keystroke is the
    //    measured resting state — the content render and the layout pass that
    //    follows it — so this only speaks up well past that, where the cost is
    //    the thing making the page trail the document under load.
    const renders = this.log.filter((entry) => entry.stage === 'render:start').length;
    if (keystrokes > 0 && renders > keystrokes * 3) {
      findings.push({
        severity: 'suspect',
        what: '입력 한 번에 렌더가 지나치게 많습니다',
        detail: `입력 ${keystrokes}회에 렌더 ${renders}회 — 부하가 걸리면 화면이 문서를 못 따라오는 원인이 됩니다.`
      });
    }

    // 9. The caret must end where the text it wrote ended. "The letter goes in
    //    one place to the left" is this, seen from the reader's chair.
    if (report.caret && report.text && this.deleted === 0 && report.announced) {
      if (report.caret.after === -1) {
        findings.push({
          severity: 'suspect',
          what: '커서가 다른 노드로 갔습니다',
          detail: `입력은 ${report.caret.sid} 에서 시작했는데 커서는 ${report.caret.endedIn} 에 있습니다.`
        });
      }
      const expected = report.caret.before + report.announced.length;
      if (report.caret.after !== -1 && report.caret.after !== expected) {
        findings.push({
          severity: 'suspect',
          what: '커서가 쓴 글자 끝에 있지 않습니다',
          detail: `기대 ${expected}, 실제 ${report.caret.after} — 입력 도중 커서가 되돌아갔을 수 있습니다.`
        });
      }
    }

    return findings;
  }
}
