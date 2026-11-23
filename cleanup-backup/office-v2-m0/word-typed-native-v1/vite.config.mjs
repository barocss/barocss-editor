import { createRequire } from 'node:module';
const root = '/Users/user/.codex/worktrees/522-m0-next-integration/barocss-editor';
const frozen = '/Users/user/.codex/worktrees/522-m0-integration/barocss-editor';
const require = createRequire(root + '/package.json');
const { loadConfigFromFile, mergeConfig, searchForWorkspaceRoot } = require('vite');
export default async function (env) {
  const loaded = await loadConfigFromFile(env, root + '/apps/word/vite.config.ts');
  if (!loaded) throw new Error('Actual Word Vite config unavailable');
  return mergeConfig(loaded.config, {
    root: root + '/apps/word',
    cacheDir: '/Users/user/barocss-editor/.omx/m0/word-typed-native-v1/vite-cache',
    server: { host: '127.0.0.1', port: 55261, strictPort: true,
      fs: { allow: [searchForWorkspaceRoot(root + '/apps/word'), frozen + '/node_modules',
        '/Users/user/barocss-editor/.omx/m0/word-typed-native-v1'] } }
  });
}
