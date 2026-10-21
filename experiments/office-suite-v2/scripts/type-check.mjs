import { resolve } from 'node:path';
import ts from 'typescript';
import { inputs, requireRuntime, root } from './paths.mjs';

requireRuntime();
const configPath = resolve(root, 'tsconfig.json');
const read = ts.readConfigFile(configPath, ts.sys.readFile);
const format = diagnostics => ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => root,
  getCanonicalFileName: file => file,
  getNewLine: () => '\n',
});
if (read.error) {
  console.error(format([read.error]));
  process.exit(1);
}
const config = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, configPath);
if (config.errors.length) {
  console.error(format(config.errors));
  process.exit(1);
}
const roots = inputs(process.argv.slice(2), file => file.endsWith('.ts'));
const program = ts.createProgram({ rootNames: roots, options: config.options });
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(`Strict TypeScript ${ts.version}: ${roots.length} root files; imports included; ${diagnostics.length} diagnostics.`);
if (diagnostics.length) {
  console.error(format(diagnostics));
  process.exitCode = 1;
}
