import { describe, it, expect } from 'vitest';
import { Schema } from '@barocss/schema';
import { getWordSchemaDefinition } from '../src/word-schema';

/**
 * Word's equations in the model.
 *
 * The point of a schema here is that it says a fraction has a numerator and a
 * denominator — exactly those, exactly once. A model that only the renderer
 * objected to would let a document be written that a real Word cannot open, and
 * that fault survives a save.
 */
const schema = new Schema('word', getWordSchemaDefinition() as any);
const n = (stype: string) => ({ stype });
const attrs = (stype: string) => schema.getNodeType(stype)?.attrs ?? {};

describe('where an equation may appear', () => {
  it('is inline, because an equation in a sentence is part of it', () => {
    expect(schema.getNodeType('oMath')?.group).toBe('inline');
  });

  it('has a display form that is a block of its own', () => {
    expect(schema.getNodeType('oMathPara')?.group).toBe('block');
    expect(schema.validateContent('oMathPara', [n('oMath')]).valid).toBe(true);
    expect(attrs('oMathPara').alignment?.default).toBe('center');
  });

  it('does not let a construct loose in ordinary text', () => {
    // A fraction is not a thing that can appear in a sentence — only inside an
    // equation. Keeping that in the schema is what stops a paste putting one
    // there.
    expect(schema.validateContent('paragraph', [n('mathFraction')]).valid).toBe(false);
  });
});

describe('every construct is slots', () => {
  it('gives a fraction a numerator and a denominator', () => {
    expect(schema.validateContent('mathFraction', [n('mathNum'), n('mathDen')]).valid).toBe(true);
    expect(schema.validateContent('mathFraction', [n('mathNum')]).valid).toBe(false);
    expect(
      schema.validateContent('mathFraction', [n('mathNum'), n('mathDen'), n('mathDen')]).valid
    ).toBe(false);
  });

  it('gives a radical a degree and a body', () => {
    expect(schema.validateContent('mathRadical', [n('mathDeg'), n('mathElement')]).valid).toBe(true);
    // Hidden, not absent: a square root still has the slot, and an author can
    // type a 3 into it and get a cube root.
    expect(attrs('mathRadical').hideDegree?.default).toBe(true);
  });

  it('orders an n-ary operator lower, upper, body', () => {
    expect(
      schema.validateContent('mathNary', [n('mathSub'), n('mathSup'), n('mathElement')]).valid
    ).toBe(true);
    expect(attrs('mathNary').char?.default).toBe('∑');
    expect(attrs('mathNary').limitLocation?.default).toBe('undOvr');
  });

  it('puts a pre-script’s scripts before what they belong to', () => {
    expect(
      schema.validateContent('mathPreSubSup', [n('mathSub'), n('mathSup'), n('mathElement')]).valid
    ).toBe(true);
  });

  it('lets a delimiter hold several things, not one string with commas in it', () => {
    expect(schema.validateContent('mathDelimiter', [n('mathElement'), n('mathElement')]).valid).toBe(
      true
    );
    expect(attrs('mathDelimiter').open?.default).toBe('(');
    expect(attrs('mathDelimiter').separator?.default).toBe('|');
  });

  it('builds a matrix from rows of cells', () => {
    expect(schema.validateContent('mathMatrix', [n('mathRow'), n('mathRow')]).valid).toBe(true);
    expect(schema.validateContent('mathRow', [n('mathElement'), n('mathElement')]).valid).toBe(true);
  });
});

describe('what a slot holds', () => {
  it('takes runs and further constructs, and nests without limit', () => {
    expect(schema.validateContent('mathNum', [n('mathRun')]).valid).toBe(true);
    // A fraction inside a numerator is an ordinary continued fraction, and the
    // schema should not be the thing that stops one.
    expect(schema.validateContent('mathNum', [n('mathFraction')]).valid).toBe(true);
    expect(schema.validateContent('mathElement', [n('mathRun'), n('mathRadical')]).valid).toBe(true);
  });

  it('may be empty, which is what an unfilled slot is', () => {
    expect(schema.validateContent('mathDen', []).valid).toBe(true);
  });

  it('does not take ordinary paragraphs', () => {
    expect(schema.validateContent('mathNum', [n('paragraph')]).valid).toBe(false);
  });
});

describe('a run of mathematical text', () => {
  it('holds text the same way every other run does', () => {
    // So the caret, the input path and undo work in it with nothing added.
    expect(schema.validateContent('mathRun', [n('inline-text')]).valid).toBe(true);
  });

  it('can say that its text is not a variable', () => {
    // Word's m:nor. Without it "sin" is three italic variables multiplied.
    expect(attrs('mathRun').literal?.default).toBe(false);
    expect(attrs('mathRun').script).toBeDefined();
  });
});
