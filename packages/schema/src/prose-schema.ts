import { getStandardSchemaDefinition } from './standard-schema';
import type { NodeTypeDefinition } from './types';

/** Optional prose vocabulary shared by written bodies and their hosts. */
export function getProseNodeDefinitions(bodyContent: string): Record<string, NodeTypeDefinition> {
  const standard = getStandardSchemaDefinition().nodes;
  return {
    pageReference: { name: 'pageReference', group: 'inline', atom: true, attrs: {
      pageId: { type: 'string', required: true }, title: { type: 'string', default: '제목 없음' }
    } },
    taskItem: { ...standard.taskItem },
    bSummary: { ...standard.bSummary },
    bDetails: {
      ...standard.bDetails,
      content: `bSummary ${bodyContent}`,
      attrs: { open: { type: 'boolean', default: true } }
    },
    calloutTitle: { name: 'calloutTitle', group: 'block', content: 'inline*' },
    callout: {
      ...standard.callout,
      content: `calloutTitle? ${bodyContent}`,
      attrs: {

        type: {
          type: 'string', default: 'info',
          options: ['info', 'warning', 'error', 'success', 'note', 'tip']
        }
      }
    }
  };
}
