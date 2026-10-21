import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as Y from 'yjs';
import { ProseReplica, PROSE_LIMITS } from '../src/prose.ts';

function sync(a: ProseReplica, b: ProseReplica): void {
  const left = a.exportUpdate();
  const right = b.exportUpdate();
  a.receive(right); b.receive(left);
  assert.equal(a.text, b.text);
  assert.deepEqual(a.runs, b.runs);
}

test('two independent Yjs clients preserve simultaneous same-paragraph input and marks', () => {
  const a = new ProseReplica('tab-a');
  a.insert(0, '한글 alpha');
  const b = new ProseReplica('tab-b', a.exportUpdate());
  try {
    a.insert(3, 'A'); b.insert(3, 'B');
    a.mark(0, 2, 'bold', true); b.mark(5, 2, 'italic', true);
    sync(a, b);
    assert.match(a.text, /A/); assert.match(a.text, /B/);
    assert(a.runs.some(run => run.attributes?.bold));
    assert(a.runs.some(run => run.attributes?.italic));
  } finally { a.destroy(); b.destroy(); }
});

test('relative selections follow remote edits and paragraph split/join retains remote text and marks', () => {
  const a = new ProseReplica('a'); a.insert(0, 'hello world'); a.mark(6, 5, 'bold', true);
  const b = new ProseReplica('b', a.exportUpdate());
  try {
    const anchor = a.anchor(6);
    a.split(6); b.insert(6, 'remote '); sync(a, b);
    assert.equal(a.paragraphs.length, 2);
    assert.equal(a.resolve(anchor), b.resolve(anchor));
    assert.equal(a.text.slice(a.resolve(anchor) ?? -1), 'world');
    a.join(a.text.indexOf('\n')); b.insert(b.text.length, '!'); sync(a, b);
    assert.equal(a.paragraphs.length, 1);
    assert.match(a.text, /remote /); assert.match(a.text, /world!/);
    assert(a.runs.some(run => run.insert.includes('world') && run.attributes?.bold));
  } finally { a.destroy(); b.destroy(); }
});

test('session-local undo preserves remote edits, including another tab of the same controlled user', () => {
  const seed = new ProseReplica('seed'); seed.insert(0, 'base');
  const a = new ProseReplica('same-user-tab-a', seed.exportUpdate());
  const b = new ProseReplica('same-user-tab-b', seed.exportUpdate());
  try {
    a.insert(4, '-local'); b.insert(0, 'remote-'); sync(a, b);
    assert.equal(a.undo(), true); sync(a, b);
    assert.equal(a.text, 'remote-base');
    assert.equal(a.redo(), true); sync(a, b);
    assert.equal(a.text, 'remote-base-local');
    const fresh = new ProseReplica('reloaded-session', a.exportUpdate());
    try { assert.equal(fresh.undo(), false); } finally { fresh.destroy(); }
  } finally { seed.destroy(); a.destroy(); b.destroy(); }
});

test('split undo preserves text from a remote paragraph edit; unsupported block operations refuse', () => {
  const a = new ProseReplica('a'); a.insert(0, 'left right');
  const b = new ProseReplica('b', a.exportUpdate());
  try {
    a.split(5); b.receive(a.exportUpdate()); b.insert(6, 'new '); a.receive(b.exportUpdate());
    assert.equal(a.undo(), true); sync(a, b);
    assert.equal(a.text, 'left new right');
    assert.throws(() => a.moveParagraph(), /unsupported/);
    assert.throws(() => a.deleteParagraph(), /unsupported/);
    assert.throws(() => a.insert(-1, 'bad'), /range/);
  } finally { a.destroy(); b.destroy(); }
});

test('malformed bytes, embeds, unknown roots and unsupported marks cannot mutate a receiver', () => {
  const a = new ProseReplica('a'); a.insert(0, 'safe');
  try {
    const before = a.exportUpdate();
    assert.throws(() => a.receive(new Uint8Array([255])));
    for (const change of [
      (doc: Y.Doc) => doc.getMap('other').set('x', 1),
      (doc: Y.Doc) => doc.getText('prose-v1').insertEmbed(0, { image: 'unsupported' }),
      (doc: Y.Doc) => doc.getText('prose-v1').insert(0, 'x', { executable: true }),
    ]) {
      const bad = new Y.Doc();
      try { Y.applyUpdate(bad, before); change(bad); assert.throws(() => a.receive(Y.encodeStateAsUpdate(bad))); }
      finally { bad.destroy(); }
    }
    assert.equal(a.text, 'safe'); assert.deepEqual(a.exportUpdate(), before);
  } finally { a.destroy(); }
});

test('undo refuses before mutation if retained text plus remote input could exceed the admitted bound', () => {
  const a = new ProseReplica('a'); a.insert(0, 'a'.repeat(PROSE_LIMITS.text));
  const b = new ProseReplica('b', a.exportUpdate());
  try {
    a.deleteText(0, PROSE_LIMITS.text); b.receive(a.exportUpdate()); b.insert(0, 'remote'); a.receive(b.exportUpdate());
    const before = a.exportUpdate();
    assert.throws(() => a.undo(), /history-capacity-refused/);
    assert.equal(a.text, 'remote'); assert.deepEqual(a.exportUpdate(), before); sync(a, b);
  } finally { a.destroy(); b.destroy(); }
});
