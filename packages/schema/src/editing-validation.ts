import type { Schema } from './schema';
import { getContentMatch } from './content-match';
import { Validator } from './validators';
import type { ValidationResult } from './types';

/** Nested editing data. No datastore IDs or product dependencies are required. */
export interface EditingNode {
  stype: string;
  attributes?: Record<string, unknown>;
  text?: string;
  marks?: { stype: string; attrs?: Record<string, unknown>; range?: [number, number] }[];
  content?: EditingNode[];
}

/** Unlike legacy fitting, this never removes wrappers or silently drops content. */
export function validateEditingContent(schema: Schema, type: string, children: EditingNode[], openStart = false, openEnd = false): ValidationResult {
  const unknown = children.find(child => !schema.hasNodeType(child.stype));
  if (unknown) return { valid: false, errors: [`Unknown child type: ${unknown.stype}`] };
  const def = schema.getNodeType(type);
  if (!def) return { valid: false, errors: [`Unknown type: ${type}`] };
  if (!def.content) return { valid: !children.length, errors: children.length ? [`${type} does not declare children`] : [] };
  try {
    const result = getContentMatch(def.content).matchFragment(children.map(n => n.stype), {
      groupOf: name => schema.getNodeType(name)?.group,
      hasNodeType: name => schema.hasNodeType(name)
    }, openStart, openEnd);
    return { valid: result.valid, errors: result.valid ? [] : [`Invalid children for ${type}: ${def.content}`] };
  } catch {
    return { valid: false, errors: [`Invalid content declaration for ${type}`] };
  }
}

/** Open depths count containers along the first/last edge, never text leaves. */
export function validateEditingFragment(schema: Schema, nodes: EditingNode[], openStart = 0, openEnd = 0): ValidationResult {
  const errors: string[] = [];
  const visit = (node: EditingNode, left: number, right: number, parent?: string, depth = 0): void => {
    if (depth > 100) { errors.push('Editing fragment exceeds depth 100'); return; }
    const def = schema.getNodeType(node.stype);
    if (!def) { errors.push(`Unknown type: ${node.stype}`); return; }
    errors.push(...schema.validateAttributes(node.stype, node.attributes ?? {}).errors);
    const children = node.content ?? [];
    if (node.text !== undefined && (typeof node.text !== 'string' || children.length || def.content)) errors.push(`Invalid text leaf: ${node.stype}`);
    if ((left || right) && (!children.length || node.text !== undefined)) errors.push(`Open boundary is not a container: ${node.stype}`);
    errors.push(...validateEditingContent(schema, node.stype, children, left > 0, right > 0).errors);
    const marks = node.marks ?? [];
    for (const mark of marks) {
      const markDef = schema.getMarkType(mark.stype);
      if (!markDef) { errors.push(`Unknown mark: ${mark.stype}`); continue; }
      errors.push(...Validator.validateAttributes(markDef.attrs ?? {}, mark.attrs ?? {}).errors);
      const restrictions = [def.marks, parent ? schema.getNodeType(parent)?.marks : undefined];
      if (restrictions.some(allowed => allowed && !allowed.includes(mark.stype))) errors.push(`Mark ${mark.stype} is not allowed in ${parent ?? node.stype}`);
      const range = mark.range ?? [0, node.text?.length ?? 0];
      if (node.text === undefined || !range.every(Number.isInteger) || range[0] < 0 || range[1] > node.text.length || range[0] >= range[1]) errors.push(`Invalid mark range: ${mark.stype}`);
      for (const other of marks) {
        if (other === mark || !markDef.excludes?.includes(other.stype)) continue;
        const otherRange = other.range ?? [0, node.text?.length ?? 0];
        if (Math.max(range[0], otherRange[0]) < Math.min(range[1], otherRange[1])) errors.push(`Conflicting marks: ${mark.stype}/${other.stype}`);
      }
    }
    children.forEach((child, index) => visit(child, index === 0 ? Math.max(0, left - 1) : 0, index === children.length - 1 ? Math.max(0, right - 1) : 0, node.stype, depth + 1));
  };
  if (![openStart, openEnd].every(n => Number.isInteger(n) && n >= 0) || !nodes.length && (openStart || openEnd)) errors.push('Invalid open depths');
  else nodes.forEach((node, index) => visit(node, index === 0 ? openStart : 0, index === nodes.length - 1 ? openEnd : 0));
  return { valid: errors.length === 0, errors };
}
