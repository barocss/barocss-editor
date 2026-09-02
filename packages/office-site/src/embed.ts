/**
 * **An embed is a provider and an id**, not a URL — and this is where the pair becomes an address.
 *
 * ## Why not just keep the URL
 *
 * A document that stores `https://www.youtube.com/embed/xyz` has stored one company's URL shape. The
 * day that shape changes, every page that used it breaks, and the document has no way to know what it
 * meant — the address *was* the meaning. A provider and an id are what a reader actually knows
 * (*this YouTube video, that one*), and the address is worked out where it is drawn.
 *
 * The same reference shape this model already has six of: `var:이름`, `page:id`, `asset:이름`,
 * `field:칸`, a dataset's name, a connection's name. A seventh is not a new idea, it is the idea.
 *
 * ## And the list is a decision, made here
 *
 * An unknown provider draws **nothing**, which is the point rather than a limitation: the alternative
 * is an `<iframe>` pointing at whatever a reader pasted, on a page a stranger will open. Somebody
 * adding a provider is adding one line and choosing to trust it, which is a decision that should look
 * like one.
 *
 * A reader who pastes a whole URL is handled by `idFrom` rather than refused: it is the thing they
 * will do, and telling them to find the id themselves is telling them to do a computer's job.
 */

/** What a page may embed, and how each one's address is built. */
export const PROVIDERS: {
  id: string;
  label: string;
  /** The address, from the id. */
  src: (id: string) => string;
  /** How to find an id in something a reader pasted — a URL, usually. */
  find: RegExp[];
  /** The shape it wants, when it has an obvious one. */
  aspect?: string;
}[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    src: (id) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,
    // `-nocookie`, deliberately: the ordinary host sets one before a visitor has pressed anything.
    find: [/youtube\.com\/watch\?v=([\w-]{6,})/, /youtu\.be\/([\w-]{6,})/, /youtube\.com\/embed\/([\w-]{6,})/],
    aspect: '16/9'
  },
  {
    id: 'vimeo',
    label: 'Vimeo',
    src: (id) => `https://player.vimeo.com/video/${encodeURIComponent(id)}`,
    find: [/vimeo\.com\/(?:video\/)?(\d{6,})/],
    aspect: '16/9'
  },
  {
    id: 'map',
    label: '지도',
    /*
     * OpenStreetMap rather than one of the two that need a key: an embed a reader has to go and get
     * an account for is an embed most readers do not get. The id is a query — a place name or a pair
     * of coordinates — which is what somebody means by *a map of here*.
     */
    src: (id) =>
      `https://www.openstreetmap.org/export/embed.html?bbox=&layer=mapnik&marker=${encodeURIComponent(id)}`,
    find: [/openstreetmap\.org\/.*mlat=([\d.-]+)/],
    aspect: '3/2'
  }
];

/** The one a name refers to, or nothing — which draws nothing. */
export function providerNamed(id: unknown): (typeof PROVIDERS)[number] | undefined {
  return typeof id === 'string' ? PROVIDERS.find((one) => one.id === id) : undefined;
}

/**
 * The address to put in the frame, or nothing.
 *
 * Nothing for an unknown provider **and** nothing for an empty id: an iframe with no source is a grey
 * rectangle a reader cannot tell from a broken one, and this product's rule everywhere else is that a
 * reference resolving to nothing draws nothing and is reported as a fault.
 */
export function embedSrc(provider: unknown, id: unknown): string | undefined {
  const found = providerNamed(provider);
  const said = typeof id === 'string' ? id.trim() : '';
  return found && said ? found.src(said) : undefined;
}

/**
 * **What a reader pasted, turned into an id** — because they will paste a URL.
 *
 * Tried against every provider rather than only the one already chosen, so pasting a Vimeo link into
 * a YouTube embed answers with Vimeo. The provider comes back with it, which is what makes this one
 * gesture instead of two.
 *
 * A string that matches nothing is returned **as the id**, unchanged: somebody who knows the id types
 * the id, and a paste that refuses what a reader typed is worse than one that trusts them.
 */
export function idFrom(said: string): { provider?: string; id: string } {
  const text = said.trim();
  for (const one of PROVIDERS) {
    for (const pattern of one.find) {
      const hit = pattern.exec(text);
      if (hit?.[1]) return { provider: one.id, id: hit[1] };
    }
  }
  return { id: text };
}

/** What a fault list says about an embed that names nothing it can draw. */
export function embedFaults(attrs: Record<string, unknown> | undefined): string[] {
  const said: string[] = [];
  const provider = attrs?.provider;
  if (typeof provider === 'string' && provider && !providerNamed(provider)) {
    said.push(`'${provider}'는 넣을 수 있는 곳이 아닙니다 — 넣을 수 있는 곳: ${PROVIDERS.map((one) => one.label).join(', ')}`);
  }
  const id = typeof attrs?.id === 'string' ? attrs.id.trim() : '';
  if (!id) said.push('무엇을 넣을지 정하지 않았습니다 — 주소를 붙여넣으면 알아냅니다');
  return said;
}
