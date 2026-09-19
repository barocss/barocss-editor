import { define, element, slot } from '@barocss/dsl';
import { getWordDocument } from './text-context';

type Node = Record<string, any>;

/** Shared drawing for optional prose blocks; their model state survives embedding and export. */
export function registerProseRenderers(): void {
  define('pageReference', (_props: Node, node: Node) => {
    const title = String(node.attributes?.title ?? '제목 없음');
    return element('span', {
      className: 'w-page-reference', 'data-note-page-reference': 'true',
      'data-page-id': String(node.attributes?.pageId ?? ''), 'data-page-title': title,
      role: 'link', tabIndex: 0, contenteditable: 'false',
      style: { display: 'inline-flex', alignItems: 'baseline', gap: '0.2em' }
    }, [element('svg', { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, [element('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5' })]), element('span', { 'data-note-page-reference-title': 'true' }, title)]);
  });
  define('taskItem', (_props: Node, node: Node) => {
    const checked = node.attributes?.checked === true;
    return element('div', {
      className: 'w-task-item',
      'data-checked': String(checked),
      style: { display: 'flex', alignItems: 'baseline', gap: '0.6em', margin: '0.35em 0' }
    }, [
      element('button', {
        type: 'button', role: 'checkbox', 'aria-checked': String(checked),
        'aria-label': checked ? '완료 취소' : '완료 표시',
        'data-checklist-toggle': 'true', 'data-bc-chrome': 'true',
        contenteditable: 'false',
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: '0', width: '1.1em', height: '1.1em', padding: '0',
          border: '1px solid currentColor', borderRadius: '3px',
          background: checked ? '#2563eb' : 'transparent',
          color: checked ? '#fff' : 'inherit', cursor: 'pointer',
          userSelect: 'none', font: 'inherit', fontSize: '0.85em'
        }
      }, checked ? '✓' : ''),
      element('span', {
        className: 'w-task-content',
        style: { flex: '1', minWidth: '0', textDecoration: checked ? 'line-through' : 'none' }
      }, [slot('content')])
    ]);
  });

  define('bDetails', element('details', {
    className: 'w-details',
    open: (node: Node) => node.attributes?.open === false ? undefined : 'true',
    style: { margin: '0.5em 0', paddingLeft: '0.4em' }
  } as never, [slot('content')]));
  define('bSummary', element('summary', {
    className: 'w-summary',
    style: { cursor: 'pointer', fontWeight: '600', marginBottom: '0.35em' }
  }, [slot('content')]));

  const colors: Record<string, string> = {
    info: '#eff6ff', warning: '#fffbeb', error: '#fef2f2',
    success: '#f0fdf4', note: '#f5f5f4', tip: '#f0fdfa'
  };
  const circle = 'M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z';
  const icons: Record<string, string> = {
    info: `${circle}M8 7v4M8 4.5h.01`,
    warning: 'M8 1.5 15 14H1L8 1.5ZM8 6v4M8 12h.01',
    error: `${circle}M5.5 5.5l5 5M10.5 5.5l-5 5`,
    success: `${circle}M5 8l2 2 4-4`,
    note: 'M4 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM5 5h6M5 8h6M5 11h4',
    tip: 'M6 12h4M6.5 14h3M5.5 10.5C5.5 9 3.5 8.5 3.5 6a4.5 4.5 0 0 1 9 0c0 2.5-2 3-2 4.5'
  };
  define('calloutTitle', (_props: Node, node: Node, context: Node) => {
    const doc = getWordDocument(context?.env);
    const empty = (value: Node, depth = 0): boolean => depth < 64 &&
      (typeof value.text === 'string' ? value.text.replace(/\uFEFF/g, '') === '' :
        (value.content ?? []).every((child: Node | string) => {
          const nested = typeof child === 'string' ? doc?.getNode(child) : child;
          return !!nested && empty(nested, depth + 1);
        }));
    return element('div', {
      className: 'w-callout-title', 'data-empty': empty(node) ? 'true' : undefined,
      style: { fontWeight: '600', marginBottom: '0.35em', minHeight: '1.5em' }
    }, [slot('content')]);
  });
  define('callout', (_props: Node, node: Node, context: Node) => {
    const doc = getWordDocument(context?.env);
    const hasTitle = (node.content ?? []).some((child: Node | string) =>
      (typeof child === 'string' ? doc?.getNode(child) : child)?.stype === 'calloutTitle');
    // Historical Site stores may be rendered before a Note session migrates them.
    const legacyTitle = !hasTitle && typeof node.attributes?.title === 'string' ? node.attributes.title : '';
    const type = String(node.attributes?.type ?? 'info');
    return element('aside', {
      className: 'w-callout', 'data-callout-type': type,
      style: {
        position: 'relative', background: `var(--prose-callout-background, ${colors[type] ?? colors.info})`,
        border: '1px solid var(--prose-callout-border, #e2e8f0)',
        padding: '0.85em 1em 0.85em 2.75em', margin: '0.75em 0', borderRadius: '8px'
      }
    }, [
      element('span', {
        'data-callout-icon': type, 'data-bc-chrome': 'true', 'aria-hidden': 'true', contenteditable: 'false',
        style: { position: 'absolute', left: '1em', top: '0.9em', fontWeight: '600', userSelect: 'none' }
      }, [element('svg', {
        xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 16 16', width: '16', height: '16',
        fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5',
        'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      }, [element('path', { d: icons[type] ?? icons.info })])]),
      ...(legacyTitle ? [element('div', { className: 'w-callout-title', contenteditable: 'false', 'data-bc-chrome': 'true', style: { fontWeight: '600', marginBottom: '0.35em' } }, legacyTitle)] : []),
      slot('content')
    ]);
  });
}
