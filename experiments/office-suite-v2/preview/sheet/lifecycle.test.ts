import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerSession } from './peer-session.ts';
import { PeerLifecycle } from './lifecycle.ts';

test('a live link pauses during suspension and resumes its prior live state', () => {
  const peer = new PeerSession({ roomId: 'lifecycle-live', create: true, send: () => {}, changed: () => {} });
  try {
    const lifecycle = new PeerLifecycle(peer);
    lifecycle.suspend(); assert.equal(peer.inspect().phase, 'paused');
    lifecycle.resume(); assert.equal(peer.inspect().phase, 'ready');
  } finally { peer.close(); peer.replica?.destroy(); }
});

test('a manual pause and its queued native edits survive suspension without transmission', () => {
  const sent: unknown[] = [];
  const peer = new PeerSession({ roomId: 'lifecycle-manual', create: true, send: packet => { sent.push(packet); }, changed: () => {} });
  try {
    peer.setPaused(true);
    const change = peer.replica!.commit({ kind: 'undo', targetEventId: 'not-a-local-target' });
    peer.publish(change.event.eventId, change.update);
    const before = peer.inspect();
    const revision = peer.replica!.projection.revision;
    const lifecycle = new PeerLifecycle(peer);
    lifecycle.suspend(); lifecycle.resume();
    assert.equal(peer.inspect().phase, 'paused');
    assert.equal(sent.length, 0, 'a page restore must not send a manually paused packet');
    assert.equal(peer.inspect().pending, before.pending);
    assert.equal(peer.replica!.projection.revision, revision);
    peer.setPaused(false);
    assert.ok(sent.length > 0, 'the explicit Resume action can send the original packet');
  } finally { peer.close(); peer.replica?.destroy(); }
});
