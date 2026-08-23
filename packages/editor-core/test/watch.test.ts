import { describe, it, expect, vi } from 'vitest';
import { Editor } from '../src/editor';
import { watchAnswers, watchContent } from '../src/watch';
import { createSchema, getStandardSchemaDefinition } from '@barocss/schema';

/**
 * "Tell me when something could change what I would answer."
 *
 * The interesting part is not that a listener is called — it is **which events
 * count**, and that was the bug. Six panels across two products each chose their
 * own set of event names and chose three different sets, and the one that mattered
 * was the one Word left out: a selection *cleared* is announced on
 * `editor:selection.change` and nowhere else, so a toolbar listening only for
 * `selection.model` kept describing a selection that no longer existed.
 *
 * Which is why this is here and not in a browser: the question is arithmetic over
 * an event vocabulary, so it is milliseconds, and the answer stops being a thing
 * each panel guesses at.
 */
const schema = createSchema('standard-watch', getStandardSchemaDefinition());
const anEditor = () => new Editor({ schema } as never);

describe('watching for anything that could change an answer', () => {
  it('reads once as soon as it is watching', () => {
    const editor = anEditor();
    const reread = vi.fn();

    watchAnswers(editor, reread);

    // Not a wasted call. A document is loaded asynchronously, so a content event
    // can be emitted between a panel deciding to subscribe and the subscription
    // existing — and an event nobody is listening to yet never arrives. Without
    // this a panel reads the document once, before there is one, and never again.
    expect(reread).toHaveBeenCalledTimes(1);
  });

  it('hears a selection that is set', () => {
    const editor = anEditor();
    const reread = vi.fn();
    watchAnswers(editor, reread);
    reread.mockClear();

    editor.emit('editor:selection.model', {});

    expect(reread).toHaveBeenCalledTimes(1);
  });

  /** The one that was missing, and the reason this function exists. */
  it('hears a selection that is cleared', () => {
    const editor = anEditor();
    const reread = vi.fn();
    watchAnswers(editor, reread);
    reread.mockClear();

    // What `updateSelection(null)` emits, and all it emits — `deleteTable` calls
    // exactly that when it succeeds. A panel watching only the model event learns
    // nothing here and goes on describing cells that have been deleted.
    editor.emit('editor:selection.change', null);

    expect(reread, '지워진 선택을 듣지 못했습니다').toHaveBeenCalledTimes(1);
  });

  it('hears the content change under a selection that has not moved', () => {
    const editor = anEditor();
    const reread = vi.fn();
    watchAnswers(editor, reread);
    reread.mockClear();

    // Type a character: the range is the same and the summary of what is inside
    // it is different.
    editor.emit('editor:content.change', {});

    expect(reread).toHaveBeenCalledTimes(1);
  });

  it('stops when it is let go', () => {
    const editor = anEditor();
    const reread = vi.fn();
    const stop = watchAnswers(editor, reread);
    reread.mockClear();

    stop();
    editor.emit('editor:selection.model', {});
    editor.emit('editor:selection.change', null);
    editor.emit('editor:content.change', {});

    // Every one of the three, because unsubscribing one of them and leaving the
    // others is a leak that only shows up as a panel updating after it is gone.
    expect(reread).not.toHaveBeenCalled();
  });

  it('is a no-op without an editor, rather than a crash', () => {
    const reread = vi.fn();
    // A panel is mounted before its editor exists — every one of these takes
    // `Editor | null` for that reason, and the effect runs on the first render.
    const stop = watchAnswers(null, reread);
    expect(reread).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });
});

describe('watching only the document', () => {
  it('hears the content and ignores the selection', () => {
    const editor = anEditor();
    const reread = vi.fn();
    watchContent(editor, reread);
    reread.mockClear();

    editor.emit('editor:selection.model', {});
    editor.emit('editor:selection.change', null);
    expect(reread, '문서만 읽는 창이 캐럿 이동에 다시 읽었습니다').not.toHaveBeenCalled();

    editor.emit('editor:content.change', {});
    expect(reread).toHaveBeenCalledTimes(1);
  });
});
