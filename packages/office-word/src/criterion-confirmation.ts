import { readBusinessPair } from './business-pair';
import { readWordFile } from './word-file';

export interface CriterionItemContext {
  itemId: string;
  version: number;
  locator: { kind: 'point-bookmark'; bookmarkId: string };
  /** Exact full native file pinned by the referenced item version. */
  snapshotText: string;
}
export interface CriterionContext {
  schemaVersion: 1;
  requirement: CriterionItemContext;
  decision: CriterionItemContext & { currentVersion: number; currentSnapshotText: string };
  relation: { kind: 'supported_by'; source: { itemId: string; version: number }; target: { itemId: string; version: number } };
}
export class CriterionConfirmationError extends Error {}

/** Capture content only. Authored approval, actor and time never establish authority.
 * The server must independently capture this context from its locked current source.
 * Storage revision, full current source and authenticated actor are separate bindings. */
export function captureCriterionContext(snapshotText: string): CriterionContext {
  const file = readWordFile(snapshotText);
  if ('error' in file) throw new CriterionConfirmationError('A valid full native Word file is required');
  const read = readBusinessPair(file.document);
  if (read.status !== 'valid') throw new CriterionConfirmationError('A valid requirement and decision pair is required');
  if (read.items.some(({ state }) => state !== 'current')) throw new CriterionConfirmationError('Current uniquely resolved criterion content is required');
  const requirement = read.payload.items.find(item => item.kind === 'requirement')!;
  const decision = read.payload.items.find(item => item.kind === 'decision')!;
  const relation = read.payload.relations[0];
  if (relation.source.version !== requirement.currentVersion) throw new CriterionConfirmationError('The referenced requirement version must be current');
  // #423 intentionally retains a historical decision reference after a new version.
  // Both the shown pin and current decision context must remain explicitly bound.
  const pin = decision.versions.find(version => version.version === relation.target.version)!;
  return {
    schemaVersion: 1,
    requirement: { itemId: requirement.id, version: requirement.currentVersion, locator: structuredClone(requirement.locator), snapshotText: requirement.versions[requirement.currentVersion - 1].snapshotText },
    decision: { itemId: decision.id, version: pin.version, currentVersion: decision.currentVersion, locator: structuredClone(decision.locator), snapshotText: pin.snapshotText, currentSnapshotText: decision.versions[decision.currentVersion - 1].snapshotText },
    relation: structuredClone(relation)
  };
}

/** Exact JSON contract equality. Additional client fields are refused. Property
 * order alone is immaterial; every nested key, array position and value remains. */
function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value, index) => same(value, right[index]));
  if (!left || typeof left !== 'object' || !right || typeof right !== 'object' || Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}
export function compareCriterionContext(snapshotText: string, expected: unknown): boolean {
  try { return same(captureCriterionContext(snapshotText), expected); }
  catch { return false; }
}

export { captureExecutableCriterion, getCriterionSpecimen, listCriterionSpecimens, CRITERION_EVALUATOR, evaluateRenderedCriterion } from './criterion-verification.js';
export type { ExecutableCriterion, CriterionSpecimen, RenderedCriterionInput, RenderedCriterionEvaluation, CriterionExecutableRead } from './criterion-verification.js';
