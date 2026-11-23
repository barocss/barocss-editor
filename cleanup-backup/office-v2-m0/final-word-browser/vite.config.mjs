import { createRequire } from 'node:module';
const root = '/Users/user/.codex/worktrees/522-m0-portal-joint/barocss-editor';
const frozen = '/Users/user/.codex/worktrees/522-m0-integration/barocss-editor';
const require = createRequire(root + '/package.json');
const { loadConfigFromFile, mergeConfig, searchForWorkspaceRoot } = require('vite');
export default async env => {
  const loaded = await loadConfigFromFile(env, root + '/apps/word/vite.config.ts');
  if (!loaded) throw new Error('Actual Word Vite configuration unavailable');
  return mergeConfig(loaded.config, {
    root: root + '/apps/word',
    cacheDir: '/Users/user/barocss-editor/.omx/m0/final-word-browser/vite-cache',
    server: { fs: { allow: [searchForWorkspaceRoot(root + '/apps/word'), frozen + '/node_modules'] } }
  });
};
