import test from 'node:test';
import assert from 'node:assert/strict';
import { SheetController } from './controller.ts';
import { createPreviewReplica } from './fixture.ts';
import { gridKey, editorKey, valueText } from './binding.ts';
import type { KeyInput } from './binding.ts';

function key(key: string, extras: Partial<KeyInput> = {}) {
  let prevented = false;
  return { event: { key, ...extras, preventDefault: () => { prevented = true; } }, prevented: () => prevented };
}
function setup(canEdit?: () => boolean) { return new SheetController(createPreviewReplica('keyboard-tests'), undefined, 'local', canEdit); }

test('grid keys select native positions and Tab wraps at native sheet bounds', () => {
  const controller = setup();
  try {
    const arrow = key('ArrowRight');
    assert.equal(gridKey(controller, arrow.event), true);
    assert.equal(arrow.prevented(), true);
    assert.equal(controller.address(), 'B1');
    controller.select(controller.index.keyAt('sheet-budget', 0, 11)!);
    gridKey(controller, key('Tab').event);
    assert.equal(controller.address(), 'A2');
    gridKey(controller, key('Tab', { shiftKey: true }).event);
    assert.equal(controller.address(), 'L1');
    gridKey(controller, key('ArrowUp').event);
    assert.equal(controller.address(), 'L1');
  } finally { controller.destroy(); }
});

test('Enter applies a native edit then selects next row; invalid input stays on its cell', () => {
  const controller = setup();
  try {
    controller.select(controller.index.keyAt('sheet-budget', 1, 1)!);
    gridKey(controller, key('F2').event);
    controller.setDraft('5');
    editorKey(controller, key('Enter').event);
    assert.equal(controller.address(), 'B3');
    assert.equal(Boolean(controller.draft), false);
    assert.equal(valueText(controller.read(controller.index.keyAt('sheet-budget', 3, 3)!)), '68');
    controller.startEdit('=1+');
    editorKey(controller, key('Tab').event);
    assert.equal(controller.address(), 'B3');
    assert.equal(controller.draft?.text, '=1+');
    assert.match(controller.message, /Input refused/);
    const before = controller.projection;
    editorKey(controller, key('Escape').event);
    assert.equal(controller.draft, null);
    assert.equal(controller.projection, before);
  } finally { controller.destroy(); }
});

test('composing Enter and keyCode 229 pass through without consuming or committing', () => {
  const controller = setup();
  try {
    controller.startEdit('한');
    const before = controller.projection;
    for (const input of [key('Enter', { isComposing: true }), key('Enter', { keyCode: 229 })]) {
      assert.equal(editorKey(controller, input.event), false);
      assert.equal(input.prevented(), false);
      assert.equal(controller.projection, before);
    }
    controller.setComposing(true);
    const enter = key('Enter');
    assert.equal(editorKey(controller, enter.event), false);
    assert.equal(enter.prevented(), false);
    assert.equal(controller.projection, before);
    controller.setComposing(false);
    controller.setDraft('한국어');
    assert.equal(editorKey(controller, key('Enter').event), true);
    assert.equal(valueText(controller.read(controller.index.keyAt('sheet-budget', 0, 0)!)), '한국어');
  } finally { controller.destroy(); }
});

test('editing keeps caret shortcuts native; grid Undo uses only own-session events', () => {
  const controller = setup();
  try {
    gridKey(controller, key('x').event);
    assert.equal(controller.draft?.text, 'x');
    const nativeUndo = key('z', { ctrlKey: true });
    assert.equal(editorKey(controller, nativeUndo.event), false);
    assert.equal(nativeUndo.prevented(), false);
    editorKey(controller, key('Tab').event);
    assert.equal(controller.address(), 'B1');
    assert.equal(valueText(controller.read(controller.index.keyAt('sheet-budget', 0, 0)!)), 'x');
    gridKey(controller, key('z', { metaKey: true }).event);
    assert.equal(valueText(controller.read(controller.index.keyAt('sheet-budget', 0, 0)!)), 'Item');
    assert.equal(controller.canUndo, false);
    const copy = key('c', { ctrlKey: true });
    assert.equal(gridKey(controller, copy.event), false);
    assert.equal(copy.prevented(), false);
  } finally { controller.destroy(); }
});

test('value binding labels stale and uncalculated reads without showing cached values', () => {
  assert.equal(valueText({ status: 'stale' }), 'Stale');
  assert.equal(valueText({ status: 'uncalculated' }), 'Not calculated');
  const controller = setup();
  try {
    controller.select(controller.index.keyAt('sheet-budget', 0, 5)!);
    controller.startEdit('=1/0'); controller.commit();
    assert.equal(valueText(controller.read(controller.selection)), '#DIV/0!');
  } finally { controller.destroy(); }
});

test('successful Enter and Tab preserve the applied status after selection moves', () => {
  const controller = setup();
  try {
    for (const command of ['Enter', 'Tab']) {
      controller.startEdit('17');
      editorKey(controller, key(command).event);
      assert.equal(Boolean(controller.draft), false);
      assert.equal(controller.message, 'Applied in this session. Reload discards changes.');
    }
  } finally { controller.destroy(); }
});

test('selection without a draft preserves status; cancelling an actual draft reports cancellation', () => {
  const controller = setup();
  try {
    const initial = controller.message;
    gridKey(controller, key('ArrowRight').event);
    assert.equal(controller.message, initial);
    controller.startEdit('19'); controller.commit();
    const applied = controller.message;
    gridKey(controller, key('ArrowRight').event);
    assert.equal(controller.message, applied);
    assert.equal(controller.select({ ...controller.selection, rowId: 'missing-row' }), false);
    const refusal = controller.message;
    gridKey(controller, key('ArrowDown').event);
    assert.equal(controller.message, refusal);
    controller.startEdit('draft only');
    const before = controller.projection;
    gridKey(controller, key('ArrowRight').event);
    assert.equal(controller.draft, null);
    assert.equal(controller.message, 'Edit cancelled. Cell content is unchanged.');
    assert.equal(controller.projection, before);
  } finally { controller.destroy(); }
});

test('read-only keyboard navigation reads native cells while edit keys and Undo author no events', () => {
  const controller = setup(() => false);
  try {
    const original = controller.projection;
    assert.equal(gridKey(controller, key('ArrowRight').event), true);
    assert.equal(controller.address(), 'B1');
    assert.equal(gridKey(controller, key('Tab').event), true);
    assert.equal(controller.address(), 'C1');
    assert.equal(controller.switchSheet('sheet-rates'), true);
    controller.select(controller.index.keyAt('sheet-rates', 1, 1)!);
    assert.equal(valueText(controller.read(controller.selection)), '12');
    for (const command of ['F2', 'Enter', 'Delete', 'Backspace', 'x']) {
      assert.equal(gridKey(controller, key(command).event), true);
      assert.equal(controller.draft, null);
    }
    assert.equal(gridKey(controller, key('z', { ctrlKey: true }).event), true);
    assert.equal(controller.projection, original);
  } finally { controller.destroy(); }
});

test('reader Enter cannot apply or move an existing draft, and navigation does not discard it', () => {
  let writable = true;
  const controller = setup(() => writable);
  try {
    controller.select(controller.index.keyAt('sheet-budget', 1, 1)!);
    controller.startEdit('999');
    const draft = controller.draft, original = controller.projection;
    writable = false;
    const enter = key('Enter');
    assert.equal(editorKey(controller, enter.event), true);
    assert.equal(enter.prevented(), true);
    assert.equal(controller.address(), 'B2');
    assert.deepEqual(controller.draft, draft);
    assert.equal(gridKey(controller, key('ArrowDown').event), true);
    assert.equal(controller.address(), 'B3');
    assert.deepEqual(controller.draft, draft);
    assert.equal(controller.projection, original);
    assert.equal(valueText(controller.read(controller.index.keyAt('sheet-budget', 1, 1)!)), '3');
  } finally { controller.destroy(); }
});
