import examples from '../../scripts/docs/live-examples.json';

// Shared by the docs plugin, package plugin, and custom Examples page.
export const navigation = [
  {
    label: 'Documentation',
    items: [
      { label: 'Overview', href: '/docs/introduction' },
      { label: 'All public packages', href: '/packages' },
      { label: 'Installation', href: '/docs/installation' },
      { label: 'JavaScript / DOM guide', href: '/docs/quick-start' },
      { label: 'React guide', href: '/docs/guides/react-editor' },
      { label: 'Office integration', href: '/docs/guides/office-products' },
      { label: 'Office styling', href: '/docs/guides/office-styling' },
    ],
  },
  {
    label: 'Live examples',
    items: examples.map(example => ({ label: example.title, href: `/examples#${example.id}` })),
  },
];

export const sharedSidebarItems = (overviewDocId?: string) => navigation.map(group => ({
  type: 'category' as const,
  label: group.label,
  collapsible: false,
  items: group.items.map(item => overviewDocId && item.href === '/docs/introduction'
    ? { type: 'doc' as const, id: overviewDocId, label: item.label }
    : { type: 'link' as const, ...item }),
}));
