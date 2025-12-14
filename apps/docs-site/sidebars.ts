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
            'architecture/shared',
            'architecture/text-analyzer',
            'architecture/collaboration',
            'architecture/collaboration-yjs',
            'architecture/collaboration-liveblocks',
            'architecture/dom-observer',
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
      items: ['api/reference'],
    },
  ],
};

export default sidebars;
