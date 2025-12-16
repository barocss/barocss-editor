import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/__docusaurus/debug',
    component: ComponentCreator('/__docusaurus/debug', '5ff'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/config',
    component: ComponentCreator('/__docusaurus/debug/config', '5ba'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/content',
    component: ComponentCreator('/__docusaurus/debug/content', 'a2b'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/globalData',
    component: ComponentCreator('/__docusaurus/debug/globalData', 'c3c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/metadata',
    component: ComponentCreator('/__docusaurus/debug/metadata', '156'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/registry',
    component: ComponentCreator('/__docusaurus/debug/registry', '88c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/routes',
    component: ComponentCreator('/__docusaurus/debug/routes', '000'),
    exact: true
  },
  {
    path: '/docs',
    component: ComponentCreator('/docs', '040'),
    routes: [
      {
        path: '/docs',
        component: ComponentCreator('/docs', '286'),
        routes: [
          {
            path: '/docs',
            component: ComponentCreator('/docs', 'e5e'),
            routes: [
              {
                path: '/docs/api/collaboration-api',
                component: ComponentCreator('/docs/api/collaboration-api', 'f11'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/converter-api',
                component: ComponentCreator('/docs/api/converter-api', '3a5'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/datastore-api',
                component: ComponentCreator('/docs/api/datastore-api', '8e7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/datastore-operations',
                component: ComponentCreator('/docs/api/datastore-operations', '785'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/dsl-api',
                component: ComponentCreator('/docs/api/dsl-api', 'e0b'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/editor-core-api',
                component: ComponentCreator('/docs/api/editor-core-api', '887'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/editor-view-dom-api',
                component: ComponentCreator('/docs/api/editor-view-dom-api', '900'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/extensions-api',
                component: ComponentCreator('/docs/api/extensions-api', '0af'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/model-api',
                component: ComponentCreator('/docs/api/model-api', '74a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/model-operation-dsl',
                component: ComponentCreator('/docs/api/model-operation-dsl', '00a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/model-operations',
                component: ComponentCreator('/docs/api/model-operations', '653'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/operation-selection-guide',
                component: ComponentCreator('/docs/api/operation-selection-guide', '397'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/operations-overview',
                component: ComponentCreator('/docs/api/operations-overview', '432'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/reference',
                component: ComponentCreator('/docs/api/reference', 'a17'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/renderer-dom-api',
                component: ComponentCreator('/docs/api/renderer-dom-api', 'ef2'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/api/schema-api',
                component: ComponentCreator('/docs/api/schema-api', 'd74'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/collaboration',
                component: ComponentCreator('/docs/architecture/collaboration', '007'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/collaboration-liveblocks',
                component: ComponentCreator('/docs/architecture/collaboration-liveblocks', '224'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/collaboration-yjs',
                component: ComponentCreator('/docs/architecture/collaboration-yjs', 'a9f'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/converter',
                component: ComponentCreator('/docs/architecture/converter', '216'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/datastore',
                component: ComponentCreator('/docs/architecture/datastore', '446'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/devtool',
                component: ComponentCreator('/docs/architecture/devtool', 'fc7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/dom-observer',
                component: ComponentCreator('/docs/architecture/dom-observer', 'd7e'),
                exact: true
              },
              {
                path: '/docs/architecture/dsl',
                component: ComponentCreator('/docs/architecture/dsl', '2ca'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/editor-core',
                component: ComponentCreator('/docs/architecture/editor-core', '05d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/editor-view-dom',
                component: ComponentCreator('/docs/architecture/editor-view-dom', '30e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/extensions',
                component: ComponentCreator('/docs/architecture/extensions', '715'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/model',
                component: ComponentCreator('/docs/architecture/model', 'f1a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/overview',
                component: ComponentCreator('/docs/architecture/overview', '833'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/packages',
                component: ComponentCreator('/docs/architecture/packages', '82a'),
                exact: true
              },
              {
                path: '/docs/architecture/practical-examples',
                component: ComponentCreator('/docs/architecture/practical-examples', '8f7'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/renderer-dom',
                component: ComponentCreator('/docs/architecture/renderer-dom', '4f4'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/schema',
                component: ComponentCreator('/docs/architecture/schema', '351'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/architecture/shared',
                component: ComponentCreator('/docs/architecture/shared', '4c4'),
                exact: true
              },
              {
                path: '/docs/architecture/text-analyzer',
                component: ComponentCreator('/docs/architecture/text-analyzer', 'd02'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/basic-usage',
                component: ComponentCreator('/docs/basic-usage', '0a3'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/concepts/decorators',
                component: ComponentCreator('/docs/concepts/decorators', 'd16'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/concepts/dsl-templates',
                component: ComponentCreator('/docs/concepts/dsl-templates', '23a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/concepts/editor-core',
                component: ComponentCreator('/docs/concepts/editor-core', '2af'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/concepts/editor-view-dom',
                component: ComponentCreator('/docs/concepts/editor-view-dom', '43f'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/concepts/rendering',
                component: ComponentCreator('/docs/concepts/rendering', 'a28'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/concepts/schema-and-model',
                component: ComponentCreator('/docs/concepts/schema-and-model', 'af1'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/examples/basic-editor',
                component: ComponentCreator('/docs/examples/basic-editor', '23f'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/examples/custom-extensions',
                component: ComponentCreator('/docs/examples/custom-extensions', '2e9'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/examples/decorators',
                component: ComponentCreator('/docs/examples/decorators', 'd6a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/getting-started',
                component: ComponentCreator('/docs/getting-started', 'eba'),
                exact: true
              },
              {
                path: '/docs/guides/advanced-extensions',
                component: ComponentCreator('/docs/guides/advanced-extensions', 'ae4'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/guides/before-hooks-safety-analysis',
                component: ComponentCreator('/docs/guides/before-hooks-safety-analysis', 'a5f'),
                exact: true
              },
              {
                path: '/docs/guides/before-hooks-use-cases',
                component: ComponentCreator('/docs/guides/before-hooks-use-cases', '8c5'),
                exact: true
              },
              {
                path: '/docs/guides/custom-operations',
                component: ComponentCreator('/docs/guides/custom-operations', '787'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/guides/decorator-guide',
                component: ComponentCreator('/docs/guides/decorator-guide', '4b2'),
                exact: true
              },
              {
                path: '/docs/guides/extension-design',
                component: ComponentCreator('/docs/guides/extension-design', 'bb1'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/installation',
                component: ComponentCreator('/docs/installation', 'b74'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/introduction',
                component: ComponentCreator('/docs/introduction', 'f7d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/docs/quick-start',
                component: ComponentCreator('/docs/quick-start', 'b74'),
                exact: true,
                sidebar: "tutorialSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '/',
    component: ComponentCreator('/', 'e5f'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
