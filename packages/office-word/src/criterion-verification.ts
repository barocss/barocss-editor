import { createSchema, validateTree } from '@barocss/schema';
import { getWordSchemaDefinition } from './word-schema';
import { readWordFile } from './word-file';
import type { CriterionContext } from './criterion-confirmation.js';

export interface ExecutableCriterion {
  schemaVersion: 1;
  kind: 'fictional-active-button-contrast';
  minimumRatio: number;
  authoredSentence: string;
}
export type CriterionExecutableRead = { status: 'executable'; criterion: ExecutableCriterion } | { status: 'unsupported'; reason: string };
interface Native { stype?: unknown; attributes?: Record<string, unknown>; content?: unknown[]; text?: unknown }
const schema = createSchema('word-criterion-verification', getWordSchemaDefinition());
const prefix = 'Fictional active-button contrast: minimum ';
const phrase = /(?:^|\s)(Fictional active-button contrast: minimum (\d+(?:\.\d+)?):1\.)(?=\s|$)/g;

/** Read only the exact pinned requirement paragraph. Qualitative source and
 * fields require a separate supported evaluator, never an inferred threshold. */
export function captureExecutableCriterion(context: CriterionContext): CriterionExecutableRead {
  const unsupported = (reason: string): CriterionExecutableRead => ({ status: 'unsupported', reason });
  try {
    const read = readWordFile(context.requirement.snapshotText);
    if ('error' in read || validateTree(schema, read.document as never).length) return unsupported('Invalid full native requirement pin');
    const matches: (Native | undefined)[] = [];
    const visit = (value: unknown, owner?: Native): void => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const node = value as Native, paragraph = node.stype === 'paragraph' ? node : owner;
      if (node.stype === 'bookmarkAnchor' && node.attributes?.id === context.requirement.locator.bookmarkId) matches.push(paragraph);
      node.content?.forEach(child => visit(child, paragraph));
    };
    visit(read.document);
    if (matches.length !== 1 || !matches[0]) return unsupported('A unique pinned requirement paragraph is required');
    let text = '', supported = true;
    for (const child of matches[0].content ?? []) {
      if (!child || typeof child !== 'object' || Array.isArray(child)) { supported = false; break; }
      const node = child as Native;
      if (node.stype === 'inline-text' && typeof node.text === 'string') text += node.text;
      else if (node.stype !== 'bookmarkAnchor') supported = false;
    }
    if (!supported) return unsupported('Unsupported native field or text in criterion');
    const found = [...text.matchAll(phrase)];
    if (text.split('Fictional active-button contrast:').length !== 2 || found.length !== 1) return unsupported('Exactly one explicit fictional contrast sentence is required');
    const minimumRatio = Number(found[0][2]);
    if (!Number.isFinite(minimumRatio) || minimumRatio < 1 || minimumRatio > 21) return unsupported('Fictional contrast ratio must be between 1 and 21');
    return { status: 'executable', criterion: Object.freeze({ schemaVersion: 1, kind: 'fictional-active-button-contrast', minimumRatio, authoredSentence: found[0][1] }) };
  } catch { return unsupported('Unavailable pinned criterion context'); }
}

export interface CriterionSpecimen { readonly id: 'dark' | 'low' | 'transparent'; readonly version: 1; readonly sourceText: string }
const html = (foreground: string, background: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Fictional criterion specimen</title></head><body style="margin:0;background:#fff;opacity:1"><button id="criterion-specimen" type="button" style="color:${foreground};background-color:${background};background-image:none;opacity:1;border:0;padding:12px;font:16px sans-serif">Active button</button></body></html>`;
const specimens: readonly CriterionSpecimen[] = Object.freeze([
  Object.freeze({ id: 'dark' as const, version: 1 as const, sourceText: html('#000', '#fff') }),
  Object.freeze({ id: 'low' as const, version: 1 as const, sourceText: html('#777', '#888') }),
  Object.freeze({ id: 'transparent' as const, version: 1 as const, sourceText: html('rgba(255,255,255,0.5)', '#000') })
]);
export function listCriterionSpecimens(): readonly CriterionSpecimen[] { return specimens; }
export function getCriterionSpecimen(id: string): CriterionSpecimen | undefined { return specimens.find(one => one.id === id); }
export const CRITERION_EVALUATOR = Object.freeze({ id: 'opaque-solid-contrast' as const, version: 1 as const,
  definition: 'For an enabled visible button with opaque solid computed sRGB foreground/background, no background image and opacity 1 through ancestors: linear channel = c/12.92 for c<=0.04045, otherwise ((c+0.055)/1.055)^2.4; luminance = 0.2126R+0.7152G+0.0722B; ratio = (max luminance+0.05)/(min luminance+0.05). Compare the unrounded ratio against only the explicitly authored fictional minimum. Unsupported inputs are not a pass. This calculation alone is not proof of browser execution.' });
export interface RenderedCriterionInput {
  color: string; backgroundColor: string; opacity: string; backgroundImage: string;
  ancestorOpacities: string[]; tagName: string; disabled: boolean; visibility: string; display: string;
}
interface RGB { r: number; g: number; b: number }
export type RenderedCriterionEvaluation = { status: 'passed' | 'failed'; minimumRatio: number; ratio: number;
  foreground: RGB; background: RGB; foregroundLuminance: number; backgroundLuminance: number; inputs: RenderedCriterionInput }
  | { status: 'unsupported'; reason: string; inputs: RenderedCriterionInput };
function rgb(value: string): RGB | undefined {
  const match = value.trim().match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$|^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(1(?:\.0+)?)\s*\)$/);
  if (!match) return;
  const offset = match[1] === undefined ? 4 : 1;
  const [r, g, b] = match.slice(offset, offset + 3).map(Number);
  if ([r, g, b].some(channel => !Number.isSafeInteger(channel) || channel < 0 || channel > 255)) return;
  return { r, g, b };
}
function luminance(value: RGB): number {
  const linear = (byte: number) => { const channel = byte / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; };
  return .2126 * linear(value.r) + .7152 * linear(value.g) + .0722 * linear(value.b);
}
/** Only the trusted executor may bind this arithmetic to actual browser inputs.
 * Submitted success flags, specimen identities and actor claims have no effect. */
export function evaluateRenderedCriterion(criterion: ExecutableCriterion, rendered: RenderedCriterionInput): RenderedCriterionEvaluation {
  const inputs = structuredClone(rendered);
  const unsupported = (reason: string): RenderedCriterionEvaluation => ({ status: 'unsupported', reason, inputs });
  if (typeof criterion.authoredSentence !== 'string' || criterion.schemaVersion !== 1 || criterion.kind !== 'fictional-active-button-contrast' || !Number.isFinite(criterion.minimumRatio) || criterion.minimumRatio < 1 || criterion.minimumRatio > 21 ||
    criterion.authoredSentence !== `${prefix}${criterion.minimumRatio}:1.` && ![...criterion.authoredSentence.matchAll(phrase)].some(one => Number(one[2]) === criterion.minimumRatio && one[1] === criterion.authoredSentence)) return unsupported('Unsupported executable criterion');
  if (typeof inputs.tagName !== 'string' || typeof inputs.color !== 'string' || typeof inputs.backgroundColor !== 'string' || typeof inputs.display !== 'string' || !inputs.display) return unsupported('Unavailable computed rendered inputs');
  if (inputs.tagName.toLowerCase() !== 'button' || inputs.disabled !== false || inputs.visibility !== 'visible' || inputs.display === 'none') return unsupported('A visible enabled button is required');
  if (inputs.opacity !== '1' || !Array.isArray(inputs.ancestorOpacities) || inputs.ancestorOpacities.length < 2 || inputs.ancestorOpacities.some(value => value !== '1') || inputs.backgroundImage !== 'none') return unsupported('Transparency, background images or gradients are unsupported');
  const foreground = rgb(inputs.color), background = rgb(inputs.backgroundColor);
  if (!foreground || !background) return unsupported('Unsupported or nonopaque computed color encoding');
  const foregroundLuminance = luminance(foreground), backgroundLuminance = luminance(background);
  const ratio = (Math.max(foregroundLuminance, backgroundLuminance) + .05) / (Math.min(foregroundLuminance, backgroundLuminance) + .05);
  return { status: ratio >= criterion.minimumRatio ? 'passed' : 'failed', minimumRatio: criterion.minimumRatio, ratio, foreground, background, foregroundLuminance, backgroundLuminance, inputs };
}
