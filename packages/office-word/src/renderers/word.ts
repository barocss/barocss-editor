/**
 * What **Word** draws: the text, and the pages it flows onto.
 *
 * Three lines, and they are the whole point of the split. `renderers.ts` draws text, tables, marks
 * and shapes and imports nothing about pages; `page.ts` draws the section as the sheets its text
 * reached, the header and footer being edited, the back matter and the contents page, and it reads
 * the layout to do it.
 *
 * Word wants both. Anything else — a deck, and whatever `office-text` becomes — wants the first
 * without the second, and could not have it while one file registered them together: `surface`
 * pulls in pagination, page furniture, line numbers and the contents page, about 1,400 lines that
 * cannot be tree-shaken out of a renderer registration (`docs/SHARED-LAYER.md`).
 */
import { registerTextRenderers } from '../renderers';
import { registerPageRenderers } from './page';

export function registerWordRenderers(): void {
  registerTextRenderers();
  registerPageRenderers();
}
