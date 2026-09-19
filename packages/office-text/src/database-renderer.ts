import { define, element } from '@barocss/dsl';
import { datasetRows, fieldsFrom, evaluateDatasetRecords, readDatasetViews, type DatasetEvaluationSource } from '@barocss/schema';
import { childrenOf, type DocumentAccess, type DocumentNode } from './document-access';
import { getWordDocument } from './text-context';

function datasetsFor(doc: DocumentAccess, block: DocumentNode): DocumentNode[] {
  const seen = new Set<string>(), names = new Set<string>(), datasets: DocumentNode[] = [];
  const collect = (at: DocumentNode | undefined) => {
    for (const group of childrenOf(doc, at)) {
      if (group.stype !== 'resources') continue;
      for (const node of childrenOf(doc, group)) {
        if (node.stype !== 'dataset') continue;
        const name = String(node.attributes?.name ?? '');
        if (!names.has(name)) { names.add(name); datasets.push(node); }
      }
    }
  };
  let at: DocumentNode | undefined = block;
  while (at) {
    collect(at);
    if (!at.parentId || seen.has(at.parentId)) break;
    seen.add(at.parentId); at = doc.getNode(at.parentId);
  }
  collect(doc.getNode(doc.rootId));
  return datasets;
}
function evaluationSource(node: DocumentNode): DatasetEvaluationSource {
  const attrs = node.attributes ?? {}, records = Array.isArray(attrs.records) ? attrs.records : [];
  const valid = (record: unknown): record is Record<string, unknown> => !!record && typeof record === 'object' && !Array.isArray(record);
  return { name: String(attrs.name ?? ''), fields: fieldsFrom(attrs.fields), records: records.filter(valid),
    rowIds: records.flatMap((record, index) => valid(record) ? [Array.isArray(attrs.rowIds) && typeof attrs.rowIds[index] === 'string' ? attrs.rowIds[index] : ''] : []) };
}

const display = (value: unknown): string => value == null ? '' : typeof value === 'boolean' ? value ? '✓' : ''
  : Array.isArray(value) ? value.map(display).join(', ') : typeof value === 'object' ? '' : String(value);

/** Static HTML remains readable in an exported Site; Note adds interactive controls by portal. */
export function registerDatabaseRenderer(): void {
  define('noteDatabase', (_props: Record<string, unknown>, node: DocumentNode, context: { env?: Parameters<typeof getWordDocument>[0] }) => {
    const doc = getWordDocument(context.env);
    const datasets = doc ? datasetsFor(doc, node) : [];
    const sources = datasets.map(evaluationSource);
    const dataset = datasets.find(source => source.attributes?.name === node.attributes?.source);
    const attrs = dataset?.attributes ?? {};
    const declaredFields = fieldsFrom(attrs.fields);
    const state = readDatasetViews(node.attributes ?? {}, declaredFields);
    const query = state.views.find(view => view.id === state.activeId)!;
    const fields = declaredFields.filter(field => !query.hiddenFields.includes(field.name));
    const source = sources.find(item => item.name === attrs.name);
    const evaluated = source ? evaluateDatasetRecords(source, sources) : { records: [], errors: {} };
    const records = evaluated.records;
    const rows = datasetRows(records, query);
    const cell = { padding: '8px 12px', border: '1px solid #e2e8f0', textAlign: 'left' };
    return element('section', { className: 'w-note-database', 'data-note-database': 'true',
      contenteditable: 'false', style: { margin: '16px 0' } }, [
      element('div', { className: 'w-note-database-static' }, [
        element('h3', { style: { fontWeight: '600', margin: '0 0 8px' } }, String(attrs.label ?? attrs.name ?? '데이터베이스')),
        ...(!dataset ? [element('p', {}, '데이터베이스를 찾을 수 없습니다.')] : [
          element('table', { style: { width: '100%', borderCollapse: 'collapse' } }, [
            element('thead', {}, [element('tr', {}, fields.map(field => element('th', { scope: 'col', style: { ...cell, background: '#f8fafc' } }, field.label ?? field.name)))]),
            element('tbody', {}, rows.map(({ record }) => element('tr', {}, fields.map(field => element('td', { style: cell }, display(record[field.name]))))))
          ])
        ])
      ])
    ]);
  });
}
