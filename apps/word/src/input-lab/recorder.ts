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
  caret: { sid: string; before: number; after: number } | null;
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

    const el = this.element;

    // Capture phase for the record, bubble phase for the verdict: one says what
    // arrived, the other says whether the editor stopped it.
    const onBeforeInput = (event: InputEvent) => {
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
    const onKeydown = (event: KeyboardEvent) =>
      this.push('keydown', { key: event.key, keyCode: event.keyCode, composingFlag: this.view._isComposing === true });
    const onCompositionStart = () => this.push('compositionstart', { composingFlag: this.view._isComposing === true });
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
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionupdate', onCompositionUpdate as EventListener);
    el.addEventListener('compositionend', onCompositionEnd as EventListener);
    document.addEventListener('selectionchange', onSelectionChange);

    this.restore.push(() => {
      el.removeEventListener('beforeinput', onBeforeInput as EventListener, true);
      el.removeEventListener('beforeinput', onBeforeInputAfter as EventListener, false);
      el.removeEventListener('input', onInput as EventListener, true);
      el.removeEventListener('keydown', onKeydown, true);
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

    const caretSid = this.caretBefore?.sid ?? caretAfter?.sid ?? null;
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
      caret:
        this.caretBefore && caretAfter
          ? { sid: caretAfter.sid, before: this.caretBefore.offset, after: caretAfter.offset }
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

    // 3. One keystroke, one writer. A second transaction carrying the same
    //    operations is the observer importing what the command already wrote.
    const keystrokes = this.log.filter(
      (entry) => entry.stage === 'beforeinput' && entry.isComposing !== true
    ).length;
    const transactions = this.log.filter(
      (entry) => entry.stage === 'transaction' && entry.skipRender !== true
    ).length;
    if (keystrokes > 0 && transactions > keystrokes) {
      findings.push({
        severity: 'suspect',
        what: '키 입력보다 트랜잭션이 많습니다',
        detail: `beforeinput ${keystrokes}회에 트랜잭션 ${transactions}회 — 한 키를 두 곳에서 썼을 수 있습니다.`
      });
    }

    // 4. Nothing may render while an IME is composing: the composed text is
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

    // 5. The flag that says a composition is open must not outlive one. While it
    //    is set, a content change is dropped without drawing and without being
    //    remembered.
    if (this.view._isComposing === true) {
      findings.push({
        severity: 'bug',
        what: '조합이 끝났는데 조합 상태가 남아 있습니다',
        detail: '이 상태에서는 타이핑이 아닌 변경(명령·주석·다른 작성자)이 화면에 그려지지 않습니다.'
      });
    }

    // 6. Records the observer's guard turned away. Expected while the editor is
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

    // 7. How much drawing one keystroke costs. Two renders a keystroke is the
    //    measured resting state — the content render and the layout pass that
    //    follows it — so this only speaks up well past that, where the cost is
    //    the thing making the page trail the document under load.
    const renders = this.log.filter((entry) => entry.stage === 'render:start').length;
    if (keystrokes > 0 && renders > keystrokes * 3) {
      findings.push({
        severity: 'suspect',
        what: '한 키에 렌더가 지나치게 많습니다',
        detail: `키 ${keystrokes}회에 렌더 ${renders}회 — 부하가 걸리면 화면이 문서를 못 따라오는 원인이 됩니다.`
      });
    }

    // 8. The caret must end where the text it wrote ended. "The letter goes in
    //    one place to the left" is this, seen from the reader's chair.
    if (report.caret && report.text && this.deleted === 0 && report.announced) {
      const expected = report.caret.before + report.announced.length;
      if (report.caret.after !== expected) {
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
