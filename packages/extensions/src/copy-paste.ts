import type { ModelSelection, Editor, Extension } from '@barocss/editor-core';
import { transaction, paste as pasteOp, replaceText as replaceTextOp } from '@barocss/model';
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

interface ClipboardLike {
  json?: INode[];
  text?: string;
  html?: string;
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
          await navigator.clipboard.write([new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' })
          })]);
          return true;
        } catch { return false; }
      }
    });

    // copy
    editor.registerCommand({
      name: 'copy',
      execute: async (ed: any, payload?: { selection?: ModelSelection }) => {
        const selection = structuredClone(payload?.selection || ed.selection);
        if (!selection || selection.type !== 'range') {
          return false;
        }

        const dataStore = ed.dataStore;
        if (!dataStore || !this._htmlConverter) return false;
        try {
          const json = dataStore.serializeRange(selection) as INode[];
          await this._writeClipboard({ json, text: getClipboardText(json, ed), html: this._htmlConverter.convert(json, 'html') });
        } catch { return false; }
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
      }) => {
        const selection = structuredClone(payload?.selection || ed.selection);
        if (!selection || selection.type !== 'range') {
          return false;
        }

        // Code is literal text, including tabs, blank lines and Markdown punctuation.
        let ancestor = ed.dataStore?.getNode?.(selection.startNodeId);
        while (ancestor && ancestor.stype !== 'codeBlock') ancestor = ancestor.parentId ? ed.dataStore.getNode(ancestor.parentId) : undefined;
        if (ancestor && payload?.clipboardText !== undefined) {
          const literal = payload.clipboardText.replace(/\r\n?/g, '\n');
          const result = await transaction(ed, [replaceTextOp(selection.startNodeId, selection.startOffset, selection.endNodeId, selection.endOffset, literal)]).commit();
          return !!result && result.success !== false;
        }

        let nodes: INode[] | undefined = payload?.nodes;

        // Resolve clipboard data: prefer inline payload from DOM event, then fall back to Clipboard API
        if (!nodes || nodes.length === 0) {
          let clipHtml = payload?.clipboardHtml;
          let clipText = payload?.clipboardText;

          if (!clipHtml && !clipText) {
            const target = this._targetStamp(ed, selection);
            const clip = await this._readClipboard();
            if (target !== this._targetStamp(ed, selection)) return false;
            clipHtml = clip.html;
            clipText = clip.text;
            if (clip.json && Array.isArray(clip.json)) {
              nodes = clip.json;
            }
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
        return !!selection && selection.type === 'range';
      }
    });

    // cut
    editor.registerCommand({
      name: 'cut',
      execute: async (ed: any, payload?: { selection?: ModelSelection }) => {
        const selection = structuredClone(payload?.selection || ed.selection);
        if (!selection || selection.type !== 'range' || selection.collapsed) {
          return false;
        }

        const dataStore = ed.dataStore;
        if (!dataStore || !this._htmlConverter) return false;
        const target = this._targetStamp(ed, selection);
        try {
          const json = dataStore.serializeRange(selection) as INode[];
          await this._writeClipboard({ json, text: getClipboardText(json, ed), html: this._htmlConverter.convert(json, 'html') });
        } catch { return false; }
        if (target !== this._targetStamp(ed, selection)) return false;

        // Use the same reversible range deletion as Backspace, including block joins.
        const builder = transaction(ed, deleteRangeOperations(selection, ed) as never);
        const result = await builder.commit();
        return !!result && (result as any).success !== false;
      },
      canExecute: (ed: any, payload?: any) => {
        const selection: ModelSelection | undefined = payload?.selection || ed.selection;
        return !!selection && selection.type === 'range' && !selection.collapsed;
      }
    });
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
      if (data.html) {
        items['text/html'] = new Blob([data.html], { type: 'text/html' });
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
    } catch {
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

