import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const isProd = process.env.NODE_ENV === 'production';

const config: Config = {
  title: 'Wonffice Developers',
  tagline: 'Product kits, shared UI, and editor libraries',
  favicon: 'img/favicon.ico',

  // Site URL: use custom domain in production, localhost in development
  url: isProd ? 'https://editor.barocss.com' : 'http://localhost:3000',
  // Pathname under which the site is served. With a custom domain, this is always '/'.
  baseUrl: '/',

  // GitHub pages deployment config.
  organizationName: 'barocss',
  projectName: 'barocss-editor',

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    mermaid: true,
  },

  // Mermaid theme for diagram rendering
  themes: ['@docusaurus/theme-mermaid'],

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang.
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/barocss/barocss-editor/tree/main/apps/docs-site/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    ['@docusaurus/plugin-content-docs', {
      id: 'packages',
      path: '.generated/packages',
      routeBasePath: 'packages',
      sidebarPath: './packages-sidebars.ts',
      // The catalogue is already registered once in the shared navigation.
      sidebarItemsGenerator: async ({ defaultSidebarItemsGenerator, ...args }) =>
        (await defaultSidebarItemsGenerator(args)).filter(item => !(item.type === 'doc' && item.id === 'index')),
    }],
    function(context, options) {
      return {
        name: 'webpack-config-plugin',
        configureWebpack(config, isServer) {
          return {
            resolve: {
              // Ensure 'import' condition is available for ESM workspace packages
              conditionNames: ['import', ...(isServer ? ['node', 'require'] : ['browser']), 'module', 'webpack', 'default'],
              // Allow .js imports to resolve to .ts files
              extensionAlias: {
                '.js': ['.ts', '.tsx', '.js', '.jsx'],
                '.jsx': ['.tsx', '.jsx'],
              },
              // Add TypeScript extensions
              extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
            },
          };
        },
      };
    },
  ],

  themeConfig: {
    navbar: {
      title: 'Wonffice Developers',
      logo: {
        alt: 'Wonffice developer documentation',
        src: 'img/logo.svg',
      },
      items: [
        { to: '/packages', label: 'Packages', position: 'left' },
        { to: '/examples', label: 'Examples', position: 'left' },
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/barocss/barocss-editor',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/introduction',
            },
            {
              label: 'Package catalogue',
              to: '/packages',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/barocss/barocss-editor',
            },
            {
              label: 'Issues',
              href: 'https://github.com/barocss/barocss-editor/issues',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Barocss Editor. Documentation built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'typescript', 'javascript', 'json'],
    },
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
