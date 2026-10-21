import { CORE_LIMITS } from './contracts.ts';
import type { BinaryOperator, CellInput, CellKey, FormulaErrorCode, FormulaNode, RangeReference } from './contracts.ts';
import { ReferenceIndex } from './references.ts';

type Token = { text: string; kind: 'number' | 'word' | 'string' | 'sheet' | 'symbol' | 'error' };
const ERROR_CODES: readonly string[] = ['#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#CYCLE!', '#LIMIT!', '#UNSUPPORTED!'];
class ParseFailure extends Error {}
class Unsupported extends Error {}
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  while (offset < source.length) {
    const rest = source.slice(offset);
    const white = /^\s+/.exec(rest);
    if (white) { offset += white[0].length; continue; }
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      let text = '';
      let i = 1;
      let closed = false;
      while (i < rest.length) {
        if (rest[i] === quote) {
          if (rest[i + 1] === quote) { text += quote; i += 2; continue; }
          i++; closed = true; break;
        }
        text += rest[i++];
      }
      if (!closed) throw new ParseFailure('Unterminated quoted value');
      tokens.push({ kind: quote === '"' ? 'string' : 'sheet', text }); offset += i; continue;
    }
    const error = ERROR_CODES.find(code => rest.toUpperCase().startsWith(code));
    if (error) { tokens.push({ kind: 'error', text: error }); offset += error.length; continue; }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    const word = /^\$?[A-Za-z_][A-Za-z_0-9.$]*/.exec(rest);
    const symbol = /^(?:<=|>=|<>|[+\-*/^=<>():,!])/.exec(rest);
    const match = number ?? word ?? symbol;
    if (!match) throw new Unsupported(`Unsupported token at ${offset}`);
    tokens.push({ kind: number ? 'number' : word ? 'word' : 'symbol', text: match[0] });
    offset += match[0].length;
    if (tokens.length > CORE_LIMITS.astNodes * 4) throw new ParseFailure('Token limit');
  }
  return tokens;
}

/** English comma/dot profile. Only the AST and parse context become native authority. */
export function parseFormula(source: string, context: CellKey, index: ReferenceIndex): CellInput {
  const invalid = (reason: string): CellInput => ({ kind: 'invalid', source, reason });
  if (source.length > CORE_LIMITS.textLength) return invalid('Formula text limit');
  if (!source.startsWith('=')) return invalid('Formula must start with =');
  let tokens: Token[];
  let at = 0;
  let nodes = 0;
  const peek = (): Token | undefined => tokens[at];
  const consume = (text: string): boolean => { if (peek()?.text === text) { at++; return true; } return false; };
  const expect = (text: string): void => { if (!consume(text)) throw new ParseFailure(`Expected ${text}`); };
  const node = (value: FormulaNode): FormulaNode => { if (++nodes > CORE_LIMITS.astNodes) throw new ParseFailure('AST node limit'); return value; };
  const precedence: Readonly<Record<string, number>> = { '=': 1, '<>': 1, '<': 1, '<=': 1, '>': 1, '>=': 1, '+': 2, '-': 2, '*': 3, '/': 3, '^': 5 };
  function reference(token: Token, defaultSheet: string, qualified: boolean): FormulaNode {
    let sheetId = defaultSheet;
    let address = token.text;
    if (consume('!')) {
      sheetId = index.sheetNamed(token.text) ?? '';
      qualified = true;
      const next = tokens[at++];
      if (!next || next.kind !== 'word') throw new ParseFailure('Expected address after sheet qualifier');
      address = next.text;
    } else if (token.kind === 'sheet') throw new ParseFailure('Quoted name requires !');
    const ref = index.resolve(address, sheetId, qualified);
    if (!/^\$?[A-Za-z]+\$?[1-9][0-9]*$/.test(address)) throw new Unsupported('Named/external references are unsupported');
    return node(ref ? { kind: 'reference', reference: ref } : { kind: 'error', code: '#REF!' });
  }
  function expression(minimum = 0, depth = 1): FormulaNode {
    if (depth > CORE_LIMITS.astDepth) throw new ParseFailure('AST depth limit');
    const token = tokens[at++];
    if (!token) throw new ParseFailure('Expected expression');
    let left: FormulaNode;
    if (token.text === '+' || token.text === '-') left = node({ kind: 'unary', operator: token.text, operand: expression(4, depth + 1) });
    else if (token.text === '(') { left = expression(0, depth + 1); expect(')'); }
    else if (token.kind === 'number') {
      const value = Number(token.text);
      if (!Number.isFinite(value)) throw new ParseFailure('Non-finite number');
      left = node({ kind: 'number', value });
    } else if (token.kind === 'string') left = node({ kind: 'string', value: token.text });
    else if (token.kind === 'error') left = node({ kind: 'error', code: token.text as FormulaErrorCode });
    else if (token.kind === 'word' && consume('(')) {
      const name = token.text.toUpperCase();
      if (name !== 'SUM' && name !== 'IF') throw new Unsupported(`Function ${name} is unsupported`);
      const args: FormulaNode[] = [];
      if (!consume(')')) {
        do { args.push(expression(0, depth + 1)); } while (consume(','));
        expect(')');
      }
      if (name === 'IF' && args.length !== 3) throw new ParseFailure('IF requires three arguments');
      left = node({ kind: 'call', name, arguments: args });
    } else if (token.kind === 'word' && /^(TRUE|FALSE)$/i.test(token.text) && peek()?.text !== '!') left = node({ kind: 'boolean', value: token.text.toUpperCase() === 'TRUE' });
    else if (token.kind === 'word' || token.kind === 'sheet') left = reference(token, context.sheetId, false);
    else throw new ParseFailure('Expected literal, reference or function');
    if (consume(':')) {
      const endToken = tokens[at++];
      if (!endToken || (endToken.kind !== 'word' && endToken.kind !== 'sheet')) throw new ParseFailure('Expected range endpoint');
      const end = reference(endToken, left.kind === 'reference' ? left.reference.sheetId : context.sheetId, left.kind === 'reference' && left.reference.sheetQualified);
      if (left.kind !== 'reference' || end.kind !== 'reference') left = node({ kind: 'error', code: '#REF!' });
      else {
        const range: RangeReference = { start: left.reference, end: end.reference, policy: 'live-interval' };
        const keys = index.rangeKeys(range);
        left = node(Array.isArray(keys) ? { kind: 'range', reference: range } : keys as FormulaNode);
      }
    }
    while (peek()) {
      const operator = peek()!.text;
      const power = precedence[operator];
      if (power === undefined || power < minimum) break;
      at++;
      const right = expression(operator === '^' ? power : power + 1, depth + 1);
      left = node({ kind: 'binary', operator: operator as BinaryOperator, left, right });
    }
    return left;
  }
  try {
    tokens = tokenize(source.slice(1));
    const ast = expression();
    if (at !== tokens.length) throw new ParseFailure('Unexpected trailing token');
    // Left-associated chains must obey the native AST depth limit too.
    const stack: { value: FormulaNode; depth: number }[] = [{ value: ast, depth: 1 }];
    while (stack.length) {
      const item = stack.pop()!;
      if (item.depth > CORE_LIMITS.astDepth) throw new ParseFailure('AST depth limit');
      const children = item.value.kind === 'binary' ? [item.value.left, item.value.right] : item.value.kind === 'unary' ? [item.value.operand] : item.value.kind === 'call' ? item.value.arguments : [];
      for (const value of children) stack.push({ value, depth: item.depth + 1 });
    }
    return { kind: 'formula', version: 1, ast, context };
  } catch (error) {
    if (error instanceof Unsupported) return { kind: 'formula', version: 1, ast: { kind: 'unsupported', source, reason: error.message }, context };
    if (error instanceof ParseFailure) return invalid(error.message);
    throw error;
  }
}

export function displayFormula(ast: FormulaNode, index: ReferenceIndex): string {
  const text = (value: FormulaNode): string => {
    switch (value.kind) {
      case 'number': return String(value.value);
      case 'boolean': return value.value ? 'TRUE' : 'FALSE';
      case 'string': return `"${value.value.replaceAll('"', '""')}"`;
      case 'error': return value.code;
      case 'unsupported': return value.source.startsWith('=') ? value.source.slice(1) : value.source;
      case 'reference': return index.display(value.reference);
      case 'range': return `${index.display(value.reference.start)}:${index.display(value.reference.end)}`;
      case 'unary': return `(${value.operator}${text(value.operand)})`;
      case 'binary': return `(${text(value.left)}${value.operator}${text(value.right)})`;
      case 'call': return `${value.name}(${value.arguments.map(text).join(',')})`;
    }
  };
  return `=${text(ast)}`;
}
