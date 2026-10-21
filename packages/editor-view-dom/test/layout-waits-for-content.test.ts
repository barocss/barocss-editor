import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Editor } from '@barocss/editor-core';
import { RendererRegistry, define, element, slot, data, intoRegistry } from '@barocss/dsl';
import { FiberScheduler } from '../../renderer-dom/src/reconcile/fiber/fiber-scheduler';
import { EditorViewDOM } from '../src/editor-view-dom';

describe('layout after content reconciliation', () => {
  let editor: Editor;
  let view: EditorViewDOM;
  let container: HTMLElement;
  let idle: Array<() => void>;
  let clock: number;

  const tree = (sid = 'doc') => ({ sid, stype: 'document', content: [
    { sid: `${sid}-p`, stype: 'paragraph', content: [
      { sid: `${sid}-text`, stype: 'inline-text', text: sid }
    ] }
  ] });

  const finishContent = () => {
    // Drive the actual Fiber scheduler, including any layout-induced renders.
    // A broken unbounded completion loop fails instead of hanging the test.
    for (let step = 0; idle.length && step < 500; step++) idle.shift()!();
    expect(idle).toHaveLength(0);
  };

  beforeEach(() => {
    idle = [];
    clock = 0;
    const registry = new RendererRegistry({ global: false });
    intoRegistry(registry, () => {
      define('document', element('div', { className: 'document' }, [slot('content')]));
      define('paragraph', element('p', {}, [slot('content')]));
      define('inline-text', element('span', {}, [data('text')]));
    });
    container = document.createElement('div');
    document.body.append(container);
    editor = new Editor({ dataStore: new DataStore() });
    view = new EditorViewDOM(editor, { container, registry, autoRender: false });

    // Tests normally force Fiber synchronous. Exercise its real yielding path
    // deterministically, without a large fixture or a wall-clock threshold.
    const schedule = FiberScheduler.prototype.scheduleWork;
    vi.spyOn(FiberScheduler.prototype, 'scheduleWork').mockImplementation(function (this: FiberScheduler, root, priority) {
      this.setSyncMode(false);
      schedule.call(this, root, priority);
    });
    vi.spyOn(performance, 'now').mockImplementation(() => clock += 3);
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => { idle.push(callback); return idle.length; });
  });

  afterEach(() => {
    view.destroy();
    editor.destroy();
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('measures committed content and applies its environment to the next completed render', () => {
    const observed: string[] = [];
    view.registerLayoutPass(() => {
      observed.push(container.querySelector('p')?.textContent ?? 'UNFINISHED');
      if (!view.getEnv().measured) return { measured: true };
    });
    view.render(tree());
    expect(observed).toEqual([]);
    finishContent();
    expect(observed).toEqual(['doc', 'doc']);
    expect(view.getEnv().measured).toBe(true);
  });

  it('keeps the three-round budget across asynchronous completions', () => {
    const pass = vi.fn(() => ({ unstable: clock }));
    view.registerLayoutPass(pass);
    view.render(tree(), { sync: true });
    finishContent();
    expect(pass).toHaveBeenCalledTimes(3);
    // A new external render receives its own bounded convergence attempt.
    view.render(undefined, { sync: true });
    finishContent();
    expect(pass).toHaveBeenCalledTimes(6);
  });

  it('retires a replaced render and measures only its successor', () => {
    const observed: string[] = [];
    view.registerLayoutPass(() => { observed.push(container.querySelector('p')?.textContent ?? 'UNFINISHED'); });
    view.render(tree('old'), { sync: true });
    view.render(tree('new'), { sync: true });
    finishContent();
    expect(observed).toEqual(['new']);
  });

  it('does not run a layout pass after disposal while content is pending', () => {
    const pass = vi.fn();
    view.registerLayoutPass(pass);
    view.render(tree(), { sync: true });
    view.destroy();
    finishContent();
    expect(pass).not.toHaveBeenCalled();
  });

  it.each(['root', 'epoch'] as const)('retires completion when the document %s changes before another render', (owner) => {
    let root = 'original-root';
    let epoch = 1;
    vi.spyOn(editor, 'getRootId').mockImplementation(() => root);
    vi.spyOn(editor.dataStore, 'getDocumentEpoch').mockImplementation(() => epoch);
    const pass = vi.fn();
    view.registerLayoutPass(pass);
    view.render(tree(), { sync: true });
    if (owner === 'root') root = 'replacement-root';
    else epoch++;
    finishContent();
    expect(pass).not.toHaveBeenCalled();
  });

  it('defers completion-driven layout through an open composition and resumes after its end', async () => {
    const pass = vi.fn();
    view.registerLayoutPass(pass);
    view.render(tree(), { sync: true });
    view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionstart'));
    finishContent();
    expect(pass).not.toHaveBeenCalled();
    view.contentEditableElement.dispatchEvent(new CompositionEvent('compositionend'));
    await new Promise(resolve => setTimeout(resolve, 0));
    finishContent();
    expect(pass).toHaveBeenCalledTimes(1);
  });

  it('preserves the synchronous completion and convergence path', () => {
    vi.restoreAllMocks();
    const observed: string[] = [];
    view.registerLayoutPass(() => {
      observed.push(container.querySelector('p')?.textContent ?? 'UNFINISHED');
      if (!view.getEnv().measured) return { measured: true };
    });
    view.render(tree(), { sync: true });
    expect(observed).toEqual(['doc', 'doc']);
    expect(idle).toHaveLength(0);
  });
});
