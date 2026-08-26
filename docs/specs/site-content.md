# What goes in a page, and how much of it

Written before the sample's words were, because the first version of them was written the other way
round: a heading and one sentence per section, everywhere, which is what a page looks like when the
*layout* was designed and the text was filled in afterwards. A reader called it thin, and thin is the
right word — every band said one thing and then stopped.

This is the model the sample is written against. It is not a style guide; it is a list of **regions,
what each one is for, and how much text that job actually takes.**

## The regions, and the job each one has

| region | the job | what the text has to do | length |
| --- | --- | --- | --- |
| **navigation** | say where else there is | four or five destinations and **one** action | 1 word each |
| **hero** | make the claim | what this is, in the reader's words, and what it replaces | claim ≤ 10 words, then 2 sentences |
| **proof strip** | make the claim survivable | who else decided this. Logos, or one number | none, or 1 line |
| **the turn** | name the reader's situation | the sentence that makes the rest worth reading | 1–2 sentences |
| **capabilities** | say what it does | one **noun** per block, then the consequence of having it | 1 label + 2 sentences each |
| **evidence** | make it checkable | a number with what it counts, or a quote with a name and a role | 3 numbers, or 1 quote ≤ 3 lines |
| **how it works** | remove the fear of starting | three steps, each a **verb** | 1 verb + 1 sentence each |
| **objections** | answer the reason for leaving | price, lock-in, migration, support | 3 questions, 2 sentences each |
| **close** | ask again | the same action as the hero, in the same words | 1 line + the button |
| **footer** | be the map | navigation, legal, contact | short |

## The rules the words follow

1. **A label is a noun, a step is a verb.** `스키마` and `내보내기` are different kinds of thing and
   the grammar says which.
2. **Two sentences, not one.** The first says what it is; the second says what it lets a reader do.
   A single sentence per block is the shape that reads as thin, and adding a third is the shape that
   reads as documentation.
3. **Every number is one this repository can produce.** 107 node types, 3 products, 1 renderer, 24
   marks. A made-up 99.9% is worse than no number.
4. **No filler verbs, no version badges, no scroll cues, no eyebrow above every heading.** These are
   the tells the taste skill lists, and the sample is the thing most likely to be copied.
5. **One action, one label.** 무료로 시작하기 in the bar, in the hero, and at the close. Three
   different words for one act is three acts to a reader.
6. **A sentence fits its box.** A card is 320px wide: two lines of 16px type is about 60 characters,
   and the third line is where a card stops looking like a card.

## What this changes about the layout

Text this length is what the layout vocabulary is *for*, and writing it first is what showed which
parts of that vocabulary the sample was not using:

- a capability block with two sentences needs its label and its body on **different type sizes**,
  which is a heading and a paragraph rather than two paragraphs;
- three of them side by side need `alignItems: stretch` and equal `sizing: fill`, or the middle one
  is taller and the row looks broken;
- a numbers strip needs `justifyContent: between` rather than a gap that happens to look even;
- a question and its answer are a **column with a small gap inside a larger one**, which is two
  levels of stack rather than one list;
- and a section whose text is 68 characters wide needs a `maxWidth` on the column, not on the band —
  the band is the colour, the column is the measure.
