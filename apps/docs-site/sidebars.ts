import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    { type: 'doc', id: 'introduction', label: 'Overview' },
    {
      type: 'category',
      label: 'Getting started',
      collapsed: false,
      items: [
        'installation',
        { type: 'doc', id: 'quick-start', label: 'JavaScript / DOM guide' },
        { type: 'doc', id: 'guides/react-editor', label: 'React guide' },
        'basic-usage',
      ],
    },
    {
      type: 'category',
      label: 'Office integration',
      items: [
        { type: 'doc', id: 'guides/office-products', label: 'Product integration' },
        { type: 'doc', id: 'guides/office-styling', label: 'Styling' },
        { type: 'doc', id: 'guides/note-integration', label: 'Note integration' },
        { type: 'doc', id: 'guides/package-boundaries', label: 'Package boundaries' },
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      items: [
        'concepts/schema-and-model',
        'concepts/dsl-templates',
        'concepts/rendering',
        'concepts/selection',
        'concepts/transactions',
        'concepts/history',
        'concepts/editor-core',
        'concepts/editor-view-dom',
        'concepts/clipboard',
        'concepts/drag-and-drop',
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
            'architecture/renderer-react',
            'architecture/editor-core',
            'architecture/editor-view-dom',
            'architecture/editor-view-react',
            'architecture/converter',
            'architecture/extensions',
            'architecture/text-analyzer',
            'architecture/dom-observer',
            'architecture/shared',
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
      label: 'Guides',
      items: [
        'guides/extension-design',
        'guides/custom-operations',
        'guides/advanced-extensions',
        'guides/decorator-guide',
        'guides/before-hooks-use-cases',
        'guides/before-hooks-safety-analysis',
      ],
    },
    {
      type: 'category',
      label: 'Recipes',
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
            'api/renderer-react-api',
            'api/editor-view-react-api',
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
