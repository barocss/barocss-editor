import { expect, it } from 'vitest';
import { SITE_MENUS, siteMenuCommands, siteMenuEntry, siteMenusFor, siteMenusIn } from '../src/menu-model';
import type { SiteWidth } from '../src/breakpoints';

const widths: SiteWidth[] = [
  { id: 'wide-proof', label: 'Editorial board', width: 1440, viewport: 900 },
  { id: 'review-proof', label: 'Review board', width: 1100, viewport: 800 }
];

it.each(['View', '表示', 'Vues'])('uses the stable View identity when its display label is %s', label => {
  // The declared menus are the actual product input. Relabel them without inventing a locale host.
  const view = SITE_MENUS.find(menu => menu.id === 'view')!;
  const previous = view.label;
  const commandIds = siteMenuCommands();
  try {
    view.label = label;
    const menus = siteMenusFor(widths, true);
    const generated = menus.find(menu => menu.id === 'view')!;
    expect(generated.label).toBe(label);
    expect(generated.blocks.find(block => block.id === 'frames')!.items).toEqual([
      { view: 'frames.wide-proof', label: 'Editorial board' },
      { view: 'frames.review-proof', label: 'Review board' }
    ]);
    expect(siteMenuEntry('view.frames.0', menus)).toEqual({ view: 'frames.wide-proof', label: 'Editorial board' });
    expect(siteMenuEntry('view.frames.1', menus)).toEqual({ view: 'frames.review-proof', label: 'Review board' });
    expect(siteMenuCommands(menus)).toEqual(commandIds);
    expect(siteMenuEntry('file.document.2', menus)).toMatchObject({ view: 'file.save' });
    expect(siteMenuEntry('view.frames.0', siteMenusIn('page', widths))).toEqual({ view: 'frames.wide-proof', label: 'Editorial board' });
  } finally { view.label = previous; }
});

it('keeps custom-width actions and order unchanged when a width display name changes', () => {
  const renamed = widths.map(width => ({ ...width, label: `Renamed ${width.label}` }));
  const entries = siteMenusFor(renamed).find(menu => menu.id === 'view')!.blocks.find(block => block.id === 'frames')!.items;
  expect(entries).toEqual([
    { view: 'frames.wide-proof', label: 'Renamed Editorial board' },
    { view: 'frames.review-proof', label: 'Renamed Review board' }
  ]);
  expect(widths.map(width => width.label)).toEqual(['Editorial board', 'Review board']);
});
