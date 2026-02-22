import type { ModelSelection, Editor, Extension } from '@barocss/editor-core';
import { transaction, copy as copyOp, paste as pasteOp, cut as cutOp } from '@barocss/model';
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

    // copy
    editor.registerCommand({
      name: 'copy',
      execute: async (ed: any, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || ed.selection;
        if (!selection || selection.type !== 'range') {
          return false;
        }

        // 1) Model perspective copy → maintained for history/undo
        const builder = transaction(ed, [copyOp(selection as any)]);
        const result = await builder.commit();
        if (!result || (result as any).success === false) {
          return false;
        }

        // 2) Generate Clipboard data based on DataStore + Converter
        const dataStore = (ed as any).dataStore;
        if (dataStore && this._htmlConverter) {
          try {
            const json: INode[] = dataStore.serializeRange(selection) as INode[];
            const text: string = dataStore.range.extractText(selection);
            const html: string = this._htmlConverter.convert(json, 'html');
            await this._writeClipboard({ json, text, html });
          } catch {
            // Clipboard failure does not block editing itself
          }
        }

        return true;
      },
      canExecute: (ed: any, payload?: any) => {
        const selection: ModelSelection | undefined = payload?.selection || ed.selection;
        return !!selection && selection.type === 'range';
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
        let selection = payload?.selection || ed.selection;
        if (!selection || selection.type !== 'range') {
          return false;
        }

        let nodes: INode[] | undefined = payload?.nodes;

        // Resolve clipboard data: prefer inline payload from DOM event, then fall back to Clipboard API
        if (!nodes || nodes.length === 0) {
          let clipHtml = payload?.clipboardHtml;
          let clipText = payload?.clipboardText;

          if (!clipHtml && !clipText) {
            const clip = await this._readClipboard();
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
        const selection = payload?.selection || ed.selection;
        if (!selection || selection.type !== 'range' || selection.collapsed) {
          return false;
        }

        const dataStore = (ed as any).dataStore;
        if (dataStore && this._htmlConverter) {
          try {
            const json: INode[] = dataStore.serializeRange(selection) as INode[];
            const text: string = dataStore.range.extractText(selection);
            const html: string = this._htmlConverter.convert(json, 'html');
            await this._writeClipboard({ json, text, html });
          } catch {
            // clipboard failure does not block editing itself
          }
        }

        const builder = transaction(ed, [cutOp(selection as any)]);
        const result = await builder.commit();
        return !!result && (result as any).success !== false;
      },
      canExecute: (ed: any, payload?: any) => {
        const selection: ModelSelection | undefined = payload?.selection || ed.selection;
        return !!selection && selection.type === 'range' && !selection.collapsed;
      }
    });
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
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;

    try {
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
      }
    } catch {
      // ignore clipboard errors — permission denied, etc.
    }
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


