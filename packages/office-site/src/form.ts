/**
 * **A form** — what a visitor sends, and where it goes.
 *
 * The one block an ordinary site has that this model had nothing behind. Everything else a page
 * needed was already in the office schema or was a stack wearing a different name; a form is neither,
 * because its point is not what it looks like but what happens **after** somebody has used it.
 *
 * This file holds the two things that are not drawing: which controls a field can be, and what a
 * field's answer is called when it arrives.
 */

/**
 * The controls a field can be — the whole list, and it is short on purpose.
 *
 * Five, and four of them are questions. A site builder's form is a contact form nine times out of
 * ten: a name, an address, a message, and a button. Every control past that (a date, a file, a
 * choice of three) is a real thing somebody will want and none of them is what stops a page from
 * shipping today, so they are absent rather than half-drawn.
 *
 * `submit` is in the list and is not a question, which is worth the sentence: it has to be a real
 * `<button type="submit">` inside the form or the Enter key does nothing and a keyboard cannot send
 * it. Making it a `kind` is what makes that impossible to get wrong — a reader cannot accidentally
 * build a form whose button is a styled box.
 */
export const FIELDS = [
  'text',
  'email',
  'tel',
  'number',
  'date',
  'paragraph',
  /**
   * **One of several** — the commonest missing one. Every lead form has a 문의 유형, and without it a
   * reader either asks for it as free text and reads a hundred spellings of the same three answers,
   * or does not ask.
   */
  'choice',
  /**
   * **One box, ticked or not** — and in Korea a form that collects personal data needs one, because
   * consent has to be given rather than assumed.
   *
   * The consent line needed nothing new beyond this, which is worth the note: a field's `label` is a
   * string and cannot hold a link, and the policy has to be linked. A form holds **blocks**, so the
   * link is an ordinary paragraph above the box. The alternative — a rich label — would put a second
   * text model inside an attribute.
   */
  'checkbox',
  /**
   * **A file**, which is the one kind this list was still missing.
   *
   * A portfolio asks for a deck, a job form asks for a CV, a support form asks for the screenshot
   * that shows the thing — and without it a reader either asks for a link to a file somebody has
   * already uploaded somewhere, or does not ask.
   *
   * It is the one field whose presence changes the **form** and not only itself: a browser will not
   * send a file through the default encoding, so a form holding one has to say
   * `enctype="multipart/form-data"` or the file is quietly dropped and everything else arrives. That
   * is `needsUpload`, and it is a fact about the set rather than about the field — the same shape as
   * *does anything here send*, which is why it lives beside it.
   *
   * And it is the one field whose **connection** has to agree: a service that takes a form as
   * `application/x-www-form-urlencoded` will refuse or ignore the file. Nothing here can check that,
   * so `formFaults` says it out loud instead of guessing.
   */
  'file',
  'submit'
] as const;

export type FieldKind = (typeof FIELDS)[number];

/**
 * What a field's control is, in the browser's own vocabulary.
 *
 * Most of a form feature is this one line: `type="email"` is a phone showing the right keyboard, a
 * browser checking the address before anything is sent, and an autofill that knows what to offer —
 * none of which a `text` box styled to look like an email field gets.
 */
export function inputTypeOf(kind: unknown): string {
  switch (kind) {
    case 'email':
      return 'email';
    case 'tel':
      return 'tel';
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    case 'checkbox':
      return 'checkbox';
    case 'file':
      return 'file';
    case 'submit':
      return 'submit';
    default:
      return 'text';
  }
}

/** Whether this kind is drawn as a list to choose one from. */
export function isChoiceField(kind: unknown): boolean {
  return kind === 'choice';
}

/**
 * Whether this kind's label goes **after** the control rather than above it.
 *
 * A checkbox, and only a checkbox. Every other field is a question with a box under it; a tick is a
 * statement with a box in front of it, and putting its words above would leave a labelled empty line
 * followed by an unexplained square. It is also the one field whose label a visitor **clicks**, which
 * is why it is wrapped rather than pointed at.
 */
export function isTickField(kind: unknown): boolean {
  return kind === 'checkbox';
}

/** The choices a `choice` field offers, in order — empty for every other kind. */
export function choicesOf(attrs: Record<string, unknown> | undefined): string[] {
  const said = attrs?.choices;
  if (!Array.isArray(said)) return [];
  return said.filter((one): one is string => typeof one === 'string' && one.trim().length > 0);
}

/** Whether this kind is drawn as a box with many lines rather than one. */
export function isParagraphField(kind: unknown): boolean {
  return kind === 'paragraph';
}

/** Whether this kind sends the form rather than asking something. */
export function isSubmitField(kind: unknown): boolean {
  return kind === 'submit';
}

/**
 * What the answer arrives **called**.
 *
 * `answerNameOf` and not `fieldNameOf`, which this package already has and which means something
 * else entirely: *the column a `field:이름` reference points at*. Two different nouns with one name
 * is the seam fault this repository keeps finding written down, and it would have been written by
 * whoever imported the wrong one from the index.
 *
 * The person reading the messages sees `email` and `message`, not 이메일 주소 and 하고 싶은 말 — so
 * a field states its own name, and this is what it falls back to when nobody has.
 *
 * Latin letters, digits, `-` and `_`, because a name travels in a form encoding and through whatever
 * service the address belongs to, and a Korean label would arrive percent-encoded in somebody's
 * spreadsheet column heading. A label with nothing usable in it — which is most Korean labels —
 * falls back to the field's position, so two fields never share a name by accident.
 */
export function answerNameOf(
  attrs: Record<string, unknown> | undefined,
  /** Where it sits in the form, for the fallback. */
  at = 0
): string {
  const said = attrs?.name;
  if (typeof said === 'string' && said.trim()) return said.trim();

  const label = typeof attrs?.label === 'string' ? attrs.label : '';
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]+/g, '')
    .trim()
    .replace(/\s+/g, '-');

  return slug || `field-${at + 1}`;
}

/** A connection: an address with a name on it, kept in `resources`. */
export interface Service {
  sid: string;
  name: string;
  label?: string;
  endpoint?: string;
  method: 'post' | 'get';
  /** What this service calls the field that brings a visitor back — `_next`, usually. */
  returnField?: string;
  /** And what it calls the one that catches a bot — `_gotcha`, usually. */
  trapField?: string;
}

/**
 * **The hidden fields a form ships**, which are the two things a service has to be told.
 *
 * Both are the service's own vocabulary rather than a standard — `_next`, `_redirect`, `_returnUrl`
 * — which is why they are on the connection and said once for a whole site.
 *
 * A return with no address to return **to** is left out rather than published empty: a service handed
 * an empty `_next` is one that either ignores it or redirects to nothing, and neither is a thing a
 * reader can debug from the page.
 */
export function hiddenFields(
  service: Service | undefined,
  /** Where a visitor should land, already absolute — see `thanksAt`. */
  back?: string
): { name: string; value: string }[] {
  const found: { name: string; value: string }[] = [];
  if (!service) return found;

  if (service.returnField?.trim() && back?.trim()) {
    found.push({ name: service.returnField.trim(), value: back.trim() });
  }
  /*
   * The trap ships **empty**, always: a person never sees it and never fills it, and a bot that fills
   * every input it finds marks itself. The value being empty is the whole mechanism.
   */
  if (service.trapField?.trim()) found.push({ name: service.trapField.trim(), value: '' });
  return found;
}

/** Every connection this document holds, in document order. */
export function servicesOf(
  doc: { rootId: string; getNode: (sid: string) => Record<string, any> | undefined } | undefined
): Service[] {
  const found: Service[] = [];
  const root = doc ? doc.getNode(doc.rootId) : undefined;
  for (const child of (root?.content ?? []) as unknown[]) {
    if (typeof child !== 'string') continue;
    const box = doc!.getNode(child);
    if (box?.stype !== 'resources') continue;

    for (const each of (box.content ?? []) as unknown[]) {
      if (typeof each !== 'string') continue;
      const node = doc!.getNode(each);
      if (node?.stype !== 'service') continue;
      const name = node.attributes?.name;
      // A connection with no name is one nothing can point at, which is not a connection.
      if (typeof name !== 'string' || !name) continue;
      found.push({
        sid: String(node.sid),
        name,
        label: typeof node.attributes?.label === 'string' ? node.attributes.label : undefined,
        endpoint:
          typeof node.attributes?.endpoint === 'string' ? node.attributes.endpoint : undefined,
        method: node.attributes?.method === 'get' ? 'get' : 'post',
        returnField:
          typeof node.attributes?.returnField === 'string' ? node.attributes.returnField : undefined,
        trapField:
          typeof node.attributes?.trapField === 'string' ? node.attributes.trapField : undefined
      });
    }
  }
  return found;
}

/** The connection a form names, or nothing. */
export function serviceNamed(
  doc: { rootId: string; getNode: (sid: string) => Record<string, any> | undefined } | undefined,
  name: unknown
): Service | undefined {
  if (typeof name !== 'string' || !name) return undefined;
  return servicesOf(doc).find((one) => one.name === name);
}

/**
 * What is wrong with a form, against what a visitor would experience.
 *
 * Four faults, and the first two are the ones only a check can see: **a form that goes nowhere looks
 * exactly like a form that works**, right up until somebody presses 보내기 and nobody ever hears from
 * them. That is the shape every fault in this product is worth reporting for — correct on screen,
 * wrong in the world.
 */
export function formFaults(
  attrs: Record<string, unknown> | undefined,
  /** The fields inside it, in order. */
  fields: Array<Record<string, unknown> | undefined>,
  /** The connection it names, looked up by the caller — absent when it names none. */
  service?: Service | undefined
): string[] {
  const faults: string[] = [];

  const sends = attrs?.sends;
  if (typeof sends !== 'string' || !sends.trim()) {
    faults.push('보낼 곳을 고르지 않았습니다 — 방문자가 보낸 내용이 아무 데도 가지 않습니다');
  } else if (!service) {
    /*
     * A name that points at nothing — the same fault a link to a deleted page has, and it is worth
     * telling apart from having chosen nothing: one is a reader who has not finished, the other is a
     * connection somebody removed out from under a form that still names it.
     */
    faults.push(`'${sends}' 연결이 없습니다 — 이름은 남아 있고 보낼 곳이 사라졌습니다`);
  } else if (!service.endpoint?.trim()) {
    faults.push(`'${service.label ?? service.name}'에 주소가 없습니다 — 서비스에서 받은 주소를 넣어야 합니다`);
  }

  if (!fields.some((one) => isSubmitField(one?.kind))) {
    faults.push('보내기 단추가 없습니다 — 방문자가 보낼 방법이 없습니다');
  }

  /**
   * **A file, sent through a connection that may not take one.**
   *
   * The form is encoded for it — `needsUpload` sees to that — and the other half is not this
   * product's to decide: whether the address at the far end accepts `multipart/form-data` is a fact
   * about somebody else's service, and a builder that guessed would be a builder that told a reader
   * their form works when the file is being dropped at the far end.
   *
   * So it is said rather than guessed, and it is a fault with the shape the rest of this list has: a
   * thing that looks completely fine on screen and loses the one answer that mattered.
   */
  if (needsUpload(fields) && service) {
    faults.push(
      `'${service.label ?? service.name}'이(가) 파일을 받는지 확인하세요 — 파일 칸이 있는 폼은 ` +
        'multipart/form-data로 보냅니다. 받지 못하는 서비스는 파일만 조용히 버립니다'
    );
  }

  /*
   * And two fields arriving under one name, which is a message with one of them silently missing.
   * Counted over the asking fields only: a submit has a name and never carries an answer.
   */
  const seen = new Set<string>();
  fields.forEach((one, at) => {
    if (isSubmitField(one?.kind)) return;
    const name = answerNameOf(one, at);
    if (seen.has(name)) faults.push(`'${name}'이(가) 두 번 있습니다 — 하나만 도착합니다`);
    seen.add(name);

    /*
     * And a list with nothing in it, which draws an empty box a visitor cannot answer — the same
     * shape as a form with no destination: correct on screen, useless in the world.
     */
    if (isChoiceField(one?.kind) && choicesOf(one).length === 0) {
      faults.push(`'${one?.label ?? name}'에 고를 것이 없습니다 — 빈 목록이 그려집니다`);
    }
  });

  return faults;
}


/**
 * **Whether this form has to be encoded for files**, which is a fact about the set.
 *
 * A browser sends a form as `application/x-www-form-urlencoded` unless told otherwise, and that
 * encoding has no way to carry a file — so a form with a file field and no `enctype` sends every
 * other answer and silently drops the one the reader actually attached. Nothing errors, nothing is
 * logged, and the person who filled it in has no idea.
 *
 * Asked of the fields rather than stored on the form, for the reason `hiddenFields` is: it is
 * derivable, and a stored copy is a second thing to keep true the day somebody deletes the field.
 */
export function needsUpload(fields: readonly (Record<string, unknown> | undefined)[]): boolean {
  return fields.some((one) => one?.kind === 'file');
}
