/**
 * A code block, **tokenized and drawn** — the same markup in the editor and on the published page.
 *
 * ## Why Prism does both jobs
 *
 * Syntax highlighting is two things: deciding what each character *is*, and drawing that. A scanner
 * written by hand can do the first badly for a handful of C-family languages; it cannot do HTML or
 * CSS at all, because those need a grammar rather than a word list. Prism has the grammars, and its
 * `highlight` fills the block's own element with its own escaped output — the code never reaches the
 * page as markup a document could have written.
 *
 * The alternative that was tried first was the CSS Custom Highlight API, painting ranges over an
 * untouched flat run. It works and it was the wrong idea: it is a way to *colour* something, not a
 * way to say what a code block is, and it made the published page depend on running a script.
 *
 * ## The block is not typed into
 *
 * `contenteditable="false"`, and the caret never enters. Which is what makes the spans safe: they
 * are the renderer's, derived from the text, and nothing maps a caret through them. Editing happens
 * in a layer of its own — see `code-editor.tsx` in the app — so the text stack never meets a code
 * block at all, and every question about offsets, IME, marks, Enter and Tab stops being asked.
 *
 * ## One markup, both grounds
 *
 * The export renders through these same renderers, so the page a visitor gets carries the same
 * `<span class="token keyword">` the editor drew, with **no script at all**. That is the property the
 * Highlight API could not have: it paints at runtime, so a published page had to run our function to
 * be coloured.
 */
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-tsx.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-rust.js';
import 'prismjs/components/prism-sql.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-markdown.js';

/**
 * What a reader may write in the panel, and which grammar it means.
 *
 * Prism's own names on the right. A language it does not know draws as plain text rather than
 * guessing — a block nobody has told is not a block in the wrong language.
 */
const ALIAS: Record<string, string> = {
  js: 'javascript',
  javascript: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  markup: 'markup',
  vue: 'markup',
  css: 'css',
  scss: 'css',
  less: 'css',
  json: 'json',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  py: 'python',
  python: 'python',
  go: 'go',
  golang: 'go',
  rs: 'rust',
  rust: 'rust',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  markdown: 'markdown'
};

/**
 * A code block, **drawing itself**.
 *
 * `external({ managesDOM: true })` is how a node type says *I own my element* — the equivalent of a
 * ProseMirror NodeView, and the honest home for a block whose content is a tokenized tree rather
 * than a list of children. Two things it buys over building vnodes:
 *
 * - **No wrapper and no keys.** The element the renderer places *is* this `pre`, and what is inside
 *   it is nobody else's to reconcile — so the tokens are set once with `Prism.highlight` instead of
 *   being mapped one for one into vnodes that then need keys to be told apart.
 * - **A place for the editor to live.** A code block is edited by a real editor, and an editor is
 *   exactly the kind of DOM a renderer cannot express: it has its own view, its own state and its
 *   own idea of what is in it. Owning the element is what lets one be put *in the block's own place*
 *   rather than over it.
 *
 * `innerHTML` here is Prism's own escaped output and nothing else — the code never reaches the page
 * as markup, which is what `Prism.highlight` guarantees and why it is used rather than a string this
 * file assembles.
 */
export const codeComponent = {
  managesDOM: true as const,

  mount(props: Record<string, any>, container: HTMLElement): HTMLElement {
    const pre = (container.ownerDocument ?? document).createElement('pre');
    pre.className = 'st-code';
    /*
     * The caret never enters a code block. That is what makes the token spans safe: they are this
     * component's, derived from the text, and nothing maps a caret through them.
     */
    pre.setAttribute('contenteditable', 'false');
    pre.setAttribute('spellcheck', 'false');
    paintInto(pre, props);
    return pre;
  },

  update(instance: { element?: HTMLElement }, _before: Record<string, any>, after: Record<string, any>): void {
    if (instance?.element) paintInto(instance.element, after);
  },

  unmount(): void {
    // Nothing held open: the editing layer is the app's and closes itself.
  }
};

/** The characters this node holds — its own when it has them, its children's when it does not. */
function wordsIn(props: Record<string, any>, depth = 0): string {
  if (typeof props?.text === 'string') return props.text;
  if (depth > 8) return '';
  return ((props?.content ?? []) as unknown[])
    .map((one) => (one && typeof one === 'object' ? wordsIn(one as Record<string, any>, depth + 1) : ''))
    .join('');
}

/** Fill an element with the code, coloured if the language is one Prism knows. */
function paintInto(pre: HTMLElement, props: Record<string, any>): void {
  const language = String(props?.attributes?.language ?? '');
  const code = wordsIn(props);
  const found = grammarFor(language);

  if (language) pre.setAttribute('data-language', language);
  else pre.removeAttribute('data-language');

  if (!found) {
    // No grammar: the characters, and no claim about what any of them are.
    pre.textContent = code;
    return;
  }
  pre.innerHTML = Prism.highlight(code, found.grammar as never, found.name);
}

/** The grammar for what a reader wrote, or nothing when Prism has never heard of it. */
export function grammarFor(language: unknown): { name: string; grammar: unknown } | undefined {
  const said = String(language ?? '').trim().toLowerCase();
  const name = ALIAS[said];
  const grammar = name ? (Prism.languages as Record<string, unknown>)[name] : undefined;
  return grammar ? { name, grammar } : undefined;
}

/**
 * What Prism's classes look like.
 *
 * Prism's own token names, coloured against `currentColor` rather than a fixed palette: a code block
 * is drawn on whatever ground the page gives it, and a theme that assumed white would be unreadable
 * in a dark band. The hues are the ones every editor theme has agreed on — a comment recedes, a
 * string is warm, a keyword carries the weight.
 *
 * Only the token types this product's languages actually produce; Prism has dozens and a stylesheet
 * naming all of them would be a claim about languages nobody has loaded.
 */
export const CODE_CSS = `
.token.comment, .token.prolog, .token.doctype, .token.cdata {
  color: color-mix(in srgb, currentColor 45%, transparent);
  font-style: italic;
}
.token.punctuation { color: color-mix(in srgb, currentColor 60%, transparent); }
.token.string, .token.char, .token.attr-value, .token.regex { color: #B25E28; }
.token.number, .token.boolean, .token.constant, .token.symbol { color: #7A4FBF; }
.token.keyword, .token.atrule, .token.important, .token.selector { color: #0F7A5A; font-weight: 600; }
.token.function, .token.class-name, .token.tag { color: #1E6FB8; }
.token.attr-name, .token.property, .token.variable { color: #8A5A00; }
.token.operator, .token.entity, .token.url { color: color-mix(in srgb, currentColor 75%, transparent); }
.token.deleted { color: #B23A3A; }
.token.inserted { color: #2E7D32; }
`;
