import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getGlobalRegistry } from '@barocss/dsl';
import { createSchema } from '@barocss/schema';
import { getSiteSchemaDefinition } from '../src/site-schema';
import { registerSiteRenderers } from '../src/renderers';
import { PAGE_CSS } from '../src/page-css';

/**
 * **A class the published page carries, styled only by a stylesheet the visitor never gets.**
 *
 * ## The other direction, and why it had to be written
 *
 * `packages/conformance/test/dead-selectors.test.ts` asks whether every `data-*` a stylesheet
 * selects on is written by something — *a rule with nobody to match*. This asks the reverse and it
 * is the direction the defects have actually been in: **something drawn with nobody to style it.**
 *
 * That fault has now been found three times in this product, always by hand and never twice for the
 * same reason:
 *
 * - `.st-chart`, `.st-chart-title`, `.st-chart-plot` — the chart's whole box lived in
 *   `apps/site/src/style.css`. Every published page this product had ever made carried a chart with
 *   no box.
 * - `.st-sticker` — the same, and an inline sticker was published at whatever size its file was.
 * - `.w-emoji` — found while moving the class from the app into `office-text`. A site can insert an
 *   emoji, `office-text`'s renderer draws it, and `PAGE_CSS` mentioned the name **zero times**: the
 *   board was right and the published page's line box stretched around the glyph.
 *
 * Three findings, three people looking. The value here is not the fix — it is that the fourth is
 * caught by a machine.
 *
 * ## Why an app's stylesheet is the dangerous place
 *
 * `PAGE_CSS` is a *string* and not a file, for a reason `page-css.ts` gives at length: the app
 * injects it so a board draws with it and `export-html.ts` inlines it so a visitor gets it — the
 * same bytes in both places. Everything else in the tree — `apps/site/src/style.css`,
 * `office-site/src/ui.css`, `office-text/src/text.css`, `office-ui/src/tokens.css` — is loaded by
 * the **editor** and by nothing else. So a rule in one of those makes the board correct and the
 * published page wrong, and the two look identical to everyone who only ever opens the editor.
 *
 * ## What it takes as "drawn", and why it is not a scan of the source
 *
 * The classes come from the **registry**, after `registerSiteRenderers()`, for every node type and
 * mark the site's schema declares. A grep over `office-text/src/renderers.ts` would report
 * `.w-list` and `.w-list-item`, and a site page has neither: this product `override`s `list` and
 * `listItem` with its own `<ul class="st-list">`. A list of what a product draws is exactly the
 * hand-kept list this harness replaced, and reading it out of the source is the same list with a
 * regex in front of it.
 *
 * Each renderer is asked twice, because a renderer answers in two shapes. `define('emoji',
 * element('span', { className: 'w-emoji' }))` is wrapped into a closure that returns a template, so
 * it has to be **called** — the way `drawnTagFrom` calls it, with an empty node — and the tree it
 * returns read. A component that decides its own markup (`chart`, `field`) is read from its
 * **source**, so a branch an empty node never reaches still counts: `.st-chart-title` is drawn only
 * when the chart has a title, and it is one of the four this check exists because of.
 *
 * ## What counts as a finding: the class *is* the styling
 *
 * A finding is a class some unpublished stylesheet styles **on its own** — a selector whose whole
 * compound is that one class, like `.w-emoji { … }`. That is the shape where the class carries the
 * look, and losing it in the export loses the look.
 *
 * The other rules that name these classes are deliberately not findings, and they are all one kind
 * of thing — the editor's own state, which a visitor is never in:
 *
 * | rule | what it is |
 * | --- | --- |
 * | `.st-stack:empty`, `.st-placement:empty`, `.st-collection:empty` | the affordance on an empty slot, drawn so a reader can drop something into it |
 * | `.st-frame:not([data-preview]) .st-page .st-collection[data-source]` | a mark drawn **over** a board, inside the editor's frame |
 * | `.w-cell[data-cell-selected]`, `.w-table[data-table-selected]` | a selection, which a published page has none of |
 * | `.w-paragraph[data-placeholder]` | a prompt in an empty block a reader is about to type in |
 *
 * Every one of those needs a state that only the editor puts an element into, so a published page
 * that lacks the rule is a published page that is correct. Stating the criterion mechanically — a
 * bare compound — rather than listing these six is what keeps the seventh from needing a decision.
 *
 * The blind spot is named rather than hidden: a rule that is *both* conditional and the page's look
 * would be missed. None of the three faults found so far was of that shape.
 */
describe('what a page draws, PAGE_CSS styles', () => {
  const repo = join(__dirname, '..', '..', '..');
  const SKIP = ['node_modules', 'dist', 'build', '.git', 'test-results', 'playwright-report'];

  /**
   * Every stylesheet the site product draws with, **read from the dependency graph** — the same
   * `treeOf` `dead-selectors.test.ts` uses, and for the same reason it was written: a list by hand
   * of what a product loads is wrong the first time somebody adds a package.
   *
   * `apps/site` is the root of the walk and its own stylesheet is in the result, which is the point.
   * Four of the five faults above were rules sitting in that file.
   */
  const treeOf = (app: string): string[] => {
    const seen = new Set<string>();
    const follow = (dir: string) => {
      if (seen.has(dir)) return;
      seen.add(dir);
      let manifest: { dependencies?: Record<string, string> };
      try {
        manifest = JSON.parse(readFileSync(join(repo, dir, 'package.json'), 'utf8'));
      } catch {
        return;
      }
      for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
        if (!name.startsWith('@barocss/') || !version.startsWith('workspace:')) continue;
        follow(`packages/${name.slice('@barocss/'.length)}`);
      }
    };
    follow(`apps/${app}`);
    return [...seen];
  };

  const stylesheets = (dirs: string[]) => {
    const files: { path: string; text: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (SKIP.includes(entry)) continue;
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          // A fixture is not a thing a product draws with.
          if (entry !== 'test' && entry !== 'tests') walk(path);
          continue;
        }
        if (!entry.endsWith('.css')) continue;
        files.push({ path: path.replace(`${repo}/`, ''), text: readFileSync(path, 'utf8') });
      }
    };
    for (const dir of dirs) walk(join(repo, dir));
    return files;
  };

  /**
   * Comments out first, or a class named in prose answers for itself.
   *
   * Measured: the first run of this reported `.w-emoji` as styled by `apps/site/src/style.css`,
   * where the only mention of it is a comment saying the rules were **moved out**. A check that
   * reads a comment as a rule is a check that goes quiet exactly when somebody documents a move.
   */
  const bare = (text: string) =>
    [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{};]+)\{/g)]
      .flatMap((one) => one[1].split(','))
      .map((one) => one.replace(/\s+/g, ' ').trim())
      .filter((one) => /^\.[-\w]+$/.test(one))
      .map((one) => one.slice(1));

  /** Whether `PAGE_CSS` names the class at all — in any selector, conditional or not. */
  const inPage = (cls: string) =>
    new RegExp(`(^|[^-\\w])\\.${cls}(?![-\\w])`).test(PAGE_CSS.replace(/\/\*[\s\S]*?\*\//g, ''));

  /** Every class the site's own renderers put on an element, taken from the registry. */
  const drawn = (): Map<string, Set<string>> => {
    registerSiteRenderers();
    const registry = getGlobalRegistry() as unknown as { get: (type: string) => { template?: unknown } | undefined };
    const schema = createSchema('site', getSiteSchemaDefinition()) as unknown as {
      nodes: Map<string, unknown>;
      marks: Map<string, unknown>;
    };

    const found = new Map<string, Set<string>>();
    const add = (value: string, where: string) => {
      for (const one of value.split(/\s+/)) {
        if (!one) continue;
        if (!found.has(one)) found.set(one, new Set());
        found.get(one)!.add(where);
      }
    };
    /*
     * A component's source, for the branches an empty node does not reach. Only literal class names:
     * a template literal is a name this cannot know, and guessing at one is how a check starts
     * reporting things that are not there.
     */
    const fromSource = (fn: (...args: never[]) => unknown, where: string) => {
      for (const one of fn.toString().matchAll(/className:\s*["']([^"'$]+)["']/g)) add(one[1], where);
    };

    const walk = (node: unknown, where: string, depth = 0) => {
      if (!node || typeof node !== 'object' || depth > 40) return;
      if (Array.isArray(node)) {
        for (const child of node) walk(child, where, depth + 1);
        return;
      }
      /*
       * `attributes` and not only `props`: an `element(…)` template keeps what it was given under
       * `attributes`, and a component's returned tree is made of those. Reading `props` alone found
       * 31 classes where the product draws 76 — and the 45 it missed included `.w-emoji`, which is
       * the one this was written for.
       */
      const one = node as {
        props?: Record<string, unknown>;
        attributes?: Record<string, unknown>;
        attrs?: Record<string, unknown>;
        children?: unknown;
        component?: unknown;
      };
      const className = (one.props ?? one.attributes ?? one.attrs)?.className;
      if (typeof className === 'string') add(className, where);
      else if (typeof className === 'function') fromSource(className as never, where);

      if (typeof one.component === 'function') {
        fromSource(one.component as never, where);
        try {
          // The empty node `drawnTagFrom` uses: no attributes, no content, no environment. A
          // renderer that needs more than that says so by throwing, and its source was read above.
          const probe = { sid: 'page-css:0', stype: where.replace(/^mark:/, ''), attributes: {}, content: [] };
          walk((one.component as (...args: unknown[]) => unknown)(probe, probe, { env: {} }), where, depth + 1);
        } catch {
          /* asked and could not answer — the source is the other half of the question */
        }
      }
      walk(one.children, where, depth + 1);
    };

    for (const type of [...schema.nodes.keys(), ...[...schema.marks.keys()].map((mark) => `mark:${mark}`)]) {
      let entry: { template?: unknown } | undefined;
      try {
        entry = registry.get(type);
      } catch {
        continue;
      }
      if (entry?.template) walk(entry.template, type);
    }
    return found;
  };

  it('styles every class a page renderer draws that anything styles at all', () => {
    const classes = drawn();
    const styles = stylesheets(treeOf('site'));

    // And it looked at both sides — an empty result would otherwise pass for the wrong reason,
    // which is the failure mode of every check that walks a tree.
    expect(classes.size, 'the registry answered').toBeGreaterThan(50);
    expect(styles.length, 'the product has stylesheets').toBeGreaterThan(3);

    const findings: string[] = [];
    for (const [name, where] of [...classes].sort(([a], [b]) => a.localeCompare(b))) {
      if (inPage(name)) continue;
      for (const sheet of styles) {
        if (!bare(sheet.text).includes(name)) continue;
        findings.push(
          `.${name} — drawn by ${[...where].sort().join(', ')}, styled by ${sheet.path}, absent from PAGE_CSS`
        );
      }
    }

    expect(findings, 'a visitor gets this element and none of its rules').toEqual([]);
  });
});
