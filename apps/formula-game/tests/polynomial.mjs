// Independent exact integer polynomial checker for authored content (a, b only).
// No eval, runtime grader reuse, or random numeric sampling.
const constant = (n) => new Map(n === 0n ? [] : [["0,0", n]]);
function add(a, b, sign = 1n) {
  const result = new Map(a);
  for (const [key, value] of b) {
    const next = (result.get(key) ?? 0n) + sign * value;
    if (next === 0n) result.delete(key);
    else result.set(key, next);
  }
  return result;
}
function multiply(a, b) {
  let result = constant(0n);
  for (const [ka, va] of a)
    for (const [kb, vb] of b) {
      const [aa, ab] = ka.split(",").map(Number),
        [ba, bb] = kb.split(",").map(Number);
      result = add(result, new Map([[`${aa + ba},${ab + bb}`, va * vb]]));
    }
  return result;
}
export function polynomial(source) {
  const input = source.replace(/\s+/g, "");
  const tokens = input.match(/\d+|[ab()+*^\-]/g) ?? [];
  if (tokens.join("") !== input)
    throw Error("Unsupported authored expression: " + source);
  let i = 0;
  function atom() {
    const token = tokens[i++];
    if (token === "(") {
      const value = sum();
      if (tokens[i++] !== ")") throw Error("Unbalanced parentheses");
      return value;
    }
    if (token === "a" || token === "b")
      return new Map([[token === "a" ? "1,0" : "0,1", 1n]]);
    if (/^\d+$/.test(token ?? "")) return constant(BigInt(token));
    throw Error("Expected operand: " + source);
  }
  function power() {
    let value = atom();
    if (tokens[i] === "^") {
      i++;
      const n = Number(tokens[i++]);
      if (!Number.isInteger(n) || n < 0 || n > 6)
        throw Error("Unsupported exponent");
      const base = value;
      value = constant(1n);
      for (let j = 0; j < n; j++) value = multiply(value, base);
    }
    return value;
  }
  function unary() {
    if (tokens[i] === "+" || tokens[i] === "-") {
      const sign = tokens[i++] === "-" ? -1n : 1n;
      return multiply(constant(sign), unary());
    }
    return power();
  }
  function product() {
    let value = unary();
    while (
      tokens[i] === "*" ||
      tokens[i] === "(" ||
      tokens[i] === "a" ||
      tokens[i] === "b" ||
      /^\d+$/.test(tokens[i] ?? "")
    ) {
      if (tokens[i] === "*") i++;
      value = multiply(value, unary());
    }
    return value;
  }
  function sum() {
    let value = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const sign = tokens[i++] === "-" ? -1n : 1n;
      value = add(value, product(), sign);
    }
    return value;
  }
  const value = sum();
  if (i !== tokens.length) throw Error("Trailing tokens: " + source);
  return [...value].sort(([a], [b]) => a.localeCompare(b));
}
