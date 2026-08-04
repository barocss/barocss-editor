import {
  createCoreExtensions,
  createRichExtensions,
  createTableExtension
} from '@barocss/extensions';
import { Editor, type EditorOptions, type Extension, type Keybinding } from '@barocss/editor-core';
import { createSchema } from '@barocss/schema';
import { getWordSchemaDefinition } from './word-schema';
import { WORD_KEYBINDINGS } from './word-keymap';

/**
 * The extensions a Word document needs.
 *
 * A kit is a product's answer to "what can be done in this editor". The engine
 * ships none of its own, so this list is the whole of Word's editing surface —
 * changing it changes the product, not the engine.
 */
export function createWordExtensions(): Extension[] {
  return [
    ...createCoreExtensions(),
    ...createRichExtensions(),
    createTableExtension({ defaultRows: 3, defaultCols: 3 })
  ];
}

export interface WordEditorOptions extends EditorOptions {
  /** Replace the kit entirely; pass `[]` for a document with no editing commands. */
  kit?: Extension[];
  /** Replace Word's key map. */
  keybindings?: Keybinding[];
}

/**
 * Create an editor configured as a word processor.
 *
 * This is the seam between engine and product: the schema, the kit and the key
 * map are all supplied here, and none of them are known to the layers below.
 */
export function createWordEditor(options: WordEditorOptions = {}): Editor {
  const { kit, keybindings, extensions = [], ...rest } = options;

  const editor = new Editor({
    ...rest,
    schema: rest.schema ?? createSchema('word', getWordSchemaDefinition()),
    extensions: [...(kit ?? createWordExtensions()), ...extensions]
  } as EditorOptions);

  // Word's key map replaces the engine default rather than layering on top:
  // leaving both registered would mean two commands competing for Tab.
  const registry = (editor as any).keybindings;
  registry?.clear?.();
  for (const binding of keybindings ?? WORD_KEYBINDINGS) {
    registry?.register?.(binding);
  }

  return editor;
}
