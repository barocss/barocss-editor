/// <reference lib="dom" />
import { chromium } from 'playwright';
import { evaluateRenderedCriterion, getCriterionSpecimen, type CriterionSpecimen, type ExecutableCriterion, type RenderedCriterionInput } from '@barocss/office-word/criterion-confirmation';

/** One closed local specimen registry. Never accepts a URL, uploaded source or executable user input. */
export function createCriterionBrowserExecutor() {
  return {
    async execute(specimen: CriterionSpecimen, criterion: ExecutableCriterion) {
      const registered = getCriterionSpecimen(specimen.id);
      if (!registered || registered.version !== specimen.version || registered.sourceText !== specimen.sourceText)
        throw new Error('registered_specimen_changed');
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 640, height: 480 } });
        try {
          await context.route('**/*', route => route.abort());
          const page = await context.newPage();
          await page.setContent(registered.sourceText, { waitUntil: 'load', timeout: 10_000 });
          const button = page.locator('#criterion-specimen');
          if (await button.count() !== 1) throw new Error('registered_specimen_unavailable');
          const rendered: RenderedCriterionInput = await button.evaluate(node => {
            const style = getComputedStyle(node), ancestorOpacities: string[] = [];
            let parent = node.parentElement;
            while (parent) { ancestorOpacities.push(getComputedStyle(parent).opacity); parent = parent.parentElement; }
            return { color: style.color, backgroundColor: style.backgroundColor, opacity: style.opacity,
              backgroundImage: style.backgroundImage, ancestorOpacities, tagName: node.tagName,
              disabled: (node as HTMLButtonElement).disabled, visibility: style.visibility, display: style.display };
          });
          return { executor: { id: 'local-playwright-chromium' as const, version: 1 as const, browserVersion: browser.version() },
            rendered, evaluation: evaluateRenderedCriterion(criterion, rendered) };
        } finally { await context.close(); }
      } finally { await browser.close(); }
    }
  };
}
