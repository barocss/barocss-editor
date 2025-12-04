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
    // HTML/Markdown Converter 초기화 및 기본 규칙 등록
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

        // 1) 모델 관점 copy → 히스토리/undo를 위해 유지
        const builder = transaction(ed, [copyOp(selection as any)]);
        const result = await builder.commit();
        if (!result || (result as any).success === false) {
          return false;
        }

        // 2) DataStore + Converter 기반 Clipboard 데이터 생성
        const dataStore = (ed as any).dataStore;
        if (dataStore && this._htmlConverter) {
          try {
            const json: INode[] = dataStore.serializeRange(selection) as INode[];
            const text: string = dataStore.range.extractText(selection);
            const html: string = this._htmlConverter.convert(json, 'html');
            await this._writeClipboard({ json, text, html });
          } catch {
            // Clipboard 실패는 편집 자체를 막지 않는다.
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
      execute: async (ed: any, payload?: { selection?: ModelSelection; nodes?: INode[] }) => {
        let selection = payload?.selection || ed.selection;
        if (!selection || selection.type !== 'range') {
          return false;
        }

        let nodes: INode[] | undefined = payload?.nodes;

        // payload로 nodes가 안 오면 Clipboard에서 읽어온다.
        if (!nodes || nodes.length === 0) {
          const clip = await this._readClipboard();
          // 1) 내부 JSON 포맷 (application/x-barocss 등에서 온 결과라고 가정)
          if (clip.json && Array.isArray(clip.json)) {
            nodes = clip.json;
          }
          // 2) HTML 포맷: Office / Google Docs / Notion / 일반 HTML 구분
          if ((!nodes || nodes.length === 0) && clip.html && this._htmlConverter) {
            try {
              const source = this._detectHtmlSource(clip.html);
              let htmlForParse = clip.html;
              if (source === 'office') {
                htmlForParse = cleanOfficeHTML(htmlForParse);
              }
              // Google Docs / Notion 은 각각 registerGoogleDocsHTMLRules / registerNotionHTMLRules
              // 가 onCreate 에서 이미 호출되어 있으므로, 여기서는 HTML만 넘겨주면 된다.
              nodes = this._htmlConverter.parse(htmlForParse, 'html') as INode[];
            } catch {
              // fallback to text
            }
          }
          // 3) text/plain: markdown 여부를 heuristic 으로 보고 분기
          if ((!nodes || nodes.length === 0) && clip.text) {
            if (this._looksLikeMarkdown(clip.text)) {
              try {
                const md = new MarkdownConverter();
                nodes = md.parse(clip.text, 'markdown-gfm') as INode[];
              } catch {
                nodes = this._textToNodes(clip.text);
              }
            } else {
              nodes = this._textToNodes(clip.text);
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
        const nodes: any[] | undefined = payload?.nodes;
        return !!selection && selection.type === 'range' && Array.isArray(nodes) && nodes.length > 0;
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
            // clipboard 실패는 편집 자체를 막지 않는다.
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
   * 텍스트를 paragraph + inline-text 노드 배열로 변환한다.
   * 단순 paste fallback 용도로 사용된다.
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

  // 실제 브라우저 Clipboard API 대신, 테스트/호출자가 교체 가능한 훅을 제공한다.
  // 기본 구현은 브라우저 환경이면 navigator.clipboard.writeText로 텍스트만 기록한다.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async _writeClipboard(data: ClipboardLike): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText && data.text) {
        await (navigator as any).clipboard.writeText(data.text);
      }
    } catch {
      // ignore clipboard errors
    }
  }

  /**
   * Clipboard에서 데이터를 읽어온다.
   * 기본 구현은 text 기반만 지원한다.
   */
  protected async _readClipboard(): Promise<ClipboardLike> {
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.readText) {
        const text = await (navigator as any).clipboard.readText();
        return { text };
      }
    } catch {
      // ignore
    }
    return {};
  }

  /**
   * HTML 문자열에서 소스를 추정한다.
   * - office: Word/PowerPoint/Excel 등의 HTML
   * - google-docs: Google Docs HTML
   * - notion: Notion Export/Copy HTML
   * - default: 그 외
   */
  private _detectHtmlSource(html: string): 'office' | 'google-docs' | 'notion' | 'default' {
    const lower = html.toLowerCase();

    // Office HTML 특징: MsoNormal, mso-*, <o:p>, v:shape 등
    if (
      lower.includes('class="msonormal') ||
      lower.includes('mso-') ||
      lower.includes('<o:p') ||
      lower.includes('office:') ||
      lower.includes('xmlns:o="urn:schemas-microsoft-com:office')
    ) {
      return 'office';
    }

    // Google Docs HTML 특징: docs-internal, data-docs-*, id="docs-internal-guid-..."
    if (
      lower.includes('docs-internal') ||
      lower.includes('data-docs-') ||
      lower.includes('id="docs-internal-guid-')
    ) {
      return 'google-docs';
    }

    // Notion HTML 특징: data-block-id, notion- 클래스를 자주 사용
    if (
      lower.includes('data-block-id') ||
      lower.includes('class="notion-')
    ) {
      return 'notion';
    }

    return 'default';
  }

  /**
   * 텍스트가 markdown-like 인지 대략적으로 판정한다.
   */
  private _looksLikeMarkdown(text: string): boolean {
    const lines = text.split(/\r?\n/).slice(0, 20); // 처음 몇 줄만 본다
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


