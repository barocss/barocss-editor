# A form, and how far a site builder takes one

Written **before** the next field is added, because three of them had already been added without
this: the fields, the connection, and the faults each landed on their own reasoning, and the next
question — a date? a file? a choice? — has no answer without saying what a form *is* here.

Measured 2026-08-31 against what the product holds today.

---

## What a form feature is made of

Six parts, and only the first two are about drawing:

| | what it is | where this product stands |
|---|---|---|
| 1 | **what can be asked** — the field kinds | 5 of them: text, email, tel, paragraph, submit |
| 2 | **how it is arranged** | free already — a form is a stack, and it holds blocks |
| 3 | **what is refused before sending** | `required`, and the kind's own check |
| 4 | **where it goes** | `service` + `form.sends` — built |
| 5 | **what happens after it is sent** | **nothing.** The visitor lands on the service's page |
| 6 | **what the owner gets** — inbox, alerts, spam, export | the service's, entirely |

Two is already done and needs no vocabulary: a row inside a form puts 이름 and 이메일 on one line,
because `form` holds `frame` and a frame is a stack like any other.

---

## The one thing that decides the rest

A form is the only block in this product **whose behaviour continues after the page is drawn**. And
the export's standing promise is a page with no script in it — kept everywhere so far, including the
places it was hard: `:has()` rather than a menu runtime, a checkbox rather than open-state
JavaScript, a fetch that happens in the editor rather than in the page.

Those two collide in exactly three places, and nowhere else:

- **after sending** — a `<form>` navigates, so the visitor leaves for the service's page;
- **validation past what a browser has built in** — anything cross-field, async, or worded our way;
- **spam** — scoring a message needs somewhere to score it.

So the line this document proposes is one sentence:

> **Everything a browser already does, the product does. Everything that needs code to run, a
> service does — and the *connection* carries whatever that service needs to be told.**

That last clause is the part worth noticing. Making the destination a named `service` resource turned
out to buy more than one address in one place: a service's own conventions — what it calls the field
that redirects, what it calls the field that traps a bot — are facts about **the service**, so they
have somewhere to live that is not the form.

---

## 1. What can be asked

Five today. What the browser gives for nothing, and what an ordinary contact or lead form actually
uses:

| kind | what it is | verdict |
|---|---|---|
| `text` `email` `tel` `paragraph` | have | — |
| **`choice`** | a `<select>` — 문의 유형, 관심 제품 | **the commonest missing one.** Every lead form has one |
| **`checkbox`** | one box that is ticked or not | **required in Korea**: a form collecting personal data needs a consent tick |
| `number` | 인원, 예산 | cheap, honest, `min`/`max` come free |
| `date` | 희망 일정 | cheap; `type=date` is a real picker on every phone |
| `url` | a link | cheap, rarely asked for |
| `file` | an attachment | markup is free, **the service is not** — most simple endpoints reject multipart until configured |
| `hidden` | not asked, sent anyway | not a field a reader places; see §5 |

**The consent line needs nothing new.** A field's `label` is a string and cannot hold a link, which
looked like a gap — until the form's own content answered it: a paragraph with a link to the policy
sits above a `checkbox` field, because a form holds blocks. The alternative (a rich label) would put
a second text model inside an attribute.

## 2. How it is arranged

Done. Worth one note: a two-column form is a `frame` with `layoutMode: 'row'` inside the form, and it
stacks at 390 by the same `overrides` every other row uses. Nothing form-shaped about it.

## 3. What is refused before sending

The browser's own validation is most of a form feature and costs nothing: `required`, `type=email`,
`min`/`max`/`step`, `minlength`/`maxlength`. All of it runs with scripts off, in the visitor's own
language, and it is what makes a real `<form>` worth insisting on.

**`pattern` is deliberately refused.** It is a regular expression — a language a reader has to learn
and cannot debug — and this schema has already turned that down once, when a list's filter became
`where` + `equals` rather than an expression. A pattern that is worth having is a *kind*.

**Anything cross-field is out of scope**: "either a phone or an email", "the end date is after the
start". Both need code, both are rare on the forms a site builder makes, and both are a service's or
a script's.

## 4. Where it goes

Built. `service` in `resources`, `form.sends` names one, and the published page posts straight to it.

## 5. What happens after it is sent — the biggest hole

Today a visitor presses 보내기 and **lands on a stranger's page**. That is the default behaviour of a
real `<form>` and it is the worst thing about the feature as it stands: the site's own design, its
header, its footer, all gone, replaced by whatever Formspree renders.

Every service of this kind solves it the same way — a **hidden field naming where to come back to**
— and they all spell it differently: `_next`, `_redirect`, `_returnUrl`. Which is exactly the shape
the connection is for.

- `service.returnField` — what *this* service calls it (`_next`)
- `form.thanks` — a page of this site, as `page:id`, which is the fifth use of the reference shape
  after `var:이름`, `componentId`, a dataset's `name` and a link's page

The export emits `<input type="hidden" name="_next" value="https://…/감사합니다">`. Absolute, so it
needs the site's address — the same rule `og:url` and `og:image` already follow, and the same answer
when there is none: no field rather than a broken one.

**Zero script, and the visitor never leaves the site.**

## 6. What the owner gets

Not this product's, with one exception that is free:

**A trap field.** A hidden text input a person never sees and a bot fills in; the service drops any
message that has it filled. Formspree calls it `_gotcha`. One more name on the connection
(`service.trapField`), one more hidden input, no script, and it removes most of the spam a public
form collects.

An inbox, alerts, retention and export are a **server**, and that is a product decision rather than a
schema one — written up in `BACKLOG.md`. The schema is ready for it: `sends: 'barocss'` is a
connection like any other.

---

## What was built, 2026-08-31

**A and B, both with no script on the page.** The line held: everything a browser already does, the
product does; everything that needs code to run, a service does, and the *connection* carries what
that service needs to be told.

`choice`, `checkbox`, `number` and `date` joined the five; `min`, `max` and `maxLength` came with
them. Four things that were decided while building rather than while designing:

- **A tick's label goes after its box and wraps it.** Every other field is a question with a box
  under it; a tick is a statement with a box in front. It is also the one field whose label a visitor
  *clicks* — wrapping turns a 14-pixel target into the whole sentence, which pointing at it does not.
- **A `choice` gets an empty first option.** Without one a browser reports the first entry as the
  answer, so a `required` list is never actually unanswered and every message arrives saying whatever
  happened to be at the top.
- **A list with nothing in it is a fault.** Same shape as a form with no destination: an empty box a
  visitor cannot answer, correct on screen and useless in the world.
- **The consent line needed nothing new**, exactly as §1 predicted: the policy link is an ordinary
  paragraph above the box, because a form holds blocks.

For §5, the connection carries the service's own names — `returnField` and `trapField` — and the form
carries `thanks` as a `page:id`. The return is absolute or absent, which is the rule `og:url` already
follows and for the same reason: a service redirecting a browser has no page to resolve a relative
address against.

## What this proposes, in order

**A — the browser's own form, finished.** `choice`, `checkbox`, `number`, `date`; `min`/`max`/
`maxLength` where the kind has one. Zero script. This is the difference between a contact form and
*a form feature*.

**B — the visitor comes back.** `service.returnField` + `form.thanks` → a hidden field. Also
`service.trapField` → spam. Zero script, and it fixes the worst thing about the feature today.

**C — a first-party inbox.** A server. Out of scope for the schema and open in `BACKLOG.md`.

**Deliberately not doing**: `pattern`, cross-field validation, in-page submission without leaving,
inline error messages of our own wording, file uploads. The first four need a runtime this product
does not ship; the fifth needs a service that accepts one.
