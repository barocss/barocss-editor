/**
 * Turning `numId` + level into the number a reader sees.
 *
 * A list number is not stored anywhere: "1.", "a.", "iii." are computed by
 * walking the document in reading order and counting. That is why this is a
 * product runtime and not schema — the same document renders "1." or "A." purely
 * from the numbering definition it points at.
 *
 * Counting rules, all of which exist because a document breaks them somewhere:
 *
 *   - counters are per definition (`numId`), not per list node, so two lists
 *     sharing a definition continue each other unless one restarts
 *   - entering a deeper level resets it and everything below
 *   - `restartAfterLevel` lets a level reset when a *shallower* one advances,
 *     which is how "1.1, 1.2, 2.1" works
 *   - a level's `text` is a pattern over every counter above it (`%1.%2.`), so
 *     the number of a deep item depends on its ancestors' counters
 */
import {
  childOfType,
  childrenOf,
  walkBlocks,
  type DocumentAccess,
  type DocumentNode
} from './document-access';

const ROMAN: [number, string][] = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
  [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
  [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
];

function toRoman(value: number): string {
  if (value <= 0) return '';
  let remaining = value;
  let out = '';
  for (const [amount, numeral] of ROMAN) {
    while (remaining >= amount) {
      out += numeral;
      remaining -= amount;
    }
  }
  return out;
}

/** 1 → a, 26 → z, 27 → aa — spreadsheet-column style, as Word does it. */
function toLetter(value: number): string {
  if (value <= 0) return '';
  let remaining = value;
  let out = '';
  while (remaining > 0) {
    const index = (remaining - 1) % 26;
    out = String.fromCharCode(97 + index) + out;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return out;
}

/** Render one counter in a given number format. */
export function formatCounter(value: number, format: string): string {
  switch (format) {
    case 'decimal':
      return String(value);
    case 'decimalZero':
      return value < 10 ? `0${value}` : String(value);
    case 'upperRoman':
      return toRoman(value).toUpperCase();
    case 'lowerRoman':
      return toRoman(value);
    case 'upperLetter':
      return toLetter(value).toUpperCase();
    case 'lowerLetter':
      return toLetter(value);
    case 'ordinal':
      return `${value}${ordinalSuffix(value)}`;
    case 'none':
      return '';
    default:
      // `bullet` and anything unknown: the level's literal text is the number.
      return '';
  }
}

function ordinalSuffix(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (value % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

interface LevelDefinition {
  level: number;
  format: string;
  text: string;
  start: number;
  restartAfterLevel?: number;
  suffix: string;
}

export interface NumberedItem {
  nodeId: string;
  numId: string;
  level: number;
  /** Rendered number, e.g. "1.", "a.", "1.2.3." or a bullet character. */
  text: string;
  /** Counter values from level 0 up to this item's level. */
  counters: number[];
  /** What separates the number from the text: tab | space | nothing. */
  suffix: string;
}

export interface NumberingResolver {
  /** The rendered number for a block, or null when it is not numbered. */
  numberFor(nodeId: string): NumberedItem | null;
  /** Every numbered item, in document order. */
  items(): NumberedItem[];
}

function readLevels(doc: DocumentAccess, definition: DocumentNode): Map<number, LevelDefinition> {
  const levels = new Map<number, LevelDefinition>();
  for (const child of childrenOf(doc, definition)) {
    if (child.stype !== 'numberingLevel') continue;
    const a = child.attributes ?? {};
    const level = typeof a.level === 'number' ? a.level : 0;
    levels.set(level, {
      level,
      format: typeof a.format === 'string' ? a.format : 'decimal',
      text: typeof a.text === 'string' ? a.text : '',
      start: typeof a.start === 'number' ? a.start : 1,
      restartAfterLevel:
        typeof a.restartAfterLevel === 'number' ? a.restartAfterLevel : undefined,
      suffix: typeof a.suffix === 'string' ? a.suffix : 'tab'
    });
  }
  return levels;
}

/**
 * Substitute counters into a level's pattern.
 *
 * `%1` is the counter at level 0, `%2` at level 1, and so on — one-based in the
 * pattern, zero-based in the array. A level with no pattern falls back to its
 * own counter, so a plain decimal list still renders without one.
 */
function renderPattern(
  pattern: string,
  counters: number[],
  levels: Map<number, LevelDefinition>,
  level: number
): string {
  if (!pattern) {
    const own = levels.get(level);
    return own ? formatCounter(counters[level] ?? 0, own.format) : String(counters[level] ?? 0);
  }
  return pattern.replace(/%(\d)/g, (_match, digit: string) => {
    const index = Number(digit) - 1;
    const definition = levels.get(index);
    const value = counters[index] ?? 0;
    return definition ? formatCounter(value, definition.format) : String(value);
  });
}

export function createNumberingResolver(doc: DocumentAccess): NumberingResolver {
  const root = doc.getNode(doc.rootId);

  const definitions = new Map<string, Map<number, LevelDefinition>>();
  for (const resource of childrenOf(doc, childOfType(doc, root, 'resources'))) {
    if (resource.stype !== 'numberingDef') continue;
    const id = resource.attributes?.id;
    if (typeof id === 'string') definitions.set(id, readLevels(doc, resource));
  }

  const byNode = new Map<string, NumberedItem>();
  const ordered: NumberedItem[] = [];

  // One pass over the document: counters only mean anything in reading order.
  const counters = new Map<string, number[]>();

  for (const block of walkBlocks(doc, root)) {
    const a = block.attributes ?? {};
    const numId = typeof a.numId === 'string' ? a.numId : undefined;
    if (!numId || !block.sid) continue;

    const levels = definitions.get(numId);
    if (!levels) continue;

    const level = typeof a.numLevel === 'number' ? a.numLevel : 0;
    const definition = levels.get(level);
    if (!definition) continue;

    let counter = counters.get(numId);
    if (!counter) {
      counter = [];
      counters.set(numId, counter);
    }

    // Start this level if it has not run yet, otherwise advance it.
    if (counter[level] === undefined) counter[level] = definition.start;
    else counter[level] += 1;

    // Deeper levels restart whenever a shallower one advances — "1.1, 1.2" then
    // "2.1", never "2.3".
    for (let deeper = level + 1; deeper < counter.length; deeper++) {
      counter[deeper] = undefined as unknown as number;
    }

    // An explicit restart pins a level to a shallower one, for definitions that
    // do not simply reset on the immediate parent.
    for (const [otherLevel, otherDefinition] of levels) {
      if (otherDefinition.restartAfterLevel === level && otherLevel > level) {
        counter[otherLevel] = undefined as unknown as number;
      }
    }

    const snapshot = counter.slice(0, level + 1).map((value) => value ?? 0);
    const text =
      definition.format === 'bullet'
        ? definition.text || '•'
        : renderPattern(definition.text, snapshot, levels, level);

    const item: NumberedItem = {
      nodeId: block.sid,
      numId,
      level,
      text,
      counters: snapshot,
      suffix: definition.suffix
    };
    byNode.set(block.sid, item);
    ordered.push(item);
  }

  return {
    numberFor: (nodeId: string) => byNode.get(nodeId) ?? null,
    items: () => ordered.slice()
  };
}
