import type { NodeTypeDefinition } from './types';

/** A view references the same named resource vocabulary used by Site collections. */
export function getNoteDatabaseNodeDefinitions(): Record<string, NodeTypeDefinition> {
  return {
    dataset: { name: 'dataset', group: 'resource', atom: true, attrs: {
      name: { type: 'string', required: true }, label: { type: 'string' },
      kind: { type: 'string', default: 'inline', options: ['inline', 'url'] },
      url: { type: 'string' }, live: { type: 'boolean', default: false },
      fields: { type: 'array' }, records: { type: 'array' }, rowIds: { type: 'array' }
    } },
    noteDatabase: { name: 'noteDatabase', group: 'block', atom: true, attrs: {
      source: { type: 'string', required: true },
      view: { type: 'string', default: 'table', options: ['table', 'board', 'gallery', 'calendar'] },
      where: { type: 'string', default: '' }, equals: { type: 'string', default: '' },
      sortBy: { type: 'string', default: '' }, sortDir: { type: 'string', default: 'asc', options: ['asc', 'desc'] },
      groupBy: { type: 'string', default: '' },
      dateField: { type: 'string' }, cardPreview: { type: 'string', options: ['none', 'content'] }, cardSize: { type: 'string', options: ['small', 'medium', 'large'] },
      filters: { type: 'object' }, sorts: { type: 'array' },
      views: { type: 'array' }, activeViewId: { type: 'string' }
    } }
  };
}
