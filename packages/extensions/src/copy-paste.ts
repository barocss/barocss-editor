import type { ModelSelection, Editor, Extension } from '@barocss/editor-core';
import { transaction, paste as pasteOp, replaceText as replaceTextOp, FragmentEditor, FRAGMENT_CLIPBOARD_TYPE, FRAGMENT_HTML_ATTRIBUTE, decodeClipboardFragment, encodeClipboardFragment, type DocumentFragment, type EditingLoss } from '@barocss/model';
import { deleteRangeOperations } from './range-delete';
import {
  HTMLConverter,
  MarkdownConverter,
  registerDefaultHTMLRules,
  registerDefaultMarkdownRules,
  registerOfficeHTMLRules,
  registerGoogleDocsHTMLRules,
  registerNotionHTMLRules,
  cleanOfficeHTML
} from '@barocss/converter';
import type { INode } from '@barocss/datastore';
import { standardClipboardFragment, standardClipboardPolicy } from './standard-clipboard';

interface ClipboardLike {
  json?: INode[];
  text?: string;
  html?: string;
  fragment?: DocumentFragment;
}
interface NativeClipboardPayload {
  selection?: ModelSelection;
  clipboardData?: Pick<DataTransfer, 'setData'>;
  /** Called synchronously while the native clipboard event is still writable. */
  onClipboardWrite?: () => void;
}

export class CopyPasteExtension implements Extension {
  name = 'copyPaste';
  priority = 100;

  private _htmlConverter: HTMLConverter | null = null;

  onCreate(editor: Editor): void {
    // Initialize HTML/Markdown Converter and register default rules
    this._htmlConverter = new HTMLConverter();
    registerDefaultHTMLRules();
    registerOfficeHTMLRules();
    registerGoogleDocsHTMLRules();
    registerNotionHTMLRules();
    registerDefaultMarkdownRules();

    // Whole sibling blocks are copied without manufacturing a text range through atoms.
    editor.registerCommand({
      name: 'copyBlocks',
      execute: async (ed: Editor, payload?: { nodeIds?: string[] }) => {
        const ids = payload?.nodeIds;
        if (!ids?.length || !this._htmlConverter) return false;
        const nodes = ids.map(id => ed.dataStore.getNode(id));
        const parent = nodes[0]?.parentId && ed.dataStore.getNode(nodes[0].parentId);
        if (!parent || nodes.some(node => !node || node.parentId !== parent.sid)) return false;
        const wanted = new Set(ids);
        const clone = (id: string): INode => {
          const node = ed.dataStore.getNode(id)!;
          return { ...node, sid: undefined, parentId: undefined, content: node.content?.map(child => clone(String(child))) } as INode;
        };
        const json = parent.content!.filter(id => wanted.has(String(id))).map(id => clone(String(id)));
        const hasDatabase = (node: INode): boolean => node.stype === 'noteDatabase' || (node.content ?? []).some(child => typeof child !== 'string' && hasDatabase(child));
        if (json.some(hasDatabase)) return false;
        try {
          const html = this._htmlConverter.convert(json, 'html'), text = getClipboardText(json, ed);
          if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
          const fragment = this._editing(ed)?.captureNodes(ids);
          await this._writeClipboard({ text, html, fragment });
          return true;
        } catch { return false; }
      }
    });

    // copy
    editor.registerCommand({
      name: 'copy',
      execute: async (ed: Editor, payload?: NativeClipboardPayload) => {
        const selection = structuredClone(payload?.selection || ed.selection);
        if (!selection || selection.type !== 'range') {
          return false;
        }

        const dataStore = ed.dataStore;
        if (!dataStore || !this._htmlConverter) return false;
        try {
          const json = dataStore.serializeRange(selection) as INode[];
          const fragment = this._editing(ed)?.captureRange(selection);
          const data = { json, fragment, text: getClipboardText(json, ed), html: this._htmlConverter.convert(json, 'html') };
          if (payload?.clipboardData) this._writeNative(data, payload);
          else await this._writeClipboard(data);
        } catch { payload?.onClipboardWrite?.(); return false; }
        // Copy is read-only. A permission failure must not report success.

        return true;
      },
      /**
       * A **range with something in it**, which is what `cut` already asked and this did not.
       *
       * Measured in the site builder while pressing every menu entry: with a caret sitting in a
       * paragraph and nothing selected, 복사 was offered — and copying nothing is a gesture that
       * reports success and leaves the clipboard holding an empty string, so the reader's *previous*
       * copy is gone. The two commands are the same question about the same selection and disagreed
       * about it.
       */
      canExecute: (ed: any, payload?: any) => {
        const selection: ModelSelection | undefined = payload?.selection || ed.selection;
        return !!selection && selection.type === 'range' && !selection.collapsed;
      }
    });

    // paste
    editor.registerCommand({
      name: 'paste',
      execute: async (ed: any, payload?: {
        selection?: ModelSelection;
        nodes?: INode[];
        clipboardHtml?: string;
        clipboardText?: string;
        clipboardFragment?: string;
        acceptLosses?: boolean;
      }) => {
        const selection = structuredClone(payload?.selection || ed.selection);
        if (!selection || selection.type !== 'range') {
          return false;
        }
        const editing = this._editing(ed);
        let ancestor = ed.dataStore?.getNode?.(selection.startNodeId);
        while (ancestor && !ed.dataStore.getActiveSchema()?.getNodeType(ancestor.stype)?.code) ancestor = ancestor.parentId ? ed.dataStore.getNode(ancestor.parentId) : undefined;
        const literalTarget = !!ancestor;
        let decoded: DocumentFragment | undefined;
        try { decoded = this._fragmentFromClipboard(payload?.clipboardFragment, payload?.clipboardHtml); }
        catch { return false; }
        if (decoded) {
          if (literalTarget && editing) return this._pasteLiteral(ed, editing, decoded, payload?.clipboardText, selection);
          return this._pasteFragment(ed, editing, decoded, selection, payload?.acceptLosses);
        }

        // Code is literal text, including tabs, blank lines and Markdown punctuation.
        if (literalTarget && payload?.clipboardText !== undefined) {
          const literal = payload.clipboardText.replace(/\r\n?/g, '\n');
          if (editing) return this._pasteFragment(ed, editing, editing.plainText(literal, selection.startNodeId, true), selection, payload?.acceptLosses);
          const result = await transaction(ed, [replaceTextOp(selection.startNodeId, selection.startOffset, selection.endNodeId, selection.endOffset, literal)]).commit();
          return !!result && result.success !== false;
        }

        let nodes: INode[] | undefined = payload?.nodes;

        // Resolve clipboard data: prefer inline payload from DOM event, then fall back to Clipboard API
        if (!nodes || nodes.length === 0) {
          let clipHtml = payload?.clipboardHtml;
          let clipText = payload?.clipboardText;

          if (!clipHtml && !clipText) {
            const checkpoint = editing?.checkpoint();
            const target = this._targetStamp(ed, selection);
            const clip = await this._readClipboard();
            if (checkpoint && !editing!.isCurrent(checkpoint) || target !== this._targetStamp(ed, selection)) return false;
            if (clip.fragment) {
              if (literalTarget && editing) return this._pasteLiteral(ed, editing, clip.fragment, clip.text, selection);
              return this._pasteFragment(ed, editing, clip.fragment, selection, payload?.acceptLosses);
            }
            clipHtml = clip.html;
            clipText = clip.text;
            if (clip.json && Array.isArray(clip.json)) {
              nodes = clip.json;
            }
          }
          if (editing && clipText !== undefined && (literalTarget || !clipHtml && !this._looksLikeMarkdown(clipText))) {
            return this._pasteFragment(ed, editing, editing.plainText(clipText, selection.startNodeId, literalTarget), selection, payload?.acceptLosses);
          }

          // 1) HTML format: distinguish Office / Google Docs / Notion / general HTML
          if ((!nodes || nodes.length === 0) && clipHtml && this._htmlConverter) {
            try {
              const source = this._detectHtmlSource(clipHtml);
              let htmlForParse = clipHtml;
              if (source === 'office') {
                htmlForParse = cleanOfficeHTML(htmlForParse);
              }
              nodes = this._htmlConverter.parse(htmlForParse, 'html') as INode[];
            } catch {
              // fallback to text
            }
          }
          // 2) text/plain: branch based on heuristic check for markdown
          if ((!nodes || nodes.length === 0) && clipText) {
            if (this._looksLikeMarkdown(clipText)) {
              try {
                const md = new MarkdownConverter();
                nodes = md.parse(clipText, 'markdown-gfm') as INode[];
              } catch {
                nodes = this._textToNodes(clipText);
              }
            } else {
              nodes = this._textToNodes(clipText);
            }
          }
        }

        if (!nodes || nodes.length === 0) {
          return false;
        }
        if (editing) return this._pasteFragment(ed, editing, standardClipboardFragment(nodes), selection, payload?.acceptLosses);

        // A document without workspace-reference vocabulary keeps the readable label.
        if (!ed.dataStore?.getActiveSchema()?.getNodeType('pageReference')) {
          const readable = (node: INode): INode => node.stype === 'pageReference'
            ? { stype: 'inline-text', text: String(node.attributes?.title ?? '제목 없음') }
            : { ...node, ...(node.content ? { content: node.content.map(child => typeof child === 'string' ? child : readable(child)) } : {}) };
          nodes = nodes.map(readable);
        }
        const builder = transaction(ed, [pasteOp(nodes as any, selection as any)]);
        const result = await builder.commit();
        return !!result && (result as any).success !== false;
      },
      canExecute: (ed: any, payload?: any) => {
        const selection: ModelSelection | undefined = payload?.selection || ed.selection;
        return ed.isEditable !== false && !!selection && selection.type === 'range';
      }
    });

    // cut
    editor.registerCommand({
      name: 'cut',
      execute: async (ed: Editor, payload?: NativeClipboardPayload) => {
        const selection = structuredClone(payload?.selection || ed.selection);
        if (!selection || selection.type !== 'range' || selection.collapsed) {
          return false;
        }

        const dataStore = ed.dataStore;
        if (!dataStore || !this._htmlConverter) return false;
        const target = this._targetStamp(ed, selection);
        const editing = this._editing(ed), checkpoint = editing?.checkpoint();
        try {
          const json = dataStore.serializeRange(selection) as INode[];
          const data = { json, fragment: editing?.captureRange(selection), text: getClipboardText(json, ed), html: this._htmlConverter.convert(json, 'html') };
          if (payload?.clipboardData) this._writeNative(data, payload);
          else await this._writeClipboard(data);
        } catch { payload?.onClipboardWrite?.(); return false; }
        if (ed.isEditable === false || checkpoint && !editing!.isCurrent(checkpoint) || target !== this._targetStamp(ed, selection)) return false;

        // Use the same reversible range deletion as Backspace, including block joins.
        const builder = transaction(ed, deleteRangeOperations(selection, ed) as never);
        const result = await builder.commit();
        return !!result && (result as any).success !== false;
      },
      canExecute: (ed: any, payload?: any) => {
        const selection: ModelSelection | undefined = payload?.selection || ed.selection;
        return ed.isEditable !== false && !!selection && selection.type === 'range' && !selection.collapsed;
      }
    });
  }

  private _editing(editor: Editor): FragmentEditor | undefined {
    const schema = editor.dataStore?.getActiveSchema();
    return typeof editor.dataStore?.getEditRevision === 'function' && schema
      ? FragmentEditor.forEditor(editor, standardClipboardPolicy(type => schema.hasNodeType(type))) : undefined;
  }
  private _fragmentFromClipboard(serialized?: string, html?: string): DocumentFragment | undefined {
    if (serialized) return decodeClipboardFragment(serialized);
    if (!html) return undefined;
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const value = parsed.querySelector(`[${FRAGMENT_HTML_ATTRIBUTE}]`)?.getAttribute(FRAGMENT_HTML_ATTRIBUTE);
    return value === undefined || value === null ? undefined : decodeClipboardFragment(decodeURIComponent(value));
  }
  private async _pasteFragment(editor: Editor, editing: FragmentEditor | undefined, fragment: DocumentFragment, selection: ModelSelection, acceptLosses = false, inputLosses: EditingLoss[] = []): Promise<boolean> {
    if (!editing) return false;
    let decision = editing.plan({ intent: 'copy', fragment, target: { kind: 'text', nodeId: selection.startNodeId, from: selection.startOffset, endNodeId: selection.endNodeId, to: selection.endOffset } });
    if (decision.ok && inputLosses.length) {
      const actions = ['transform' as const, ...decision.plan.actions], losses = [...inputLosses, ...decision.plan.losses];
      losses.forEach(loss => Object.freeze(loss)); Object.freeze(losses); Object.freeze(actions);
      decision = { ok: true, plan: Object.freeze({ ...decision.plan, outcome: 'converted', actions, losses }) };
    }
    editor.emit('editor:clipboard.plan', decision);
    if (editor.isEditable === false || !decision.ok || decision.plan.losses.length && !acceptLosses) return false;
    return (await editing.apply(decision.plan)).committed === true;
  }
  private _pasteLiteral(editor: Editor, editing: FragmentEditor, source: DocumentFragment, text: string | undefined, selection: ModelSelection): Promise<boolean> {
    // A schema code region explicitly chooses literal input. Report that conversion even though
    // this destination policy accepts it without a second user decision.
    const losses: EditingLoss[] = [{ kind: 'structure', reason: 'Literal target imports the plain-text representation instead of source structure' }];
    const visit = (nodes: DocumentFragment['content']): void => nodes.forEach(node => {
      if (node.marks?.length && !losses.some(loss => loss.kind === 'mark')) losses.push({ kind: 'mark', reason: 'Literal target does not import source marks' });
      if (Object.keys(node.attributes ?? {}).length && !losses.some(loss => loss.kind === 'attribute')) losses.push({ kind: 'attribute', reason: 'Literal target keeps destination attributes instead of source attributes' });
      if (node.content) visit(node.content);
    });
    visit(source.content);
    if (source.references.length) losses.push({ kind: 'reference', reason: 'Literal target imports reference labels instead of links' });
    return this._pasteFragment(editor, editing, editing.plainText(text ?? getClipboardText(source.content as INode[], editor), selection.startNodeId, true), selection, true, losses);
  }
  private _writeNative(data: ClipboardLike, payload: NativeClipboardPayload): void {
    const html = data.fragment ? encodeClipboardFragment(data.fragment, data.html ?? '') : data.html ?? '';
    payload.clipboardData!.setData('text/plain', data.text ?? '');
    payload.clipboardData!.setData('text/html', html);
    // Some browsers reject custom MIME. The HTML envelope already preserves the same fragment.
    if (data.fragment) {
      try { payload.clipboardData!.setData(FRAGMENT_CLIPBOARD_TYPE, JSON.stringify(data.fragment)); } catch { /* HTML transport remains available. */ }
    }
    payload.onClipboardWrite?.();
  }

  private _targetStamp(editor: Editor, selection: ModelSelection): string {
    return JSON.stringify([editor.getRootId?.(),
      editor.dataStore?.getNode(selection.startNodeId), editor.dataStore?.getNode(selection.endNodeId),
      editor.dataStore?.serializeRange(selection)]);
  }

  /**
   * Converts text to array of paragraph + inline-text nodes.
   * Used for simple paste fallback.
   */
  private _textToNodes(text: string): INode[] {
    const lines = text.split(/\r?\n/);
    const nodes: INode[] = [];
    for (const line of lines) {
      if (!line) {
        nodes.push({ stype: 'paragraph', content: [] } as any);
        continue;
      }
      nodes.push({
        stype: 'paragraph',
        content: [
          { stype: 'inline-text', text: line } as any
        ]
      } as any);
    }
    return nodes;
  }

  protected async _writeClipboard(data: ClipboardLike): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) throw new Error('Clipboard unavailable');

    // Prefer ClipboardItem API to write both text/plain and text/html
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      const items: Record<string, Blob> = {};
      if (data.text) {
        items['text/plain'] = new Blob([data.text], { type: 'text/plain' });
      }
      if (data.html || data.fragment) {
        const html = data.fragment ? encodeClipboardFragment(data.fragment, data.html ?? '') : data.html!;
        items['text/html'] = new Blob([html], { type: 'text/html' });
      }
      if (Object.keys(items).length > 0) {
        await navigator.clipboard.write([new ClipboardItem(items)]);
        return;
      }
    }
    // Fallback: write text only
    if (data.text && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(data.text);
      return;
    }
    throw new Error('Clipboard write unavailable');
  }

  protected async _readClipboard(): Promise<ClipboardLike> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return {};

    try {
      // Prefer ClipboardItem API to read both text/plain and text/html
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        const result: ClipboardLike = {};
        for (const item of items) {
          if (item.types.includes('text/html')) {
            const blob = await item.getType('text/html');
            result.html = await blob.text();
            result.fragment = this._fragmentFromClipboard(undefined, result.html);
          }
          if (item.types.includes('text/plain')) {
            const blob = await item.getType('text/plain');
            result.text = await blob.text();
          }
        }
        if (result.html || result.text) return result;
      }
      // Fallback: read text only
      if (navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        return { text };
      }
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof URIError || error instanceof Error && error.message === 'Invalid clipboard fragment envelope') throw error;
      // ignore — permission denied, etc.
    }
    return {};
  }

  /**
   * Estimates source from HTML string.
   * - office: HTML from Word/PowerPoint/Excel, etc.
   * - google-docs: Google Docs HTML
   * - notion: Notion Export/Copy HTML
   * - default: others
   */
  private _detectHtmlSource(html: string): 'office' | 'google-docs' | 'notion' | 'default' {
    const lower = html.toLowerCase();

    // Office HTML characteristics: MsoNormal, mso-*, <o:p>, v:shape, etc.
    if (
      lower.includes('class="msonormal') ||
      lower.includes('mso-') ||
      lower.includes('<o:p') ||
      lower.includes('office:') ||
      lower.includes('xmlns:o="urn:schemas-microsoft-com:office')
    ) {
      return 'office';
    }

    // Google Docs HTML characteristics: docs-internal, data-docs-*, id="docs-internal-guid-..."
    if (
      lower.includes('docs-internal') ||
      lower.includes('data-docs-') ||
      lower.includes('id="docs-internal-guid-')
    ) {
      return 'google-docs';
    }

    // Notion HTML characteristics: frequently uses data-block-id, notion- classes
    if (
      lower.includes('data-block-id') ||
      lower.includes('class="notion-')
    ) {
      return 'notion';
    }

    return 'default';
  }

  /**
   * Roughly determines if text is markdown-like.
   */
  private _looksLikeMarkdown(text: string): boolean {
    const lines = text.split(/\r?\n/).slice(0, 20); // Only look at first few lines
    let score = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^#{1,6}\s+/.test(line)) score += 2;                  // heading
      if (/^([-*+])\s+/.test(line)) score += 1;                  // bullet list
      if (/^\d+\.\s+/.test(line)) score += 1;                    // ordered list
      if (/^```/.test(line)) score += 2;                         // code fence
      if (/!\[[^\]]*]\([^)]+\)/.test(line)) score += 1;          // image syntax
      if (/\[[^\]]+]\([^)]+\)/.test(line)) score += 1;           // link syntax
      if (/^- \[[ xX]]\s+/.test(line)) score += 2;               // task list
    }
    return score >= 3;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDestroy(_editor: Editor): void {
    // no-op
  }
}


/** Plain clipboard text includes visible atoms and paragraph boundaries. */
export function getClipboardText(nodes: INode[], editor: Editor): string {
  const schema = editor.dataStore?.getActiveSchema();
  const block = (node: INode) => schema?.getNodeType(node.stype)?.group === 'block';
  const render = (node: INode): string => {
    if (typeof node.text === 'string') return node.text;
    if (node.stype === 'pageReference') return String(node.attributes?.title ?? '제목 없음');
    if (node.stype === 'hardBreak') return '\n';
    if (node.stype === 'emoji') return String(node.attributes?.unicode ?? node.attributes?.shortcode ?? '');
    if (node.stype === 'inline-image' || node.stype === 'image') return String(node.attributes?.alt ?? '');
    return join((node.content ?? []).filter((child): child is INode => typeof child !== 'string'));
  };
  const join = (items: INode[]) => items.map((node, index) => (index && (block(node) || block(items[index - 1])) ? '\n' : '') + render(node)).join('');
  return join(nodes);
}
