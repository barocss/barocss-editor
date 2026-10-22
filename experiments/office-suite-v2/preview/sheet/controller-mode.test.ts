import test from 'node:test';
import assert from 'node:assert/strict';
import { SheetController } from './controller.ts';
import { createPreviewReplica } from './fixture.ts';

test('a callback does not infer peer transport or server durability', () => {
  const local = new SheetController(createPreviewReplica('mode-local'), () => {});
  const relay = new SheetController(createPreviewReplica('mode-relay'), () => {}, 'durable');
  try {
    assert.equal(local.message, 'Session only. Reload starts a new example.');
    assert.equal(relay.message, 'Controlled relay. Local input needs server confirmation.');
    relay.startEdit('changed'); assert.equal(relay.commit(), true);
    assert.equal(relay.message, 'Applied locally. Relay confirmation is shown separately.');
    assert.doesNotMatch(relay.message, /saved|durable|synchronized/i);
  } finally { local.destroy(); relay.destroy(); }
});

test('relay observer failure keeps applied input and a neutral update-delivery warning', () => {
  const relay = new SheetController(createPreviewReplica('mode-relay-error'), () => { throw new Error('IDB transaction failed'); }, 'durable');
  try {
    relay.startEdit('retained'); assert.equal(relay.commit(), true);
    assert.equal(relay.source(), 'retained');
    assert.match(relay.transportWarning ?? '', /Update delivery failed.*IDB transaction failed/);
    assert.doesNotMatch(relay.transportWarning ?? '', /Peer/);
  } finally { relay.destroy(); }
});
