import type { Editor } from '@barocss/editor-core';
import { DOMRenderer } from '@barocss/renderer-dom';
import { getGlobalRegistry } from '@barocss/dsl';
import { WORD_ENV_KEY } from '@barocss/office-text';
import { twipToPx } from '@barocss/shared';
import { deckSlides, type DeckAccess } from './deck';
import { slideSize } from './geometry';
import { createDeckEnv } from './layout-format';

/** Render the saved model at physical size, without the editor's camera or motion state. */
export function createSlidePrint(editor: Editor, owner: Document = document) {
  let container: HTMLDivElement | undefined;
  const clear = () => { container?.remove(); container = undefined; };
  const build = () => {
    clear();
    const rootId = editor.getRootId();
    if (!rootId) return 0;
    const doc: DeckAccess = { rootId, getNode: (id: string) => editor.dataStore.getNode(id) as never };
    const slides = deckSlides(doc).filter(slide => !slide.hidden);
    if (!slides.length) return 0;
    container = owner.createElement('div');
    container.className = 'sl-print-pages';
    container.setAttribute('aria-hidden', 'true');
    container.inert = true;
    const rules: string[] = [];
    for (const [index, slide] of slides.entries()) {
      const proxy = editor.getDocumentProxy(slide.sid);
      if (!proxy) continue;
      const size = slideSize(doc.getNode(slide.sid)?.attributes);
      const width = twipToPx(size.width), height = twipToPx(size.height);
      const page = owner.createElement('div');
      page.className = 'sl-print-page';
      page.dataset.printSlide = slide.sid;
      page.style.cssText = `width:${width}px;height:${height}px;page:sl-page-${index}`;
      // Named pages retain custom and mixed slide sizes. Twips / 20 = points.
      rules.push(`@page sl-page-${index} { size:${size.width / 20}pt ${size.height / 20}pt; margin:0; }`);
      const renderer = new DOMRenderer(getGlobalRegistry(), {
        env: { [WORD_ENV_KEY]: createDeckEnv(doc) }
      } as never);
      renderer.render(page, JSON.parse(JSON.stringify(proxy)));
      renderer.destroy();
      page.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
      page.querySelectorAll('video, audio').forEach(node => {
        node.removeAttribute('autoplay');
        node.removeAttribute('controls');
      });
      container.appendChild(page);
    }
    const style = owner.createElement('style');
    style.textContent = `${rules.join('\n')}
      .sl-print-pages { position:fixed; left:-100000px; top:0; pointer-events:none; }
      .sl-print-page { position:relative; overflow:hidden; break-after:page; }
      .sl-print-page:last-of-type { break-after:auto; }
      .sl-print-page > .sl-slide { margin:0!important; box-shadow:none!important; border-radius:0!important; }
      @media print {
        html, body { margin:0!important; padding:0!important; height:auto!important; overflow:visible!important; }
        body > *:not(.sl-print-pages) { display:none!important; }
        .sl-print-pages { position:static; display:block!important; }
        .sl-print-pages, .sl-print-pages * { print-color-adjust:exact; -webkit-print-color-adjust:exact; }
      }`;
    container.appendChild(style);
    owner.body.appendChild(container);
    return slides.length;
  };
  return {
    build, clear,
    async print() {
      if (!build()) return;
      try {
        await owner.fonts.ready;
        await Promise.all([...container!.querySelectorAll('img')].map(image => image.decode().catch(() => undefined)));
        // Some browsers return while their print UI is still open. Keep the
        // pages until afterprint; clearing on return can produce blank paper.
        owner.defaultView?.addEventListener('afterprint', clear, { once: true });
        owner.defaultView?.print();
      } catch (error) { clear(); throw error; }
    },
    attach() {
      const view = owner.defaultView;
      const before = () => { build(); };
      view?.addEventListener('beforeprint', before);
      view?.addEventListener('afterprint', clear);
      return () => {
        view?.removeEventListener('beforeprint', before);
        view?.removeEventListener('afterprint', clear);
        clear();
      };
    }
  };
}
