/**
 * Colour in a code block, painted **without touching the text**.
 *
 * ## Why the CSS Custom Highlight API and not spans
 *
 * A code block is drawn as one flat run — measured: `<pre class="w-code"><span class="w-text"><span>
 * …the whole program…</span></span></pre>`, a single text node holding the newlines and all. That is
 * what makes it editable by the ordinary text stack, and it is exactly what wrapping tokens in spans
 * would destroy: every offset in that stack is a walk from a text node, and turning one text node
 * into forty is turning one walk into forty. The caret bugs this repository has spent the most time
 * on all live in that arithmetic.
 *
 * `CSS.highlights` paints **ranges**. The DOM is not altered at all — same elements, same text node,
 * same offsets — so a block being read and a block being typed in are coloured by the same code, and
 * the caret never learns that any of it happened.
 *
 * ## Why the whole thing is one self-contained function
 *
 * Because the **published page** has to paint the same colours, and a published page carries no
 * framework and imports nothing from this repository. So the export inlines this function's own
 * source — `paintCode.toString()` — and calls it. One implementation, two grounds: the alternative
 * is a copy of the tokenizer written in a template literal, which is the fault export-as-a-render
 * exists to prevent, in the one place nobody would think to check.
 *
 * That is why there are no imports here and nothing outside the function body is referenced from
 * inside it. It reads as an oddly closed piece of code and it is deliberate.
 *
 * ## What the tokenizer is, and is not
 *
 * A scanner, not a parser. It knows comments, strings, numbers and words, and whether a word is a
 * keyword in the language it was told. That is enough to make a code *sample* on a page readable and
 * it will be wrong about a regular expression containing a quote — which is a trade a marketing page
 * can make and a compiler cannot. The alternative is a real grammar per language, which is the point
 * at which a site builder has quietly become an IDE.
 */

/** The names the stylesheet paints, in the order a scanner finds them. */
export const CODE_TOKENS = ['comment', 'string', 'number', 'keyword'] as const;

/**
 * Paint every code block under `root`.
 *
 * Self-contained on purpose — see the header. Everything it needs is inside it, so the export can
 * take its source and run it on a page that has never heard of this package.
 */
export function paintCode(root: Document | ParentNode): void {
  const scope: any = typeof globalThis === 'undefined' ? undefined : (globalThis as any);
  const registry = scope && scope.CSS && scope.CSS.highlights;
  const Highlighter = scope && scope.Highlight;
  if (!registry || !Highlighter) return;

  const WORDS: Record<string, string> = {
    js: 'await async break case catch class const continue default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while yield true false null undefined',
    ts: 'await async break case catch class const continue declare default delete do else enum export extends finally for from function if implements import in instanceof interface let namespace new of private protected public readonly return static super switch this throw try type typeof var void while yield true false null undefined',
    css: 'and from important media not only or supports to',
    html: 'DOCTYPE',
    json: 'true false null',
    py: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda None nonlocal not or pass raise return True False try while with yield',
    sh: 'case do done elif else esac fi for function if in then until while',
    go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil',
    rs: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self static struct super trait type unsafe use where while true false'
  };
  const ALIAS: Record<string, string> = {
    javascript: 'js', jsx: 'js', mjs: 'js', node: 'js',
    typescript: 'ts', tsx: 'ts',
    python: 'py', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh',
    golang: 'go', rust: 'rs', scss: 'css', less: 'css', xml: 'html', svg: 'html'
  };

  const found: Record<string, Range[]> = { comment: [], string: [], number: [], keyword: [] };

  const blocks = (root as ParentNode).querySelectorAll
    ? (root as ParentNode).querySelectorAll('pre.w-code')
    : [];

  blocks.forEach((block: Element) => {
    /*
     * The text nodes in order, and where each one starts in the block's whole text. A code block is
     * one run today; `content: 'inline*'` allows more, and a paste can make one — so the offsets are
     * counted across them rather than assumed to be a single node.
     */
    const doc = block.ownerDocument;
    const walker = doc.createTreeWalker(block, 4 /* NodeFilter.SHOW_TEXT */);
    const pieces: { node: Text; at: number }[] = [];
    let code = '';
    let node = walker.nextNode() as Text | null;
    while (node) {
      pieces.push({ node, at: code.length });
      code += node.data;
      node = walker.nextNode() as Text | null;
    }
    if (code.length === 0) return;

    const said = (block.getAttribute('data-language') || '').toLowerCase();
    const language = ALIAS[said] || said;
    const keywords = new Set((WORDS[language] || '').split(' ').filter(Boolean));
    const hashComments = language === 'py' || language === 'sh' || language === 'yaml';

    /** A range over the block's whole text, mapped back onto the text nodes it crosses. */
    const rangeFor = (start: number, end: number): Range | undefined => {
      let from: { node: Text; offset: number } | undefined;
      let to: { node: Text; offset: number } | undefined;
      for (const piece of pieces) {
        const stop = piece.at + piece.node.data.length;
        if (!from && start < stop) from = { node: piece.node, offset: start - piece.at };
        if (!to && end <= stop) to = { node: piece.node, offset: end - piece.at };
      }
      if (!from || !to) return undefined;
      const range = doc.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      return range;
    };

    const push = (kind: string, start: number, end: number) => {
      const range = rangeFor(start, end);
      if (range) found[kind].push(range);
    };

    let i = 0;
    while (i < code.length) {
      const ch = code[i];
      const next = code[i + 1];

      // Comments, which swallow everything to the end of the line or of the pair.
      if (ch === '/' && next === '/') {
        const end = code.indexOf('\n', i);
        push('comment', i, end < 0 ? code.length : end);
        i = end < 0 ? code.length : end;
        continue;
      }
      if (ch === '/' && next === '*') {
        const end = code.indexOf('*/', i + 2);
        push('comment', i, end < 0 ? code.length : end + 2);
        i = end < 0 ? code.length : end + 2;
        continue;
      }
      if (hashComments && ch === '#') {
        const end = code.indexOf('\n', i);
        push('comment', i, end < 0 ? code.length : end);
        i = end < 0 ? code.length : end;
        continue;
      }

      // Strings, ended by the same quote and not by an escaped one.
      if (ch === '"' || ch === "'" || ch === '`') {
        let at = i + 1;
        while (at < code.length && code[at] !== ch) at += code[at] === '\\' ? 2 : 1;
        push('string', i, Math.min(at + 1, code.length));
        i = Math.min(at + 1, code.length);
        continue;
      }

      // Numbers, including what follows the digits so `0x1f` and `1.5e3` come out whole.
      if (ch >= '0' && ch <= '9') {
        let at = i + 1;
        while (at < code.length && /[0-9a-fA-F_.xXeE+-]/.test(code[at])) {
          if ((code[at] === '+' || code[at] === '-') && !/[eE]/.test(code[at - 1])) break;
          at += 1;
        }
        push('number', i, at);
        i = at;
        continue;
      }

      // Words. A keyword is a word the language claims; everything else is left the text's colour.
      if (/[A-Za-z_$@]/.test(ch)) {
        let at = i + 1;
        while (at < code.length && /[\w$-]/.test(code[at])) at += 1;
        if (keywords.has(code.slice(i, at))) push('keyword', i, at);
        i = at;
        continue;
      }

      i += 1;
    }
  });

  for (const kind of ['comment', 'string', 'number', 'keyword']) {
    const ranges = found[kind];
    if (ranges.length === 0) registry.delete('code-' + kind);
    else registry.set('code-' + kind, new Highlighter(...ranges));
  }
}

/**
 * What the four token kinds look like.
 *
 * `currentColor` mixed rather than four hard-coded hexes: a code block is drawn on whatever ground
 * the page gives it, and a palette that assumed white would be unreadable in a dark band. The hues
 * are the ones every editor theme has agreed on for thirty years — a comment recedes, a string is
 * warm, a keyword carries the weight.
 */
export const CODE_HIGHLIGHT_CSS = `
::highlight(code-comment) { color: color-mix(in srgb, currentColor 45%, transparent); font-style: italic; }
::highlight(code-string) { color: #B25E28; }
::highlight(code-number) { color: #7A4FBF; }
::highlight(code-keyword) { color: #0F7A5A; font-weight: 600; }
`;
