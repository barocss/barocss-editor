import { childrenOf, DeckAccess, DeckNode } from './deck';

/**
 * A theme: the colours and faces a deck is designed in, named rather than
 * repeated.
 *
 * A shape's fill is a hex string, so a deck built by hand has that string copied
 * onto forty shapes — and re-colouring it means finding all forty, including the
 * ones on the slide nobody scrolled to. Every design tool answers this the same
 * way: a shape says *which slot* it uses, and one place says what the slots are.
 *
 * ## `theme:accent1`, in the same attribute
 *
 * A slot is written where a colour goes: `fill: 'theme:accent1'` beside
 * `fill: '#0ea5e9'`. Not a second attribute — `fillSlot` beside `fill` — because
 * then every reader has to check two places and decide which wins, and a
 * document with both is a document with no answer.
 *
 * The prefix is what makes it unambiguous: a CSS colour cannot begin with
 * `theme:`, so nothing that is already a colour changes meaning, and a value
 * naming a slot the theme does not have resolves to nothing rather than to a
 * guess — which is the same rule the transition effects follow.
 *
 * ## Where the theme comes from
 *
 * The master names it. PowerPoint binds a theme to a master, and this deck
 * already resolves formatting and background up that chain — slide, layout,
 * master — so the theme is one step further along a road that exists.
 */

/**
 * What a theme is called once a reader has changed one of its slots.
 *
 * A word rather than a blank: a theme row whose value matches none of its options
 * shows the *first* one, so "no name" read as "Office" — the exact lie the
 * matching was written to stop. It is also the truer thing to say. The dialog
 * writes it and the panel offers it, from here, so the two cannot disagree about
 * the spelling.
 */
export const CUSTOM_THEME = '사용자 지정';

/** PowerPoint's twelve, by the names its own file format uses. */
export const THEME_COLOUR_SLOTS = [
  'dark1',
  'light1',
  'dark2',
  'light2',
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'hyperlink',
  'followedHyperlink'
] as const;

export type ThemeColourSlot = (typeof THEME_COLOUR_SLOTS)[number];

/**
 * The two faces, which is what every theme has: one for headings and one for
 * everything else. PowerPoint calls them major and minor.
 */
export const THEME_FONT_SLOTS = ['major', 'minor'] as const;

export type ThemeFontSlot = (typeof THEME_FONT_SLOTS)[number];

/** The attributes a theme carries, declared where they are read. */
export const THEME_ATTRS = {
  id: { type: 'string' as const, required: true },
  name: { type: 'string' as const, required: false },
  ...Object.fromEntries(
    THEME_COLOUR_SLOTS.map((slot) => [slot, { type: 'string' as const, required: false }])
  ),
  majorFont: { type: 'string' as const, required: false },
  minorFont: { type: 'string' as const, required: false }
};

const PREFIX = 'theme:';

/** Whether a value names a slot rather than being a colour or a face. */
export function isThemeRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX) && value.length > PREFIX.length;
}

/** The slot a value names, without the prefix. */
export function slotOf(value: string): string {
  return value.slice(PREFIX.length);
}

/** How a document writes a slot, so nothing has to build the string by hand. */
export function themeRef(slot: ThemeColourSlot | ThemeFontSlot): string {
  return `${PREFIX}${slot}`;
}

const attrString = (node: DeckNode | undefined, key: string): string | undefined => {
  const value = node?.attributes?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};


/** A resource of a kind, by the id something names it with. */
function resourceById(doc: DeckAccess, stype: string, id: string): DeckNode | undefined {
  const root = doc.getNode(doc.rootId);
  for (const sid of childrenOf(root)) {
    const node = doc.getNode(sid);
    if (node?.stype !== 'resources') continue;
    for (const child of childrenOf(node)) {
      const resource = doc.getNode(child);
      if (resource?.stype === stype && resource.attributes?.id === id) return resource;
    }
  }
  return undefined;
}

/**
 * The theme a master names, or the deck's only one.
 *
 * A deck with a single theme and a master that forgot to name it is a deck
 * somebody wrote by hand, and drawing it grey would be this product punishing a
 * document for a missing attribute it can infer with certainty. Two themes and
 * no binding is genuinely ambiguous, so that resolves to nothing.
 */
export function themeFor(doc: DeckAccess, masterId: string | undefined): DeckNode | undefined {
  if (masterId) {
    const named = attrString(resourceById(doc, 'slideMaster', masterId), 'themeId');
    if (named) return resourceById(doc, 'theme', named);
  }

  const themes: DeckNode[] = [];
  const root = doc.getNode(doc.rootId);
  for (const sid of childrenOf(root)) {
    const node = doc.getNode(sid);
    if (node?.stype !== 'resources') continue;
    for (const child of childrenOf(node)) {
      const resource = doc.getNode(child);
      if (resource?.stype === 'theme') themes.push(resource);
    }
  }
  return themes.length === 1 ? themes[0] : undefined;
}

/**
 * A value with its slot filled in, or the value itself.
 *
 * Anything that is not a reference comes back untouched — which is what keeps
 * every deck written before themes drawing exactly as it did — and a reference
 * the theme cannot answer comes back as `undefined`, so the caller draws nothing
 * rather than drawing black.
 */
export function resolveThemeValue(
  theme: DeckNode | undefined,
  value: unknown
): string | undefined {
  if (!isThemeRef(value)) return typeof value === 'string' ? value : undefined;

  const slot = slotOf(value);
  if (!theme) return undefined;

  if ((THEME_FONT_SLOTS as readonly string[]).includes(slot)) {
    return attrString(theme, slot === 'major' ? 'majorFont' : 'minorFont');
  }
  if ((THEME_COLOUR_SLOTS as readonly string[]).includes(slot)) {
    return attrString(theme, slot);
  }
  // A slot this product does not have — a deck from a tool with more of them.
  return undefined;
}

/**
 * The themes a deck can be re-designed in.
 *
 * Data rather than a dialog: what a theme *is* belongs to the product, and how a
 * reader picks one belongs to the app — the same division the toolbar model
 * makes. Four, because a list of forty is a colour picker with extra steps and
 * the point of a preset is that the common answer is one press away.
 *
 * Each names all twelve slots. A preset that filled six would leave a deck
 * half-re-coloured, with the shapes on `accent5` keeping the colour of a theme
 * nobody has any more — which looks like the theme not working.
 */
export interface DeckTheme {
  id: string;
  name: string;
  colours: Record<ThemeColourSlot, string>;
  majorFont: string;
  minorFont: string;
}

const palette = (
  dark1: string,
  light1: string,
  dark2: string,
  light2: string,
  accents: [string, string, string, string, string, string],
  links: [string, string]
): Record<ThemeColourSlot, string> => ({
  dark1,
  light1,
  dark2,
  light2,
  accent1: accents[0],
  accent2: accents[1],
  accent3: accents[2],
  accent4: accents[3],
  accent5: accents[4],
  accent6: accents[5],
  hyperlink: links[0],
  followedHyperlink: links[1]
});

export const DECK_THEMES: DeckTheme[] = [
  {
    id: 'office',
    name: 'Office',
    colours: palette(
      '#0f172a',
      '#ffffff',
      '#334155',
      '#f1f5f9',
      ['#2563eb', '#fbbf24', '#22c55e', '#a855f7', '#ef4444', '#14b8a6'],
      ['#2563eb', '#7c3aed']
    ),
    majorFont: 'Georgia',
    minorFont: 'Georgia'
  },
  {
    id: 'slate',
    name: 'Slate',
    colours: palette(
      '#020617',
      '#f8fafc',
      '#1e293b',
      '#e2e8f0',
      ['#0ea5e9', '#64748b', '#38bdf8', '#94a3b8', '#0f766e', '#7dd3fc'],
      ['#0284c7', '#6366f1']
    ),
    majorFont: 'Helvetica',
    minorFont: 'Helvetica'
  },
  {
    id: 'ember',
    name: 'Ember',
    colours: palette(
      '#1c1917',
      '#fffbeb',
      '#44403c',
      '#fef3c7',
      ['#ea580c', '#b45309', '#dc2626', '#f59e0b', '#7c2d12', '#fb923c'],
      ['#c2410c', '#9a3412']
    ),
    majorFont: 'Georgia',
    minorFont: 'Verdana'
  },
  {
    id: 'forest',
    name: 'Forest',
    colours: palette(
      '#052e16',
      '#f7fee7',
      '#166534',
      '#dcfce7',
      ['#16a34a', '#65a30d', '#0d9488', '#4d7c0f', '#047857', '#84cc16'],
      ['#15803d', '#3f6212']
    ),
    majorFont: 'Verdana',
    minorFont: 'Verdana'
  }
];

/** The payload `setDeckTheme` takes, from a preset a reader chose. */
export function themePayload(theme: DeckTheme): Record<string, string> {
  return {
    name: theme.name,
    ...theme.colours,
    majorFont: theme.majorFont,
    minorFont: theme.minorFont
  };
}

/**
 * The deck's theme as a whole set of values, with anything missing filled in.
 *
 * ## Why the gaps have to be filled
 *
 * A theme node carries whichever slots have been written, so a deck may name a
 * theme and have four of its twelve colours. Every reader of a *single* slot is
 * fine with that — `resolveThemeValue` answers `undefined` and the caller draws
 * nothing rather than drawing black. A reader that wants to *edit* the theme is
 * not: a colour field with nothing in it cannot be changed by a nudge, and a row
 * of twelve where four are blank reads as a broken panel rather than as a theme
 * with four slots set.
 *
 * So the gaps come from the first preset, which is the one a deck with no theme
 * is already drawn with.
 */
export function themeNow(theme: DeckNode | undefined): DeckTheme {
  const fallback = DECK_THEMES[0];
  const value = (slot: string, spare: string) => attrString(theme, slot) ?? spare;

  return {
    id: attrString(theme, 'id') ?? fallback.id,
    name: attrString(theme, 'name') ?? fallback.name,
    colours: Object.fromEntries(
      THEME_COLOUR_SLOTS.map((slot) => [slot, value(slot, fallback.colours[slot])])
    ) as Record<ThemeColourSlot, string>,
    majorFont: value('majorFont', fallback.majorFont),
    minorFont: value('minorFont', fallback.minorFont)
  };
}

/**
 * Which preset this theme *is*, if it is one exactly.
 *
 * Nothing when a reader has changed a slot, and that is the point: the theme row
 * read the stored `name` and would go on saying "Office" about a deck whose
 * accent had been changed to the company's red. A name that survives the thing it
 * names is worse than no name — a reader who cannot see that they have a custom
 * theme cannot see why the list will not put it back.
 *
 * Compared on the values rather than on the id for the same reason: an id is what
 * the theme was made from and the values are what it is.
 *
 * Case-insensitively, because `#2563EB` and `#2563eb` are one colour and a reader
 * who types one of them has not left the preset.
 */
export function themeMatching(theme: DeckNode | undefined): DeckTheme | undefined {
  const now = themeNow(theme);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  return DECK_THEMES.find(
    (preset) =>
      same(preset.majorFont, now.majorFont) &&
      same(preset.minorFont, now.minorFont) &&
      THEME_COLOUR_SLOTS.every((slot) => same(preset.colours[slot], now.colours[slot]))
  );
}
