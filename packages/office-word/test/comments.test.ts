import { describe, it, expect } from 'vitest';
import { commentThreads, freeThreadId } from '../src/comments';
import type { DocumentAccess, DocumentNode } from '../src/document-access';

/**
 * Reading the comments on a document.
 *
 * A comment is two things that have to stay together: a thread among the
 * resources, which is who said what and when, and a mark over the text it is
 * about, which is the only part that survives anyone typing above it.
 */
const docOf = (nodes: Record<string, DocumentNode>, rootId = 'root'): DocumentAccess => ({
  getNode: (id: string) => nodes[id],
  rootId
});

/** A document with one paragraph and whatever threads are given. */
const withThreads = (
  threads: DocumentNode[],
  marks: NonNullable<DocumentNode['marks']> = []
): DocumentAccess => {
  const nodes: Record<string, DocumentNode> = {
    root: { sid: 'root', stype: 'document', content: ['res', 'body'] },
    res: { sid: 'res', stype: 'resources', content: threads.map((t) => t.sid!) },
    body: { sid: 'body', stype: 'body', content: ['p'] },
    p: { sid: 'p', stype: 'paragraph', content: ['t'] },
    t: { sid: 't', stype: 'inline-text', text: 'The quick brown fox', marks }
  };
  for (const thread of threads) {
    nodes[thread.sid!] = thread;
    for (const child of thread.content ?? []) {
      if (typeof child !== 'string') nodes[child.sid!] = child;
    }
  }
  return docOf(nodes);
};

const entry = (sid: string, author: string, text: string): DocumentNode => ({
  sid,
  stype: 'paragraph',
  attributes: { author, date: '2026-08-10' },
  content: [{ sid: `${sid}-t`, stype: 'inline-text', text }]
});

const thread = (id: string, entries: DocumentNode[], resolved = false): DocumentNode => ({
  sid: `thread-${id}`,
  stype: 'commentThread',
  attributes: { id, resolved },
  content: entries
});

describe('reading comments', () => {
  it('reports who said what, and where it is anchored', () => {
    const doc = withThreads(
      [thread('c1', [entry('e1', 'Jinho', 'Is this right?')])],
      [{ stype: 'commentRef', range: [4, 9], attrs: { id: 'c1' } }]
    );

    expect(commentThreads(doc)).toEqual([
      {
        id: 'c1',
        sid: 'thread-c1',
        resolved: false,
        entries: [{ sid: 'e1', author: 'Jinho', date: '2026-08-10', text: 'Is this right?' }],
        anchor: { sid: 't', start: 4, end: 9 }
      }
    ]);
  });

  it('keeps replies in order behind the comment they answer', () => {
    const doc = withThreads([
      thread('c1', [entry('e1', 'Jinho', 'Is this right?'), entry('e2', 'Sujin', 'It is now')])
    ]);
    expect(commentThreads(doc)[0].entries.map((e) => e.author)).toEqual(['Jinho', 'Sujin']);
  });

  it('keeps a thread whose anchor is gone', () => {
    // Deleting the text a comment was about should not silently delete what
    // somebody wrote about it. A pane can say it has lost its place; it cannot
    // say what it said if the thread is dropped here.
    const doc = withThreads([thread('c1', [entry('e1', 'Jinho', 'Still here')])]);
    const [only] = commentThreads(doc);
    expect(only.anchor).toBeUndefined();
    expect(only.entries[0].text).toBe('Still here');
  });

  it('carries whether the thread has been settled', () => {
    const doc = withThreads([thread('c1', [entry('e1', 'Jinho', 'Done?')], true)]);
    expect(commentThreads(doc)[0].resolved).toBe(true);
  });

  it('takes the first anchor when a comment is marked twice', () => {
    // A document fault either way; taking the later one would move the comment
    // as soon as the earlier text was edited.
    const doc = withThreads(
      [thread('c1', [entry('e1', 'Jinho', 'x')])],
      [
        { stype: 'commentRef', range: [0, 3], attrs: { id: 'c1' } },
        { stype: 'commentRef', range: [10, 15], attrs: { id: 'c1' } }
      ]
    );
    expect(commentThreads(doc)[0].anchor).toEqual({ sid: 't', start: 0, end: 3 });
  });

  it('ignores marks and threads that name nothing', () => {
    const doc = withThreads(
      [{ sid: 'nameless', stype: 'commentThread', attributes: {}, content: [] }],
      [{ stype: 'commentRef', range: [0, 3] }]
    );
    expect(commentThreads(doc)).toEqual([]);
  });

  it('finds none in a document that has no resources', () => {
    expect(commentThreads(docOf({ root: { sid: 'root', stype: 'document' } }))).toEqual([]);
  });
});

describe('naming a new thread', () => {
  it('avoids the ids already in use', () => {
    const doc = withThreads([
      thread('comment-1', [entry('e1', 'Jinho', 'a')]),
      thread('comment-2', [entry('e2', 'Jinho', 'b')])
    ]);
    expect(freeThreadId(doc)).toBe('comment-3');
  });
});
