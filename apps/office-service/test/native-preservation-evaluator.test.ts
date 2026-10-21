import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { captureCriterionContext } from '@barocss/office-word/criterion-confirmation';
import { captureExecutionTarget, expectedExecutionSnapshot } from '../src/project-execution-native.js';
import type { ProjectTarget } from '../src/project-store.js';
import { evaluateNativePreservation, NATIVE_PRESERVATION_EVALUATOR, NATIVE_PRESERVATION_SENTENCE } from '../src/native-preservation-evaluator.js';

const original = readFileSync(new URL('./fixtures/criterion-confirmation-word.json', import.meta.url), 'utf8');
const source = original.replaceAll('Keep original fictional content.', NATIVE_PRESERVATION_SENTENCE);
const context = captureCriterionContext(source);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function change(text: string, from: string, to: string, field: 'content' | 'metadata' = 'content'): string {
  const parsed: unknown = JSON.parse(text);
  if (!object(parsed) || !object(parsed.document)) throw Error('fixture');
  const document = parsed.document;
  const encoded = JSON.stringify(document[field]);
  if (!encoded.includes(from)) throw Error('fixture missing text');
  document[field] = JSON.parse(encoded.replace(from, to));
  return JSON.stringify(parsed);
}
function appendUnprotectedParagraph(text: string): string {
  const parsed: unknown = JSON.parse(text);
  if (!object(parsed) || !object(parsed.document) || !Array.isArray(parsed.document.content)) throw Error('fixture');
  parsed.document.content.push({stype:'surface',content:[{stype:'paragraph',content:[{stype:'inline-text',text:'New applied work.'}]}]});
  return JSON.stringify(parsed);
}
function formattedRequirementSource(marks: unknown[]=[{stype:'bold',range:[0,NATIVE_PRESERVATION_SENTENCE.length]}],
  sentence=NATIVE_PRESERVATION_SENTENCE): string {
  const file: unknown=JSON.parse(source);
  if (!object(file)||!object(file.document)||!object(file.document.metadata)||
    !object(file.document.metadata.wonfficeBusinessPair)||!Array.isArray(file.document.metadata.wonfficeBusinessPair.items)) throw Error('fixture');
  const decorate=(document: unknown): void=>{
    if (!object(document)||!Array.isArray(document.content)||!object(document.content[0])||
      !Array.isArray(document.content[0].content)) throw Error('fixture');
    const [requirement,decision]=document.content[0].content;
    if (!object(requirement)||!Array.isArray(requirement.content)||!object(requirement.content[1])||
      requirement.content[1].text!==NATIVE_PRESERVATION_SENTENCE||!object(decision)||
      !Array.isArray(decision.content)||!object(decision.content[1])) throw Error('fixture');
    requirement.content[1].text=sentence;
    requirement.content[1].marks=structuredClone(marks);
    decision.attributes={alignment:'left'};
    decision.content[1].metadata={reviewed:false,retained:'full-native-reference'};
  };
  decorate(file.document);
  for (const item of file.document.metadata.wonfficeBusinessPair.items) {
    if (!object(item)||!Array.isArray(item.versions)) throw Error('fixture');
    for (const version of item.versions) {
      if (!object(version)||typeof version.snapshotText!=='string') throw Error('fixture');
      const pin: unknown=JSON.parse(version.snapshotText);
      if (!object(pin)||!object(pin.document)) throw Error('fixture');
      decorate(pin.document);
      version.snapshotText=JSON.stringify(pin);
    }
  }
  return JSON.stringify(file);
}
function wordWorkFixture(protectedTarget: boolean): { snapshotText: string; target: ProjectTarget } {
  const threadId = '77777777-7777-4777-8777-777777777777';
  const file: unknown = JSON.parse(source);
  if (!object(file) || !object(file.document) || !object(file.document.metadata)
    || !object(file.document.metadata.wonfficeBusinessPair)
    || !Array.isArray(file.document.metadata.wonfficeBusinessPair.items)) throw Error('fixture');
  const decorate = (document: unknown): string => {
    if (!object(document) || !Array.isArray(document.content) || !object(document.content[0])
      || !Array.isArray(document.content[0].content)) throw Error('fixture');
    const surface = document.content[0],children = surface.content;
    if (!Array.isArray(children)) throw Error('fixture');
    let text: string;
    if (protectedTarget) {
      const paragraph = children[1];
      if (!object(paragraph) || !Array.isArray(paragraph.content) || !object(paragraph.content[1])
        || typeof paragraph.content[1].text !== 'string') throw Error('fixture');
      text = paragraph.content[1].text;
      paragraph.content[1].marks = [{ stype:'commentRef',attrs:{id:threadId},range:[0,text.length] }];
    } else {
      text = 'Edit a separate work paragraph.';
      children.push({stype:'paragraph',attributes:{},content:[{stype:'inline-text',text,
        marks:[{stype:'commentRef',attrs:{id:threadId},range:[0,text.length]}]}]});
    }
    document.content.push({stype:'resources',attributes:{},content:[{stype:'commentThread',attributes:{id:threadId,resolved:false},
      content:[{stype:'paragraph',attributes:{author:'Synthetic test'},content:[{stype:'inline-text',text:'Review work'}]}]}]});
    return text;
  };
  const quote = decorate(file.document);
  for (const item of file.document.metadata.wonfficeBusinessPair.items) {
    if (!object(item) || !Array.isArray(item.versions)) throw Error('fixture');
    for (const version of item.versions) {
      if (!object(version) || typeof version.snapshotText !== 'string') throw Error('fixture');
      const pin: unknown = JSON.parse(version.snapshotText);
      if (!object(pin)) throw Error('fixture');
      decorate(pin.document);
      version.snapshotText = JSON.stringify(pin);
    }
  }
  return { snapshotText:JSON.stringify(file),target:{kind:'word-comment',id:threadId,quote} };
}
it('requires the explicitly authored condition and proves its linked native reference is unchanged', () => {
  expect(NATIVE_PRESERVATION_EVALUATOR.id).toBe('word-paragraph-preserved');
  const result = appendUnprotectedParagraph(source);
  const evaluation = evaluateNativePreservation(context, source, result);
  if (evaluation.status === 'unsupported') throw Error(evaluation.reason);
  expect(evaluation).toMatchObject({status:'passed'});
  if (evaluation.status !== 'passed') throw Error('unexpected evaluator outcome');
  expect(evaluation.referenceParagraphText).toBe(evaluation.resultParagraphText);
  expect(evaluation.referenceParagraphHash).toBe(sha(evaluation.referenceParagraphText));
});
it('recognizes the exact formatted requirement while comparing the full pinned native decision', () => {
  const rich=formattedRequirementSource(),confirmed=captureCriterionContext(rich);
  expect(confirmed.requirement.snapshotText).toContain('"marks"');
  expect(confirmed.decision.snapshotText).toContain('full-native-reference');
  const unchanged=evaluateNativePreservation(confirmed,rich,appendUnprotectedParagraph(rich));
  expect(unchanged.status).toBe('passed');
  if (unchanged.status!=='passed') throw Error('formatted requirement was not recognized');
  expect(unchanged.referenceParagraphText).toBe(unchanged.resultParagraphText);
  expect(unchanged.referenceParagraphText).toContain('full-native-reference');
  const changed=evaluateNativePreservation(confirmed,rich,change(rich,'Store exact rich reference.','Changed protected content.'));
  expect(changed.status).toBe('failed');
  if (changed.status!=='failed') throw Error('protected change was not detected');
  expect(changed.referenceParagraphHash).not.toBe(changed.resultParagraphHash);
});
it('refuses unsupported and malformed formatting on the authored requirement', () => {
  for (const mark of [
    {stype:'unknown-style',range:[0,NATIVE_PRESERVATION_SENTENCE.length]},
    {stype:'deletion',range:[0,NATIVE_PRESERVATION_SENTENCE.length]},
    {stype:'bold',range:[0,NATIVE_PRESERVATION_SENTENCE.length+1]},
    {stype:'bold',range:[0,NATIVE_PRESERVATION_SENTENCE.length],attrs:{unknown:'value'}},
  ]) {
    const rich=formattedRequirementSource([mark]),confirmed=captureCriterionContext(rich);
    expect(evaluateNativePreservation(confirmed,rich,appendUnprotectedParagraph(rich)))
      .toStrictEqual({status:'unsupported',reason:'unregistered_preservation_condition'});
  }
});
it('does not register a different sentence merely because it has valid bold formatting', () => {
  const rich=formattedRequirementSource(undefined,`${NATIVE_PRESERVATION_SENTENCE.slice(0,-1)}?`),
    confirmed=captureCriterionContext(rich);
  expect(evaluateNativePreservation(confirmed,rich,appendUnprotectedParagraph(rich)))
    .toStrictEqual({status:'unsupported',reason:'unregistered_preservation_condition'});
});
it('pure comparison fails changed protected content without treating application success as verification', () => {
  const result = change(source, 'Store exact rich reference.', 'Changed protected content.');
  const evaluation = evaluateNativePreservation(context, source, result);
  if (evaluation.status === 'unsupported') throw Error(evaluation.reason);
  expect(evaluation).toMatchObject({status:'failed'});
  if (evaluation.status !== 'failed') throw Error('unexpected evaluator outcome');
  expect(evaluation.referenceParagraphHash).not.toBe(evaluation.resultParagraphHash);
  expect(evaluation.resultParagraphText).toContain('Changed protected content.');
});
it('compares output produced by the existing supported Word native edit branch', () => {
  const work = wordWorkFixture(false), confirmed = captureCriterionContext(work.snapshotText);
  expect(captureExecutionTarget(work.snapshotText, work.target)).toMatchObject({nodeId:work.target.id,text:work.target.quote});
  const result = expectedExecutionSnapshot(work.snapshotText, work.target, 'Applied to a separate work paragraph.');
  expect(evaluateNativePreservation(confirmed, work.snapshotText, result).status).toBe('passed');
});
it('fails the preservation condition when native Word work changes the anchored protected paragraph', () => {
  const work = wordWorkFixture(true), confirmed = captureCriterionContext(work.snapshotText);
  expect(confirmed.schemaVersion).toBe(1);
  expect(captureExecutionTarget(work.snapshotText, work.target)).toMatchObject({nodeId:work.target.id,text:work.target.quote});
  const result = expectedExecutionSnapshot(work.snapshotText, work.target, 'Changed protected content.');
  const evaluation = evaluateNativePreservation(confirmed, work.snapshotText, result);
  expect(evaluation).toMatchObject({status:'failed'});
  if (evaluation.status !== 'failed') throw Error('unexpected evaluator outcome');
  expect(JSON.parse(evaluation.resultParagraphText)).toMatchObject({stype:'paragraph',content:[
    {stype:'bookmarkAnchor',attributes:{id:'decision'}},
    {stype:'inline-text',text:'Changed protected content.'},
  ]});
  expect(evaluation.resultParagraphHash).not.toBe(evaluation.referenceParagraphHash);
});
it('treats native marks and attributes as protected content', () => {
  const text = '"text":"Store exact rich reference."';
  expect(evaluateNativePreservation(context, source, change(source, text,
    '"text":"Store exact rich reference.","marks":[{"stype":"code","range":[0,6]}]')).status).toBe('failed');
  const heading = '"stype":"paragraph","content":[{"stype":"bookmarkAnchor","attributes":{"id":"decision"}';
  expect(evaluateNativePreservation(context, source, change(source, heading,
    '"stype":"paragraph","attributes":{"alignment":"center"},"content":[{"stype":"bookmarkAnchor","attributes":{"id":"decision"}')).status).toBe('failed');
});
it('refuses missing and ambiguous native targets, changed business identities and changed reference context', () => {
  const missing = change(source, '"id":"decision"', '"id":"removed"');
  expect(evaluateNativePreservation(context, source, missing)).toStrictEqual({status:'unsupported',reason:'missing_paragraph'});
  const ambiguous = change(source, '"id":"requirement"', '"id":"decision"');
  expect(evaluateNativePreservation(context, source, ambiguous)).toStrictEqual({status:'unsupported',reason:'ambiguous_paragraph'});
  const copied = change(source, context.decision.itemId, '99999999-9999-4999-8999-999999999999', 'metadata');
  expect(evaluateNativePreservation(context, source, copied)).toStrictEqual({status:'unsupported',reason:'business_identity_changed'});
  expect(evaluateNativePreservation(context, source, change(source, '"stype":"surface"', '"stype":"heading"'))).toStrictEqual({status:'unsupported',reason:'native_context_changed'});
  expect(evaluateNativePreservation(context, source, '{')).toStrictEqual({status:'unsupported',reason:'invalid_native_file'});
});
it('does not infer preservation from an arbitrary confirmed requirement', () => {
  expect(evaluateNativePreservation(captureCriterionContext(original), original, original))
    .toStrictEqual({status:'unsupported',reason:'unregistered_preservation_condition'});
});
