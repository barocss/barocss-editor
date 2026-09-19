import type { INode } from '@barocss/datastore';

import { withWordDefaults } from './default-styles';

/** A blank, styled Word document with editable metadata and Letter page setup. */
export function createStarterDocument(): INode {
  return withWordDefaults({
    stype: 'document',
    attributes: {},
    content: [
      {
        stype: 'docMeta',
        attributes: {},
        content: [
          {
            stype: 'docTitle',
            attributes: {},
            content: [{ stype: 'inline-text', text: '' }]
          }
        ]
      },
      {
        stype: 'surface',
        attributes: {
          kind: 'flow',
          name: 'Section 1',
          pageWidth: 12240,
          pageHeight: 15840,
          marginTop: 1440,
          marginBottom: 1440,
          marginLeft: 1440,
          marginRight: 1440
        },
        content: [
          {
            stype: 'paragraph',
            attributes: { styleId: 'Body' },
            content: [{ stype: 'inline-text', text: '' }]
          }
        ]
      }
    ]
  } as INode);
}
