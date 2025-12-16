import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'introduction',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'installation',
        'quick-start',
        'basic-usage',
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      items: [
        'concepts/schema-and-model',
        'concepts/dsl-templates',
        'concepts/rendering',
        'concepts/editor-core',
        'concepts/editor-view-dom',
        'concepts/decorators',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/overview',
        {
          type: 'category',
          label: 'Packages',
          items: [
            'architecture/schema',
            'architecture/datastore',
            'architecture/model',
            'architecture/dsl',
            'architecture/renderer-dom',
            'architecture/editor-core',
            'architecture/editor-view-dom',
            'architecture/converter',
            'architecture/extensions',
            'architecture/text-analyzer',
            { type: 'doc', id: 'architecture/collaboration', label: '@barocss/collaboration' },
            { type: 'doc', id: 'architecture/collaboration-yjs', label: '@barocss/collaboration-yjs' },
            { type: 'doc', id: 'architecture/collaboration-liveblocks', label: '@barocss/collaboration-liveblocks' },
            'architecture/devtool',
          ],
        },
        'architecture/practical-examples',
      ],
    },
    {
      type: 'category',
      label: 'Extending',
      items: [
        'guides/extension-design',
        'guides/custom-operations',
        'guides/advanced-extensions',
      ],
    },
    {
      type: 'category',
      label: 'Demos',
      items: [
        'examples/basic-editor',
        'examples/custom-extensions',
        'examples/decorators',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api/reference',
        {
          type: 'category',
          label: 'Core APIs',
          items: [
            'api/editor-core-api',
            'api/editor-view-dom-api',
            'api/dsl-api',
            'api/schema-api',
            'api/model-api',
            {
              type: 'category',
              label: 'Operations',
              items: [
                'api/operations-overview',
                'api/operation-selection-guide',
                'api/datastore-operations',
                'api/model-operations',
                'api/model-operation-dsl',
              ],
            },
          ],
        },
        {
          type: 'category',
          label: 'Additional APIs',
          items: [
            'api/datastore-api',
            'api/renderer-dom-api',
            'api/converter-api',
            'api/extensions-api',
            'api/collaboration-api',
          ],
        },
      ],
    },
  ],
};

export default sidebars;
