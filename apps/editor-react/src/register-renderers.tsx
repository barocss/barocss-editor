/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
//
// editor-react 전용 렌더러 — 블록 + 마크 모두 React 컴포넌트(external())로 정의.
//
// ▸ define('nodeType', external(Component))   — 블록 노드
// ▸ defineMark('markType', external(Component)) — 인라인 마크
//
// Props 규약 (renderer-react → Component):
//   블록: { sid, stype, attributes, children, text, model }
//   마크: { markType, attributes, text, children }  (children = 내부 텍스트 or 중첩 마크)
//
import React, { useRef, useEffect } from 'react';
import { define, defineMark, external } from '@barocss/dsl';
import type { BlockComponentProps, MarkComponentProps } from '@barocss/dsl';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

type BP = BlockComponentProps;
type MP = MarkComponentProps;

/** 단순 래퍼 팩토리 — 자식(children)만 감싸는 블록 */
const wrap = (Tag: string, cls: string) =>
  ({ sid, stype, children }: BP) => (
    <Tag className={cls} data-bc-sid={sid} data-bc-stype={stype}>{children}</Tag>
  );

// ═══════════════════════════════════════════════════════════════════════
// Block Components
// ═══════════════════════════════════════════════════════════════════════

function Heading({ sid, stype, attributes, children }: BP) {
  const Tag = `h${attributes?.level || 1}` as any;
  return <Tag className="heading" data-bc-sid={sid} data-bc-stype={stype}>{children}</Tag>;
}

function Paragraph({ sid, stype, attributes, children }: BP) {
  return (
    <p className="paragraph" data-placeholder={attributes?.placeholder ?? ''} data-bc-sid={sid} data-bc-stype={stype}>
      {children}
    </p>
  );
}

function CodeFence({ sid, stype, attributes, text }: BP) {
  const lang = attributes?.language ?? 'text';
  return (
    <pre className="code-fence" data-language={lang} data-bc-sid={sid} data-bc-stype={stype}>
      <code data-language={lang}>{text ?? ''}</code>
    </pre>
  );
}

function Column({ sid, stype, attributes, children }: BP) {
  const width = attributes?.width;
  return (
    <div
      className="column"
      style={{ width: width || undefined, flex: width ? '0 0 auto' : '1 1 0', boxSizing: 'border-box' }}
      data-bc-sid={sid} data-bc-stype={stype}
    >
      {children}
    </div>
  );
}

function FootnoteDef({ sid, stype, attributes, children }: BP) {
  const id = attributes?.id ?? '';
  return (
    <div className="footnote-def" id={`fn-${id}`} data-bc-sid={sid} data-bc-stype={stype}>
      <sup className="footnote-label">{id}</sup>
      <span className="footnote-content">{children}</span>
    </div>
  );
}

function InlineImage({ sid, stype, attributes }: BP) {
  return <img src={attributes?.src ?? ''} alt={attributes?.alt ?? ''} data-bc-sid={sid} data-bc-stype={stype} />;
}

function Emoji({ sid, stype, attributes }: BP) {
  const unicode = attributes?.unicode ?? '';
  const shortcode = attributes?.shortcode ?? '';
  return (
    <span className="emoji" data-emoji="true" data-shortcode={shortcode} data-unicode={unicode} data-bc-sid={sid} data-bc-stype={stype}>
      {unicode || shortcode}
    </span>
  );
}

function CodeBlock({ sid, stype, attributes, text }: BP) {
  const lang = attributes?.language ?? 'text';
  return (
    <div className="code-block" data-language={lang} data-bc-sid={sid} data-bc-stype={stype}>
      <pre className="code-content" data-language={lang}>{text ?? ''}</pre>
    </div>
  );
}

function List({ sid, stype, attributes, children }: BP) {
  const type = attributes?.type ?? 'bullet';
  const Tag = type === 'ordered' ? 'ol' : 'ul';
  return (
    <Tag className={`list list-${type}`} data-list-type={type} data-bc-sid={sid} data-bc-stype={stype}>
      {children}
    </Tag>
  );
}

function TaskItem({ sid, stype, attributes, children }: BP) {
  const checked = attributes?.checked ?? false;
  return (
    <li className="task-item" data-checked={String(checked)} data-bc-sid={sid} data-bc-stype={stype}>
      <input type="checkbox" checked={checked} disabled />
      <span className="task-content">{children}</span>
    </li>
  );
}

function Callout({ sid, stype, attributes, children }: BP) {
  const type = attributes?.type ?? 'info';
  return (
    <div className={`callout callout-${type}`} data-type={type} data-bc-sid={sid} data-bc-stype={stype}>
      <div className="callout-title">{attributes?.title ?? ''}</div>
      <div className="callout-body">{children}</div>
    </div>
  );
}

function CommentThread({ sid, stype, attributes, children }: BP) {
  return (
    <aside className="comment-thread" data-id={attributes?.id ?? ''} data-bc-sid={sid} data-bc-stype={stype}>
      {children}
    </aside>
  );
}

function EndnoteDef({ sid, stype, attributes, children }: BP) {
  const id = attributes?.id ?? '';
  return (
    <div className="endnote-def" id={`en-${id}`} data-bc-sid={sid} data-bc-stype={stype}>
      <sup className="endnote-label">{id}</sup>
      <span className="endnote-content">{children}</span>
    </div>
  );
}

function FieldDateTime({ sid, stype, attributes }: BP) {
  return (
    <time className="field-datetime" dateTime={new Date().toISOString()} data-bc-sid={sid} data-bc-stype={stype}>
      {attributes?.format ?? ''}
    </time>
  );
}

function BookmarkAnchor({ sid, stype, attributes }: BP) {
  return <a className="bookmark-anchor" id={attributes?.id} data-bc-sid={sid} data-bc-stype={stype} />;
}

function BTable({ sid, stype, attributes, children }: BP) {
  const caption = attributes?.caption;
  return (
    <table className="table" data-bc-caption={caption ?? ''} data-bc-sid={sid} data-bc-stype={stype}>
      {caption && <caption className="table-caption">{caption}</caption>}
      {children}
    </table>
  );
}

function BTableHeader({ sid, stype, children }: BP) {
  return (
    <thead className="table-head" data-bc-sid={sid} data-bc-stype={stype}>
      <tr className="table-row">{children}</tr>
    </thead>
  );
}

function BTableHeaderCell({ sid, stype, attributes, children }: BP) {
  return (
    <th className="table-cell" colSpan={attributes?.colspan ?? 1} rowSpan={attributes?.rowspan ?? 1} scope="col" data-bc-sid={sid} data-bc-stype={stype}>
      {children}
    </th>
  );
}

function BTableCell({ sid, stype, attributes, children }: BP) {
  const isHeader = !!attributes?.header;
  const Tag = isHeader ? 'th' : 'td';
  return (
    <Tag className="table-cell" colSpan={attributes?.colspan ?? 1} rowSpan={attributes?.rowspan ?? 1} scope={isHeader ? 'col' : undefined} data-bc-sid={sid} data-bc-stype={stype}>
      {children}
    </Tag>
  );
}

function MediaVideo({ sid, stype, attributes }: BP) {
  return <video className="video" src={attributes?.src ?? ''} poster={attributes?.poster ?? ''} controls={attributes?.controls ?? true} data-bc-sid={sid} data-bc-stype={stype} />;
}

function MediaAudio({ sid, stype, attributes }: BP) {
  return <audio className="audio" src={attributes?.src ?? ''} controls={attributes?.controls ?? true} data-bc-sid={sid} data-bc-stype={stype} />;
}

function MediaEmbed({ sid, stype, attributes }: BP) {
  return (
    <iframe
      className="embed" title={attributes?.title ?? ''}
      data-provider={attributes?.provider ?? ''} data-embed-id={attributes?.id ?? ''}
      width="560" height="315" frameBorder="0" allowFullScreen
      data-bc-sid={sid} data-bc-stype={stype}
    />
  );
}

function Columns({ sid, stype, children }: BP) {
  return (
    <div className="columns" style={{ display: 'flex', gap: '16px', alignItems: 'stretch', width: '100%' }} data-bc-sid={sid} data-bc-stype={stype}>
      {children}
    </div>
  );
}

function InlineText({ sid, stype, text }: BP) {
  return <span className="text" data-bc-sid={sid} data-bc-stype={stype}>{text ?? ''}</span>;
}

// ── Side-effect components ─────────────────────────────────────────────

function MathInline({ sid, attributes }: BP) {
  const ref = useRef<HTMLSpanElement>(null);
  const tex = attributes?.tex ?? '';
  const engine = attributes?.engine ?? 'katex';
  useEffect(() => {
    if (!ref.current || !tex) return;
    try { katex.render(tex, ref.current, { displayMode: false, throwOnError: false }); }
    catch { if (ref.current) ref.current.textContent = tex; }
  }, [tex]);
  return <span ref={ref} className="math-inline" data-engine={engine} data-bc-sid={sid} data-bc-stype="mathInline">{tex ? null : ''}</span>;
}

function MathBlock({ sid, attributes }: BP) {
  const ref = useRef<HTMLDivElement>(null);
  const tex = attributes?.tex ?? '';
  const engine = attributes?.engine ?? 'katex';
  useEffect(() => {
    if (!ref.current || !tex) return;
    try { katex.render(tex, ref.current, { displayMode: true, throwOnError: false }); }
    catch { if (ref.current) ref.current.textContent = tex; }
  }, [tex]);
  return <div ref={ref} className="math-block" data-engine={engine} data-bc-sid={sid} data-bc-stype="mathBlock">{tex ? null : '(empty equation)'}</div>;
}

function ChartBlock({ sid, attributes }: BP) {
  const title = (attributes?.title ?? 'Chart').toString();
  const raw = (attributes?.values ?? '').toString();
  const values = raw.split(',').map((v: string) => Number(v.trim())).filter((n: number) => Number.isFinite(n));
  const maxVal = Math.max(...values, 1);
  return (
    <div className="chart-host" style={{ display: 'block', minHeight: '180px' }} data-bc-sid={sid} data-bc-stype="chart">
      <div className="chart-container" style={{ height: '160px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div className="chart-title">{title}</div>
        <div className="chart-bars" style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100%' }}>
          {values.length === 0
            ? <div className="chart-empty">No data</div>
            : values.map((n: number, i: number) => (
                <div key={i} className="chart-bar" style={{
                  height: `${Math.max(2, Math.min(100, (n / maxVal) * 100))}%`,
                  width: '16px', background: '#4F46E5', borderRadius: '3px 3px 0 0',
                }} />
              ))
          }
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Mark Components
// ═══════════════════════════════════════════════════════════════════════

function BoldMark({ children, attributes }: MP) {
  return <span className="custom-bold mark-bold" data-mark-type="bold" data-weight={attributes?.weight ?? 'bold'} style={{ fontWeight: 'bold', padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function ItalicMark({ children, attributes }: MP) {
  return <span className="custom-italic mark-italic" data-mark-type="italic" data-style={attributes?.style ?? 'italic'} style={{ fontStyle: 'italic', padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function FontColorMark({ children, attributes }: MP) {
  const color = attributes?.color ?? '#000000';
  return <span className="custom-font-color mark-fontColor" data-mark-type="fontColor" data-color={color} style={{ color, padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function BgColorMark({ children, attributes }: MP) {
  const bg = attributes?.bgColor ?? '#ffff00';
  return <span className="custom-bg-color mark-bgColor" data-mark-type="bgColor" data-bg-color={bg} style={{ backgroundColor: bg, padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function UnderlineMark({ children }: MP) {
  return <span className="custom-underline mark-underline" data-mark-type="underline" style={{ textDecoration: 'underline', textDecorationColor: '#666', textDecorationThickness: '2px', padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function StrikethroughMark({ children }: MP) {
  return <span className="custom-strikethrough mark-strikethrough" data-mark-type="strikethrough" style={{ textDecoration: 'line-through', textDecorationColor: '#ff0000', textDecorationThickness: '2px', padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function CodeMark({ children, attributes }: MP) {
  return (
    <span className="custom-code mark-code" data-mark-type="code" data-language={attributes?.language ?? 'text'} style={{
      fontFamily: 'Monaco, Consolas, "Courier New", monospace', backgroundColor: '#f5f5f5', color: '#d63384',
      padding: '2px 4px', borderRadius: '3px', fontSize: '0.9em', border: '1px solid #e0e0e0',
    }}>
      {children}
    </span>
  );
}

function InlineCodeMark({ children, attributes }: MP) {
  return <code className="mark-inline-code" data-language={attributes?.language ?? 'text'}>{children}</code>;
}

function LinkMark({ children, attributes }: MP) {
  return (
    <a className="custom-link mark-link" data-mark-type="link" href={attributes?.href ?? '#'} title={attributes?.title ?? ''} target="_blank" rel="noopener noreferrer" style={{
      color: '#007bff', textDecoration: 'underline', textDecorationColor: '#007bff', padding: '1px 2px', borderRadius: '2px',
    }}>
      {children}
    </a>
  );
}

function InsertedMark({ children, attributes }: MP) {
  return <ins className="mark-inserted" data-author={attributes?.author ?? ''} data-date={attributes?.date ?? ''}>{children}</ins>;
}

function DeletedMark({ children, attributes }: MP) {
  return <del className="mark-deleted" data-author={attributes?.author ?? ''} data-date={attributes?.date ?? ''}>{children}</del>;
}

function CitationMark({ children, attributes }: MP) {
  return <span className="mark-citation" data-key={attributes?.key ?? ''} data-style={attributes?.style ?? ''}>{children}</span>;
}

function XrefMark({ children, attributes }: MP) {
  return <a className="mark-xref" href={`#${attributes?.target ?? ''}`} title={attributes?.label ?? ''}>{children}</a>;
}

function IndexEntryMark({ children, attributes }: MP) {
  return <span className="mark-index-entry" data-term={attributes?.term ?? ''} data-subterm={attributes?.subterm ?? ''}>{children}</span>;
}

function EndnoteRefMark({ attributes }: MP) {
  const id = attributes?.id ?? '';
  return <sup className="endnote-ref"><a href={`#en-${id}`}>{id}</a></sup>;
}

function BookmarkMark({ children, attributes }: MP) {
  return <a className="mark-bookmark" id={attributes?.id}>{children}</a>;
}

function HighlightMark({ children, attributes }: MP) {
  const color = attributes?.color ?? '#ffff00';
  return <span className="custom-highlight mark-highlight" data-mark-type="highlight" data-highlight-color={color} style={{ backgroundColor: color, padding: '1px 2px', borderRadius: '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>{children}</span>;
}

function FontSizeMark({ children, attributes }: MP) {
  const size = attributes?.size ?? '14px';
  return <span className="custom-font-size mark-fontSize" data-mark-type="fontSize" data-size={size} style={{ fontSize: size, padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function FontFamilyMark({ children, attributes }: MP) {
  const family = attributes?.family ?? 'Arial';
  return <span className="custom-font-family mark-fontFamily" data-mark-type="fontFamily" data-family={family} style={{ fontFamily: family, padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function SubscriptMark({ children, attributes }: MP) {
  return <sub className="custom-subscript mark-subscript" data-mark-type="subscript" data-position={attributes?.position ?? 'sub'} style={{ fontSize: '0.75em', verticalAlign: 'sub', padding: '1px 2px', borderRadius: '2px' }}>{children}</sub>;
}

function SuperscriptMark({ children, attributes }: MP) {
  return <sup className="custom-superscript mark-superscript" data-mark-type="superscript" data-position={attributes?.position ?? 'super'} style={{ fontSize: '0.75em', verticalAlign: 'super', padding: '1px 2px', borderRadius: '2px' }}>{children}</sup>;
}

function SmallCapsMark({ children, attributes }: MP) {
  return <span className="custom-small-caps mark-smallCaps" data-mark-type="smallCaps" data-variant={attributes?.variant ?? 'small-caps'} style={{ fontVariant: 'small-caps', padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function LetterSpacingMark({ children, attributes }: MP) {
  const spacing = attributes?.spacing ?? '0.1em';
  return <span className="custom-letter-spacing mark-letterSpacing" data-mark-type="letterSpacing" data-spacing={spacing} style={{ letterSpacing: spacing, padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function WordSpacingMark({ children, attributes }: MP) {
  const spacing = attributes?.spacing ?? '0.2em';
  return <span className="custom-word-spacing mark-wordSpacing" data-mark-type="wordSpacing" data-spacing={spacing} style={{ wordSpacing: spacing, padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function LineHeightMark({ children, attributes }: MP) {
  const height = attributes?.height ?? '1.5';
  return <span className="custom-line-height mark-lineHeight" data-mark-type="lineHeight" data-height={height} style={{ lineHeight: height, padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function TextShadowMark({ children, attributes }: MP) {
  const shadow = attributes?.shadow ?? '1px 1px 2px rgba(0,0,0,0.3)';
  return <span className="custom-text-shadow mark-textShadow" data-mark-type="textShadow" data-shadow={shadow} style={{ textShadow: shadow, padding: '1px 2px', borderRadius: '2px' }}>{children}</span>;
}

function BorderMark({ children, attributes }: MP) {
  return (
    <span className="custom-border mark-border" data-mark-type="border" data-style={attributes?.style ?? 'solid'} data-width={attributes?.width ?? '1px'} data-color={attributes?.color ?? '#000000'} style={{
      borderStyle: attributes?.style ?? 'solid', borderWidth: attributes?.width ?? '1px', borderColor: attributes?.color ?? '#000000', padding: '1px 2px', borderRadius: '2px',
    }}>
      {children}
    </span>
  );
}

function KbdMark({ children }: MP) {
  return <kbd className="mark-kbd">{children}</kbd>;
}

function MentionMark({ children, attributes }: MP) {
  return <span className="mention mark-mention" data-id={attributes?.id ?? ''}>{children}</span>;
}

function SpoilerMark({ children }: MP) {
  return <span className="spoiler mark-spoiler"><span className="spoiler-toggle" />{children}</span>;
}

function FootnoteRefMark({ attributes }: MP) {
  const id = attributes?.id ?? '';
  return <sup className="footnote-ref"><a href={`#fn-${id}`}>{id}</a></sup>;
}

function SpanLangMark({ children, attributes }: MP) {
  return <span data-lang={attributes?.lang ?? ''} data-dir={attributes?.dir ?? ''} lang={attributes?.lang ?? ''} dir={attributes?.dir ?? ''}>{children}</span>;
}

// ═══════════════════════════════════════════════════════════════════════
// Registration
// ═══════════════════════════════════════════════════════════════════════

export function registerRenderers(): void {

  // ── Block nodes ────────────────────────────────────────────────────

  define('document',       external(wrap('div', 'document')));
  define('heading',        external(Heading));
  define('paragraph',      external(Paragraph));
  define('blockQuote',     external(wrap('blockquote', 'block-quote')));
  define('pullQuote',      external(wrap('blockquote', 'pull-quote')));
  define('codeFence',      external(CodeFence));
  define('pageBreak',      external(({ sid, stype }: BP) => <div className="page-break" aria-hidden="true" data-bc-sid={sid} data-bc-stype={stype} />));
  define('docSection',     external(wrap('section', 'section')));
  define('columns',        external(Columns));
  define('column',         external(Column));
  define('toc',            external(({ sid, stype }: BP) => <nav className="toc" role="navigation" data-bc-sid={sid} data-bc-stype={stype} />));
  define('footnoteDef',    external(FootnoteDef));
  define('inline-image',   external(InlineImage));
  define('emoji',          external(Emoji));
  define('codeBlock',      external(CodeBlock));
  define('horizontalRule', external(({ sid, stype }: BP) => <div className="horizontal-rule" data-bc-sid={sid} data-bc-stype={stype} />));
  define('list',           external(List));
  define('listItem',       external(wrap('li', 'list-item')));
  define('taskItem',       external(TaskItem));
  define('callout',        external(Callout));
  define('bFigure',        external(wrap('figure', 'figure')));
  define('bFigcaption',    external(wrap('figcaption', 'figcaption')));
  define('bDetails',       external(wrap('details', 'details')));
  define('bSummary',       external(wrap('summary', 'summary')));
  define('descList',       external(wrap('dl', 'dl')));
  define('descTerm',       external(wrap('dt', 'dt')));
  define('descDef',        external(wrap('dd', 'dd')));
  define('mathInline',     external(MathInline));
  define('mathBlock',      external(MathBlock));
  define('mediaVideo',     external(MediaVideo));
  define('mediaAudio',     external(MediaAudio));
  define('mediaEmbed',     external(MediaEmbed));
  define('hardBreak',      external(({ sid, stype }: BP) => <br data-bc-sid={sid} data-bc-stype={stype} />));
  define('chart',          external(ChartBlock));
  define('docHeader',      external(wrap('header', 'doc-header')));
  define('docFooter',      external(wrap('footer', 'doc-footer')));
  define('bibliography',   external(wrap('section', 'bibliography')));
  define('commentThread',  external(CommentThread));
  define('endnoteDef',     external(EndnoteDef));
  define('indexBlock',     external(wrap('section', 'index-block')));
  define('fieldPageNumber', external(({ sid, stype }: BP) => <span className="field-page-number" data-bc-sid={sid} data-bc-stype={stype} />));
  define('fieldPageCount', external(({ sid, stype }: BP) => <span className="field-page-count" data-bc-sid={sid} data-bc-stype={stype} />));
  define('fieldDateTime',  external(FieldDateTime));
  define('fieldDocTitle',  external(({ sid, stype }: BP) => <span className="field-doc-title" data-bc-sid={sid} data-bc-stype={stype} />));
  define('fieldAuthor',    external(({ sid, stype }: BP) => <span className="field-author" data-bc-sid={sid} data-bc-stype={stype} />));
  define('bookmarkAnchor', external(BookmarkAnchor));
  define('bTable',         external(BTable));
  define('bTableHeader',   external(BTableHeader));
  define('bTableBody',     external(wrap('tbody', '')));
  define('bTableFooter',   external(wrap('tfoot', '')));
  define('bTableHeaderCell', external(BTableHeaderCell));
  define('bTableRow',      external(wrap('tr', 'table-row')));
  define('bTableCell',     external(BTableCell));
  define('inline-text',    external(InlineText));

  // ── Mark renderers ─────────────────────────────────────────────────

  defineMark('bold',           external(BoldMark));
  defineMark('italic',         external(ItalicMark));
  defineMark('fontColor',      external(FontColorMark));
  defineMark('bgColor',        external(BgColorMark));
  defineMark('underline',      external(UnderlineMark));
  defineMark('strikethrough',  external(StrikethroughMark));
  defineMark('code',           external(CodeMark));
  defineMark('inlineCode',     external(InlineCodeMark));
  defineMark('link',           external(LinkMark));
  defineMark('inserted',       external(InsertedMark));
  defineMark('deleted',        external(DeletedMark));
  defineMark('citation',       external(CitationMark));
  defineMark('xref',           external(XrefMark));
  defineMark('indexEntry',     external(IndexEntryMark));
  defineMark('endnoteRef',     external(EndnoteRefMark));
  defineMark('bookmark',       external(BookmarkMark));
  defineMark('highlight',      external(HighlightMark));
  defineMark('fontSize',       external(FontSizeMark));
  defineMark('fontFamily',     external(FontFamilyMark));
  defineMark('subscript',      external(SubscriptMark));
  defineMark('superscript',    external(SuperscriptMark));
  defineMark('smallCaps',      external(SmallCapsMark));
  defineMark('letterSpacing',  external(LetterSpacingMark));
  defineMark('wordSpacing',    external(WordSpacingMark));
  defineMark('lineHeight',     external(LineHeightMark));
  defineMark('textShadow',     external(TextShadowMark));
  defineMark('border',         external(BorderMark));
  defineMark('kbd',            external(KbdMark));
  defineMark('mention',        external(MentionMark));
  defineMark('spoiler',        external(SpoilerMark));
  defineMark('footnoteRef',    external(FootnoteRefMark));
  defineMark('spanLang',       external(SpanLangMark));
}
