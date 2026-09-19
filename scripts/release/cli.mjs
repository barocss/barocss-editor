#!/usr/bin/env node
import path from 'node:path';
import { createDevelopmentManifest, readJson, validateManifest, writeJson, PROTOTYPE_NOTICE } from './manifest.mjs';

function usage() {
  return `Usage:\n  node scripts/release/cli.mjs create --repo-root <path> --out <path>\n  node scripts/release/cli.mjs validate --repo-root <path> --manifest <path> --mode <development|release>`;
}

function parseArgs(argv) {
  const command = argv[2];
  const args = { command };
  for (let index = 3; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`invalid arguments\n${usage()}`);
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

function requireArg(args, name) {
  if (!args[name]) throw new Error(`missing --${name}\n${usage()}`);
  return args[name];
}

try {
  const args = parseArgs(process.argv);
  if (args.command === 'create') {
    const repoRoot = path.resolve(requireArg(args, 'repo-root'));
    const out = path.resolve(requireArg(args, 'out'));
    const manifest = createDevelopmentManifest({ repoRoot });
    writeJson(out, manifest);
    console.log(`wrote development manifest: ${out}`);
    console.log(PROTOTYPE_NOTICE);
  } else if (args.command === 'validate') {
    const repoRoot = path.resolve(requireArg(args, 'repo-root'));
    const manifestPath = path.resolve(requireArg(args, 'manifest'));
    const mode = requireArg(args, 'mode');
    const manifest = readJson(manifestPath);
    const result = validateManifest(manifest, { repoRoot, mode });
    if (!result.ok) {
      for (const error of result.errors) console.error(error);
      console.error(result.notice);
      process.exit(1);
    }
    console.log(`manifest valid for ${mode}`);
    console.log(result.notice);
  } else {
    throw new Error(usage());
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
