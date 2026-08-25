import { describe, it, expect, beforeEach } from 'vitest';
import { createWordEditor } from '../src/word-kit';

/**
 * A mark command has to write the attribute its mark **declares**.
 *
 * Measured, and it was live for months: `setBgColor` wrote its colour into an attribute called
 * `color` while the schema declares `bgColor` and every reader asks for it by name — the two apps
 * that draw the mark read `attributes.bgColor`, and Word's format resolution reads `attrs.bgColor`.
 * So the command committed, reported `true`, and painted nothing.
 *
 * Nothing caught it because the test beside the command asked only which **mark type** was written.
 * A mark type with the wrong attribute is not a smaller version of the right mark; it is a mark that
 * is not there, which is the one failure a reader cannot see and cannot report.
 *
 * So this is the check that would have: run the command for real, read the mark back out of the
 * store, and hold every attribute on it to what the schema says that mark has. The table is written
 * out rather than discovered, for the reason the conformance harness gives about `produces`: a
 * command is a function, the engine cannot see what it makes, and a guess from the name would be a
 * check that lies in both directions.
 */
describe('a mark command writes what its mark declares', () => {
  const WRITES = [
    { command: 'setFontColor', payload: { color: '#B22222' }, mark: 'fontColor', attrs: { color: '#B22222' } },
    { command: 'setBgColor', payload: { color: '#00ff00' }, mark: 'bgColor', attrs: { bgColor: '#00ff00' } },
    { command: 'setHighlight', payload: { color: '#FFFF00' }, mark: 'highlight', attrs: { color: '#FFFF00' } },
    { command: 'setFontSize', payload: { size: '14px' }, mark: 'fontSize', attrs: { size: '14px' } },
    { command: 'setFontFamily', payload: { family: 'Georgia' }, mark: 'fontFamily', attrs: { family: 'Georgia' } }
  ];

  let editor: any;

  beforeEach(() => {
    editor = createWordEditor();
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            // A `surface` of kind `flow`, which is what a Word section is in this schema.
            stype: 'surface',
            attributes: { kind: 'flow' },
            content: [{ stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '문단 하나' }] }]
          }
        ]
      },
      'word'
    );
  });

  /** The one run in the document, found rather than named — a load mints its own sids. */
  const run = () => {
    const store = editor.dataStore;
    const seen: string[] = [];
    const walk = (sid: string) => {
      const node = store.getNode(sid);
      if (!node) return;
      if (node.stype === 'inline-text') seen.push(sid);
      for (const child of node.content ?? []) if (typeof child === 'string') walk(child);
    };
    walk(editor.getRootId());
    return seen[0];
  };

  const selection = (sid: string) => ({
    type: 'range',
    startNodeId: sid,
    startOffset: 0,
    endNodeId: sid,
    endOffset: 2,
    collapsed: false,
    direction: 'forward'
  });

  for (const one of WRITES) {
    it(`${one.command} writes ${one.mark}(${Object.keys(one.attrs).join(', ')})`, async () => {
      const sid = run();
      expect(await editor.executeCommand(one.command, { selection: selection(sid), ...one.payload })).toBe(true);

      const marks = (editor.dataStore.getNode(sid)?.marks ?? []) as {
        stype?: string;
        attrs?: Record<string, unknown>;
      }[];
      const written = marks.find((mark) => mark.stype === one.mark);
      expect(written, `${one.command} wrote no ${one.mark} mark`).toBeDefined();

      /*
       * The guard, in two directions. The value has to arrive under the name the schema declares —
       * and no *other* name may arrive with it, because an attribute the schema does not declare is
       * one nothing will ever read.
       */
      const declared = editor.dataStore.getActiveSchema().getMarkType(one.mark)?.attrs ?? {};
      for (const [key, value] of Object.entries(one.attrs)) {
        expect(written?.attrs?.[key], `${one.command} did not write ${one.mark}.${key}`).toBe(value);
      }
      for (const key of Object.keys(written?.attrs ?? {})) {
        expect(Object.keys(declared), `${one.mark} does not declare ${key}`).toContain(key);
      }
    });
  }
});
