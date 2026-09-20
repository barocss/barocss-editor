import type { Schema } from '@barocss/schema';
import type { EditingPolicy, EditingRule, EditingRuleTrace, FragmentNode } from './types';
import { freeze } from './state';

/** A reusable value, with no global registration or live callbacks. */
export function defineEditingRule(rule: EditingRule): EditingRule {
  const copy = structuredClone(rule);
  if (!copy.id?.trim() || copy.id.startsWith('builtin:')) throw new Error('Editing rule requires a non-reserved id');
  if (copy.priority !== undefined && !Number.isSafeInteger(copy.priority)) throw new Error('Editing rule priority must be a safe integer');
  if (!copy.match?.sourceType || !copy.match.targetType || !['open', 'closed'].includes(copy.match.boundary)
    || !['equal', 'any'].includes(copy.match.attributes)
    || copy.match.targetKind !== undefined && !['text', 'children'].includes(copy.match.targetKind)) throw new Error('Invalid editing rule match');
  if (!['join-inline', 'preserve', 'reject'].includes(copy.effect) || !copy.reason?.trim()) throw new Error('Editing rule requires a supported effect and reason');
  if (copy.effect === 'join-inline' && copy.match.boundary !== 'open') throw new Error('join-inline requires an open boundary');
  return freeze(copy);
}

/** Copy and validate the entire editor policy. configure() replaces it atomically. */
export function defineEditingPolicy(policy: EditingPolicy): EditingPolicy {
  const rules = policy.rules?.map(defineEditingRule);
  if (rules && new Set(rules.map(rule => rule.id)).size !== rules.length) throw new Error('Duplicate editing rule id');
  return freeze({ ...policy, rules, references: structuredClone(policy.references), adapters: policy.adapters?.map(adapter => ({ ...adapter })) });
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && a.length !== (b as unknown[]).length) return false;
  if (!Array.isArray(a) && (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype)) return false;
  const left = Object.entries(a), right = Object.entries(b);
  return left.length === right.length && left.every(([key, value]) => Object.hasOwn(b, key) && sameValue(value, (b as Record<string, unknown>)[key]));
}

export function effectiveAttributes(schema: Schema, node: FragmentNode): Record<string, unknown> {
  return {
    ...Object.fromEntries(Object.entries(schema.getNodeType(node.stype)?.attrs ?? {}).filter(([, attr]) => attr.default !== undefined).map(([key, attr]) => [key, attr.default])),
    ...node.attributes,
  };
}

export function sameAttributes(schema: Schema, source: FragmentNode, target: FragmentNode): boolean {
  return sameValue(effectiveAttributes(schema, source), effectiveAttributes(schema, target));
}

/** Resolve by explicit priority. Type specificity and registration order do not break ties. */
export function resolveEditingRule(
  policy: EditingPolicy, schema: Schema, source: FragmentNode, target: FragmentNode,
  context: Pick<EditingRuleTrace, 'boundary' | 'targetKind'>,
  fallback: { effect: EditingRule['effect']; reason: string },
): EditingRuleTrace {
  const matched = (policy.rules ?? []).filter(rule =>
    (rule.match.sourceType === '*' || rule.match.sourceType === source.stype)
    && (rule.match.targetType === '*' || rule.match.targetType === target.stype)
    && rule.match.boundary === context.boundary
    && (!rule.match.targetKind || rule.match.targetKind === context.targetKind)
    && (rule.match.attributes === 'any' || sameAttributes(schema, source, target)));
  const priority = Math.max(...matched.map(rule => rule.priority ?? 0));
  const winners = matched.filter(rule => (rule.priority ?? 0) === priority).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const base = { sourceType: source.stype, targetType: target.stype, ...context };
  if (!winners.length) return { ...base, ruleIds: [`builtin:${fallback.effect}`], ...fallback };
  if (new Set(winners.map(rule => rule.effect)).size > 1) {
    return { ...base, ruleIds: winners.map(rule => rule.id), effect: 'reject', reason: `Conflicting editing rules at priority ${priority}: ${winners.map(rule => rule.id).join(', ')}` };
  }
  return { ...base, ruleIds: winners.map(rule => rule.id), effect: winners[0].effect, reason: winners.map(rule => rule.reason).join('; ') };
}
