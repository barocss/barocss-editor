import { describe, expect, it, vi } from 'vitest';
import { getGlobalRegistry } from '@barocss/dsl';
import { assertSlidesNativeReferences } from '../src/native-identity';
import { registerSlidesRenderers } from '../src/renderers';
import { createSlidesEditor } from '../src/slides-kit';
import { deckFileText } from '../src/deck-file';
import { connectorIdentityFixture, drawNativeConnector, identityFixture, nativeIdentityReaderClaims,
  nativeIdentityTypes, withNativeConnectorRead } from './helpers/native-identity-probe';

describe('Slides native readers used by conformance', () => {
  registerSlidesRenderers();
  const registry = getGlobalRegistry();

  it.each(nativeIdentityTypes)('%s refuses duplicate durable identity without modifying its original native graph', type => {
    const valid = identityFixture(type), before = structuredClone(valid);
    expect(() => assertSlidesNativeReferences(valid)).not.toThrow();
    expect(valid).toEqual(before);
    const duplicate = identityFixture(type, 'first-object'), duplicateBefore = structuredClone(duplicate);
    expect(() => assertSlidesNativeReferences(duplicate)).toThrow('Duplicate or invalid Slides object identity.');
    expect(duplicate).toEqual(duplicateBefore);
    expect(nativeIdentityReaderClaims()[`${type}.objectId`]).toHaveProperty('covers', ['every-attribute-is-read']);
  });

  it.each(['start', 'end'] as const)('%s durable endpoint changes the resolved route and drawn SVG path', end => {
    const first = drawNativeConnector(registry, end, 'target-a');
    const second = drawNativeConnector(registry, end, 'target-b');
    expect(first.route).toHaveLength(2); expect(second.route).toHaveLength(2);
    expect(first.route).not.toEqual(second.route);
    expect(first.paths.length).toBeGreaterThan(0); expect(second.paths.length).toBeGreaterThan(0);
    expect(first.paths).not.toEqual(second.paths);
    expect(() => assertSlidesNativeReferences(connectorIdentityFixture(end, 'missing-target')))
      .toThrow('Missing or wrong-scope Slides connector target.');
    expect(withNativeConnectorRead(registry, () => false)('connector', `${end}ObjectId`)).toBe(true);
  });

  it.each(['start', 'end'] as const)('the existing connector command changes the durable %s target with exact Undo/Redo', async end => {
    const editor = createSlidesEditor();
    try {
      editor.loadDocument(connectorIdentityFixture(end, 'target-a'));
      const nodes = [...editor.dataStore.getNodes().values()];
      const line = nodes.find(node => node.attributes?.objectId === 'line-object')!;
      const target = nodes.find(node => node.attributes?.objectId === 'target-b')!;
      const native = () => deckFileText(editor.exportDocument(), 'fixed');
      const before = native();
      expect(JSON.parse(before).document.content[0].content[2].attributes[`${end}ObjectId`]).toBe('target-a');
      expect(await editor.executeCommand('setConnector', { nodeIds: [line.sid!], [`${end}NodeId`]: target.sid! })).toBe(true);
      const after = native();
      expect(JSON.parse(after).document.content[0].content[2].attributes[`${end}ObjectId`]).toBe('target-b');
      expect(after).not.toBe(before);
      expect(await editor.undo()).toBe(true); expect(native()).toBe(before);
      expect(await editor.redo()).toBe(true); expect(native()).toBe(after);
    } finally { editor.destroy(); }
  });

  it('leaves every unrelated attribute result, including unanswered and unread, with the existing probe', () => {
    const fallback = vi.fn((_type: string, attr: string) => attr === 'unknown' ? null : false);
    const read = withNativeConnectorRead(registry, fallback);
    expect(read('connector', 'stroke')).toBe(false);
    expect(read('rectangle', 'startObjectId')).toBe(false);
    expect(read('connector', 'unknown')).toBeNull();
    expect(fallback.mock.calls).toEqual([['connector', 'stroke'], ['rectangle', 'startObjectId'], ['connector', 'unknown']]);
  });
});
