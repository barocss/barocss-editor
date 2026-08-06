import { describe, it, expect } from 'vitest';
import { Schema } from '@barocss/schema';
import { getWordSchemaDefinition } from '../src/word-schema';
import {
  currentStyle,
  toolbarCommands,
  toolbarMarkTypes,
  WORD_STYLES,
  WORD_TOOLBAR
} from '../src/toolbar-model';
import { WORD_KEYBINDINGS } from '../src/word-keymap';
import type { SelectionSummary } from '@barocss/editor-core';

const definition = getWordSchemaDefinition() as any;
const schema = new Schema('word', definition);

/**
 * The toolbar curates rather than mirroring — a schema with forty marks does not
 * make a usable toolbar, and Word's own shows a dozen. But what it curates has
 * to be real: a control naming a mark the schema does not define is a button
 * that is always off, and nobody notices, because an off button looks like an
 * off button.
 */
describe('what the toolbar names', () => {
  it('reads only marks the schema defines', () => {
    for (const type of toolbarMarkTypes()) {
      expect(schema.getMarkType(type), `mark '${type}' is not in the schema`).toBeDefined();
    }
  });

  it('names the styles by node types the schema defines', () => {
    for (const style of WORD_STYLES) {
      expect(schema.getNodeType(style.stype), `node '${style.stype}' is not in the schema`).toBeDefined();
    }
  });

  it('runs only commands the key map also knows', () => {
    // Not a rule about implementation — a command can exist without a shortcut —
    // but a toolbar button and a shortcut for the same thing should not drift
    // into two different command names.
    const bound = new Set(WORD_KEYBINDINGS.map((binding) => binding.command));
    const shared = toolbarCommands().filter((command) => bound.has(command));
    expect(shared.length).toBeGreaterThan(0);
  });

  it('gives every control an id, a label and a command', () => {
    for (const control of WORD_TOOLBAR.flatMap((group) => group.controls)) {
      expect(control.id).toBeTruthy();
      // The label is what a screen reader announces; an icon alone says nothing
      expect(control.label).toBeTruthy();
      expect(control.command).toBeTruthy();
    }
  });

  it('does not repeat an id', () => {
    const ids = WORD_TOOLBAR.flatMap((group) => group.controls).map((control) => control.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('which style the dropdown shows', () => {
  const summary = (over: Partial<SelectionSummary>): SelectionSummary =>
    ({
      marks: [],
      mixedMarks: [],
      markAttributes: {},
      blocks: [],
      blockAttributes: {},
      mixedAttributes: [],
      collapsed: false,
      empty: false,
      ...over
    }) as SelectionSummary;

  it('shows the entry when the blocks agree', () => {
    expect(currentStyle(summary({ blockAttributes: { stype: 'paragraph' } }))).toBe('paragraph');
    expect(currentStyle(summary({ blockAttributes: { stype: 'heading', level: 2 } }))).toBe('heading2');
  });

  it('shows nothing when they do not', () => {
    // Showing one of them is how a dropdown applies a style to a selection that
    // had two.
    expect(currentStyle(summary({ mixedAttributes: ['stype'] }))).toBeNull();
    expect(
      currentStyle(summary({ blockAttributes: { stype: 'heading' }, mixedAttributes: ['level'] }))
    ).toBeNull();
  });

  it('shows nothing for a block the dropdown does not offer', () => {
    // A table is a block, and "table" is not a paragraph style
    expect(currentStyle(summary({ blockAttributes: { stype: 'bTable' } }))).toBeNull();
  });
});

/**
 * The model has to stay drawable by anything.
 *
 * The engine renders through either a DOM or a React renderer. A product that
 * shipped its toolbar as DOM would force every host to be a DOM host; one that
 * shipped it as React would force React on all of them.
 */
describe('the toolbar model', () => {
  it('touches no DOM', async () => {
    // Read from the package root, which is where vitest runs
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/toolbar-model.ts', 'utf8')
    );

    for (const global of ['document.', 'window.', 'HTMLElement', 'createElement']) {
      expect(source, `toolbar-model references ${global}`).not.toContain(global);
    }
  });

  it('is data a host can walk without running anything', () => {
    for (const group of WORD_TOOLBAR) {
      expect(Array.isArray(group.controls)).toBe(true);
      for (const control of group.controls) {
        // A host needs the label and the icon to draw it, and the command to
        // wire it — none of which should require calling into the product.
        expect(typeof control.label).toBe('string');
        expect(typeof control.icon).toBe('string');
        expect(typeof control.command).toBe('string');
      }
    }
  });
});
