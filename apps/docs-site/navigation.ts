import examples from '../../scripts/docs/live-examples.json';

// Shared by the docs plugin, package plugin, and custom Examples page.
export const navigation = [
  {
    label: 'Documentation',
    items: [
      { label: 'Overview', href: '/docs/introduction' },
      { label: 'All public packages', href: '/packages' },
    ],
  },
  {
    label: 'Getting started',
    items: [
      { label: 'Installation', href: '/docs/installation' },
      { label: 'JavaScript / DOM guide', href: '/docs/quick-start' },
      { label: 'React guide', href: '/docs/guides/react-editor' },
      { label: 'Basic usage', href: '/docs/basic-usage' },
    ],
  },
  {
    label: 'Office integration',
    items: [
      { label: 'Product integration', href: '/docs/guides/office-products' },
      { label: 'Styling', href: '/docs/guides/office-styling' },
      { label: 'Package boundaries', href: '/docs/guides/package-boundaries' },
    ],
  },
  {
    label: 'Live examples',
    items: examples.map(example => ({ label: example.title, href: `/examples#${example.id}` })),
  },
];

export const sharedSidebarItems = (scope: 'docs' | 'packages') => navigation.map(group => ({
  type: 'category' as const,
  label: group.label,
  collapsible: false,
  items: group.items.map(item => {
    if (scope === 'docs' && item.href.startsWith('/docs/')) {
      return { type: 'doc' as const, id: item.href.slice('/docs/'.length), label: item.label };
    }
    if (scope === 'packages' && item.href === '/packages') {
      return { type: 'doc' as const, id: 'index', label: item.label };
    }
    return { type: 'link' as const, ...item };
  }),
}));
