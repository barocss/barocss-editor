/** Create a standalone frozen-install input from the workspace's existing resolutions. */
export function deploymentLock(lockfile, project) {
  if (lockfile.lockfileVersion !== '6.0') throw new Error('Unsupported pnpm lockfile version');
  const importer = lockfile.importers?.[project];
  if (!importer) throw new Error('API importer missing from lockfile');
  for (const section of ['dependencies', 'optionalDependencies', 'devDependencies']) {
    for (const entry of Object.values(importer[section] ?? {})) {
      if (/^(?:link:|file:|workspace:)/.test(entry.version)) {
        throw new Error('Workspace dependencies require an explicit deployment packaging contract');
      }
    }
  }
  return { ...lockfile, importers: { '.': importer } };
}
