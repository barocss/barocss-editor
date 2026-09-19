import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import { getNoteSchemaDefinition, NOTE_BLOCKS } from '../src/note-schema';
import { createNoteEditor } from '../src/note-kit';
import { noteRegistry } from '../src/renderers';
import { NOTE_KEYBINDINGS } from '../src/note-keymap';
import { noteControlsIn } from '../src/toolbar-model';

// Historical filename. Product contracts replace arbitrary code-size and node-count constraints.
const spec = readFileSync(join(__dirname, '../../../docs/specs/note.md'), 'utf8');
const match = spec.match(/<!-- note-contract -->\s*```json\s*([\s\S]*?)```/);
if (!match) throw new Error('Note spec must declare its product contract');
const contract = JSON.parse(match[1]) as { blocks: string[]; commands: string[]; insertion: string[]; tableKeys: string[] };
const schema = createSchema('note-contract', getNoteSchemaDefinition());
const held: ReturnType<typeof createNoteEditor>[] = [];
afterEach(() => { for (const editor of held.splice(0)) editor.destroy(); });

describe('Note product contract', () => {
  it('names concrete writing capabilities rather than an empty contract', () => {
    expect(contract.blocks).toEqual(expect.arrayContaining(['paragraph', 'taskItem', 'bDetails', 'callout']));
    expect(contract.commands).toEqual(expect.arrayContaining(['replaceText', 'toggleChecklistItem', 'toggleDetails']));
    for (const values of Object.values(contract)) expect(new Set(values).size).toBe(values.length);
  });

  it('admits and renders every promised block', () => {
    expect([...NOTE_BLOCKS].sort()).toEqual([...contract.blocks].sort());
    for (const block of contract.blocks) {
      expect(schema.nodes.has(block), block).toBe(true);
      expect(noteRegistry().has(block), block).toBe(true);
    }
  });

  it('registers the commands the product promises', () => {
    const editor = createNoteEditor({ dataStore: new DataStore(undefined, schema), schema, editable: true });
    held.push(editor);
    expect(editor.commandNames()).toEqual(expect.arrayContaining(contract.commands));
  });

  it('makes every promised insertion reachable through the block menu', () => {
    expect(noteControlsIn('block').map(control => control.command))
      .toEqual(expect.arrayContaining(contract.insertion));
  });

  it('retains keyboard navigation in tables without limiting future shortcuts', () => {
    expect(NOTE_KEYBINDINGS.map(binding => binding.key))
      .toEqual(expect.arrayContaining(contract.tableKeys));
  });
});
