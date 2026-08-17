import { describe, it, expect } from 'vitest';
import { createSchema } from '@barocss/schema';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import {
  SLIDES_TOOLBAR,
  slidesToolbarCommands,
  slidesToolbarMarkTypes
} from '../src/toolbar-model';

/**
 * The toolbar, held to the same standard as everything else the product
 * declares: a control that names a command nothing registers is a button that
 * does nothing, and a button that does nothing looks exactly like a button
 * whose effect you did not see.
 *
 * The same two questions Word's toolbar test asks. Asked here because the
 * *model* is the product's — only the drawing is shared — so nothing about
 * `office-ui` could have caught either of these.
 */
describe('the deck toolbar', () => {
  const editor = createSlidesEditor();
  const schema = createSchema('slides', getSlidesSchemaDefinition());

  it('touches no DOM', async () => {
    // The reason the model is a package away from the app: the engine renders
    // through a DOM or a React renderer, and a product that shipped its toolbar
    // as either would force that choice on every host.
    // Read from the package root, which is where vitest runs — the same way
    // Word's toolbar test reads its own model.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/toolbar-model.ts', 'utf8')
    );
    expect(source).not.toMatch(/document\.|window\.|React|from 'react'/);
  });

  it('names only commands the kit registers', () => {
    const registered = new Set(editor.commandNames());
    const missing = slidesToolbarCommands().filter((command) => !registered.has(command));
    expect(missing, `toolbar commands nothing registers: ${missing.join(', ')}`).toEqual([]);
  });

  it('reads only marks the schema defines', () => {
    // A control naming a mark the schema does not define is a button that is
    // always off — it reads something nothing ever writes.
    const missing = slidesToolbarMarkTypes().filter((type) => !schema.getMarkType?.(type));
    expect(missing, `toolbar marks the schema does not define: ${missing.join(', ')}`).toEqual([]);
  });

  it('has the group a document has no counterpart for', () => {
    // A page is a consequence of how much text there is; a slide is a thing the
    // author makes. If this group ever goes, the deck's toolbar is a word
    // processor's.
    const slide = SLIDES_TOOLBAR.find((group) => group.id === 'slide');
    expect(slide?.controls.map((control) => control.command)).toEqual([
      'insertSlide',
      'duplicateSlide',
      'moveSlide',
      'moveSlide',
      'toggleSlideHidden',
      'deleteSlide'
    ]);
  });

  it('says which controls need the slide the reader is on', () => {
    // Which slide that is is a fact about the reader rather than the document,
    // so the control says it needs one and the host supplies it — the model
    // never learns what the app is looking at.
    for (const control of SLIDES_TOOLBAR.find((g) => g.id === 'slide')!.controls) {
      expect(control.needsSlide, `${control.id} acts on a slide`).toBe(true);
    }
    for (const control of SLIDES_TOOLBAR.find((g) => g.id === 'character')!.controls) {
      expect(control.needsSlide, `${control.id} acts on the selection`).toBeUndefined();
    }
  });

  it('gives every control a label and an icon of its own', () => {
    const controls = SLIDES_TOOLBAR.flatMap((group) => group.controls);
    const ids = controls.map((control) => control.id);
    expect(new Set(ids).size, 'two controls share an id').toBe(ids.length);

    for (const control of controls) {
      expect(control.label.length, `${control.id} has no label`).toBeGreaterThan(0);
      expect(control.icon.length, `${control.id} has no icon`).toBeGreaterThan(0);
    }
  });
});
