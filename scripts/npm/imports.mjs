import ts from 'typescript';
import { isBuiltin } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { run, inspectTarball } from './packages.mjs';

export function undeclaredImports(source, manifest) {
  const declared = new Set([manifest.name, ...Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies })]);
  const specifiers = [];
  const tree = ts.createSourceFile('artifact.ts', source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) specifiers.push(node.argument.literal.text);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) specifiers.push(node.moduleReference.expression.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) specifiers.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return specifiers.filter((specifier) => {
    if (specifier.startsWith('.') || specifier.startsWith('#') || isBuiltin(specifier)) return false;
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    return !declared.has(name);
  });
}
export function checkArchiveImports(file) {
  const manifest = inspectTarball(file);
  const directory = mkdtempSync(resolve(tmpdir(), 'wonffice-imports-'));
  try {
    run('tar', ['-xzf', file, '-C', directory]);
    const base = resolve(directory, 'package');
    const errors = [];
    for (const name of readdirSync(base, { recursive: true })) {
      if (!/\.(?:[cm]?js|d\.[cm]?ts)$/.test(name)) continue;
      for (const specifier of undeclaredImports(readFileSync(resolve(base, name), 'utf8'), manifest)) errors.push(`${name}: ${specifier}`);
    }
    if (errors.length) throw new Error(`${manifest.name}: undeclared published imports\n${errors.join('\n')}`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
