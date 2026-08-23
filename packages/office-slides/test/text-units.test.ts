import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { Editor } from '@barocss/editor-core';
import { createSlidesEditor } from '../src/slides-kit';
import { getSlidesSchemaDefinition } from '../src/slides-schema';
import { slideTimeline, withTiming } from '../src/timeline';
import type { DeckAccess } from '../src/deck';
import {
  animatedPieces,
  graphemes,
  joinsUp,
  splitText,
  unitCount,
  unitSpan,
  words
} from '../src/text-units';

/**
 * Animating text by the piece.
 *
 * The splitting is worth testing in milliseconds because the cases that break it
 * are the ones nobody types while looking at the screen: an emoji with a
 * modifier, a Hangul syllable, a line with two spaces in it. And the *timing* is
 * worth testing because it is the same fault the repeat count had — a step whose
 * length is understated starts the next one early, which on a slide looks like
 * the deck being in a hurry rather than like arithmetic.
 */
describe('splitting a string into pieces', () => {
  it('splits letters by grapheme, not by code unit', () => {
    expect(graphemes('abc')).toEqual(['a', 'b', 'c']);
    // A surrogate pair is one letter, and an emoji with a skin-tone modifier is
    // one letter — `split('')` gives three pieces of nothing for the second.
    expect(graphemes('a👍b')).toEqual(['a', '👍', 'b']);
    expect(graphemes('👍🏽')).toEqual(['👍🏽']);
    expect(graphemes('한글')).toEqual(['한', '글']);
  });

  /**
   * A word keeps the space that follows it.
   *
   * Otherwise the gap to the next word appears before the word does, so a line
   * assembles with holes in it — and the pieces would no longer concatenate back
   * to what was there, which is what makes the split reversible.
   */
  it('keeps a word’s trailing space with the word', () => {
    expect(words('one two three').join('')).toBe('one two three');
    expect(words('one two three')).toEqual(['one ', 'two ', 'three']);
    expect(words('제목 입니다').join('')).toBe('제목 입니다');
  });

  it('puts punctuation with the word it follows', () => {
    expect(words('Hello, world!')).toEqual(['Hello, ', 'world!']);
  });

  /**
   * And a space is not a piece to animate.
   *
   * The number the timeline sizes a bar from and the number the stage animates
   * have to be the same one — they had drifted by three on a four-word title,
   * which made the bar 135ms too wide and the next step wait for a letter that
   * was a space.
   */
  it('does not count a space as a piece', () => {
    expect(animatedPieces('One engine', 'letter')).toHaveLength(9);
    expect(animatedPieces('one two', 'word')).toEqual(['one ', 'two']);
    expect(animatedPieces('  ', 'letter')).toEqual([]);
  });

  it('reassembles exactly, for every unit', () => {
    for (const text of ['One engine, two products', '글자마다 나타내기', 'a👍 b']) {
      expect(splitText(text, 'letter').join('')).toBe(text);
      expect(splitText(text, 'word').join('')).toBe(text);
      expect(splitText(text, 'box')).toEqual([text]);
    }
  });

  it('has one piece for a box, and none for nothing', () => {
    expect(splitText('anything', 'box')).toHaveLength(1);
    expect(splitText('', 'box')).toEqual([]);
  });
});

describe('how long a staggered step takes', () => {
  it('is the duration plus a beat for every piece after the first', () => {
    expect(unitSpan(400, 60, 1)).toBe(400);
    expect(unitSpan(400, 60, 2)).toBe(460);
    expect(unitSpan(350, 45, 10)).toBe(350 + 45 * 9);
  });

  /**
   * Total arithmetic. These three numbers come from a document, and a `NaN`
   * reaching a bar makes it draw nothing at all — for a step that is fine.
   */
  it('treats a missing count as a box', () => {
    expect(unitSpan(400)).toBe(400);
    expect(unitSpan(400, undefined, undefined)).toBe(400);
    expect(unitSpan(400, Number.NaN, Number.NaN)).toBe(400);
  });
});

describe('how many pieces a box has', () => {
  let editor: Editor;
  let store: DataStore;
  let slide: string;
  let title: string;
  let body: string;

  const run = async (command: string, payload?: unknown) =>
    await (editor as any).executeCommand(command, payload);
  const doc = (): DeckAccess => ({
    rootId: (editor as any).getRootId(),
    getNode: (sid: string) => store.getNode(sid) as never
  });

  beforeEach(() => {
    const schema = createSchema('slides', getSlidesSchemaDefinition());
    store = new DataStore(undefined, schema);
    editor = createSlidesEditor({ editable: true, schema, dataStore: store });
    editor.loadDocument(
      {
        stype: 'document',
        attributes: {},
        content: [
          {
            stype: 'surface',
            attributes: { kind: 'slide' },
            content: [
              {
                stype: 'textFrame',
                attributes: { role: 'title', x: 0, y: 0, width: 100, height: 100 },
                content: [
                  {
                    stype: 'paragraph',
                    attributes: {},
                    content: [{ stype: 'inline-text', text: 'One engine' }]
                  }
                ]
              },
              {
                stype: 'textFrame',
                attributes: { role: 'body', x: 0, y: 200, width: 100, height: 100 },
                content: [
                  {
                    stype: 'paragraph',
                    attributes: {},
                    content: [{ stype: 'inline-text', text: 'first line' }]
                  },
                  {
                    stype: 'paragraph',
                    attributes: {},
                    content: [{ stype: 'inline-text', text: 'second' }]
                  }
                ]
              }
            ]
          },
          { stype: 'resources', attributes: {}, content: [] }
        ]
      } as never,
      'slides'
    );
    slide = (store.getNode((editor as any).getRootId()) as any).content[0];
    const boxes = (store.getNode(slide) as any).content as string[];
    title = boxes[0];
    body = boxes[1];
  });

  it('counts the pieces a unit asks for', () => {
    expect(unitCount(doc(), title, 'box')).toBe(1);
    expect(unitCount(doc(), title, 'word')).toBe(2);
    // Nine, not ten: the space is drawn and never animated, so it is not a beat
    // of the stagger. The stage follows the same rule, which is the point.
    expect(unitCount(doc(), title, 'letter')).toBe(9);

    // Two paragraphs, and the words and letters of both.
    expect(unitCount(doc(), body, 'paragraph')).toBe(2);
    expect(unitCount(doc(), body, 'word')).toBe(3);
    expect(unitCount(doc(), body, 'letter')).toBe(9 + 6);
  });

  /**
   * A box with no text is one piece, not none: a step animating nothing still
   * takes its duration, and a zero would collapse the bar and start whatever
   * follows on top of it.
   */
  it('is one piece for a box with nothing in it', () => {
    expect(unitCount(doc(), undefined, 'letter')).toBe(1);
    expect(unitCount(doc(), 'nothing', 'letter')).toBe(1);
  });

  /**
   * And the timeline's bar is as wide as the *whole* animation.
   *
   * This is the same fault the repeat count had: a step whose length is
   * understated starts the next one early. A title of ten letters at 45ms is over
   * 405ms after it starts, not when its first letter finishes.
   */
  it('makes the bar as wide as the last piece’s end', async () => {
    await run('addBoxBuild', {
      nodeId: title,
      effect: 'fly',
      unit: 'letter',
      stagger: 45,
      duration: 350
    });
    await run('addBoxBuild', {
      nodeId: body,
      effect: 'fade',
      startsWith: 'afterPrevious',
      duration: 300
    });

    const timed = withTiming(slideTimeline(doc(), slide));
    // Nine letters in "One engine": the space is drawn, not animated.
    expect(timed[0].units).toBe(9);
    // 350 + 45 × 8 = 710, so the second step waits until then rather than 350.
    expect(timed[0].endAt).toBe(710);
    expect(timed[1].startAt).toBe(710);
  });

  it('refuses to write a unit this product does not have', async () => {
    await run('addBoxBuild', { nodeId: title, effect: 'fade', unit: 'letter' });
    const step = slideTimeline(doc(), slide)[0];
    expect(step.unit).toBe('letter');

    expect(
      (editor as any).canExecuteCommand?.('setMotionStep', { stepId: step.sid, unit: 'line' })
    ).toBe(false);
    // And a stagger outside the range a reader could mean.
    expect(
      (editor as any).canExecuteCommand?.('setMotionStep', { stepId: step.sid, stagger: -5 })
    ).toBe(false);
  });
});

/**
 * A deck from somewhere else, which is the case a fake document tests best.
 *
 * `line` is a real PowerPoint grouping and not one this product has. It animates
 * as a whole box rather than not at all — the same rule the effect names follow,
 * and for the same reason: a motion a reader can see is a motion they can change.
 */
describe('a unit this product does not have', () => {
  const fake = (unit: string): DeckAccess => {
    const nodes: Record<string, unknown> = {
      root: { sid: 'root', stype: 'document', content: ['slide', 'res'] },
      slide: { sid: 'slide', stype: 'surface', attributes: { kind: 'slide', trackId: 't1' }, content: ['box'] },
      box: { sid: 'box', stype: 'textFrame', attributes: { name: 'shape-1' }, content: [] },
      res: { sid: 'res', stype: 'resources', content: ['track'] },
      track: { sid: 'track', stype: 'motionTrack', attributes: { id: 't1' }, content: ['step'] },
      step: {
        sid: 'step',
        stype: 'motionStep',
        attributes: { kind: 'build', effect: 'fade', target: 'shape-1', unit }
      }
    };
    return { rootId: 'root', getNode: (sid: string) => nodes[sid] as never };
  };

  it('reads as a box', () => {
    expect(slideTimeline(fake('line'), 'slide')[0].unit).toBe('box');
    expect(slideTimeline(fake('letter'), 'slide')[0].unit).toBe('letter');
    // And a box's bar is its duration, whatever the text says.
    expect(withTiming(slideTimeline(fake('line'), 'slide'))[0].endAt).toBe(400);
  });
});

/**
 * A script whose letters join.
 *
 * Splitting text into one span per letter stops the browser shaping across the
 * boundaries. For Latin and Hangul nothing changes; for Arabic بيت becomes
 * بـ يـ ت — not a different look, the **wrong text**. So a letter unit on text
 * like that is served as a word unit, which is the nearest thing that is still
 * correct.
 */
describe('text whose letters join up', () => {
  it('knows which text it is', () => {
    expect(joinsUp('بيت')).toBe(true);
    expect(joinsUp('नमस्ते')).toBe(true);
    expect(joinsUp('สวัสดี')).toBe(true);
    expect(joinsUp('한글과 English')).toBe(false);
    expect(joinsUp('')).toBe(false);
  });

  it('animates by word rather than by letter', () => {
    // Two words, not six letters: the letters would be drawn disconnected.
    expect(splitText('بيت كبير', 'letter')).toEqual(words('بيت كبير'));
    expect(animatedPieces('بيت كبير', 'letter')).toHaveLength(2);

    // And Latin and Hangul are unaffected, which is the whole point of the guard
    // being about the text rather than about a setting.
    expect(splitText('abc', 'letter')).toEqual(['a', 'b', 'c']);
    expect(splitText('한글', 'letter')).toEqual(['한', '글']);
  });

  /** A mixed line takes the safe answer, because one span would break either way. */
  it('takes the safe answer for a mixed line', () => {
    expect(splitText('hello بيت', 'letter')).toEqual(words('hello بيت'));
  });
});
